-- ============================================================================
-- 008_settings_patch.sql
-- Palstro-Hotels: safe, concurrency-guarded partial writes for every settings
-- surface. This is the write half of the settings framework (build 3).
--
-- ----------------------------------------------------------------------------
-- WHY THIS MIGRATION EXISTS — the lost-update problem, stated plainly
-- ----------------------------------------------------------------------------
-- property_settings.branding is a single JSONB column. The naive save path is:
-- read the whole object, change one key, write the whole object back. Two admins
-- editing DIFFERENT tabs at the same time then race:
--
--   1. Admin A loads branding = { primary: X, tagline: T }.
--   2. Admin B loads the same object.
--   3. Admin A saves a new primary  -> branding = { primary: X2, tagline: T }.
--   4. Admin B saves a new tagline, writing back the WHOLE object it loaded in
--      step 2 -> branding = { primary: X, tagline: T2 }.
--
-- Admin A's primary change is gone. No error fired. The last full-object write
-- wins and silently erases the other's work — the worst kind of failure, because
-- nobody learns it happened until a guest sees the wrong colour.
--
-- Two mechanisms here kill that:
--   * MERGE, don't replace. branding = branding || p_patch changes only the keys
--     the caller actually touched, so two admins editing different keys never
--     collide in the first place.
--   * OPTIMISTIC CONCURRENCY. Every RPC takes the updated_at the client loaded
--     with (p_expected_updated_at) and refuses the write if the row has since
--     moved on. A client working from stale data is REJECTED (errcode PT409),
--     not allowed to clobber. The client turns PT409 into "someone else changed
--     this, reload" — it never auto-discards the user's typing.
--
-- All four RPCs below follow the IDENTICAL shape so future settings surfaces
-- (email templates in build 6, etc.) copy it without thinking:
--   resolve owning tenant -> is_tenant_admin gate -> lock row FOR UPDATE ->
--   compare updated_at -> apply -> RETURN the fresh row (so the client gets the
--   new updated_at without a second fetch).
--
-- SECURITY DEFINER + `set search_path = public` on every one: these bypass RLS,
-- so each re-checks authorisation itself via is_tenant_admin(). auth.uid() inside
-- a SECURITY DEFINER function still resolves to the CALLING admin (it reads the
-- request JWT, not the function owner), so the shared set_row_audit() trigger
-- stamps updated_by with the real actor — we deliberately do NOT override the
-- audit columns here.
--
-- Custom SQLSTATEs the client keys off (see SettingsForm):
--   PT409  concurrency conflict (stale updated_at)  -> "reload" message
--   PT403  caller is not an admin of the owning tenant
--   PT404  property / settings row not found
--
-- Not idempotency-keyed (rule 2): these are configuration patches, not
-- financial writes. The updated_at guard is their correctness mechanism — a
-- double-submit re-sends the same stale updated_at and is safely rejected with
-- PT409 rather than applied twice. No duplicate row, charge or payment is
-- possible here, so the idempotency-key machinery rule 2 mandates for
-- booking/folio/payment writes does not apply.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. update_property_branding — merge into property_settings.branding (JSONB)
-- ----------------------------------------------------------------------------
create or replace function update_property_branding(
  p_property_id         uuid,
  p_patch               jsonb,
  p_expected_updated_at timestamptz
) returns property_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id  uuid;
  v_updated_at timestamptz;
  v_result     property_settings;
begin
  -- Owning tenant (and confirm the property is live). A soft-deleted property
  -- has no editable settings.
  select p.tenant_id
    into v_tenant_id
  from properties p
  where p.id = p_property_id
    and p.deleted_at is null;

  if v_tenant_id is null then
    raise exception 'Property % not found', p_property_id
      using errcode = 'PT404';
  end if;

  -- RLS is bypassed under SECURITY DEFINER, so authorise explicitly. Only an
  -- owner/manager of the property's tenant may edit branding.
  if not is_tenant_admin(v_tenant_id) then
    raise exception 'You are not authorised to edit this property''s settings'
      using errcode = 'PT403';
  end if;

  -- Lock the settings row so the read-compare-write below is atomic: no second
  -- transaction can slip a write between our check and our update.
  select ps.updated_at
    into v_updated_at
  from property_settings ps
  where ps.property_id = p_property_id
  for update;

  if v_updated_at is null then
    raise exception 'Settings for property % not found', p_property_id
      using errcode = 'PT404';
  end if;

  -- The optimistic-concurrency gate. `is distinct from` is NULL-safe: a client
  -- that omitted the token (NULL) never accidentally matches a real timestamp.
  if p_expected_updated_at is distinct from v_updated_at then
    raise exception 'These settings were changed by someone else since you loaded them'
      using errcode = 'PT409',
            hint = 'Reload to see the latest values, then reapply your change.';
  end if;

  -- MERGE, not replace: only the supplied keys change. set_row_audit() bumps
  -- updated_at/updated_by; we return the fresh row so the client re-bases its
  -- concurrency token without a second round trip.
  update property_settings
     set branding = branding || p_patch
   where property_id = p_property_id
  returning * into v_result;

  return v_result;
end;
$$;

comment on function update_property_branding(uuid, jsonb, timestamptz) is
  'Merge a partial patch into property_settings.branding under an optimistic '
  'updated_at check. Admin-gated; SECURITY DEFINER. Raises PT409 on a stale write.';

-- ----------------------------------------------------------------------------
-- 2. update_property_config — property_settings COLUMNS (template, booking)
-- ----------------------------------------------------------------------------
-- The fourth storage target from the brief's own list (property_settings
-- columns) needs a writer distinct from the branding-JSONB merge above, because
-- template/booking_enabled are typed, constrained columns — not branding keys.
-- Same table as branding, so it shares the same updated_at token; a tab that
-- changes both a branding key AND template must sequence the two writes and
-- thread the returned updated_at (the client does exactly this).
--
-- p_patch ? 'key' (JSONB key-presence) means only supplied columns are touched,
-- so a save that changes template alone never disturbs booking_enabled.
create or replace function update_property_config(
  p_property_id         uuid,
  p_patch               jsonb,
  p_expected_updated_at timestamptz
) returns property_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id  uuid;
  v_updated_at timestamptz;
  v_result     property_settings;
begin
  select p.tenant_id
    into v_tenant_id
  from properties p
  where p.id = p_property_id
    and p.deleted_at is null;

  if v_tenant_id is null then
    raise exception 'Property % not found', p_property_id
      using errcode = 'PT404';
  end if;

  if not is_tenant_admin(v_tenant_id) then
    raise exception 'You are not authorised to edit this property''s settings'
      using errcode = 'PT403';
  end if;

  select ps.updated_at
    into v_updated_at
  from property_settings ps
  where ps.property_id = p_property_id
  for update;

  if v_updated_at is null then
    raise exception 'Settings for property % not found', p_property_id
      using errcode = 'PT404';
  end if;

  if p_expected_updated_at is distinct from v_updated_at then
    raise exception 'These settings were changed by someone else since you loaded them'
      using errcode = 'PT409',
            hint = 'Reload to see the latest values, then reapply your change.';
  end if;

  update property_settings
     set template = case
                      when p_patch ? 'template' then p_patch ->> 'template'
                      else template
                    end,
         booking_enabled = case
                             when p_patch ? 'booking_enabled'
                               then (p_patch ->> 'booking_enabled')::boolean
                             else booking_enabled
                           end
   where property_id = p_property_id
  returning * into v_result;

  return v_result;
end;
$$;

comment on function update_property_config(uuid, jsonb, timestamptz) is
  'Patch property_settings columns (template, booking_enabled) under an '
  'optimistic updated_at check. Admin-gated; SECURITY DEFINER. PT409 on stale.';

-- ----------------------------------------------------------------------------
-- 3. update_property_details — properties COLUMNS (location & operations)
-- ----------------------------------------------------------------------------
-- nullif(x, '') turns a cleared text field back into NULL, so blanking an
-- optional column (phone, address) stores NULL rather than an empty string that
-- rule §6 (MISSING_VALUE) would then have to paper over on read.
create or replace function update_property_details(
  p_property_id         uuid,
  p_patch               jsonb,
  p_expected_updated_at timestamptz
) returns properties
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id  uuid;
  v_updated_at timestamptz;
  v_result     properties;
begin
  select p.tenant_id, p.updated_at
    into v_tenant_id, v_updated_at
  from properties p
  where p.id = p_property_id
    and p.deleted_at is null
  for update;

  if v_tenant_id is null then
    raise exception 'Property % not found', p_property_id
      using errcode = 'PT404';
  end if;

  if not is_tenant_admin(v_tenant_id) then
    raise exception 'You are not authorised to edit this property'
      using errcode = 'PT403';
  end if;

  if p_expected_updated_at is distinct from v_updated_at then
    raise exception 'This property was changed by someone else since you loaded it'
      using errcode = 'PT409',
            hint = 'Reload to see the latest values, then reapply your change.';
  end if;

  -- name is NOT NULL and is rendered site-wide: reject a blank/whitespace-only
  -- value rather than writing it. (slug stays deliberately unpatchable — it
  -- breaks URLs; name carries no such risk.)
  if p_patch ? 'name' and length(trim(coalesce(p_patch ->> 'name', ''))) = 0 then
    raise exception 'Hotel name cannot be empty'
      using errcode = 'PT422';
  end if;

  update properties
     set name = case
                  when p_patch ? 'name' then trim(p_patch ->> 'name')
                  else name
                end,
         timezone = case
                      when p_patch ? 'timezone' then p_patch ->> 'timezone'
                      else timezone
                    end,
         currency = case
                      when p_patch ? 'currency' then p_patch ->> 'currency'
                      else currency
                    end,
         night_audit_time = case
                              when p_patch ? 'night_audit_time'
                                then (p_patch ->> 'night_audit_time')::time
                              else night_audit_time
                            end,
         phone = case
                   when p_patch ? 'phone' then nullif(p_patch ->> 'phone', '')
                   else phone
                 end,
         email = case
                   when p_patch ? 'email' then nullif(p_patch ->> 'email', '')
                   else email
                 end,
         address_line = case
                          when p_patch ? 'address_line'
                            then nullif(p_patch ->> 'address_line', '')
                          else address_line
                        end,
         city = case
                  when p_patch ? 'city' then nullif(p_patch ->> 'city', '')
                  else city
                end,
         state = case
                   when p_patch ? 'state' then nullif(p_patch ->> 'state', '')
                   else state
                 end,
         postal_code = case
                         when p_patch ? 'postal_code'
                           then nullif(p_patch ->> 'postal_code', '')
                         else postal_code
                       end
   where id = p_property_id
  returning * into v_result;

  return v_result;
end;
$$;

comment on function update_property_details(uuid, jsonb, timestamptz) is
  'Patch properties columns (timezone, currency, night audit, contact/location) '
  'under an optimistic updated_at check. Admin-gated; SECURITY DEFINER. PT409 on stale.';

-- ----------------------------------------------------------------------------
-- 4. update_tenant_settings — tenant_settings COLUMNS (accounting-level)
-- ----------------------------------------------------------------------------
-- enabled_modules is deliberately NOT patchable here: module entitlement is an
-- operator/billing action (see 006/007), not a per-property admin toggle. Only
-- default_vat_rate is exposed; its 0..1 check constraint still guards the value.
create or replace function update_tenant_settings(
  p_tenant_id           uuid,
  p_patch               jsonb,
  p_expected_updated_at timestamptz
) returns tenant_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_at timestamptz;
  v_result     tenant_settings;
begin
  if not is_tenant_admin(p_tenant_id) then
    raise exception 'You are not authorised to edit this tenant''s settings'
      using errcode = 'PT403';
  end if;

  select ts.updated_at
    into v_updated_at
  from tenant_settings ts
  where ts.tenant_id = p_tenant_id
  for update;

  if v_updated_at is null then
    raise exception 'Settings for tenant % not found', p_tenant_id
      using errcode = 'PT404';
  end if;

  if p_expected_updated_at is distinct from v_updated_at then
    raise exception 'These settings were changed by someone else since you loaded them'
      using errcode = 'PT409',
            hint = 'Reload to see the latest values, then reapply your change.';
  end if;

  update tenant_settings
     set default_vat_rate = case
                              when p_patch ? 'default_vat_rate'
                                then (p_patch ->> 'default_vat_rate')::numeric
                              else default_vat_rate
                            end
   where tenant_id = p_tenant_id
  returning * into v_result;

  return v_result;
end;
$$;

comment on function update_tenant_settings(uuid, jsonb, timestamptz) is
  'Patch tenant_settings columns (default_vat_rate) under an optimistic '
  'updated_at check. Admin-gated; SECURITY DEFINER. PT409 on stale.';

-- ----------------------------------------------------------------------------
-- 5. Grants — authenticated only, never anon
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER functions default to EXECUTE for PUBLIC, which would let an
-- anonymous guest visitor invoke them (the is_tenant_admin gate would reject
-- them, but the surface should not be reachable at all). Revoke PUBLIC, grant
-- authenticated.
revoke execute on function update_property_branding(uuid, jsonb, timestamptz) from public;
revoke execute on function update_property_config(uuid, jsonb, timestamptz)   from public;
revoke execute on function update_property_details(uuid, jsonb, timestamptz)  from public;
revoke execute on function update_tenant_settings(uuid, jsonb, timestamptz)   from public;

grant execute on function update_property_branding(uuid, jsonb, timestamptz) to authenticated;
grant execute on function update_property_config(uuid, jsonb, timestamptz)   to authenticated;
grant execute on function update_property_details(uuid, jsonb, timestamptz)  to authenticated;
grant execute on function update_tenant_settings(uuid, jsonb, timestamptz)   to authenticated;

-- ============================================================================
-- End of 008_settings_patch.sql
-- ============================================================================
