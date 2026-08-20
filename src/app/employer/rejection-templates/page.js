'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import PageHeader from '@/components/ip/PageHeader';

export default function RejectionTemplatesPage() {
  const [items, setItems] = useState([]);
  const [name, setName] = useState('');
  const [body, setBody] = useState('Hi {{candidate_first_name}}, thank you for applying to {{internship_title}}. …');
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const res = await fetch('/api/ip/employer/rejection-templates');
    const data = await res.json();
    setItems(data.items || []);
  }

  useEffect(() => { load(); }, []);

  async function save(e) {
    e.preventDefault();
    setError('');
    setMsg('');
    const res = await fetch('/api/ip/employer/rejection-templates', {
      method: editId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editId ? { id: editId, name, body } : { name, body }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Save failed');
      return;
    }
    setMsg(editId ? 'Template updated' : 'Template created');
    setEditId(null);
    setName('');
    setBody('Hi {{candidate_first_name}}, thank you for applying to {{internship_title}}. …');
    await load();
  }

  async function remove(id) {
    if (!window.confirm('Delete this template?')) return;
    const res = await fetch(`/api/ip/employer/rejection-templates?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Delete failed');
      return;
    }
    await load();
  }

  function startEdit(t) {
    if (t.is_system) return;
    setEditId(t.id);
    setName(t.name);
    setBody(t.body);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Rejection templates"
        description="Reusable messages for bulk reject. Variables: {{candidate_first_name}}, {{internship_title}}."
      />
      {error ? <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {msg ? <Alert><AlertDescription>{msg}</AlertDescription></Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{editId ? 'Edit template' : 'Create template'}</CardTitle>
          <CardDescription>System default cannot be deleted; create your own for custom wording.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-3">
            <Field>
              <FieldLabel>Name</FieldLabel>
              <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Polite decline" />
            </Field>
            <Field>
              <FieldLabel>Body</FieldLabel>
              <FieldDescription>Write the body only — names are inserted at send time.</FieldDescription>
              <Textarea required rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
            </Field>
            <div className="flex gap-2">
              <Button type="submit">{editId ? 'Save changes' : 'Create'}</Button>
              {editId ? (
                <Button type="button" variant="outline" onClick={() => { setEditId(null); setName(''); }}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Your templates</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {items.map((t) => (
            <div key={t.id} className="border rounded-md p-3 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{t.name}</span>
                {t.is_system ? <Badge variant="secondary">System default</Badge> : null}
                <span className="text-xs text-muted-foreground">v{t.version}</span>
              </div>
              <pre className="text-xs whitespace-pre-wrap text-muted-foreground">{t.body}</pre>
              {!t.is_system ? (
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => startEdit(t)}>Edit</Button>
                  <Button size="sm" variant="destructive" onClick={() => remove(t.id)}>Delete</Button>
                </div>
              ) : null}
            </div>
          ))}
          {!items.length ? <p className="text-sm text-muted-foreground">No templates yet.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
