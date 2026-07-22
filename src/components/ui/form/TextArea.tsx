import { FieldShell, controlClasses, type BaseFieldProps } from './FieldShell';

interface TextAreaProps extends BaseFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 4,
  ...base
}: TextAreaProps) {
  return (
    <FieldShell {...base}>
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          required={base.required}
          disabled={base.disabled}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={`${controlClasses} resize-y`}
        />
      )}
    </FieldShell>
  );
}
