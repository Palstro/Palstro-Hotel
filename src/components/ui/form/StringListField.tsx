import { useState } from 'react';
import { FieldShell, controlClasses, type BaseFieldProps } from './FieldShell';
import { CloseIcon, PlusIcon } from '../icons';

interface StringListFieldProps extends BaseFieldProps {
  // An ordered list of short strings — amenities, tags, house rules. Add via
  // Enter or the add button; remove per chip.
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}

export function StringListField({
  value,
  onChange,
  placeholder,
  ...base
}: StringListFieldProps) {
  const [draft, setDraft] = useState('');

  function add() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    // Ignore duplicates rather than silently storing two identical chips.
    if (value.includes(trimmed)) {
      setDraft('');
      return;
    }
    onChange([...value, trimmed]);
    setDraft('');
  }

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    // group mode: the collection is not a single labelled input, so the label is
    // a caption over the whole widget.
    <FieldShell {...base} labelFor="group">
      {({ id, describedBy, invalid }) => (
        <div>
          <div className="flex gap-2">
            <input
              id={id}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  // Enter adds a chip; it must not submit the surrounding form.
                  e.preventDefault();
                  add();
                }
              }}
              placeholder={placeholder}
              disabled={base.disabled}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              className={controlClasses}
            />
            <button
              type="button"
              onClick={add}
              disabled={base.disabled || draft.trim().length === 0}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-sand-border bg-white/70 px-3 py-2 text-sm font-semibold text-charcoal transition-colors hover:bg-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-cream disabled:cursor-not-allowed disabled:opacity-60"
            >
              <PlusIcon className="h-4 w-4" />
              Add
            </button>
          </div>

          {value.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-2">
              {value.map((item, index) => (
                <li
                  key={`${item}-${index}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-sand-border bg-sand px-3 py-1 text-sm text-charcoal"
                >
                  <span className="break-all">{item}</span>
                  <button
                    type="button"
                    onClick={() => removeAt(index)}
                    disabled={base.disabled}
                    aria-label={`Remove ${item}`}
                    className="rounded-full p-0.5 text-charcoal-muted transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-sand disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <CloseIcon className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </FieldShell>
  );
}
