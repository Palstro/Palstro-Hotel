-- ============================================================================
-- 002_rooms.sql
-- Palstro-Hotels: room types and physical rooms.
--
-- TWO TABLES, NOT ONE — deliberately:
--   * room_types is WHAT A GUEST BOOKS and what the website advertises
--     ("Deluxe Double"): a marketable category with a rate, occupancy, photos.
--   * rooms is a PHYSICAL UNIT housekeeping cleans and the front desk assigns
--     at check-in (room 204). A guest choosing "Deluxe Double" is not choosing
--     204.
-- Conflating the two forces retrofitting one of them across every later module
-- (housekeeping board, front desk, folios) — the same category of mistake as
-- conflating tenant with property. Keep them separate from day one.
--
-- Both are MASTER DATA (configuration, not events), so per CLAUDE.md §6 they
-- carry deleted_at soft-delete (not is_voided) and NO business_date — nothing
-- here "happened" on an operating day.
--
-- Conventions inherited from 001: shared set_row_audit() trigger owns every
-- audit column; RLS scopes reads via get_tenant_ids() and gates writes via
-- is_tenant_admin(); public-read policies join through properties to tenants to
-- check "good standing". No seed data.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Structural consistency prerequisite
-- ----------------------------------------------------------------------------
-- To make "a child's tenant_id can never disagree with its parent" STRUCTURAL
-- rather than a matter of convention, the parent needs a unique key on exactly
-- the paired columns a child will reference. properties.id is already unique;
-- this adds (id, tenant_id) as a composite-FK target for room_types and rooms.
-- Guarded so re-running the migration does not error on the second add.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'properties_id_tenant_unique'
  ) then
    alter table properties
      add constraint properties_id_tenant_unique unique (id, tenant_id);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 1. room_types  — the bookable, advertisable category
-- ----------------------------------------------------------------------------
create table if not exists room_types (
  id                   uuid primary key default gen_random_uuid(),
  -- Both not null. tenant_id is the scoping root RLS reads directly; property_id
  -- ties the type to one physical hotel (a "Deluxe Double" is defined per
  -- property, since rate and photos differ between hotels in a group). Neither
  -- carries its own FK: a COMPOSITE FK at the end of this table binds the pair
  -- to the property, so tenant_id can never disagree with the property's tenant.
  tenant_id            uuid not null,
  property_id          uuid not null,

  name                 text not null,               -- e.g. "Deluxe Double"
  description          text,

  -- Money per CLAUDE.md §6: numeric(14,2), never float, never money-in-JSONB.
  base_rate            numeric(14,2) not null,

  max_adults           integer not null default 2,
  max_children         integer not null default 0,
  bed_configuration    text,                        -- free text, e.g. "1 King"

  -- Dimensional value (square metres), not an inventory quantity, so 2dp is
  -- correct here; the numeric(14,4) quantity rule is for consumable measures.
  size_sqm             numeric(14,2),               -- nullable

  has_air_conditioning boolean not null default true,
  is_smoking           boolean not null default false,

  -- Postgres text array; default empty, never null, so app code never guards a
  -- null before iterating amenity labels.
  amenities            text[] not null default '{}',

  -- Ordered array of image URLs (presentation data). jsonb per §6's rule that
  -- structured non-money presentation data is fine as jsonb; money never is.
  images               jsonb not null default '[]',

  display_order        integer not null default 0,  -- guest-site ordering

  -- A type can exist for operations (housekeeping, front desk) BEFORE it is
  -- advertised. Public read requires this true; internal reads do not.
  is_published         boolean not null default false,

  deleted_at           timestamptz,                 -- soft delete (master data)
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid default auth.uid() references auth.users(id),
  updated_by           uuid references auth.users(id),

  -- Composite FK: (property_id, tenant_id) must match a real properties row's
  -- (id, tenant_id). PREVENTS a room type being attached to a property that
  -- belongs to a DIFFERENT tenant — a cross-tenant leak RLS could never catch,
  -- because every policy trusts tenant_id directly. Cascade on parent teardown.
  constraint room_types_property_tenant_fk
    foreign key (property_id, tenant_id)
    references properties (id, tenant_id) on delete cascade,
  -- Unique key on (id, property_id) so rooms can bind (room_type_id,
  -- property_id) to it, guaranteeing a room only ever references a type from the
  -- SAME property (see the rooms composite FK).
  constraint room_types_id_property_unique unique (id, property_id)
);

comment on table room_types is
  'A bookable, advertisable room category (e.g. "Deluxe Double"). What a guest '
  'books and what the website shows — NOT a physical unit. Rooms are separate.';
comment on column room_types.base_rate is
  'The single advertised nightly rate for now. Rate plans (flexible vs '
  'non-refundable, meal inclusion, minimum stay, seasonal/weekend pricing) are '
  'DELIBERATELY not modelled here — they arrive with the booking module as a '
  'separate rate_plans table, so this stays one flat advertised rate.';
comment on column room_types.images is
  'Ordered array of image URLs (JSON). Presentation data only — never a rate or '
  'any figure accounting reads (§6: money is never stored in JSONB).';
comment on column room_types.is_published is
  'False lets a type exist for operations before it appears publicly. The public '
  'RLS policy requires this true; member reads ignore it.';

-- Required index: the guest site lists published types per property in order.
create index if not exists room_types_property_display_order_idx
  on room_types (property_id, display_order);
-- tenant_id drives the member-select policy predicate; index it as 001 does.
create index if not exists room_types_tenant_id_idx
  on room_types (tenant_id);

drop trigger if exists set_row_audit_room_types on room_types;
create trigger set_row_audit_room_types
  before insert or update on room_types
  for each row execute function set_row_audit();

-- ----------------------------------------------------------------------------
-- 2. rooms  — the physical unit
-- ----------------------------------------------------------------------------
create table if not exists rooms (
  id                  uuid primary key default gen_random_uuid(),
  -- No inline FKs: two COMPOSITE FKs at the end of this table bind these three
  -- columns so tenant_id, property_id, and room_type_id can never disagree with
  -- one another (see the constraints below).
  tenant_id           uuid not null,
  property_id         uuid not null,
  room_type_id        uuid not null,

  room_number         text not null,               -- unique per property, live rows only (index below)
  floor               text,                        -- nullable, free text

  -- Physical/operational availability of the unit. NOT the same axis as
  -- housekeeping_status (see below).
  status              text not null default 'available'
                        constraint rooms_status_check
                        check (status in ('available', 'occupied', 'out_of_service')),

  -- Housekeeping condition, a SEPARATE axis from status on purpose: a room can
  -- be occupied AND dirty at the same time (guest in house, not yet serviced).
  -- Collapsing these two into one field is a classic PMS mistake that breaks the
  -- housekeeping board — you can no longer represent "occupied + dirty" or
  -- "available + clean vs available + needs-inspection". Keep them independent.
  housekeeping_status text not null default 'clean'
                        constraint rooms_housekeeping_status_check
                        check (housekeeping_status in ('clean', 'dirty', 'inspected', 'in_progress')),

  notes               text,

  deleted_at          timestamptz,                 -- soft delete (master data)
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid default auth.uid() references auth.users(id),
  updated_by          uuid references auth.users(id),

  -- Composite FK: (property_id, tenant_id) must match a real properties row.
  -- PREVENTS a room being scoped to a tenant that does not own its property —
  -- the same cross-tenant leak guard as room_types. Cascade on teardown.
  constraint rooms_property_tenant_fk
    foreign key (property_id, tenant_id)
    references properties (id, tenant_id) on delete cascade,
  -- Composite FK: (room_type_id, property_id) must match a real room_types row.
  -- PREVENTS a room pointing at a room type from a DIFFERENT hotel: a "Deluxe
  -- Double" defined for hotel A can never be assigned to a room in hotel B.
  -- Cascade so a type's rooms fall with it on teardown.
  constraint rooms_room_type_property_fk
    foreign key (room_type_id, property_id)
    references room_types (id, property_id) on delete cascade
);

comment on table rooms is
  'A physical room unit housekeeping cleans and the front desk assigns. Belongs '
  'to exactly one room_type. NOT guest-bookable directly and NOT public.';
comment on constraint rooms_status_check on rooms is
  'Prevents unknown physical states; only available/occupied/out_of_service.';
comment on constraint rooms_housekeeping_status_check on rooms is
  'Prevents unknown housekeeping states; only clean/dirty/inspected/in_progress. '
  'Kept separate from status so occupied+dirty is representable.';
comment on column rooms.housekeeping_status is
  'Deliberately separate from status: a room can be occupied and dirty at once. '
  'Merging the two axes breaks the housekeeping board — do not collapse them.';

-- Required index: operational screens list rooms per property by status
-- (housekeeping board, availability views).
create index if not exists rooms_property_status_idx
  on rooms (property_id, status);
-- tenant_id drives the member-select policy predicate; index it as 001 does.
create index if not exists rooms_tenant_id_idx
  on rooms (tenant_id);
-- room_type_id is joined when rolling rooms up to their type; index the FK.
create index if not exists rooms_room_type_id_idx
  on rooms (room_type_id);

-- Room numbers are unique within a property, but for LIVE rows ONLY: a
-- decommissioned (soft-deleted, deleted_at set) room releases its number for
-- reuse. Renumbering after taking a unit out of service is normal hotel
-- practice, so the uniqueness is a partial index scoped to deleted_at is null
-- rather than a plain constraint that would block reuse forever.
create unique index if not exists rooms_property_room_number_live_uniq
  on rooms (property_id, room_number)
  where deleted_at is null;

drop trigger if exists set_row_audit_rooms on rooms;
create trigger set_row_audit_rooms
  before insert or update on rooms
  for each row execute function set_row_audit();

-- ----------------------------------------------------------------------------
-- 3. Row-Level Security
-- ----------------------------------------------------------------------------
-- Same pattern as 001. Member reads scope to the user's tenants via
-- get_tenant_ids() (SECURITY DEFINER, so it reads tenant_users without
-- re-invoking RLS — no recursion). Destructive writes additionally require an
-- admin role via is_tenant_admin(tenant_id). room_types additionally gets a
-- public-read policy for the guest site; rooms gets NONE (see the block at the
-- end of this file).

alter table room_types enable row level security;
alter table rooms      enable row level security;

-- --- room_types: member access --------------------------------------------
-- SELECT: any active member of the owning tenant may read every type, published
-- or not (front desk / housekeeping need unpublished types too).
drop policy if exists room_types_member_select on room_types;
create policy room_types_member_select on room_types
  for select to authenticated
  using (tenant_id = any(get_tenant_ids()));

-- INSERT/UPDATE/DELETE: admin only. Prevents a front_desk/housekeeper from
-- creating, editing rates/photos on, or removing a room type.
drop policy if exists room_types_member_insert on room_types;
create policy room_types_member_insert on room_types
  for insert to authenticated
  with check (is_tenant_admin(tenant_id));

drop policy if exists room_types_member_update on room_types;
create policy room_types_member_update on room_types
  for update to authenticated
  using (is_tenant_admin(tenant_id))
  with check (is_tenant_admin(tenant_id));

-- NO delete policy — BY DESIGN. Room types are SOFT-DELETED only: an admin
-- removes one by setting deleted_at through the update policy above. A hard
-- DELETE would cascade to every physical room of the type (and later its
-- booking/folio history), silently destroying records that must survive. The
-- drop below clears any delete policy a prior version of this migration created.
drop policy if exists room_types_member_delete on room_types;

-- --- rooms: member access --------------------------------------------------
-- SELECT: any active member of the owning tenant may read rooms.
drop policy if exists rooms_member_select on rooms;
create policy rooms_member_select on rooms
  for select to authenticated
  using (tenant_id = any(get_tenant_ids()));

-- INSERT/UPDATE/DELETE: admin only. Prevents a non-admin from adding, editing,
-- or removing physical rooms. (Day-to-day status/housekeeping changes will move
-- to purpose-built SECURITY DEFINER RPCs later; until then edits are admin-only,
-- matching 001's conservative default.)
drop policy if exists rooms_member_insert on rooms;
create policy rooms_member_insert on rooms
  for insert to authenticated
  with check (is_tenant_admin(tenant_id));

drop policy if exists rooms_member_update on rooms;
create policy rooms_member_update on rooms
  for update to authenticated
  using (is_tenant_admin(tenant_id))
  with check (is_tenant_admin(tenant_id));

-- NO delete policy — BY DESIGN. Rooms are SOFT-DELETED only (set deleted_at).
-- Rooms will later carry booking and folio history that must survive; a hard
-- DELETE would take that history with them. The drop below clears any delete
-- policy a prior version of this migration created.
drop policy if exists rooms_member_delete on rooms;

-- ----------------------------------------------------------------------------
-- 4. Public read for the guest site — room_types ONLY
-- ----------------------------------------------------------------------------
-- Matches the shape of property_settings_public_select in 001: join through
-- properties to tenants to check that the property is active and its tenant is
-- in good standing. Adds the two type-level gates: is_published and not deleted.
--
-- Admits: anyone (anon or authenticated portal user), to read a room type only
-- when ALL hold:
--   * the type itself is published and not soft-deleted, AND
--   * its parent property is active and not deleted, AND
--   * the tenant above that property is in good standing (trial/active) and not
--     deleted.
-- So unpublishing a type, deactivating a property, or suspending a tenant each
-- immediately removes the type from public view.
drop policy if exists room_types_public_select on room_types;
create policy room_types_public_select on room_types
  for select to anon, authenticated
  using (
    is_published = true
    and deleted_at is null
    and exists (
      select 1
      from properties p
      join tenants t on t.id = p.tenant_id
      where p.id = room_types.property_id
        and p.status = 'active'
        and p.deleted_at is null
        and t.status in ('trial', 'active')
        and t.deleted_at is null
    )
  );

-- ----------------------------------------------------------------------------
-- 5. rooms has NO public policy — BY DESIGN. DO NOT ADD ONE.
-- ----------------------------------------------------------------------------
-- Physical room numbers and their live occupancy/housekeeping state are
-- OPERATIONAL data. Exposing them to anonymous visitors would leak which rooms
-- exist and which are occupied — a guest-safety and security problem, and of no
-- use to a marketing visitor (who books a room_type, never a specific room).
-- rooms therefore has member/admin policies ONLY. If a future feature needs to
-- surface, say, live availability publicly, it must do so through an aggregate
-- (a count of free units per type via a SECURITY DEFINER RPC), NEVER by adding a
-- public SELECT policy that returns raw rooms rows.
--
-- With RLS enabled and no anon/public policy present, anon SELECTs on rooms
-- return zero rows — fail-closed, exactly as intended.

-- ============================================================================
-- End of 002_rooms.sql
-- ============================================================================
