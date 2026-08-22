'use client';

import { LayoutGrid, List } from 'lucide-react';
import '@/components/ip/ip-view-toggle.css';

export default function ViewModeToggle({ value, onChange }) {
  return (
    <div className="ip-view-toggle" role="group" aria-label="View mode">
      <button
        type="button"
        className={`ip-view-toggle__btn${value === 'cards' ? ' is-on' : ''}`}
        onClick={() => onChange('cards')}
      >
        <LayoutGrid size={14} aria-hidden />
        Cards
      </button>
      <button
        type="button"
        className={`ip-view-toggle__btn${value === 'list' ? ' is-on' : ''}`}
        onClick={() => onChange('list')}
      >
        <List size={14} aria-hidden />
        List
      </button>
    </div>
  );
}
