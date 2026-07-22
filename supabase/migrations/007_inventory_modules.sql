-- ============================================================================
-- 007_inventory_modules.sql
-- Palstro-Hotels: add the Inventory module group to the enabled_modules set.
--
-- 006 shipped enabled_modules with a 13-module default. The Inventory group
-- (Store, Requisitions, Purchases, Suppliers, Stock Counts — see adminNav.ts)
-- adds five module keys. 006 is already applied, so the default is changed here
-- in a NEW migration rather than by editing 006.
--
-- Two steps, because changing a column default does NOT touch existing rows:
--   1. Move the default forward so newly-provisioned tenants get the full set.
--   2. Backfill existing tenant_settings rows so already-provisioned tenants
--      (Heledon under 006) actually see the new modules — otherwise the point of
--      the change is lost for every tenant that already exists.
-- No schema/table changes; no new RLS. The check constraint from 006
-- ('settings' must be present) is unaffected — settings stays in the set.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. New default: the 13 original modules + the 5 Inventory modules.
-- ----------------------------------------------------------------------------
-- Keep this list in lockstep with the AdminModule union in adminNav.ts.
alter table tenant_settings
  alter column enabled_modules set default array[
    'front_desk','bookings','rooms','housekeeping','guests',
    'rates','food_beverage','laundry',
    'store','requisitions','purchases','suppliers','stock_counts',
    'maintenance','staff','reports','accounting',
    'settings'
  ]::text[];

-- ----------------------------------------------------------------------------
-- 2. Backfill existing rows — append ONLY the new keys that are missing.
-- ----------------------------------------------------------------------------
-- Appends the Inventory keys a row does not already have, preserving each
-- tenant's existing choices (a module they deliberately disabled is never
-- re-enabled, because we only ever ADD keys from the Inventory set, never touch
-- the others). The array_length guard means rows already carrying all five are
-- left untouched, so re-running this migration is a no-op.
update tenant_settings ts
set enabled_modules = ts.enabled_modules || add.to_append
from (
  select
    tenant_id,
    array(
      select m
      from unnest(array[
        'store','requisitions','purchases','suppliers','stock_counts'
      ]::text[]) as m
      where m <> all(enabled_modules)
    ) as to_append
  from tenant_settings
) add
where ts.tenant_id = add.tenant_id
  and array_length(add.to_append, 1) > 0;

-- ============================================================================
-- End of 007_inventory_modules.sql
-- ============================================================================
