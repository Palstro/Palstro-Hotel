import type { IconComponent } from '../ui/icons';
import {
  SettingsIcon,
  BookingsIcon,
  RoomsIcon,
  HousekeepingIcon,
  ReportsIcon,
} from '../ui/icons';

// The admin's navigation, defined once as data (3.txt §2). Future modules are
// added by APPENDING an entry here — never by editing the layout markup — so the
// shell extends without being rewritten. Each item's `module` key is the handle
// a later access-gating pass will read; it is carried now so gating is a filter
// over this array, not a markup change.

// Module identity for later per-role gating. Matches the domains named in 3.txt.
export type AdminModule =
  | 'settings'
  | 'bookings'
  | 'rooms'
  | 'housekeeping'
  | 'reports';

export interface AdminNavItem {
  // Generic UI copy, not tenant content (rule 17) — safe to live in code.
  label: string;
  icon: IconComponent;
  // Relative segment appended to /admin/:propertySlug/ — the active slug is
  // supplied at render, keeping the property in the URL (§1).
  segment: string;
  module: AdminModule;
  // 'ready' items link; 'coming_soon' items render visibly disabled with a
  // "coming soon" affordance, so the owner sees the shape of the finished
  // product without a dead link.
  status: 'ready' | 'coming_soon';
}

export const ADMIN_NAV: AdminNavItem[] = [
  {
    label: 'Settings',
    icon: SettingsIcon,
    segment: 'settings',
    module: 'settings',
    status: 'ready',
  },
  {
    label: 'Bookings',
    icon: BookingsIcon,
    segment: 'bookings',
    module: 'bookings',
    status: 'coming_soon',
  },
  {
    label: 'Rooms',
    icon: RoomsIcon,
    segment: 'rooms',
    module: 'rooms',
    status: 'coming_soon',
  },
  {
    label: 'Housekeeping',
    icon: HousekeepingIcon,
    segment: 'housekeeping',
    module: 'housekeeping',
    status: 'coming_soon',
  },
  {
    label: 'Reports',
    icon: ReportsIcon,
    segment: 'reports',
    module: 'reports',
    status: 'coming_soon',
  },
];
