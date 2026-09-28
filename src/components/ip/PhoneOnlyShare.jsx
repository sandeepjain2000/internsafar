'use client';

import { Smartphone, X } from 'lucide-react';
import './ip-phone-only-share.css';

export function PhoneOnlyTag() {
  return <span className="ip-phone-only-tag">Phone only</span>;
}

export function PhoneOnlyNote({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="ip-phone-only-note" role="status" data-testid="phone-only-share-note">
      <Smartphone aria-hidden />
      <span>{message}</span>
      {onClose ? (
        <button type="button" onClick={onClose} aria-label="Dismiss message">
          <X aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
