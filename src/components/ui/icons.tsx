// Inline SVG icons — no external icon library (self-contained, no runtime dep).
// All are decorative by default (aria-hidden); meaningful labels always come
// from the data via the calling component. Line icons use currentColor stroke;
// brand/social icons use currentColor fill.

export interface IconProps {
  className?: string;
}

// A rendered icon component. Exported so the icon-mapping helpers (iconMap.ts)
// can be typed without importing every icon by name.
export type IconComponent = (props: IconProps) => React.ReactNode;

function Line({
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/* --- UI / navigation ------------------------------------------------------ */

export const MenuIcon = ({ className }: IconProps) => (
  <Line className={className}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </Line>
);

export const CloseIcon = ({ className }: IconProps) => (
  <Line className={className}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Line>
);

export const ChevronDownIcon = ({ className }: IconProps) => (
  <Line className={className}>
    <path d="M6 9l6 6 6-6" />
  </Line>
);

export const ArrowLeftIcon = ({ className }: IconProps) => (
  <Line className={className}>
    <path d="M15 6l-6 6 6 6" />
  </Line>
);

export const ArrowRightIcon = ({ className }: IconProps) => (
  <Line className={className}>
    <path d="M9 6l6 6-6 6" />
  </Line>
);

/* --- Admin navigation ----------------------------------------------------- */

export const SettingsIcon = ({ className }: IconProps) => (
  <Line className={className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
  </Line>
);

export const BookingsIcon = ({ className }: IconProps) => (
  <Line className={className}>
    <rect x="3.5" y="5" width="17" height="16" rx="2" />
    <path d="M3.5 9h17M8 3v4M16 3v4M8 13h3M8 17h8" />
  </Line>
);

export const RoomsIcon = ({ className }: IconProps) => (
  <Line className={className}>
    <path d="M3 21V8l9-5 9 5v13" />
    <path d="M3 21h18M9 21v-6h6v6M8 11h.01M16 11h.01" />
  </Line>
);

export const HousekeepingIcon = ({ className }: IconProps) => (
  <Line className={className}>
    <path d="M6 3v8M4 5h4M6 11l-1 10h2l-1-10" />
    <path d="M14 3c3 0 6 2 6 6h-6V3Z" />
    <path d="M14 9v12" />
  </Line>
);

export const ReportsIcon = ({ className }: IconProps) => (
  <Line className={className}>
    <path d="M4 20V4M4 20h16" />
    <path d="M8 20v-6M12 20V8M16 20v-9" />
  </Line>
);

export const UserIcon = ({ className }: IconProps) => (
  <Line className={className}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" />
  </Line>
);

export const SignOutIcon = ({ className }: IconProps) => (
  <Line className={className}>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
    <path d="M10 12H3M6 8l-3 4 3 4" />
  </Line>
);

export const PlusIcon = ({ className }: IconProps) => (
  <Line className={className}>
    <path d="M12 5v14M5 12h14" />
  </Line>
);

export const ChevronUpDownIcon = ({ className }: IconProps) => (
  <Line className={className}>
    <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />
  </Line>
);

/* --- Contact -------------------------------------------------------------- */

export const PhoneIcon = ({ className }: IconProps) => (
  <Line className={className}>
    <path d="M4 5c0 8.284 6.716 15 15 15a1.5 1.5 0 0 0 1.5-1.5v-2.2a1 1 0 0 0-.76-.97l-3.2-.8a1 1 0 0 0-1 .3l-.9 1.05a11.5 11.5 0 0 1-5.1-5.1l1.05-.9a1 1 0 0 0 .3-1l-.8-3.2a1 1 0 0 0-.97-.76H5.5A1.5 1.5 0 0 0 4 5Z" />
  </Line>
);

export const MailIcon = ({ className }: IconProps) => (
  <Line className={className}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m4 7 8 6 8-6" />
  </Line>
);

export const MapPinIcon = ({ className }: IconProps) => (
  <Line className={className}>
    <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.5" />
  </Line>
);

/* --- Amenities ------------------------------------------------------------ */

export const WifiIcon = ({ className }: IconProps) => (
  <Line className={className}>
    <path d="M2.5 9a15 15 0 0 1 19 0M5.5 12.5a10 10 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0" />
    <path d="M12 19.5h.01" />
  </Line>
);

export const RestaurantIcon = ({ className }: IconProps) => (
  <Line className={className}>
    <path d="M5 3v7a2 2 0 0 0 2 2h0V3M9 3v18M9 3v0" />
    <path d="M7 12v9" />
    <path d="M17 3c-1.5 0-2.5 2-2.5 5s1 4 2.5 4v9" />
  </Line>
);

export const BarIcon = ({ className }: IconProps) => (
  <Line className={className}>
    <path d="M5 4h14l-7 8-7-8Z" />
    <path d="M12 12v6M8 21h8" />
  </Line>
);

export const LaundryIcon = ({ className }: IconProps) => (
  <Line className={className}>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <circle cx="12" cy="13" r="4" />
    <path d="M8 6h.01M11 6h.01" />
  </Line>
);

export const PlaneIcon = ({ className }: IconProps) => (
  <Line className={className}>
    <path d="M10.5 3.5a1.5 1.5 0 0 1 3 0V9l7 4v2l-7-2v4l2 1.5V20l-3.5-1L8 20v-1.5L10 17v-4l-7 2v-2l7-4V3.5Z" />
  </Line>
);

export const AirConIcon = ({ className }: IconProps) => (
  <Line className={className}>
    <path d="M12 2v20M2 12h20M5 5l14 14M19 5 5 19" />
  </Line>
);

export const ParkingIcon = ({ className }: IconProps) => (
  <Line className={className}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M9 16V8h3a2.5 2.5 0 0 1 0 5H9" />
  </Line>
);

export const PoolIcon = ({ className }: IconProps) => (
  <Line className={className}>
    <path d="M2 17c1.5 0 1.5 1 3 1s1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1" />
    <path d="M2 21c1.5 0 1.5 1 3 1s1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1" />
    <path d="M7 15V6a2 2 0 0 1 4 0M11 12h6" />
  </Line>
);

export const GymIcon = ({ className }: IconProps) => (
  <Line className={className}>
    <path d="M6 9v6M4 10v4M18 9v6M20 10v4M6 12h12" />
  </Line>
);

export const CheckIcon = ({ className }: IconProps) => (
  <Line className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </Line>
);

/* --- Social --------------------------------------------------------------- */

export const FacebookIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M13.5 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.25-1.5 1.55-1.5H17V3.6c-.3 0-1.3-.1-2.45-.1-2.4 0-4.05 1.47-4.05 4.17v2.23H7.8V13h2.7v8h3Z" />
  </svg>
);

export const InstagramIcon = ({ className }: IconProps) => (
  <Line className={className}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
    <circle cx="12" cy="12" r="3.5" />
    <path d="M17 7h.01" />
  </Line>
);

export const TwitterIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.5 3h3l-6.6 7.5L21.8 21h-6l-4.3-5.6L6.5 21h-3l7-8L2.5 3h6.2l3.9 5.1L17.5 3Zm-1.1 16h1.7L7.7 4.8H5.9L16.4 19Z" />
  </svg>
);

export const WhatsappIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.5-1.2A9 9 0 1 0 12 3Zm0 1.8a7.2 7.2 0 0 1 6 11.2l.2.3-.7 2.5-2.6-.7-.3.2A7.2 7.2 0 1 1 12 4.8Zm-2.6 3.3c-.2 0-.5 0-.7.4-.3.4-.9 1-.9 2.3 0 1.4 1 2.7 1.1 2.9.2.2 2 3.1 4.9 4.2 2.4.9 2.9.8 3.4.7.5 0 1.6-.6 1.8-1.3.2-.6.2-1.2.2-1.3-.1-.1-.3-.2-.6-.3-.3-.2-1.6-.8-1.9-.9-.2-.1-.4-.1-.6.1-.2.3-.6.9-.8 1-.1.2-.3.2-.5.1-.3-.1-1.2-.5-2.2-1.4-.8-.7-1.4-1.6-1.5-1.9-.2-.2 0-.4.1-.5l.4-.5c.1-.2.2-.3.3-.5v-.5c-.1-.1-.6-1.5-.8-2-.2-.5-.4-.4-.6-.4h-.5Z" />
  </svg>
);

