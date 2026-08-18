'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FieldDescription } from '@/components/ui/field';

/**
 * File button that POSTs multipart to an upload endpoint (CPMU-style server→S3).
 */
export default function IpUploadButton({
  endpoint,
  accept,
  label = 'Upload file',
  extraFormData,
  onUploaded,
  disabled = false,
}) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file, file.name);
      if (extraFormData && typeof extraFormData === 'object') {
        for (const [k, v] of Object.entries(extraFormData)) {
          if (v != null && v !== '') fd.append(k, String(v));
        }
      }
      const res = await fetch(endpoint, { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || data.hint || 'Upload failed');
      }
      onUploaded?.(data, file);
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={onPick}
        disabled={disabled || busy}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? 'Uploading…' : label}
      </Button>
      {error ? <FieldDescription className="text-destructive">{error}</FieldDescription> : null}
    </div>
  );
}

/** Optional URL field kept alongside upload for paste/link convenience. */
export function IpUrlInput({ value, onChange, placeholder = 'https://…', className }) {
  return (
    <Input
      value={value || ''}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      className={className}
    />
  );
}
