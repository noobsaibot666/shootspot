'use client';

import { PageHead } from '@/components/PageHead';
import { useCallback, useEffect, useState } from 'react';
import { ConfirmAction } from '@/components/ConfirmAction';
import { api, fmtDate } from '@/lib/api';

interface User {
  id: string;
  email: string;
  role: 'member' | 'owner';
  created_at: string;
  onboarded_at: string | null;
  records: number;
  sessions: number;
}

/** Shows only what an operator needs; profile details stay out of the admin view. */
export default function UsersPage() {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<User[] | null>(null);
  const load = useCallback(() => {
    api<{ items: User[] }>(`/admin/v1/users?q=${encodeURIComponent(q)}`).then((r) =>
      setItems(r.items),
    );
  }, [q]);
  useEffect(load, [load]);

  return (
    <>
      <PageHead
        title="Users"
        sub="Members and owners. Role changes and sign-out-everywhere need a reason and are audited."
      />
      <label style={{ maxWidth: 320 }}>
        <span className="label">Search email</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {!items ? (
        <p className="muted">Loading…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Joined</th>
              <th>Records</th>
              <th>Sessions</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id}>
                <td data-label="Email">{u.email}</td>
                <td data-label="Role">{u.role}</td>
                <td data-label="Joined" className="mono">
                  {fmtDate(u.created_at)}
                </td>
                <td data-label="Records" className="mono">
                  {u.records}
                </td>
                <td data-label="Sessions" className="mono">
                  {u.sessions}
                </td>
                <td data-label="Actions">
                  <div className="row">
                    <ConfirmAction
                      label="Sign out everywhere"
                      title={`Sign out ${u.email}?`}
                      impact="Ends all of this account's sessions on every device."
                      onConfirm={async (reason) => {
                        await api(`/admin/v1/users/${u.id}/revoke-sessions`, {
                          method: 'POST',
                          body: { reason },
                        });
                        load();
                      }}
                    />
                    <ConfirmAction
                      label={u.role === 'owner' ? 'Make member' : 'Make owner'}
                      danger={u.role === 'member'}
                      title={u.role === 'owner' ? 'Remove owner access?' : 'Grant owner access?'}
                      impact={
                        u.role === 'owner'
                          ? 'They lose access to this admin console immediately.'
                          : 'Owners can moderate content and see who created any record. They must set up 2-factor first.'
                      }
                      onConfirm={async (reason) => {
                        await api(`/admin/v1/users/${u.id}/role`, {
                          method: 'POST',
                          body: { role: u.role === 'owner' ? 'member' : 'owner', reason },
                        });
                        load();
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
