'use client';

import { LayoutGrid, List } from 'lucide-react';

export default function ViewModeToggle({ value, onChange }) {
  return (
    <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5" role="group" aria-label="View mode">
      <button
        type="button"
        className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${value === 'cards' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
        onClick={() => onChange('cards')}
      >
        <LayoutGrid size={14} aria-hidden />
        Cards
      </button>
      <button
        type="button"
        className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${value === 'list' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
        onClick={() => onChange('list')}
      >
        <List size={14} aria-hidden />
        List
      </button>
    </div>
  );
}
