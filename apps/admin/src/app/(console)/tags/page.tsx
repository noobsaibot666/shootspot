'use client';

import { PageHead } from '@/components/PageHead';
import { useCallback, useEffect, useState } from 'react';
import { StatusBadge } from '@/components/ConfirmAction';
import { api } from '@/lib/api';

type Kind = 'good_for' | 'best_light';
interface Tag {
  kind: Kind;
  key: string;
  label: string;
  position: number;
  active: boolean;
  used: number;
}

const KIND_TITLE: Record<Kind, string> = { good_for: 'Good for', best_light: 'Best light' };

/**
 * Admin-managed tag lists (D-25). Keys are permanent (records store them); labels, order and
 * visibility change instantly in the app. Hidden tags stay on existing locations.
 */
export default function TagsPage() {
  const [items, setItems] = useState<Tag[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api<{ items: Tag[] }>('/admin/v1/vocabulary').then(
      (r) => setItems(r.items),
      () => setError('Could not load tags.'),
    );
  }, []);
  useEffect(load, [load]);

  async function patch(t: Tag, body: Partial<Pick<Tag, 'label' | 'active' | 'position'>>) {
    setError(null);
    try {
      await api(`/admin/v1/vocabulary/${t.kind}/${t.key}`, { method: 'PATCH', body });
      load();
    } catch {
      setError('That change did not save.');
    }
  }

  async function move(list: Tag[], i: number, dir: -1 | 1) {
    const a = list[i];
    const b = list[i + dir];
    if (!a || !b) return;
    await patch(a, { position: b.position });
    await patch(b, { position: a.position });
  }

  return (
    <>
      <PageHead
        title="Tags"
        sub="The Good for and Best light lists in the app. Rename, reorder or hide; keys are permanent (D-25)."
      />
      <p className="muted">
        Labels, order and visibility update in the app immediately. A tag&apos;s key never changes,
        and hiding a tag keeps it on existing locations; it just can&apos;t be chosen for new ones.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {(['good_for', 'best_light'] as const).map((kind) => {
        const list = (items ?? []).filter((t) => t.kind === kind);
        return (
          <section key={kind}>
            <h2>{KIND_TITLE[kind]}</h2>
            <table>
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Key</th>
                  <th>Used by</th>
                  <th>Status</th>
                  <th>Order</th>
                </tr>
              </thead>
              <tbody>
                {list.map((t, i) => (
                  <tr key={t.key}>
                    <td data-label="Label">
                      <LabelEditor tag={t} onSave={(label) => void patch(t, { label })} />
                    </td>
                    <td data-label="Key" className="mono">
                      {t.key}
                    </td>
                    <td data-label="Used by" className="mono">
                      {t.used}
                    </td>
                    <td data-label="Status">
                      <div className="row">
                        <StatusBadge value={t.active ? 'published' : 'hidden'} />
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => void patch(t, { active: !t.active })}
                        >
                          {t.active ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    </td>
                    <td data-label="Order">
                      <div className="row">
                        <button
                          type="button"
                          className="secondary"
                          aria-label={`Move ${t.label} up`}
                          disabled={i === 0}
                          onClick={() => void move(list, i, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          aria-label={`Move ${t.label} down`}
                          disabled={i === list.length - 1}
                          onClick={() => void move(list, i, 1)}
                        >
                          ↓
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <AddTag kind={kind} onAdded={load} />
          </section>
        );
      })}
    </>
  );
}

function LabelEditor({ tag, onSave }: { tag: Tag; onSave(label: string): void }) {
  const [value, setValue] = useState(tag.label);
  useEffect(() => setValue(tag.label), [tag.label]);
  const dirty = value.trim() !== tag.label && value.trim().length > 0;
  return (
    <div className="row">
      <input
        aria-label={`Label for ${tag.key}`}
        value={value}
        maxLength={60}
        onChange={(e) => setValue(e.target.value)}
        style={{ maxWidth: 260 }}
      />
      {dirty && (
        <button type="button" onClick={() => onSave(value.trim())}>
          Save
        </button>
      )}
    </div>
  );
}

function AddTag({ kind, onAdded }: { kind: Kind; onAdded(): void }) {
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const key = label
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(\d)/, 't_$1')
    .slice(0, 32);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api('/admin/v1/vocabulary', {
        method: 'POST',
        body: { kind, key, label: label.trim() },
      });
      setLabel('');
      onAdded();
    } catch {
      setError('Could not add it. The key may already exist.');
    }
  }
  return (
    <form onSubmit={add} className="row" style={{ marginTop: 12 }}>
      <label style={{ margin: 0, flex: 1, maxWidth: 320 }}>
        <span className="label">New {KIND_TITLE[kind].toLowerCase()} tag</span>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={60}
          placeholder="e.g. Rooftop"
        />
      </label>
      <span className="mono muted" style={{ alignSelf: 'end', paddingBottom: 10 }}>
        key: {key || '—'}
      </span>
      <button type="submit" disabled={key.length < 2} style={{ alignSelf: 'end' }}>
        Add
      </button>
      {error && (
        <span className="error" role="alert">
          {error}
        </span>
      )}
    </form>
  );
}
