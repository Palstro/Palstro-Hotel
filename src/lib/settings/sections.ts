// The guest-site sections a property can show, hide, and reorder from the
// Content settings tab (build 3, §2). Defined once here so the Content tab's
// visibility toggles and its order field are generated from the SAME list —
// there is no second place to keep in sync, and a future build that teaches the
// guest LandingPage to honour these flags reads the same ids.
//
// Rooms and Contact are intentionally absent: a hotel site without a way to see
// rooms or reach the property is not a hotel site, so those two are always shown
// and are not offered as toggles. Everything here is optional chrome.

export interface GuestSection {
  // Stored id — used as the branding key suffix (show_<id>) and as an entry in
  // branding.section_order. Never rename an existing id.
  id: string;
  label: string;
}

export const GUEST_SECTIONS: GuestSection[] = [
  { id: 'about', label: 'About' },
  { id: 'amenities', label: 'Amenities' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'location', label: 'Location' },
];
