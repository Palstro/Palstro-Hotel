import { useId } from 'react';
import type { BaseFieldProps } from './FieldShell';

interface ToggleProps extends BaseFieldProps {
  value: boolean;
  onChange: (value: boolean) => void;
}

// A switch (role="switch"), not a checkbox — it toggles a setting on/off (e.g.
// booking_enabled). Label sits beside the track; help/error render below,
// matching the other primitives' help-then-error rule (§4). Built standalone
// rather than through FieldShell so the label associates cleanly with the
// switch via aria-labelledby.
export function Toggle({
  label,
  value,
  onChange,
  helpText,
  error,
  disabled,
  required,
}: ToggleProps) {
  const labelId = useId();
  const describerId = `${labelId}-describer`;
  const describedBy = error || helpText ? describerId : undefined;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-4">
        <span id={labelId} className="text-sm font-medium text-charcoal">
          {label}
          {required ? (
            <>
              {' '}
              <span className="text-primary" aria-hidden="true">
                *
              </span>
              <span className="sr-only">(required)</span>
            </>
          ) : null}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={value}
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          disabled={disabled}
          onClick={() => onChange(!value)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-cream disabled:cursor-not-allowed disabled:opacity-60 ${
            value ? 'bg-primary' : 'bg-sand-border'
          }`}
        >
          <span
            aria-hidden="true"
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              value ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {describedBy ? (
        <p
          id={describerId}
          className={`mt-1 text-xs ${
            error ? 'font-medium text-primary' : 'text-charcoal-muted'
          }`}
          role={error ? 'alert' : undefined}
        >
          {error ?? helpText}
        </p>
      ) : null}
    </div>
  );
}
