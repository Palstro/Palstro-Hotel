-- ============================================================================
-- 001_initial_tenancy.sql
-- Palstro-Hotels: multi-tenant foundation.
-- Tenancy spine (tenants, properties, membership), the tenant-level and
-- property-level settings split, auto-provisioning of settings rows, the
-- tenant/property/admin resolver functions, and RLS for all of them.
-- No seed data — tenant/property insertion is a separate step.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extensions
-- ----------------------------------------------------------------------------
create extension if not exists pgcrypto;  -- provides gen_random_uuid()

-- ----------------------------------------------------------------------------
-- 2. Shared row-audit trigger function
-- ----------------------------------------------------------------------------
-- Owns every audit column on both INSERT and UPDATE so application code never
-- sets them by hand. search_path is pinned for the same injection-hardening
-- reason as the resolver functions.
--
-- Client-supplied audit values are DELIBERATELY IGNORED. A client that sends its
-- own created_by/updated_by (or created_at/updated_at) does not get to keep it:
-- the trigger overwrites it with auth.uid()/now(). This is what makes the
-- theft-detection reports trustworthy — an audit column the actor could set
-- themselves would be worthless for answering "which staff member did this".
--
-- COALESCE(auth.uid(), ...) preserves an explicitly set actor ONLY when there is
-- no session — the SECURITY DEFINER RPC and service_role cases, where the code
-- deliberately supplies the real actor. Such RPCs must set the columns
-- explicitly, because auth.uid() inside them resolves to the caller, not the
-- intended actor.
--
-- INSERT: force created_at/created_by; leave updated_at to its column default
-- (now()) and updated_by NULL ("never updated").
-- UPDATE: force updated_at/updated_by, and pin created_at/created_by back to
-- their OLD values so an update can never rewrite who created the row.
create or replace function set_row_audit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := coalesce(auth.uid(), new.created_by);
  elsif tg_op = 'UPDATE' then
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by);
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. tenants
-- ----------------------------------------------------------------------------
-- A tenant is a company or hotel group, NOT a physical building.
create table if not exists tenants (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,          -- URL-based tenant resolution
  status        text not null default 'trial'
                  constraint tenants_status_check
                  check (status in ('trial', 'active', 'suspended', 'cancelled')),
  trial_ends_at timestamptz,
  deleted_at    timestamptz,                    -- soft delete (master data)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid() references auth.users(id),
  updated_by    uuid references auth.users(id)
);

comment on table tenants is
  'A tenant is a company / hotel group (not a building). Root of all scoping.';
comment on constraint tenants_status_check on tenants is
  'Prevents unknown lifecycle states; only trial/active/suspended/cancelled are valid.';

drop trigger if exists set_row_audit_tenants on tenants;
create trigger set_row_audit_tenants
  before insert or update on tenants
  for each row execute function set_row_audit();

-- ----------------------------------------------------------------------------
-- 4. properties
-- ----------------------------------------------------------------------------
-- A property is a physical hotel belonging to a tenant. Heledon is one property
-- under one tenant; future hotel groups may have several. The guest site is
-- resolved by property (via `domain`), so guest-facing settings live per
-- property (see property_settings), not per tenant.
create table if not exists properties (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  name             text not null,
  slug             text not null,               -- unique per tenant (see below)
  domain           text unique,                 -- property's own guest-facing domain
  timezone         text not null default 'Africa/Lagos',
  currency         text not null default 'NGN',
  night_audit_time time not null default '06:00', -- cutoff deciding business day
  status           text not null default 'active'
                     constraint properties_status_check
                     check (status in ('active', 'inactive', 'closed')),
  deleted_at       timestamptz,                 -- soft delete (master data)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid default auth.uid() references auth.users(id),
  updated_by       uuid references auth.users(id),
  constraint properties_tenant_slug_unique unique (tenant_id, slug)
);

comment on table properties is
  'A physical hotel belonging to a tenant. Operational data is scoped to one property.';
comment on constraint properties_status_check on properties is
  'Prevents unknown property states; only active/inactive/closed are valid.';

create index if not exists properties_tenant_id_idx on properties (tenant_id);

drop trigger if exists set_row_audit_properties on properties;
create trigger set_row_audit_properties
  before insert or update on properties
  for each row execute function set_row_audit();

-- ----------------------------------------------------------------------------
-- 5. tenant_users
-- ----------------------------------------------------------------------------
-- Many-to-many between auth.users and tenants. A user may hold different roles
-- at different tenants.
-- NOTE: multiple roles at the SAME tenant will be modelled by a separate table
-- later; do not model it here. `role` stays single-valued for now.
create table if not exists tenant_users (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null
               constraint tenant_users_role_check
               check (role in ('owner', 'manager', 'front_desk',
                               'housekeeping_supervisor', 'housekeeper',
                               'server', 'kitchen', 'barman', 'accountant',
                               'maintenance')),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint tenant_users_tenant_user_unique unique (tenant_id, user_id)
);

comment on table tenant_users is
  'Membership of a user in a tenant, with a single role. Read by get_tenant_ids() on every policy eval.';
comment on constraint tenant_users_role_check on tenant_users is
  'Prevents typo/unknown roles that would grant or deny access unpredictably.';

-- get_tenant_ids() filters by user_id on every policy evaluation, so index it.
create index if not exists tenant_users_user_id_idx on tenant_users (user_id);

drop trigger if exists set_row_audit_tenant_users on tenant_users;
create trigger set_row_audit_tenant_users
  before insert or update on tenant_users
  for each row execute function set_row_audit();

-- ----------------------------------------------------------------------------
-- 6. user_properties
-- ----------------------------------------------------------------------------
-- Which properties within a tenant a given membership may operate. A front desk
-- clerk at one hotel in a group must not see another hotel's arrivals.
-- Immutable join row: created only, never updated (hence no updated_at/by). It
-- still gets an INSERT-only set_row_audit trigger to enforce created_by.
create table if not exists user_properties (
  id             uuid primary key default gen_random_uuid(),
  tenant_user_id uuid not null references tenant_users(id) on delete cascade,
  property_id    uuid not null references properties(id) on delete cascade,
  created_at     timestamptz not null default now(),
  created_by     uuid default auth.uid() references auth.users(id),
  constraint user_properties_unique unique (tenant_user_id, property_id)
);

comment on table user_properties is
  'Grants a tenant membership access to a specific property. Immutable join; read by get_property_ids().';

-- INSERT only: no updated_* columns, so the trigger fires on insert alone to
-- force a non-forgeable created_by.
drop trigger if exists set_row_audit_user_properties on user_properties;
create trigger set_row_audit_user_properties
  before insert on user_properties
  for each row execute function set_row_audit();

-- ----------------------------------------------------------------------------
-- 7. tenant_settings  (company-wide only)
-- ----------------------------------------------------------------------------
-- Split rule: anything the accounting module reads is tenant-level and lives
-- here; anything a guest sees is property-level and lives in property_settings.
-- Nigerian VAT is federal, so default_vat_rate is correctly tenant-wide.
create table if not exists tenant_settings (
  tenant_id        uuid primary key references tenants(id) on delete cascade,
  default_vat_rate numeric(5,4) not null default 0.075
                     constraint tenant_settings_vat_rate_check
                     check (default_vat_rate >= 0 and default_vat_rate <= 1),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid default auth.uid() references auth.users(id),
  updated_by       uuid references auth.users(id)
);

comment on table tenant_settings is
  'Company-wide settings the accounting module reads (e.g. federal VAT). '
  'Split rule: accounting reads it -> tenant-level here; a guest sees it -> property_settings.';
comment on constraint tenant_settings_vat_rate_check on tenant_settings is
  'Prevents a VAT rate outside 0..1 (e.g. 7.5 instead of 0.075) that would 100x every tax calculation.';

drop trigger if exists set_row_audit_tenant_settings on tenant_settings;
create trigger set_row_audit_tenant_settings
  before insert or update on tenant_settings
  for each row execute function set_row_audit();

-- ----------------------------------------------------------------------------
-- 8. property_settings  (everything the guest site renders)
-- ----------------------------------------------------------------------------
-- Presentation and booking config per physical hotel, so a tenant with three
-- properties gets three domains each with their own branding.
create table if not exists property_settings (
  property_id     uuid primary key references properties(id) on delete cascade,
  template        text not null default 'warm_family'
                    constraint property_settings_template_check
                    check (template in ('warm_family', 'luxury_modern', 'minimalist')),
  booking_enabled boolean not null default true,
  branding        jsonb not null default '{}',  -- PRESENTATION ONLY (see below)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid() references auth.users(id),
  updated_by      uuid references auth.users(id)
);

comment on table property_settings is
  'Guest-facing settings per property (template, booking toggle, branding). '
  'Split rule: a guest sees it -> property-level here; accounting reads it -> tenant_settings.';
comment on column property_settings.branding is
  'Presentation only: colors, logo url, hero image urls, font pair, tagline, section visibility, section order. '
  'NEVER put a rate, amount, tax figure, threshold, or anything the accounting module reads in here: the database '
  'cannot validate it and no query can find which properties have it set.';
comment on constraint property_settings_template_check on property_settings is
  'Prevents selecting a template with no implementation; only the three shipped templates are valid.';

drop trigger if exists set_row_audit_property_settings on property_settings;
create trigger set_row_audit_property_settings
  before insert or update on property_settings
  for each row execute function set_row_audit();

-- ----------------------------------------------------------------------------
-- 9. Auto-provision settings rows
-- ----------------------------------------------------------------------------
-- Every tenant and every property is guaranteed a settings row from the moment
-- it exists, so no query anywhere in the application needs to handle a missing
-- settings row (which would otherwise render an unbranded site if onboarding
-- skipped the step).
--
-- Both functions are SECURITY DEFINER with a pinned search_path: the admin-only
-- insert policies on the settings tables would otherwise block the trigger's own
-- write. Both use ON CONFLICT DO NOTHING so re-running, or a manual insert of
-- the settings row first, never fails.

create or replace function create_tenant_settings_row()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into tenant_settings (tenant_id)
  values (new.id)
  on conflict (tenant_id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_tenant_settings_after_insert on tenants;
create trigger create_tenant_settings_after_insert
  after insert on tenants
  for each row execute function create_tenant_settings_row();

create or replace function create_property_settings_row()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into property_settings (property_id)
  values (new.id)
  on conflict (property_id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_property_settings_after_insert on properties;
create trigger create_property_settings_after_insert
  after insert on properties
  for each row execute function create_property_settings_row();

-- ----------------------------------------------------------------------------
-- 10. get_tenant_ids()  — canonical, verbatim per CLAUDE.md rule 13
-- ----------------------------------------------------------------------------
-- Returns every tenant the current user actively belongs to.
-- SECURITY DEFINER is load-bearing: it runs as the function owner (which
-- bypasses RLS), so the SELECT on tenant_users below does NOT itself trigger
-- tenant_users' RLS policy. Since that policy calls get_tenant_ids(), an
-- INVOKER function would recurse infinitely. DEFINER breaks the cycle.
create or replace function get_tenant_ids()
returns uuid[]
language plpgsql stable security definer
set search_path = public
as $$
begin
  return coalesce(array(
    select tenant_id from tenant_users
    where user_id = auth.uid() and is_active = true
  ), '{}');
end;
$$;

-- ----------------------------------------------------------------------------
-- 11. get_property_ids()  — same hardening as get_tenant_ids()
-- ----------------------------------------------------------------------------
-- Returns every property the current user may operate, via their active
-- memberships. Same recursion-avoidance and fail-closed guarantees.
create or replace function get_property_ids()
returns uuid[]
language plpgsql stable security definer
set search_path = public
as $$
begin
  return coalesce(array(
    select up.property_id
    from user_properties up
    join tenant_users tu on tu.id = up.tenant_user_id
    where tu.user_id = auth.uid() and tu.is_active = true
  ), '{}');
end;
$$;

-- ----------------------------------------------------------------------------
-- 12. is_tenant_admin()  — role gate for destructive writes
-- ----------------------------------------------------------------------------
-- True only when the current user is an ACTIVE owner/manager of the given
-- tenant. Same hardening as the resolvers (STABLE, SECURITY DEFINER, pinned
-- search_path) and fail-closed: EXISTS yields false, never NULL, so a missing
-- membership denies rather than fails open. SECURITY DEFINER also keeps its
-- read of tenant_users from re-triggering that table's RLS.
create or replace function is_tenant_admin(p_tenant_id uuid)
returns boolean
language plpgsql stable security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from tenant_users
    where user_id = auth.uid()
      and tenant_id = p_tenant_id
      and is_active = true
      and role in ('owner', 'manager')
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 13. Row-Level Security
-- ----------------------------------------------------------------------------
-- Recursion note: every member policy below scopes via get_tenant_ids() /
-- is_tenant_admin(), which are SECURITY DEFINER and therefore read tenant_users
-- WITHOUT invoking RLS. No policy queries a table whose own policy would
-- re-invoke it under the caller's rights, so none of these policies can recurse.
--
-- Read vs write: SELECT policies are membership-only (front desk staff must read
-- settings and property data to do their job). Destructive writes additionally
-- require an admin role via is_tenant_admin().

alter table tenants           enable row level security;
alter table properties        enable row level security;
alter table tenant_users      enable row level security;
alter table user_properties   enable row level security;
alter table tenant_settings   enable row level security;
alter table property_settings enable row level security;

-- --- tenants ---------------------------------------------------------------
-- SELECT: any active member of the tenant may read it.
drop policy if exists tenants_member_select on tenants;
create policy tenants_member_select on tenants
  for select to authenticated
  using (id = any(get_tenant_ids()));

-- UPDATE: admin only. Prevents a front_desk/housekeeper/etc. from editing the
-- tenant's name or status.
drop policy if exists tenants_member_update on tenants;
create policy tenants_member_update on tenants
  for update to authenticated
  using (is_tenant_admin(id))
  with check (is_tenant_admin(id));

-- --- properties ------------------------------------------------------------
-- SELECT: any active member of the owning tenant may read properties. Property
-- selection within the tenant is enforced at the app layer via get_property_ids().
drop policy if exists properties_member_select on properties;
create policy properties_member_select on properties
  for select to authenticated
  using (tenant_id = any(get_tenant_ids()));

-- INSERT/UPDATE/DELETE: admin only. Prevents a front desk user from creating,
-- renaming, or deleting a property.
drop policy if exists properties_member_insert on properties;
create policy properties_member_insert on properties
  for insert to authenticated
  with check (is_tenant_admin(tenant_id));

drop policy if exists properties_member_update on properties;
create policy properties_member_update on properties
  for update to authenticated
  using (is_tenant_admin(tenant_id))
  with check (is_tenant_admin(tenant_id));

drop policy if exists properties_member_delete on properties;
create policy properties_member_delete on properties
  for delete to authenticated
  using (is_tenant_admin(tenant_id));

-- --- tenant_settings -------------------------------------------------------
-- SELECT: any active member may read (front desk needs VAT to build a folio).
-- INSERT/UPDATE/DELETE: admin only. Prevents a front desk user from altering the
-- VAT rate. NOT public — this table gets no anon/public policy.
drop policy if exists tenant_settings_member_select on tenant_settings;
create policy tenant_settings_member_select on tenant_settings
  for select to authenticated
  using (tenant_id = any(get_tenant_ids()));

drop policy if exists tenant_settings_member_insert on tenant_settings;
create policy tenant_settings_member_insert on tenant_settings
  for insert to authenticated
  with check (is_tenant_admin(tenant_id));

drop policy if exists tenant_settings_member_update on tenant_settings;
create policy tenant_settings_member_update on tenant_settings
  for update to authenticated
  using (is_tenant_admin(tenant_id))
  with check (is_tenant_admin(tenant_id));

drop policy if exists tenant_settings_member_delete on tenant_settings;
create policy tenant_settings_member_delete on tenant_settings
  for delete to authenticated
  using (is_tenant_admin(tenant_id));

-- --- property_settings -----------------------------------------------------
-- SELECT: any active member of the property's tenant may read branding/config.
-- INSERT/UPDATE/DELETE: admin only, gated on the parent property's tenant.
-- Prevents a front desk user from changing the hotel's template or branding.
drop policy if exists property_settings_member_select on property_settings;
create policy property_settings_member_select on property_settings
  for select to authenticated
  using (exists (
    select 1 from properties p
    where p.id = property_settings.property_id
      and p.tenant_id = any(get_tenant_ids())
  ));

drop policy if exists property_settings_member_insert on property_settings;
create policy property_settings_member_insert on property_settings
  for insert to authenticated
  with check (exists (
    select 1 from properties p
    where p.id = property_settings.property_id
      and is_tenant_admin(p.tenant_id)
  ));

drop policy if exists property_settings_member_update on property_settings;
create policy property_settings_member_update on property_settings
  for update to authenticated
  using (exists (
    select 1 from properties p
    where p.id = property_settings.property_id
      and is_tenant_admin(p.tenant_id)
  ))
  with check (exists (
    select 1 from properties p
    where p.id = property_settings.property_id
      and is_tenant_admin(p.tenant_id)
  ));

drop policy if exists property_settings_member_delete on property_settings;
create policy property_settings_member_delete on property_settings
  for delete to authenticated
  using (exists (
    select 1 from properties p
    where p.id = property_settings.property_id
      and is_tenant_admin(p.tenant_id)
  ));

-- --- tenant_users & user_properties ----------------------------------------
-- DELIBERATE: neither tenants, tenant_users, nor user_properties has an insert
-- (or, for the latter two, any write) policy. Tenant creation and membership /
-- property grants are intentionally out of reach of the client. During early
-- operation the operator performs them manually via the SQL editor; they will
-- later move to SECURITY DEFINER RPCs that write an audit trail. No insert
-- policy is to be added to any of these tables until that RPC exists first.
--
-- SELECT: active members may read memberships of their own tenant(s).
drop policy if exists tenant_users_member_select on tenant_users;
create policy tenant_users_member_select on tenant_users
  for select to authenticated
  using (tenant_id = any(get_tenant_ids()));

-- SELECT: active members may read property grants whose parent membership
-- belongs to one of their tenants.
drop policy if exists user_properties_member_select on user_properties;
create policy user_properties_member_select on user_properties
  for select to authenticated
  using (exists (
    select 1 from tenant_users tu
    where tu.id = user_properties.tenant_user_id
      and tu.tenant_id = any(get_tenant_ids())
  ));

-- ----------------------------------------------------------------------------
-- 14. Public read for guest-facing sites (anon AND authenticated)
-- ----------------------------------------------------------------------------
-- Anonymous marketing visitors have no session, so get_tenant_ids() returns
-- '{}' and the member policies admit nothing. But guest PORTAL users are role
-- `authenticated` and also hold no tenant membership, so get_tenant_ids() is
-- '{}' for them too. Both must be able to read branding, so these policies cover
-- `anon, authenticated`. This exposes nothing new: anon can already read the
-- same rows, and authenticated is a strict superset of that audience here.
--
-- "Good standing" for public serving = tenant status in ('trial','active') and
-- not deleted. Trial is INCLUDED: a new customer is in trial for the entire
-- build, which is exactly when their guest site must render. 'suspended' and
-- 'cancelled' are excluded, so suspending a tenant is our enforcement lever.
--
-- PUBLIC BY DESIGN: tenants, properties, property_settings ONLY. tenant_settings
-- is NOT public (accounting config). No table holding guest data, bookings,
-- folios, financials, staff information, or inventory may EVER receive a public
-- policy.

-- Admits: anyone, to read a tenant that is in good standing (trial or active)
-- and not deleted. Suspended/cancelled tenants disappear from public view.
drop policy if exists tenants_public_select on tenants;
create policy tenants_public_select on tenants
  for select to anon, authenticated
  using (status in ('trial', 'active') and deleted_at is null);

-- Admits: anyone, to read a property only when the property itself is active and
-- not deleted AND its owning tenant is in good standing. Rule: a guest-facing
-- page is served only when the property is active AND its tenant is in good
-- standing, so suspending a tenant takes all of their sites down.
drop policy if exists properties_public_select on properties;
create policy properties_public_select on properties
  for select to anon, authenticated
  using (
    status = 'active'
    and deleted_at is null
    and exists (
      select 1 from tenants t
      where t.id = properties.tenant_id
        and t.status in ('trial', 'active')
        and t.deleted_at is null
    )
  );

-- Admits: anyone, to read a property's branding/config only when the parent
-- property is active and not deleted AND the tenant above it is in good standing.
-- property_settings has no status/deleted_at of its own, so this joins through
-- properties to tenants. Rule: a guest-facing page is served only when the
-- property is active AND its tenant is in good standing, so suspending a tenant
-- takes all of their sites down.
drop policy if exists property_settings_public_select on property_settings;
create policy property_settings_public_select on property_settings
  for select to anon, authenticated
  using (exists (
    select 1
    from properties p
    join tenants t on t.id = p.tenant_id
    where p.id = property_settings.property_id
      and p.status = 'active'
      and p.deleted_at is null
      and t.status in ('trial', 'active')
      and t.deleted_at is null
  ));

-- ============================================================================
-- End of 001_initial_tenancy.sql
-- ============================================================================
