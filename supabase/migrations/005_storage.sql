-- ============================================================================
-- 005_storage.sql
-- Palstro-Hotels: property media storage foundation.
--
-- Everything here serves ONE overriding goal from the brief: cost control.
-- Storage is cheap; EGRESS is the bill. So the design is:
--   * one PUBLIC bucket (guest sites are anonymous — signed URLs on public
--     photos would only add latency and per-request cost for no privacy gain),
--   * pre-resized WebP variants uploaded by the client (thumb/card/full) so a
--     room card never ships a 1920px hero, and
--   * a per-tenant byte QUOTA enforced at upload time, so one tenant dumping
--     hundreds of full-size photos can never become an unbounded egress bill.
--
-- Conventions inherited from 001/002 (followed verbatim here):
--   * shared set_row_audit() trigger owns every audit column,
--   * composite (id, tenant_id) FK target on properties makes a child's
--     tenant_id structurally unable to disagree with its parent (002 §0),
--   * RLS scopes member reads via get_tenant_ids() and gates writes via
--     is_tenant_admin(),
--   * numbered sequentially, one concern per file, re-runnable (guarded DDL).
-- No seed data.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Bucket: property-media
-- ----------------------------------------------------------------------------
-- PUBLIC read by design. Guest sites are served to anonymous visitors, and the
-- photos are public by intent (a hotel wants its rooms seen). Signed URLs would
-- add a round-trip and expiry-management complexity for zero privacy benefit.
--
-- Backstops set at the bucket level, independent of any app code that could be
-- bypassed or forgotten:
--   * file_size_limit 10MB — a hard ceiling on any single object. The client
--     also rejects >10MB before processing (imageProcessing.ts), but this is the
--     floor the database enforces even against a hand-rolled upload.
--   * allowed_mime_types jpeg/png/webp — the client always uploads WebP, but the
--     bucket refuses anything else regardless of caller.
--
-- Path convention (CLAUDE.md §6 storage-paths, extended with a size segment):
--   {tenant_id}/{property_id}/{category}/{size}/{filename}
--   categories: hero, gallery, rooms, logo, about
--   sizes:      thumb, card, full
-- The tenant_id in the FIRST segment is what the write policies below parse to
-- decide who may write — see the is_tenant_admin() check.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'property-media',
  'property-media',
  true,
  10485760,                                        -- 10 * 1024 * 1024 = 10MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public            = excluded.public,
  file_size_limit   = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- 2. Storage RLS on storage.objects (scoped to this bucket)
-- ----------------------------------------------------------------------------
-- storage.objects already has RLS enabled by Supabase. We add four policies, all
-- gated on bucket_id = 'property-media' so nothing here touches other buckets.
--
-- Write policies parse the tenant_id out of the FIRST path segment with
-- storage.foldername(name) — which returns the folder segments as a text[], the
-- filename excluded — and pass it to is_tenant_admin(). So only an active
-- owner/manager of the tenant that OWNS the first path segment may write there.
-- A non-uuid or empty first segment yields NULL (or a cast error), and
-- is_tenant_admin(NULL) is false: fail-closed either way. The app is responsible
-- for building the full 5-segment path; RLS's security boundary is purely
-- "the first segment is a tenant you administer".

-- READ: anyone (anon or authenticated) may read any object in the bucket.
-- PREVENTS nothing by design — these are public marketing photos; the point is
-- that a guest browser with no session can load them. It grants read on THIS
-- bucket only, never any other.
drop policy if exists "property_media_public_read" on storage.objects;
create policy "property_media_public_read" on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'property-media');

-- INSERT: only an admin of the tenant named in the first path segment may upload.
-- PREVENTS a member of tenant A from writing a file under tenant B's folder, and
-- prevents any non-admin (front desk, housekeeping) from uploading media at all.
drop policy if exists "property_media_admin_insert" on storage.objects;
create policy "property_media_admin_insert" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'property-media'
    and is_tenant_admin(((storage.foldername(name))[1])::uuid)
  );

-- UPDATE: same gate on BOTH the existing row (USING → old name) and the new row
-- (WITH CHECK → new name). PREVENTS an admin of tenant A from re-pathing an
-- object INTO tenant B's folder, and prevents a non-admin from overwriting media.
drop policy if exists "property_media_admin_update" on storage.objects;
create policy "property_media_admin_update" on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'property-media'
    and is_tenant_admin(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'property-media'
    and is_tenant_admin(((storage.foldername(name))[1])::uuid)
  );

-- DELETE: only an admin of the owning tenant may remove an object.
-- PREVENTS a non-admin, or an admin of another tenant, from deleting media —
-- which matters because deletes are how orphaned files get cleaned up
-- (deleteMediaAsset), and a cross-tenant delete would be data loss.
drop policy if exists "property_media_admin_delete" on storage.objects;
create policy "property_media_admin_delete" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'property-media'
    and is_tenant_admin(((storage.foldername(name))[1])::uuid)
  );

-- ----------------------------------------------------------------------------
-- 3. media_assets — one row per uploaded file
-- ----------------------------------------------------------------------------
-- The bucket holds bytes; this table is the INDEX over them. Without it there is
-- no way to (a) find orphaned files, (b) sum a tenant's usage for the quota, or
-- (c) know a file's category/variant/dimensions without parsing the path. One
-- row per variant per image — a single processed photo yields three rows
-- (thumb, card, full), each its own object in the bucket.
--
-- Composite-FK pattern from 002 §0: (property_id, tenant_id) references the
-- properties (id, tenant_id) unique key, so a media row's tenant_id can NEVER
-- disagree with its property's tenant — a cross-tenant leak RLS could not catch,
-- because every policy trusts tenant_id directly. Cascades on hard property
-- teardown (soft-deleted parents do not cascade — see the §6 warning; media
-- rows are filtered by their own deleted_at, NULL-safe per rule 5).
create table if not exists media_assets (
  id                uuid primary key default gen_random_uuid(),
  -- No inline FKs on these two: the composite FK at the end binds the pair to
  -- the parent property so tenant_id can never disagree with it.
  tenant_id         uuid not null,
  property_id       uuid not null,

  -- The object's full path in the bucket, unique so the same file can never be
  -- indexed twice. This is the join key between a row and its bytes; the pair
  -- MUST stay in lockstep (delete both together — see deleteMediaAsset and the
  -- CLAUDE.md §6 note added in this change).
  bucket_path       text not null unique,

  -- What the image is FOR, constrained to the fixed guest-site categories so a
  -- typo can't create an un-renderable "galery" bucket nobody queries.
  category          text not null
                      constraint media_assets_category_check
                      check (category in ('hero', 'gallery', 'rooms', 'logo', 'about')),

  -- Which resized variant this row is. Constrained to the three the client
  -- produces so every consumer can safely ask for a known size.
  size_variant      text not null
                      constraint media_assets_size_variant_check
                      check (size_variant in ('thumb', 'card', 'full')),

  -- Bytes of THIS variant's object, summed by tenant_storage_bytes() for the
  -- quota. bigint (not int) so it never overflows on a large library; a size can
  -- never be negative.
  byte_size         bigint not null
                      constraint media_assets_byte_size_check
                      check (byte_size >= 0),

  -- Pixel dimensions of the stored variant, nullable in case a future ingest
  -- path can't determine them. Presentation metadata only.
  width             integer,
  height            integer,

  -- The name the user's file had, kept for display ("beach-sunset.jpg") since
  -- the bucket filename is content-addressed and not human-meaningful.
  original_filename text,

  deleted_at        timestamptz,                   -- soft delete (rule 5, §6)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid default auth.uid() references auth.users(id),
  updated_by        uuid references auth.users(id),

  -- Composite FK: (property_id, tenant_id) must match a real properties row.
  -- PREVENTS a media row scoped to a tenant that does not own its property.
  constraint media_assets_property_tenant_fk
    foreign key (property_id, tenant_id)
    references properties (id, tenant_id) on delete cascade
);

comment on table media_assets is
  'One row per uploaded media file (per variant). The index over the property-media '
  'bucket: lets orphans be found, quotas be summed, and a file''s category/variant/'
  'dimensions be known without parsing its path. A file and its row are created and '
  'deleted TOGETHER — a file with no row is invisible and bills egress forever.';
comment on column media_assets.bucket_path is
  'Full object path in property-media ({tenant_id}/{property_id}/{category}/{size}/'
  '{filename}). Unique. The join key to the bytes; kept in lockstep with the object.';
comment on constraint media_assets_category_check on media_assets is
  'Prevents an un-renderable category the guest site never queries; only '
  'hero/gallery/rooms/logo/about are valid.';
comment on constraint media_assets_size_variant_check on media_assets is
  'Prevents an unknown variant; only thumb/card/full, the three the client produces.';

-- Required index: usage and galleries are listed per tenant per category
-- (and tenant_id alone, the member-select predicate, is a usable prefix).
create index if not exists media_assets_tenant_category_idx
  on media_assets (tenant_id, category);

drop trigger if exists set_row_audit_media_assets on media_assets;
create trigger set_row_audit_media_assets
  before insert or update on media_assets
  for each row execute function set_row_audit();

-- ----------------------------------------------------------------------------
-- 4. media_assets RLS — member read, admin write, NO public policy
-- ----------------------------------------------------------------------------
-- The FILES are public (bucket read above). Their METADATA is not: it exposes a
-- tenant's full media inventory, usage, and original filenames, which no guest
-- needs. So media_assets follows 001's private pattern exactly — member select,
-- admin write — and gets NO anon/public policy. With RLS on and no public
-- policy, an anon SELECT returns zero rows (fail-closed).
alter table media_assets enable row level security;

-- SELECT: any active member of the owning tenant may read the metadata.
drop policy if exists media_assets_member_select on media_assets;
create policy media_assets_member_select on media_assets
  for select to authenticated
  using (tenant_id = any(get_tenant_ids()));

-- INSERT/UPDATE/DELETE: admin only, matching the storage.objects write policies
-- so the row and its file are governed by the same gate. Prevents a non-admin
-- from recording, editing, or soft-deleting media metadata.
drop policy if exists media_assets_member_insert on media_assets;
create policy media_assets_member_insert on media_assets
  for insert to authenticated
  with check (is_tenant_admin(tenant_id));

drop policy if exists media_assets_member_update on media_assets;
create policy media_assets_member_update on media_assets
  for update to authenticated
  using (is_tenant_admin(tenant_id))
  with check (is_tenant_admin(tenant_id));

drop policy if exists media_assets_member_delete on media_assets;
create policy media_assets_member_delete on media_assets
  for delete to authenticated
  using (is_tenant_admin(tenant_id));

-- ----------------------------------------------------------------------------
-- 5. Quota: per-tenant usage + the limit
-- ----------------------------------------------------------------------------
-- storage_quota_bytes lives on tenant_settings, not property_settings: a quota
-- is a company-wide cost control (an accounting/operations concern), not
-- something a guest sees, so per the 001 split rule it is tenant-level.
-- 524288000 = 500MB. The COST-GUARD rationale: without a ceiling, a single
-- tenant uploading hundreds of full-size photos turns into an unbounded egress
-- bill that we, not they, pay. Enforced at upload time by the client, which
-- reads this value and the usage below before writing.
alter table tenant_settings
  add column if not exists storage_quota_bytes bigint not null default 524288000
    constraint tenant_settings_storage_quota_check check (storage_quota_bytes >= 0);

comment on column tenant_settings.storage_quota_bytes is
  'Per-tenant storage ceiling in bytes (default 524288000 = 500MB), enforced at '
  'upload time. A COST GUARD: egress is the real bill, so without this a single '
  'tenant''s full-size photo dump becomes an unbounded cost. Company-wide, hence '
  'tenant-level not property-level (001 split rule).';

-- tenant_storage_bytes(): summed byte_size of a tenant's NON-deleted assets.
-- STABLE (no writes, cacheable within a statement), SECURITY DEFINER with a
-- pinned search_path (same hardening as the 001 resolvers). deleted_at is
-- NULL-safe per rule 5: only live rows count, so a soft-deleted (and file-
-- removed) asset stops counting against the quota immediately.
--
-- Membership guard: even though this is SECURITY DEFINER, it must not let one
-- tenant probe another's usage, so it refuses a tenant the caller does not
-- belong to (rule 19 — RLS is the floor, app/RPC scoping is additional).
-- sum(bigint) is numeric in Postgres; coalesce+cast back to bigint, 0 on empty.
create or replace function tenant_storage_bytes(p_tenant_id uuid)
returns bigint
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not (p_tenant_id = any(get_tenant_ids())) then
    raise exception 'tenant_storage_bytes: caller is not a member of tenant %',
      p_tenant_id
      using errcode = 'insufficient_privilege';
  end if;

  return coalesce((
    select sum(byte_size)
    from media_assets
    where tenant_id = p_tenant_id
      and deleted_at is null
  ), 0)::bigint;
end;
$$;

comment on function tenant_storage_bytes(uuid) is
  'Summed byte_size of a tenant''s non-deleted media_assets (0 if none). The usage '
  'half of the quota check; the limit is tenant_settings.storage_quota_bytes. '
  'Refuses tenants the caller does not belong to.';

-- Not for anon. Grant execute to authenticated only (the admin upload flow calls
-- it); the membership guard inside is the real boundary, this is belt-and-braces.
revoke all     on function tenant_storage_bytes(uuid) from public;
revoke execute on function tenant_storage_bytes(uuid) from anon;
grant  execute on function tenant_storage_bytes(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Quota enforcement: BEFORE INSERT trigger on media_assets
-- ----------------------------------------------------------------------------
-- §5 gives us the pieces (per-tenant usage + the limit) but nothing makes them
-- bite at write time. This trigger closes that: before a media_assets row is
-- inserted, it sums the tenant's current non-deleted byte_size, adds the
-- incoming row's byte_size, and refuses the insert if the total would exceed the
-- tenant's tenant_settings.storage_quota_bytes — naming current usage, the
-- incoming size, and the limit so the caller can see exactly why it failed.
--
-- SECURITY DEFINER + pinned search_path, matching the §5 resolvers. Summing
-- directly (rather than calling tenant_storage_bytes) sidesteps that function's
-- caller-membership guard, which is irrelevant here: RLS's admin-insert policy
-- has already proven the writer owns this tenant. deleted_at is NULL-safe per
-- rule 5 — soft-deleted (and file-removed) assets stop counting immediately.
--
-- NOTE: byte_size is CLIENT-SUPPLIED, so a determined admin could under-report
-- it and slip past this check. That is acceptable: this is a COST GUARD against
-- a hotel owner or a buggy upload loop adding hundreds of photos, NOT a security
-- boundary. Files uploaded WITHOUT a media_assets row are invisible to both this
-- quota and orphan cleanup — which is exactly why every upload path must insert
-- the row (CLAUDE.md §6 storage note).
create or replace function enforce_media_quota()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_current bigint;
  v_limit   bigint;
begin
  select coalesce(sum(byte_size), 0)::bigint
    into v_current
    from media_assets
    where tenant_id = new.tenant_id
      and deleted_at is null;

  select storage_quota_bytes
    into v_limit
    from tenant_settings
    where tenant_id = new.tenant_id;

  if v_current + new.byte_size > v_limit then
    raise exception
      'media quota exceeded for tenant %: % bytes used + % incoming exceeds limit of % bytes',
      new.tenant_id, v_current, new.byte_size, v_limit
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function enforce_media_quota() is
  'BEFORE INSERT guard on media_assets: refuses an insert that would push the '
  'tenant''s summed non-deleted byte_size past tenant_settings.storage_quota_bytes. '
  'A COST GUARD, not a security boundary — byte_size is client-supplied and could '
  'be under-reported. Files with no media_assets row escape it entirely, which is '
  'why every upload path must insert the row.';

drop trigger if exists enforce_media_quota_media_assets on media_assets;
create trigger enforce_media_quota_media_assets
  before insert on media_assets
  for each row execute function enforce_media_quota();

-- ============================================================================
-- End of 005_storage.sql
-- ============================================================================
