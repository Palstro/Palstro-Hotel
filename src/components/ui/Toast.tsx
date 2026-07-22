import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CheckIcon, CloseIcon } from './icons';

// In-house toast system — no external library (3.txt §3). Success and info
// auto-dismiss; errors DO NOT, because an error the user did not read is an
// error they will hit again (§3). Everything is announced through a single
// aria-live region so screen-reader users hear each toast as it fires.

export type ToastVariant = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  variant: ToastVariant;
  message: string;
}

interface ToastContextValue {
  // Convenience wrappers so callers write toast.success('Saved') rather than
  // assembling the object themselves. Returns the id in case a caller wants to
  // dismiss programmatically (e.g. an error that a later success supersedes).
  success: (message: string) => number;
  error: (message: string) => number;
  info: (message: string) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

// How long success/info stay before auto-dismissing. Errors ignore this.
const AUTO_DISMISS_MS = 4500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Monotonic id source. A ref (not state) so incrementing never triggers a
  // render, and Date.now()/Math.random() are avoided entirely.
  const nextId = useRef(1);
  // Track pending auto-dismiss timers so we can clear them on unmount and on
  // manual dismiss, never leaving a timer to fire against a stale toast.
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (variant: ToastVariant, message: string) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, variant, message }]);
      // Errors are sticky (manual dismiss only). Success/info auto-dismiss.
      if (variant !== 'error') {
        const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
        timers.current.set(id, timer);
      }
      return id;
    },
    [dismiss],
  );

  // Clear every outstanding timer if the provider unmounts.
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((timer) => clearTimeout(timer));
      map.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      success: (message) => push('success', message),
      error: (message) => push('error', message),
      info: (message) => push('info', message),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// Fixed, stacked, top-right on desktop and full-width on mobile. The region is
// aria-live so additions are announced; errors are assertive (interrupt),
// success/info are polite. role="status" pairs with the polite region.
function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 px-4 py-4 sm:inset-x-auto sm:right-0 sm:items-end"
      // Polite region: most toasts are non-urgent. Errors set their own
      // assertive alert role on the item itself (below) so they still interrupt.
      aria-live="polite"
      aria-relevant="additions"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: number) => void;
}) {
  const isError = toast.variant === 'error';

  // Warm-palette surfaces only, no color literals (rule 17). Info/success sit
  // on the sand surface with charcoal text (11.6:1, per index.css); errors use
  // the primary terracotta surface with white text (6.4:1) so they read as
  // urgent without a new red token.
  const surface = isError
    ? 'bg-primary text-white'
    : 'bg-sand text-charcoal border border-sand-border';

  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl px-4 py-3 shadow-lg ${surface}`}
    >
      <span aria-hidden="true" className="mt-0.5 shrink-0">
        {toast.variant === 'success' ? (
          <CheckIcon className="h-5 w-5" />
        ) : isError ? (
          <CloseIcon className="h-5 w-5" />
        ) : (
          <InfoGlyph />
        )}
      </span>
      <p className="min-w-0 flex-1 text-sm font-medium break-words">
        {toast.message}
      </p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className={`shrink-0 rounded-md p-0.5 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
          isError
            ? 'focus-visible:ring-white focus-visible:ring-offset-primary'
            : 'focus-visible:ring-primary focus-visible:ring-offset-sand'
        }`}
      >
        <CloseIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

function InfoGlyph() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (value === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return value;
}
