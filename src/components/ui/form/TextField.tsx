import { BaseFieldProps, FieldShell, controlClasses } from './FieldShell';

interface TextFieldProps extends BaseFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  // Narrow to the text-like input types this primitive is meant for; numbers go
  // through NumberField, money through CurrencyField.
  type?: 'text' | 'email' | 'tel' | 'url';
  autoComplete?: string;
  inputMode?: 'text' | 'email' | 'tel' | 'url';
}

export function TextField({
  value,
  onChange,
  placeholder,
  type = 'text',
  autoComplete,
  inputMode,
  ...base
}: TextFieldProps) {
  return (
    <FieldShell {...base}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
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
