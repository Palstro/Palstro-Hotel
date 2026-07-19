import { useCallback, useEffect, useRef, useState } from 'react';
import { CloseIcon, ArrowLeftIcon, ArrowRightIcon } from './ui/icons';

interface LightboxProps {
  images: string[];
  startIndex: number;
  hotelName: string;
  onClose: () => void;
}

/**
 * Accessible image lightbox: role="dialog" aria-modal, opens with focus on the
 * close button, traps Tab within its controls, restores focus to the trigger on
 * close, closes on Escape or backdrop click, and navigates with the arrow keys.
 * Body scroll is locked while open. No localStorage/sessionStorage.
 */
export function Lightbox({
  images,
  startIndex,
  hotelName,
  onClose,
}: LightboxProps) {
  const count = images.length;
  const [index, setIndex] = useState(startIndex);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const prev = useCallback(
    () => setIndex((i) => (i - 1 + count) % count),
    [count],
  );
  const next = useCallback(() => setIndex((i) => (i + 1) % count), [count]);

  // Focus the close button on open; restore focus to the trigger on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);

  // Lock body scroll while the dialog is open.
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  // Keyboard: Escape closes, arrows navigate, Tab is trapped inside the dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && count > 1) {
        prev();
      } else if (e.key === 'ArrowRight' && count > 1) {
        next();
      } else if (e.key === 'Tab') {
        const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled])',
        );
        if (!focusables || focusables.length === 0) return;
        const list = Array.from(focusables);
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, prev, next, count]);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${hotelName} gallery`}
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-charcoal/90 p-4"
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Close gallery"
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <CloseIcon className="h-6 w-6" />
      </button>

      {count > 1 ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            prev();
          }}
          aria-label="Previous image"
          className="absolute left-3 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:left-6"
        >
          <ArrowLeftIcon className="h-6 w-6" />
        </button>
      ) : null}

      <figure
        className="relative max-h-[85vh] max-w-5xl"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={images[index]}
          alt={`${hotelName} — photo ${index + 1}`}
          className="max-h-[85vh] w-auto rounded-lg object-contain"
        />
        <figcaption className="mt-3 text-center text-sm text-white/70">
          {index + 1} / {count}
        </figcaption>
      </figure>

      {count > 1 ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            next();
          }}
          aria-label="Next image"
          className="absolute right-3 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-6"
        >
          <ArrowRightIcon className="h-6 w-6" />
        </button>
      ) : null}
    </div>
  );
}
