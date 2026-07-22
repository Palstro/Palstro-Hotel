import { useEffect, type RefObject } from 'react';

// Traps keyboard focus inside a container while it is active, and calls onEscape
// when Escape is pressed. Used by the mobile nav drawer (3.txt §2 accessibility:
// the drawer traps focus and closes on Escape). Inert when active is false, so
// the same hook is a no-op on desktop where the sidebar is always visible.
//
// On activation it moves focus into the container and, on deactivation, restores
// focus to whatever was focused before (the toggle button), so keyboard users
// are never dropped back at the top of the document.

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  onEscape: () => void,
) {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    // Move focus into the drawer on open.
    const first = focusables()[0];
    first?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onEscape();
        return;
      }
      if (e.key !== 'Tab') return;

      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const activeEl = document.activeElement;

      // Wrap around at both ends so Tab/Shift+Tab stay inside the drawer.
      if (e.shiftKey && activeEl === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && activeEl === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // Restore focus to the trigger on close.
      previouslyFocused?.focus?.();
    };
  }, [active, containerRef, onEscape]);
}
