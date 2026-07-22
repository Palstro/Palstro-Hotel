import { supabase } from './supabase';
import { MEDIA_BUCKET, variantPath } from './mediaUrl';
import { SIZE_VARIANTS } from './imageProcessing';
import type { ProcessedImage } from './imageProcessing';
import type { MediaAsset, MediaCategory } from '../types/media';

// One year, in seconds, as the string the Storage API expects for cacheControl.
// These objects are content-addressed (a random filename per image) and NEVER
// overwritten in place, so a long immutable cache is safe: a returning guest
// re-fetches nothing, which is the biggest single repeat-egress saving.
const ONE_YEAR_SECONDS = '31536000';

// ---------------------------------------------------------------------------
// Quota
// ---------------------------------------------------------------------------
export interface QuotaStatus {
  usedBytes: number; // sum of the tenant's live media, from tenant_storage_bytes()
  quotaBytes: number; // tenant_settings.storage_quota_bytes (the ceiling)
  availableBytes: number; // max(0, quota - used)
}

// Read a tenant's current usage (via the SECURITY DEFINER RPC) and its limit.
// Both awaited with errors surfaced (rule 11). The RPC refuses tenants the
// caller is not a member of, so this only ever answers for the active tenant.
export async function fetchQuotaStatus(
  tenantId: string,
): Promise<QuotaStatus> {
  const { data: used, error: usedErr } = await supabase.rpc(
    'tenant_storage_bytes',
    { p_tenant_id: tenantId },
  );
  if (usedErr) throw usedErr;

  // The settings row is guaranteed to exist by the 001 AFTER INSERT trigger, so
  // .single() is safe and a missing row is a real error, not an empty state.
  const { data: settings, error: setErr } = await supabase
    .from('tenant_settings')
    .select('storage_quota_bytes')
    .eq('tenant_id', tenantId)
    .single();
  if (setErr) throw setErr;

  // bigint comes back as a JS number from PostgREST (not a numeric string).
  const usedBytes = Number(used ?? 0);
  const quotaBytes = Number(settings.storage_quota_bytes);
  return {
    usedBytes,
    quotaBytes,
    availableBytes: Math.max(0, quotaBytes - usedBytes),
  };
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------
export interface UploadImageArgs {
  tenantId: string;
  propertyId: string;
  category: MediaCategory;
  processed: ProcessedImage;
}

// Upload the three processed variants and index each with a media_assets row.
// A single random filename is shared across the three variants (only the size
// segment differs), so variantPath()/mediaVariantUrl() can derive any sibling
// from one path.
//
// PARTIAL-FAILURE SAFETY (brief): if some variant objects upload but a later one
// (or the metadata insert) fails, every object already written is removed before
// the error propagates — never leaving a half-set of orphaned files that would
// bill egress with no row to find them by. The original error is what surfaces
// (rule 11); cleanup failures are swallowed so they can't mask it.
export async function uploadProcessedImage(
  args: UploadImageArgs,
): Promise<MediaAsset[]> {
  const { tenantId, propertyId, category, processed } = args;

  // crypto.randomUUID keeps the path content-addressed and collision-free, so an
  // upload never overwrites an existing object (upsert:false enforces it too).
  const filename = `${crypto.randomUUID()}.webp`;
  const base = `${tenantId}/${propertyId}/${category}`;
  const pathFor = (size: string) => `${base}/${size}/${filename}`;

  const uploaded: string[] = [];
  try {
    // 1. Upload each variant, awaited one at a time so a failure stops
    //    immediately and cleanup removes exactly what was written.
    for (const v of processed.variants) {
      const path = pathFor(v.size);
      const { error } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(path, v.blob, {
          contentType: 'image/webp',
          cacheControl: ONE_YEAR_SECONDS,
          upsert: false, // content-addressed paths are never overwritten in place
        });
      if (error) throw error;
      uploaded.push(path);
    }

    // 2. Index every uploaded object with a media_assets row (one insert).
    const rows = processed.variants.map((v) => ({
      tenant_id: tenantId,
      property_id: propertyId,
      bucket_path: pathFor(v.size),
      category,
      size_variant: v.size,
      byte_size: v.byteSize,
      width: v.width,
      height: v.height,
      original_filename: processed.originalFilename,
    }));
    const { data, error } = await supabase
      .from('media_assets')
      .insert(rows)
      .select();
    if (error) throw error;
    return (data ?? []) as MediaAsset[];
  } catch (e) {
    if (uploaded.length > 0) {
      try {
        await supabase.storage.from(MEDIA_BUCKET).remove(uploaded);
      } catch {
        // Swallow: the primary failure (thrown below) is the one the user needs.
      }
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Orphan handling
// ---------------------------------------------------------------------------
// Delete a media image: remove all three variant objects AND soft-delete their
// rows, together. Pass any one variant's row; the siblings are derived from its
// bucket_path.
//
// ORDER IS DELIBERATE — files first, then rows. The dangerous state is a file
// with no row: invisible to every screen and to the quota, yet billing egress
// forever. So we remove the objects first; if the row soft-delete then fails, we
// are left with rows pointing at already-gone files — visible and repairable —
// which is the safe direction. Both steps surface their error (rule 11); nothing
// is left behind silently.
export async function deleteMediaAsset(asset: MediaAsset): Promise<void> {
  const paths = SIZE_VARIANTS.map((size) =>
    variantPath(asset.bucket_path, size),
  );

  // 1. Remove all three objects from the bucket.
  const { error: rmErr } = await supabase.storage
    .from(MEDIA_BUCKET)
    .remove(paths);
  if (rmErr) throw rmErr;

  // 2. Soft-delete all three metadata rows (rule 5/§6: deleted_at, not a hard
  //    delete). Scoped to still-live rows so a retry is idempotent. The set_row_
  //    audit trigger stamps updated_at/updated_by; deleted_at is set explicitly.
  const { error: updErr } = await supabase
    .from('media_assets')
    .update({ deleted_at: new Date().toISOString() })
    .in('bucket_path', paths)
    .is('deleted_at', null);
  if (updErr) throw updErr;
}
