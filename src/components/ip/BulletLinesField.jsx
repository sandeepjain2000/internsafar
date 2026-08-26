'use client';

import { Field, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';

/** One responsibility / requirement per line — stored as newline text. */
export default function BulletLinesField({
  label,
  value,
  onChange,
  placeholder = 'One point per line…',
  hint = 'Tip: put each bullet on its own line.',
  rows = 5,
}) {
  return (
    <Field className="sm:col-span-2">
      <FieldLabel>{label}</FieldLabel>
      <Textarea
        rows={rows}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="font-normal"
      />
      {hint ? <FieldDescription>{hint}</FieldDescription> : null}
    </Field>
  );
}
