-- ============================================================================
-- 003_property_location.sql
-- Palstro-Hotels: real location and contact data on properties.
--
-- Adds a structured postal address, geo-coordinates, and contact details as
-- FIRST-CLASS COLUMNS on properties — deliberately NOT in
-- property_settings.branding.
--
-- WHY COLUMNS, NOT BRANDING JSONB (the 001 split rule):
--   branding is presentation-only freeform JSONB the guest site renders and the
--   database cannot validate, constrain, or aggregate. But a hotel's address and
--   contact details are read by INVOICES, RECEIPTS, BOOKING CONFIRMATIONS and TAX
--   DOCUMENTS — operational and accounting output, not just the marketing site.
--   Per 001's rule "anything an accounting or operational document reads is a
--   column, anything only a guest sees is property-level branding", these belong
--   in typed columns.
--
-- No new RLS policies: these are columns on an existing table already covered by
-- 001's member-select, admin-write, and public-read policies (including the
-- public read the guest site uses).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Structured postal address + contact columns
-- ----------------------------------------------------------------------------
-- All nullable except country (every property is somewhere; country defaults to
-- Nigeria, the first market). add column if not exists keeps the migration
-- re-runnable, matching 001/002's guarded style.
alter table properties
  add column if not exists address_line text,
  add column if not exists city         text,
  add column if not exists state        text,
  add column if not exists postal_code  text,
  add column if not exists country      text not null default 'Nigeria',
  -- numeric(10,7): 7 decimal places is ~1cm precision at the equator — more than
  -- enough to pin a building — and numeric (not float) avoids the binary
  -- floating-point rounding that would drift a pinned coordinate.
  add column if not exists latitude     numeric(10,7),
  add column if not exists longitude    numeric(10,7),
  add column if not exists phone        text,
  add column if not exists email        text;

-- ----------------------------------------------------------------------------
-- 2. Documentation
-- ----------------------------------------------------------------------------
-- Re-state the table comment so the 001 description survives AND the split-rule
-- rationale for these columns is recorded where a reader will find it. (comment
-- on table replaces the whole comment, so both halves live here.)
comment on table properties is
  'A physical hotel belonging to a tenant. Operational data is scoped to one property. '
  'Address and contact columns (address_line..email) are real COLUMNS, not '
  'property_settings.branding: they appear on invoices, receipts, booking confirmations '
  'and tax documents, not only the marketing site. Per the 001 split rule, anything an '
  'accounting or operational document reads is a typed column — never freeform branding '
  'JSONB the database cannot validate, constrain, or aggregate. Only genuinely '
  'presentational bits (directions text, social links) stay in branding.';

comment on column properties.country is
  'Not null, defaults to Nigeria (the first market). Every property is somewhere, so '
  'unlike the other address parts this one is never absent.';
comment on column properties.latitude is
  'Geographic latitude. numeric(10,7) ~ 1cm precision; numeric (not float) avoids the '
  'floating-point rounding that would drift a pinned coordinate.';
comment on column properties.longitude is
  'Geographic longitude. numeric(10,7) ~ 1cm precision; numeric (not float) avoids the '
  'floating-point rounding that would drift a pinned coordinate.';

-- ============================================================================
-- End of 003_property_location.sql
-- ============================================================================
