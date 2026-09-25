'use client';

import { Field, FieldLabel } from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';

const WORK_MODES = ['Remote', 'Hybrid', 'On-site'];

/**
 * Standard radio group for internship work mode (Remote / Hybrid / On-site).
 * Classic SaaS pattern: vertical list of native-style radios + labels — not segmented cards.
 */
export default function WorkModeRadios({
  value,
  onChange,
  name = 'work-mode',
  disabled = false,
  className,
}) {
  return (
    <RadioGroup
      name={name}
      value={value || undefined}
      disabled={disabled}
      onValueChange={(next) => onChange?.(next)}
      className={cn('grid gap-2.5', className)}
      aria-label="Work Mode"
    >
      {WORK_MODES.map((mode) => {
        const id = `${name}-${mode.toLowerCase().replace(/\s+/g, '-')}`;
        return (
          <Field key={mode} orientation="horizontal" className="items-center gap-2.5">
            <RadioGroupItem value={mode} id={id} disabled={disabled} />
            <FieldLabel htmlFor={id} className="cursor-pointer font-normal">
              {mode}
            </FieldLabel>
          </Field>
        );
      })}
    </RadioGroup>
  );
}

export { WORK_MODES };
