import { BaseFieldProps, FieldShell, controlClasses } from './FieldShell';
import { ChevronDownIcon } from '../icons';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends BaseFieldProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  // Optional leading blank option (e.g. "Select a template…") for a not-yet-
  // chosen state. Its value is the empty string.
  placeholder?: string;
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
  ...base
}: SelectProps) {
  return (
    <FieldShell {...base}>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <select
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={base.required}
            disabled={base.disabled}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className={`${controlClasses} appearance-none pr-9`}
          >
            {placeholder ? (
              <option value="" disabled>
                {placeholder}
              </option>
            ) : null}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-charcoal-muted" />
        </div>
      )}
    </FieldShell>
  );
}
