import { supabase } from './supabase';
import type { SizeVariant } from '../types/media';

// The single public bucket (005). Named once here so no caller writes it as a
// literal.
export const MEDIA_BUCKET = 'property-media';

// Public URL for an exact object path. The bucket is public, so this is a plain,
// long-lived CDN URL — no signing, no expiry, cacheable by the browser for the
// one-year cacheControl the upload sets.
export function mediaPublicUrl(bucketPath: string): string {
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(bucketPath).data
    .publicUrl;
}

// Rewrite the {size} segment of a path to another variant.
// Paths follow {tenant_id}/{property_id}/{category}/{size}/{filename} (5
// segments), and all three variants of one image share EVERY other segment,
// including the filename — so the sibling variant's exact path is this path with
// just the size segment (second-to-last) swapped. No second DB lookup needed.
// A path that does not match the convention is returned unchanged.
export function variantPath(bucketPath: string, size: SizeVariant): string {
  const parts = bucketPath.split('/');
  if (parts.length < 5) return bucketPath;
  parts[parts.length - 2] = size;
  return parts.join('/');
}

// Public URL for a given image at the size the CONSUMER needs. Pass any variant's
// bucket_path plus the size to render: a room card asks for 'card', a hero for
// 'full', a thumbnail for 'thumb'. This is the read-time egress saving made real
// — a card must never load the full variant, and this is how it avoids doing so.
export function mediaVariantUrl(bucketPath: string, size: SizeVariant): string {
  return mediaPublicUrl(variantPath(bucketPath, size));
}
