import { useState } from 'react';
import { FieldShell, controlClasses, type BaseFieldProps } from './FieldShell';
import { formatCurrency, parseNumeric } from '../../../lib/format';

interface CurrencyFieldProps extends BaseFieldProps {
  value: number | null;
  onChange: (value: number | null) => void;
  // A currency CODE, never a hardcoded naira assumption — the property's own
  // currency flows in from the DB (3.txt §4, rule 17). Used for the formatted,
  // blurred display via formatCurrency.
  currency: string;
  placeholder?: string;
}

export function CurrencyField({
  value,
  onChange,
  currency,
  placeholder,
  ...base
}: CurrencyFieldProps) {
  // Two display modes: while focused the user edits a raw number (draft); on
  // blur we show the formatted amount (₦45,000). parseNumeric on every change,
  // formatCurrency only for the resting display (§4).
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(value === null ? '' : String(value));

  // Adopt an OUTSIDE change to `value` (e.g. form reset) by re-seeding the draft
  // — but never while focused, so we don't stomp what the user is typing. Done
  // as a conditional setState during render (React's "adjust state on prop
  // change" pattern), not an effect, so there is no extra render pass.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    if (!focused) setDraft(value === null ? '' : String(value));
  }

  const display = focused
    ? draft
    : value === null
      ? ''
      : formatCurrency(value, currency);

  return (
    <FieldShell {...base}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          // text (not number) so the formatted, grouped value can render on
          // blur; inputMode keeps a numeric keypad on mobile.
          type="text"
          inputMode="decimal"
          value={display}
          onFocus={() => setFocused(true)}
          onChange={(e) => {
            setDraft(e.target.value);
            onChange(parseNumeric(e.target.value));
          }}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          required={base.required}
          disabled={base.disabled}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={controlClasses}
        />
      )}
    </FieldShell>
  );
}
