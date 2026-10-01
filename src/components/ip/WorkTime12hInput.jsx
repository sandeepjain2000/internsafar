'use client';

import { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { from12hParts, to12hParts } from '@/lib/ipWorkHours';

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
// Inline: global .grid rules override Tailwind gap utilities.
const GRID_STYLE = { gap: '0.25rem' };

/** Typed "9:30" / "930" / "9:30 pm" / "21:30" → { hour, minute, period? }; null = invalid. */
function parseTyped(text) {
  const m = String(text).trim().match(/^(\d{1,2})(?::?(\d{2}))?\s*([ap])?\.?\s*m?\.?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (min > 59 || h > 23) return null;
  let period = m[3] ? (m[3].toLowerCase() === 'p' ? 'PM' : 'AM') : null;
  if (h === 0) {
    h = 12;
    period = 'AM';
  } else if (h > 12) {
    h -= 12;
    period = 'PM';
  }
  return { hour: String(h), minute: String(min).padStart(2, '0'), period };
}

/** 12-hour time: type it or pick from the clock, with AM/PM. value / onChange use 24-hour "HH:MM" ('' = not set). */
export default function WorkTime12hInput({ value, onChange, label, defaultPeriod = 'AM' }) {
  const initial = to12hParts(value);
  const [text, setText] = useState(initial ? `${initial.hour}:${initial.minute}` : '');
  const [period, setPeriod] = useState(initial?.period || defaultPeriod);
  const [invalid, setInvalid] = useState(false);
  const [open, setOpen] = useState(false);
  const emitted = useRef(value || '');

  useEffect(() => {
    if ((value || '') === emitted.current) return;
    emitted.current = value || '';
    const p = to12hParts(value);
    setText(p ? `${p.hour}:${p.minute}` : '');
    if (p) setPeriod(p.period);
    setInvalid(false);
  }, [value]);

  const emit = (next) => {
    emitted.current = next;
    onChange(next);
  };

  const current = parseTyped(text);

  const onType = (raw) => {
    setText(raw);
    if (!raw.trim()) {
      setInvalid(false);
      emit('');
      return;
    }
    const p = parseTyped(raw);
    if (!p) return;
    setInvalid(false);
    const nextPeriod = p.period || period;
    if (p.period) setPeriod(p.period);
    emit(from12hParts({ ...p, period: nextPeriod }));
  };

  const onBlur = () => {
    if (!text.trim()) return;
    const p = parseTyped(text);
    if (!p) {
      setInvalid(true);
      emit('');
      return;
    }
    setText(`${p.hour}:${p.minute}`);
  };

  const pickPeriod = (next) => {
    setPeriod(next);
    if (current) emit(from12hParts({ ...current, period: next }));
  };

  const pick = (hour, minute) => {
    setText(`${hour}:${minute}`);
    setInvalid(false);
    emit(from12hParts({ hour, minute, period }));
  };

  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <Input
        className="w-20"
        inputMode="numeric"
        placeholder="hh:mm"
        aria-label={label}
        aria-invalid={invalid || undefined}
        title={invalid ? 'Enter a time like 9:30' : undefined}
        value={text}
        onChange={(e) => onType(e.target.value)}
        onBlur={onBlur}
      />
      <div className="flex" role="group" aria-label={`${label} AM or PM`}>
        {['AM', 'PM'].map((p) => (
          <Button
            key={p}
            type="button"
            size="sm"
            variant={period === p ? 'default' : 'outline'}
            className={cn('h-9 px-2', p === 'AM' ? 'rounded-r-none' : 'rounded-l-none border-l-0')}
            aria-pressed={period === p}
            onClick={() => pickPeriod(p)}
          >
            {p}
          </Button>
        ))}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={<Button type="button" variant="outline" size="icon" aria-label={`${label}: pick from clock`} />}
        >
          <Clock className="size-4" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent className="w-64 gap-3" align="start">
          <div>
            <p className="text-muted-foreground mb-1 text-xs font-medium">Hour</p>
            <div className="grid grid-cols-6" style={GRID_STYLE}>
              {HOURS.map((h) => (
                <Button
                  key={h}
                  type="button"
                  size="xs"
                  variant={current?.hour === h ? 'default' : 'outline'}
                  onClick={() => pick(h, current?.minute || '00')}
                >
                  {h}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-muted-foreground mb-1 text-xs font-medium">Minute</p>
            <div className="grid grid-cols-6" style={GRID_STYLE}>
              {MINUTES.map((m) => (
                <Button
                  key={m}
                  type="button"
                  size="xs"
                  variant={current?.minute === m ? 'default' : 'outline'}
                  disabled={!current}
                  onClick={() => {
                    pick(current.hour, m);
                    setOpen(false);
                  }}
                >
                  {m}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex">
              {['AM', 'PM'].map((p) => (
                <Button
                  key={p}
                  type="button"
                  size="xs"
                  variant={period === p ? 'default' : 'outline'}
                  className={p === 'AM' ? 'rounded-r-none' : 'rounded-l-none border-l-0'}
                  onClick={() => pickPeriod(p)}
                >
                  {p}
                </Button>
              ))}
            </div>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => {
                onType('');
                setOpen(false);
              }}
            >
              Clear
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
