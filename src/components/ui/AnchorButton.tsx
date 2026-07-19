import type { AnchorHTMLAttributes, ReactNode } from 'react';

type Variant = 'accent' | 'outline';

interface AnchorButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: Variant;
  children: ReactNode;
}

// Shared CTA styled as a link (it navigates to an anchor, so it is an <a>, not
// a <button>). Colors come only from theme utilities (rule 17). White-on-accent
// clears AA at 4.95:1 — the reason the accent was darkened in Step 1.
const base =
  'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

const variants: Record<Variant, string> = {
  accent:
    'bg-accent text-white hover:bg-accent-hover focus-visible:ring-accent focus-visible:ring-offset-cream',
  // For use over the hero image: inherits currentColor for border/text so the
  // caller controls the tone (e.g. white over the hero).
  outline:
    'border border-current text-current hover:bg-white/10 focus-visible:ring-current focus-visible:ring-offset-transparent',
};

export function AnchorButton({
  variant = 'accent',
  className = '',
  children,
  ...rest
}: AnchorButtonProps) {
  return (
    <a className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </a>
  );
}
