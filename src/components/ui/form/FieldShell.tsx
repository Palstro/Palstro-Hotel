import { useId, type ReactNode } from 'react';

// The one place label placement, help text, and error rendering are decided, so
// every field in the app (settings tabs, booking forms, every later module) is
// laid out and wired for accessibility identically (3.txt §4).
//
// Contract:
//   - label sits above the control, help text below it.
//   - error REPLACES help text when present (never both — a field is either
//     explaining itself or reporting a problem).
//   - the control is wired to whichever of the two is showing via
//     aria-describedby, and marked aria-invalid when an error is present, so a
//     screen reader announces the help or the error with the field.

export interface BaseFieldProps {
  label: string;
  helpText?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
}

interface FieldShellProps extends BaseFieldProps {
  // Render the control given the ids/flags it must carry. Using a render prop
  // (rather than cloning children) keeps the wiring explicit and typed.
  children: (aria: {
    id: string;
    describedBy: string | undefined;
    invalid: boolean;
  }) => ReactNode;
  // A few controls (Toggle) put their own label to the side; they opt out of the
  // shell's <label> element but still want the help/error row.
  labelFor?: 'control' | 'group';
}

// Shared control styling so every input/select/textarea looks the same. Warm
// palette only, no color literals (rule 17). Focus is always visible.
export const controlClasses =
  'w-full rounded-lg border border-sand-border bg-white/70 px-3 py-2 text-sm text-charcoal ' +
  'placeholder:text-charcoal-muted/70 transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-cream ' +
  'disabled:cursor-not-allowed disabled:opacity-60 ' +
  'aria-[invalid=true]:border-primary';

export function FieldShell({
  label,
  helpText,
  error,
  required,
  children,
  labelFor = 'control',
}: FieldShellProps) {
  const id = useId();
  const describerId = `${id}-describer`;
  // Only advertise a describedBy when there is actually something to describe,
  // so we never point at an empty node.
  const describedBy = error || helpText ? describerId : undefined;
  const invalid = Boolean(error);

  const labelNode = (
    <span className="mb-1 block text-sm font-medium text-charcoal">
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
  );

  return (
    <div className="w-full">
      {labelFor === 'control' ? (
        <label htmlFor={id}>{labelNode}</label>
      ) : (
        // Grouped controls (chips, toggle) are not a single focusable target, so
        // the label is a plain caption rather than a <label for>.
        labelNode
      )}

      {children({ id, describedBy, invalid })}

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
