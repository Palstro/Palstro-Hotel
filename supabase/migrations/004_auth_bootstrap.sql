-- ============================================================================
-- 004_auth_bootstrap.sql
-- Palstro-Hotels: the deliberate manual bootstrap path for granting a user
-- ownership of a tenant.
--
-- This is the SECURITY DEFINER RPC referenced in 001's "no client insert path"
-- note: tenant_users and user_properties have no client insert policy by design
-- (see 001 §13). The operator runs THIS function via the SQL editor /
-- service_role to seat the first owner of a tenant and grant them every
-- property. It is not, and must never become, client-callable.
--
-- Self-service tenant signup (a prospect creating their OWN tenant + owner in
-- one flow, with billing and an audit trail) is a separate, larger RPC that
-- ships with the commercial signup flow. This function is only the operator's
-- bootstrap lever.
--
-- Idempotency: this RPC is naturally idempotent on the two membership NATURAL
-- keys (tenant_users(tenant_id,user_id) and user_properties(tenant_user_id,
-- property_id)) via ON CONFLICT DO NOTHING, which is strictly stronger than a
-- p_idempotency_key here — re-running can never create a second owner row or a
-- duplicate grant. So, unlike a transactional write RPC (CLAUDE.md rule 2), it
-- deliberately takes no p_idempotency_key: there is no transaction to
-- de-duplicate beyond what the unique constraints already guarantee.
-- ============================================================================

create or replace function create_tenant_owner(
  p_user_id   uuid,
  p_tenant_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_user_id uuid;
begin
  -- Fail loudly and specifically if the tenant is missing or soft-deleted,
  -- rather than silently seating an owner on a tenant that cannot serve.
  if not exists (
    select 1 from tenants
    where id = p_tenant_id
      and deleted_at is null
  ) then
    raise exception
      'create_tenant_owner: tenant % does not exist or is soft-deleted',
      p_tenant_id
      using errcode = 'no_data_found';
  end if;

  -- 1. Seat the owner membership. created_by is set EXPLICITLY: under
  --    service_role auth.uid() is NULL, so set_row_audit()'s
  --    coalesce(auth.uid(), new.created_by) would otherwise leave it NULL.
  --    The bootstrapped owner is attributed as the creator of their own
  --    membership. ON CONFLICT DO NOTHING makes a re-run a no-op.
  insert into tenant_users (tenant_id, user_id, role, created_by)
  values (p_tenant_id, p_user_id, 'owner', p_user_id)
  on conflict (tenant_id, user_id) do nothing;

  -- Fetch the membership id whether we just inserted it or it already existed
  -- (ON CONFLICT DO NOTHING returns no row on conflict).
  select id
    into v_tenant_user_id
    from tenant_users
   where tenant_id = p_tenant_id
     and user_id = p_user_id;

  -- 2. Grant that membership access to every LIVE property of the tenant.
  --    Soft-deleted properties are excluded (deleted_at is null, rule 5).
  --    A set-based insert, naturally idempotent per grant via ON CONFLICT.
  insert into user_properties (tenant_user_id, property_id, created_by)
  select v_tenant_user_id, p.id, p_user_id
    from properties p
   where p.tenant_id = p_tenant_id
     and p.deleted_at is null
  on conflict (tenant_user_id, property_id) do nothing;
end;
$$;

comment on function create_tenant_owner(uuid, uuid) is
  'Operator bootstrap (service_role only): seats p_user_id as owner of '
  'p_tenant_id and grants access to all live properties. The deliberate manual '
  'path from 001''s no-client-insert note. Idempotent on the membership natural '
  'keys. NOT the self-service signup RPC.';

-- Bootstrap only: never reachable from the client. Revoke the default PUBLIC
-- execute, revoke from the two client roles explicitly (belt-and-braces), and
-- grant to service_role alone.
revoke all     on function create_tenant_owner(uuid, uuid) from public;
revoke execute on function create_tenant_owner(uuid, uuid) from anon, authenticated;
grant  execute on function create_tenant_owner(uuid, uuid) to service_role;

-- ----------------------------------------------------------------------------
-- Auto-grant new properties to tenant admins
-- ----------------------------------------------------------------------------
-- create_tenant_owner() grants existing properties at bootstrap time, but a
-- property added LATER would have no grant for anyone. Since get_property_ids()
-- reads user_properties, that new property would silently vanish from every
-- operational screen — an owner would add their own new hotel and then not see
-- it. This AFTER INSERT trigger closes that gap: the moment a property exists,
-- every active owner and manager of its tenant gets a user_properties row.
--
-- Design note: owners and managers get EVERY property in their tenant
-- automatically (they run the company). Rank-and-file staff are NOT auto-granted
-- here — they are added to a specific hotel individually, which is the entire
-- point of user_properties (a front desk clerk at one hotel must not see
-- another's arrivals). So this trigger is deliberately scoped to admins only.
--
-- SECURITY DEFINER + pinned search_path: user_properties has no client write
-- policy (001 §13), so the trigger must run with the owner's rights to insert,
-- exactly like the settings auto-provision triggers in 001. ON CONFLICT DO
-- NOTHING keeps it idempotent (e.g. a re-fired trigger, or an admin already
-- granted at bootstrap). created_by is set EXPLICITLY to the grantee's user_id:
-- when a property is inserted via service_role (no session) auth.uid() is NULL,
-- so set_row_audit()'s coalesce(auth.uid(), new.created_by) would otherwise
-- leave the grant's actor NULL.
create or replace function grant_property_to_tenant_admins()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into user_properties (tenant_user_id, property_id, created_by)
  select tu.id, new.id, tu.user_id
    from tenant_users tu
   where tu.tenant_id = new.tenant_id
     and tu.is_active = true
     and tu.role in ('owner', 'manager')
  on conflict (tenant_user_id, property_id) do nothing;
  return new;
end;
$$;

drop trigger if exists grant_property_to_tenant_admins_after_insert on properties;
create trigger grant_property_to_tenant_admins_after_insert
  after insert on properties
  for each row execute function grant_property_to_tenant_admins();

-- ============================================================================
-- End of 004_auth_bootstrap.sql
-- ============================================================================
