import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../ui/Toast';
import {
  ChevronDownIcon,
  SignOutIcon,
  UserIcon,
} from '../ui/icons';
import { MISSING_VALUE } from '../../lib/format';

// The signed-in user's identity and sign-out control in the header (3.txt §2).
// A small dropdown: the trigger shows who is signed in; the menu holds sign out.
// Closes on Escape and on outside click.
export function UserMenu() {
  const { user, signOut } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      // No navigation call needed: the session clears, ProtectedRoute
      // re-evaluates and redirects to /login on the next render.
    } catch (e) {
      // Surface the failure (rule 11) — never leave the user believing they
      // signed out when they did not.
      toast.error(
        e instanceof Error ? e.message : 'Could not sign out. Please try again.',
      );
      setSigningOut(false);
    }
  }

  const email = user?.email ?? MISSING_VALUE;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-sand-border bg-white/70 py-1.5 pr-2 pl-1.5 text-sm font-medium text-charcoal transition-colors hover:bg-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-cream"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sand text-charcoal-muted">
          <UserIcon className="h-4 w-4" />
        </span>
        <span className="hidden max-w-[12rem] truncate sm:block">{email}</span>
        <ChevronDownIcon className="h-4 w-4 text-charcoal-muted" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-sand-border bg-cream shadow-lg"
        >
          <div className="border-b border-sand-border px-4 py-3">
            <p className="text-xs text-charcoal-muted">Signed in as</p>
            <p className="truncate text-sm font-semibold text-charcoal">
              {email}
            </p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            disabled={signingOut}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-charcoal transition-colors hover:bg-sand focus-visible:bg-sand focus-visible:outline-none disabled:opacity-60"
          >
            <SignOutIcon className="h-4 w-4 text-charcoal-muted" />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
