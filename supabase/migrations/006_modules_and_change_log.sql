-- ============================================================================
-- 006_modules_and_change_log.sql
-- Palstro-Hotels: per-tenant module flags + a generic field-level change log.
-- Two foundation pieces, cheap now and expensive to retrofit once ten modules
-- exist. No module screens are built in this migration — only the plumbing.
-- Conventions inherited from 001: shared helpers get_tenant_ids()/auth.uid(),
-- SECURITY DEFINER + pinned search_path on every function.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Module flags on tenant_settings
-- ----------------------------------------------------------------------------
-- Not every hotel buys every module: a property with no restaurant should not
-- see Food and Beverage in its navigation. This column exists so enabling a
-- module is a DATA change, not a code change. The values are exactly the
-- AdminModule keys in src/components/admin/adminNav.ts — keep the two in step.
alter table tenant_settings
  add column if not exists enabled_modules text[] not null
    default array[
      'front_desk','bookings','rooms','housekeeping','guests',
      'rates','food_beverage','laundry',
      'maintenance','staff','reports','accounting',
      'settings'
    ]::text[];

comment on column tenant_settings.enabled_modules is
  'Which admin modules this tenant sees in navigation. Values are the AdminModule '
  'keys from adminNav.ts. Enabling/disabling a module is a data change here, not '
  'code. A UX guard only — RLS remains the real access enforcement (rule 19).';

-- Settings can NEVER be disabled: a tenant with no Settings access can never fix
-- their own configuration (including re-enabling other modules). Enforced at the
-- DB so no app path — or manual SQL edit — can strand a tenant. Guarded add so
-- re-running the migration does not error on the second attempt.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tenant_settings_settings_module_check'
  ) then
    alter table tenant_settings
      add constraint tenant_settings_settings_module_check
      check ('settings' = any(enabled_modules));
  end if;
end $$;

comment on constraint tenant_settings_settings_module_check on tenant_settings is
  'Settings is undisableable: without it a tenant could never fix their own config.';

-- ----------------------------------------------------------------------------
-- 2. change_log — field-level audit history
-- ----------------------------------------------------------------------------
-- The customer's stated pain is staff theft and disputes. "Who changed the rate
-- on this room type, and what was it before?" is a question the system MUST be
-- able to answer, and history you did not capture is gone forever. That is why
-- this ships on every core table from day one rather than when someone first
-- asks — you cannot retroactively record a change you never logged.
--
-- old_value/new_value are TEXT deliberately: one table spans every column type
-- in the system (uuid, numeric, boolean, jsonb, arrays, timestamps), and text is
-- the one representation that holds all of them uniformly.
--
-- DELIBERATE §6 EXCEPTION: this is an append-only audit log, not domain data. It
-- carries changed_by/changed_at as its actor/time columns instead of the
-- standard created_by/updated_by set, is written ONLY by the SECURITY DEFINER
-- trigger below, and is never updated — so the shared set_row_audit() trigger
-- does not apply to it.
create table if not exists change_log (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  table_name text not null,
  row_id     uuid not null,
  field_name text not null,
  old_value  text,
  new_value  text,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now()
);

comment on table change_log is
  'Field-level change history across core tables, written only by the '
  'log_field_changes() trigger. Answers "who changed what, from what, and when" '
  'for theft/dispute investigations.';

-- Primary access path: a tenant browsing their own recent history, newest first.
create index if not exists change_log_tenant_changed_at_idx
  on change_log (tenant_id, changed_at desc);
-- Secondary path: the full history of one specific row.
create index if not exists change_log_table_row_idx
  on change_log (table_name, row_id);

-- ----------------------------------------------------------------------------
-- 3. log_field_changes() — generic AFTER UPDATE trigger function
-- ----------------------------------------------------------------------------
-- Works on ANY table without modification: it diffs to_jsonb(OLD) against
-- to_jsonb(NEW) and writes one change_log row per changed field. SECURITY
-- DEFINER (so it can write change_log, which has no insert policy for anyone)
-- with a pinned search_path, matching every other function in this schema.
create or replace function log_field_changes()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  v_key text;
  v_old_val text;
  v_new_val text;
  v_subkey text;
  v_old_sub text;
  v_new_sub text;
  v_tenant_id uuid;
  v_row_id uuid;
  -- Same actor rule as set_row_audit(): the session user, falling back to the
  -- row's updated_by only when there is no session (SECURITY DEFINER RPC /
  -- service_role paths). By AFTER UPDATE, set_row_audit() has already stamped
  -- new.updated_by, so this is the real actor.
  v_actor uuid := coalesce(auth.uid(), (v_new->>'updated_by')::uuid);
begin
  -- Owning tenant for the log row. Reads tenant_id from NEW where present
  -- (properties, room_types, rooms, tenant_users, tenant_settings — whose PK IS
  -- tenant_id, so this still works). The two tables that carry no tenant_id
  -- column resolve it structurally: `tenants` is its own tenant (use id), and
  -- property_settings joins up to its property.
  if v_new ? 'tenant_id' then
    v_tenant_id := (v_new->>'tenant_id')::uuid;
  elsif tg_table_name = 'tenants' then
    v_tenant_id := (v_new->>'id')::uuid;
  elsif v_new ? 'property_id' then
    select p.tenant_id into v_tenant_id
    from properties p where p.id = (v_new->>'property_id')::uuid;
  end if;

  -- The changed row's own key. Handles id-keyed tables, the tenant_id-keyed
  -- tenant_settings, and the property_id-keyed property_settings uniformly.
  v_row_id := coalesce(v_new->>'id', v_new->>'tenant_id', v_new->>'property_id')::uuid;

  for v_key in select jsonb_object_keys(v_new)
  loop
    -- Skip the audit columns themselves. Logging that updated_at changed on
    -- every single update is noise that buries the signal we actually want.
    if v_key in ('updated_at','updated_by','created_at','created_by') then
      continue;
    end if;

    v_old_val := v_old->>v_key;
    v_new_val := v_new->>v_key;

    -- NULL-safe compare: only genuine changes are logged (an unchanged field,
    -- including NULL->NULL, writes nothing).
    if v_old_val is not distinct from v_new_val then
      continue;
    end if;

    -- One-level jsonb diff. When the column is a jsonb OBJECT on BOTH sides
    -- (e.g. property_settings.branding), log one row per changed key inside it
    -- with field_name 'column.key' (e.g. 'branding.primary_color') instead of
    -- dumping the whole multi-kilobyte document per edit. Branding is what the
    -- settings console edits most, so the log is kept readable exactly where it
    -- is needed most. A column that is jsonb null on EITHER side is NOT an
    -- object, so it falls through to the whole-value path below and is logged
    -- whole rather than recursed into.
    if jsonb_typeof(v_old -> v_key) = 'object'
       and jsonb_typeof(v_new -> v_key) = 'object' then
      -- Iterate the union of keys present on either side, so an added or removed
      -- key is caught too.
      for v_subkey in
        select k from (
          select jsonb_object_keys(v_old -> v_key) as k
          union
          select jsonb_object_keys(v_new -> v_key) as k
        ) union_keys
      loop
        -- ->> serialises the nested value to text. ONE LEVEL ONLY, deliberately:
        -- a nested object one level down is recorded whole as this key's
        -- serialised value, and a jsonb ARRAY (e.g. branding.hero_images) is
        -- logged whole as a single field — diffing arrays is not worth the
        -- complexity; knowing the list changed and what it became is enough.
        v_old_sub := (v_old -> v_key) ->> v_subkey;
        v_new_sub := (v_new -> v_key) ->> v_subkey;
        if v_old_sub is distinct from v_new_sub then
          -- Truncate at 4000 chars (see whole-value note below): the same cap
          -- applies to nested keys, since about_text or an image-URL blob can
          -- live one level down inside branding just as easily.
          insert into change_log
            (tenant_id, table_name, row_id, field_name, old_value, new_value, changed_by)
          values (
            v_tenant_id, tg_table_name, v_row_id, v_key || '.' || v_subkey,
            case when length(v_old_sub) > 4000
                 then left(v_old_sub, 4000) || '… [truncated]' else v_old_sub end,
            case when length(v_new_sub) > 4000
                 then left(v_new_sub, 4000) || '… [truncated]' else v_new_sub end,
            v_actor
          );
        end if;
      end loop;
      continue; -- handled per nested key; do not also log the column whole.
    end if;

    -- Whole-value path: scalars, arrays, and jsonb columns null on either side.
    -- Truncate old/new at 4000 characters, appending '… [truncated]' when cut:
    -- an about_text field or a long image-URL array can be very large, and this
    -- table already grows without bound. The log records THAT a change happened
    -- and ROUGHLY what it was — it is not a content backup.
    insert into change_log
      (tenant_id, table_name, row_id, field_name, old_value, new_value, changed_by)
    values (
      v_tenant_id, tg_table_name, v_row_id, v_key,
      case when length(v_old_val) > 4000
           then left(v_old_val, 4000) || '… [truncated]' else v_old_val end,
      case when length(v_new_val) > 4000
           then left(v_new_val, 4000) || '… [truncated]' else v_new_val end,
      v_actor
    );
  end loop;

  return null; -- AFTER trigger: return value is ignored.
end;
$$;

-- Attach to every core table. tenants, properties, tenant_settings,
-- property_settings, room_types, rooms, tenant_users. (Insert-only join tables
-- like user_properties are excluded — they are never updated, so there is
-- nothing to diff.)
drop trigger if exists log_field_changes_tenants on tenants;
create trigger log_field_changes_tenants
  after update on tenants for each row execute function log_field_changes();

drop trigger if exists log_field_changes_properties on properties;
create trigger log_field_changes_properties
  after update on properties for each row execute function log_field_changes();

drop trigger if exists log_field_changes_tenant_settings on tenant_settings;
create trigger log_field_changes_tenant_settings
  after update on tenant_settings for each row execute function log_field_changes();

drop trigger if exists log_field_changes_property_settings on property_settings;
create trigger log_field_changes_property_settings
  after update on property_settings for each row execute function log_field_changes();

drop trigger if exists log_field_changes_room_types on room_types;
create trigger log_field_changes_room_types
  after update on room_types for each row execute function log_field_changes();

drop trigger if exists log_field_changes_rooms on rooms;
create trigger log_field_changes_rooms
  after update on rooms for each row execute function log_field_changes();

drop trigger if exists log_field_changes_tenant_users on tenant_users;
create trigger log_field_changes_tenant_users
  after update on tenant_users for each row execute function log_field_changes();

-- ----------------------------------------------------------------------------
-- 4. RLS on change_log
-- ----------------------------------------------------------------------------
-- SELECT: any active member of the tenant may read their own history.
-- NO insert/update/delete policy for ANYONE — by design. Rows are written only
-- by the SECURITY DEFINER trigger above (which runs as the function owner and so
-- bypasses RLS). An audit log that its own users can edit is not an audit log:
-- the ability to rewrite history destroys the very evidence it exists to keep.
alter table change_log enable row level security;

drop policy if exists change_log_member_select on change_log;
create policy change_log_member_select on change_log
  for select to authenticated
  using (tenant_id = any(get_tenant_ids()));

-- ----------------------------------------------------------------------------
-- 5. Growth note
-- ----------------------------------------------------------------------------
-- This table grows WITHOUT BOUND — one row per changed field, forever. It will
-- eventually need archival or time-based partitioning (e.g. monthly partitions
-- on changed_at). The decision point is when it passes a few million rows, NOT
-- now: partitioning an empty table is premature complexity. Revisit at scale.

-- ============================================================================
-- End of 006_modules_and_change_log.sql
-- ============================================================================
