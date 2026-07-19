import {
  type IconComponent,
  WifiIcon,
  RestaurantIcon,
  BarIcon,
  LaundryIcon,
  PlaneIcon,
  AirConIcon,
  ParkingIcon,
  PoolIcon,
  GymIcon,
  CheckIcon,
  FacebookIcon,
  InstagramIcon,
  TwitterIcon,
  WhatsappIcon,
} from './icons';

// Icon-selection helpers, kept out of icons.tsx so that file exports only
// components (fast-refresh friendly). In both cases the LABEL/platform comes
// from the data; only the decorative icon is inferred from it.

// Closest icon for a free-text amenity label, defaulting to a check mark.
export function amenityIcon(label: string): IconComponent {
  const s = label.toLowerCase();
  if (/(wifi|wi-fi|internet)/.test(s)) return WifiIcon;
  if (/(restaurant|dining|breakfast|food|kitchen)/.test(s)) return RestaurantIcon;
  if (/(bar|lounge|drinks|wine|cocktail)/.test(s)) return BarIcon;
  if (/(laundry|washing|dry clean)/.test(s)) return LaundryIcon;
  if (/(airport|pickup|shuttle|transfer)/.test(s)) return PlaneIcon;
  if (/(air condition|air-condition|\bac\b|cooling)/.test(s)) return AirConIcon;
  if (/(parking|car park|garage)/.test(s)) return ParkingIcon;
  if (/(pool|swim)/.test(s)) return PoolIcon;
  if (/(gym|fitness|workout)/.test(s)) return GymIcon;
  return CheckIcon;
}

// Icon for a known social platform, or null when we have no brand icon for it
// (the caller then shows the platform name as text).
export function socialIcon(platform: string): IconComponent | null {
  const s = platform.toLowerCase();
  if (/(facebook|fb)/.test(s)) return FacebookIcon;
  if (/insta/.test(s)) return InstagramIcon;
  if (/(twitter|x)/.test(s)) return TwitterIcon;
  if (/(whatsapp|wa)/.test(s)) return WhatsappIcon;
  return null;
}
