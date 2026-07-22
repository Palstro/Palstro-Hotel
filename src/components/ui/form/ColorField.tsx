import { FieldShell, controlClasses, type BaseFieldProps } from './FieldShell';

interface ColorFieldProps extends BaseFieldProps {
  // A hex color string like '#9c4426'. This is tenant BRANDING data the admin is
  // editing — a value flowing through the field, not a literal baked into a
  // component — so it is exactly the kind of color rule 17 wants configurable
  // rather than hardcoded.
  value: string;
  onChange: (value: string) => void;
}

// #RGB or #RRGGBB — the forms the native color input accepts. When the free-text
// value is not yet a valid hex we fall back to a neutral swatch value so the
// native picker never throws, while the text field keeps the raw input.
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function ColorField({ value, onChange, ...base }: ColorFieldProps) {
  const swatchValue = HEX.test(value) ? value : '#000000';

  return (
    <FieldShell {...base}>
      {({ id, describedBy, invalid }) => (
        <div className="flex items-center gap-2">
          <input
            // The swatch picker. aria-hidden + a matching text field below keeps
            // it from being an unlabeled control in the tab order twice; the text
            // field is the labelled, described one.
            type="color"
            value={swatchValue}
            onChange={(e) => onChange(e.target.value)}
            disabled={base.disabled}
            aria-label={`${base.label} color picker`}
            className="h-9 w-10 shrink-0 cursor-pointer rounded-lg border border-sand-border bg-white/70 p-1 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <input
            id={id}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="#9c4426"
            spellCheck={false}
            autoCapitalize="none"
            required={base.required}
            disabled={base.disabled}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className={`${controlClasses} font-mono`}
          />
        </div>
      )}
    </FieldShell>
  );
}
