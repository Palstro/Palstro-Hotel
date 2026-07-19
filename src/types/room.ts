// DB row type for room_types (supabase/migrations/002_rooms.sql). Keep in sync
// with the migration — no fields the schema does not have.
//
// IMPORTANT: the guest site reads room_types ONLY, never rooms. A room_type is
// what a guest books and what the website advertises; rooms are physical units
// (204) that are operational data and are NOT public. There is deliberately no
// Room type here — the landing page has no reason to import one.

export interface RoomType {
  id: string;
  tenant_id: string;
  property_id: string;
  name: string;
  description: string | null;
  // numeric(14,2) columns. PostgREST returns numeric as STRINGS (e.g.
  // "45000.00"), never JS numbers, to preserve precision — parse with
  // parseNumeric before any arithmetic or formatting (CLAUDE.md §6, Money).
  base_rate: string; // advertised nightly rate
  max_adults: number;
  max_children: number;
  bed_configuration: string | null;
  size_sqm: string | null;
  amenities: string[]; // text[] default '{}'
  images: string[]; // jsonb ordered array of image URLs
  display_order: number;
  is_published: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}
