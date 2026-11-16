// The admin page (#/admin): every account's Aether Shards and fragments, and
// changing a player's shards. The game server checks the admin flag on every
// request (profiles.is_admin); this page only asks and shows. Each change has
// its own request id, kept for retries, so a repeat never applies twice.

import { useEffect, useState } from 'react';
import { accessToken, ShardIcon, showShards, useSession } from './AccountBar.tsx';
import { RequestCard, requestApi, STATUS_LABEL, type RequestStatus, type SupportRequest } from './RequestsPage.tsx';

interface AdminAccount {
  id: string;
  name: string;
  shards: number;
  fragments: { common: number; uncommon: number; rare: number; mythic: number };
  admin: boolean;
  createdAt: string;
}
interface AdminAction {
  admin: string;
  user: string;
  kind: 'set_shards' | 'add_shards';
  amount: number;
  balanceAfter: number;
  note: string;
  at: string;
}
interface Draft {
  mode: 'set' | 'add';
  amount: string;
  note: string;
  requestId: string;
}

const RARITIES = [
  ['common', 'C'],
  ['uncommon', 'U'],
  ['rare', 'R'],
  ['mythic', 'M'],
] as const;

async function call<T>(path: string, body?: unknown): Promise<T> {
  const token = await accessToken();
  if (!token) throw new Error('Sign in first.');
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? 'The game server could not do that. Try again.');
  return json;
}

const fresh = (): Draft => ({ mode: 'set', amount: '', note: '', requestId: crypto.randomUUID() });

/** The admin page: accounts (shards, fragments) and the players' requests. */
export function AdminPage() {
  const [tab, setTab] = useState<'accounts' | 'requests'>('accounts');
  return (
    <>
      <div className="admin-tabs" role="tablist" aria-label="Admin">
        <button role="tab" aria-selected={tab === 'accounts'} className={tab === 'accounts' ? 'chosen' : ''} onClick={() => setTab('accounts')}>
          Accounts
        </button>
        <button role="tab" aria-selected={tab === 'requests'} className={tab === 'requests' ? 'chosen' : ''} onClick={() => setTab('requests')}>
          Requests
        </button>
      </div>
      {tab === 'accounts' ? <AdminAccounts /> : <AdminRequests />}
    </>
  );
}

/**
 * The players' requests: newest first, with the account that sent each one.
 * Set a status (not started, incomplete, complete), or delete a request once
 * it's dealt with.
 */
function AdminRequests() {
  const [list, setList] = useState<SupportRequest[] | null>(null);
  const [filter, setFilter] = useState<RequestStatus | 'all' | 'open'>('open');
  const [problem, setProblem] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const load = () =>
    requestApi<{ requests: SupportRequest[] }>('/api/admin/requests')
      .then((r) => {
        setList(r.requests);
        setProblem(null);
      })
      .catch((e: Error) => setProblem(e.message));
  useEffect(() => {
    void load();
  }, []);
  if (!list) return <p className="packs-loading">{problem ?? 'Loading the requests…'}</p>;
  const shown = list.filter((r) => (filter === 'all' ? true : filter === 'open' ? r.status !== 'complete' : r.status === filter));
  const count = (f: RequestStatus) => list.filter((r) => r.status === f).length;
  const setStatus = async (r: SupportRequest, status: RequestStatus) => {
    try {
      await requestApi('/api/admin/requests/status', 'POST', { id: r.id, status });
      setList(list.map((x) => (x.id === r.id ? { ...x, status, updatedAt: new Date().toISOString() } : x)));
    } catch (e) {
      setProblem((e as Error).message);
    }
  };
  const remove = async (r: SupportRequest) => {
    try {
      await requestApi(`/api/admin/requests/${r.id}`, 'DELETE');
      setList(list.filter((x) => x.id !== r.id));
      setDeleting(null);
    } catch (e) {
      setProblem((e as Error).message);
    }
  };
  return (
    <div className="admin-page">
      <div className="admin-head">
        <div className="admin-filters" role="radiogroup" aria-label="Show">
          {(
            [
              ['open', `Open (${list.length - count('complete')})`],
              ['not_started', `Not started (${count('not_started')})`],
              ['incomplete', `Incomplete (${count('incomplete')})`],
              ['complete', `Complete (${count('complete')})`],
              ['all', `All (${list.length})`],
            ] as const
          ).map(([f, label]) => (
            <button key={f} role="radio" aria-checked={filter === f} className={filter === f ? 'chosen' : ''} onClick={() => setFilter(f)}>
              {label}
            </button>
          ))}
        </div>
        <button className="ghost" onClick={() => void load()}>
          Refresh
        </button>
      </div>
      {problem && <p className="online-error">{problem}</p>}
      {shown.length === 0 ? (
        <p className="fineprint">No requests here.</p>
      ) : (
        shown.map((r) => (
          <RequestCard
            key={r.id}
            r={r}
            admin={
              <div className="request-admin">
                <label>
                  Status{' '}
                  <select value={r.status} onChange={(e) => void setStatus(r, e.target.value as RequestStatus)}>
                    {(Object.keys(STATUS_LABEL) as RequestStatus[]).map((st) => (
                      <option key={st} value={st}>
                        {STATUS_LABEL[st]}
                      </option>
                    ))}
                  </select>
                </label>
                {deleting === r.id ? (
                  <>
                    <span>Delete this request?</span>
                    <button className="danger" onClick={() => void remove(r)}>
                      Yes, delete
                    </button>
                    <button className="ghost" onClick={() => setDeleting(null)}>
                      Keep
                    </button>
                  </>
                ) : (
                  <button className="ghost" onClick={() => setDeleting(r.id)}>
                    Delete
                  </button>
                )}
              </div>
            }
          />
        ))
      )}
    </div>
  );
}

function AdminAccounts() {
  const me = useSession().session?.user.id;
  const [data, setData] = useState<{ accounts: AdminAccount[]; actions: AdminAction[] } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(fresh);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const load = () =>
    call<{ accounts: AdminAccount[]; actions: AdminAction[] }>('/api/admin/accounts')
      .then((d) => {
        setData(d);
        setProblem(null);
      })
      .catch((e: Error) => setProblem(e.message));
  useEffect(() => {
    void load();
  }, []);

  if (!data) return <p className="packs-loading">{problem ?? 'Loading the accounts…'}</p>;
  const nameOf = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? id.slice(0, 8);
  const shown = data.accounts.filter((a) => a.name.toLowerCase().includes(search.trim().toLowerCase()));
  const target = data.accounts.find((a) => a.id === editing) ?? null;
  const amount = Number(draft.amount);
  const valid = draft.amount.trim() !== '' && Number.isInteger(amount) && (draft.mode === 'add' ? amount !== 0 : amount >= 0);
  const after = target && valid ? (draft.mode === 'set' ? amount : target.shards + amount) : null;

  const open = (a: AdminAccount) => {
    setEditing(a.id);
    setDraft(fresh());
    setConfirming(false);
    setDone(null);
    setProblem(null);
  };
  const apply = async () => {
    if (!target || !valid) return;
    setBusy(true);
    try {
      const r = await call<{ balance: number; applied: boolean }>('/api/admin/shards', { userId: target.id, mode: draft.mode, amount, requestId: draft.requestId, note: draft.note });
      if (target.id === me) showShards(r.balance);
      setDone(`${target.name} now has ${r.balance.toLocaleString()} Aether Shards.`);
      setEditing(null);
      setConfirming(false);
      await load();
    } catch (e) {
      // The same request id is kept, so trying again can't apply the change twice.
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-head">
        <input className="admin-search" placeholder="Search players" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search players" />
        <span className="fineprint">
          {data.accounts.length} accounts · {data.accounts.reduce((n, a) => n + a.shards, 0).toLocaleString()} Aether Shards in all
        </span>
        <button className="ghost" onClick={() => void load()}>
          Refresh
        </button>
      </div>
      {done && <p className="admin-done">{done}</p>}
      {problem && <p className="online-error">{problem}</p>}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Joined</th>
              <th className="num">
                <ShardIcon size={14} /> Aether Shards
              </th>
              <th className="num" title="Fragments: common, uncommon, rare, mythic">
                Fragments (C / U / R / M)
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((a) => (
              <tr key={a.id} className={editing === a.id ? 'editing' : ''}>
                <td>
                  {a.name} {a.admin && <span className="turn-pill">Admin</span>}
                  {a.id === me && <span className="fineprint"> (you)</span>}
                </td>
                <td className="fineprint">{a.createdAt ? new Date(a.createdAt).toLocaleDateString() : ''}</td>
                <td className="num">{a.shards.toLocaleString()}</td>
                <td className="num">{RARITIES.map(([r]) => a.fragments[r].toLocaleString()).join(' / ')}</td>
                <td>
                  <button onClick={() => open(a)}>Change shards</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {target && (
        <section className="admin-edit" aria-label={`Change ${target.name}'s shards`}>
          <h3>
            {target.name}: {target.shards.toLocaleString()} Aether Shards
          </h3>
          <div className="admin-edit-row">
            <select value={draft.mode} onChange={(e) => (setDraft({ ...draft, mode: e.target.value as Draft['mode'], requestId: crypto.randomUUID() }), setConfirming(false))} aria-label="How to change it">
              <option value="set">Set the balance to</option>
              <option value="add">Add (negative to take away)</option>
            </select>
            <input
              type="number"
              step={1}
              value={draft.amount}
              onChange={(e) => (setDraft({ ...draft, amount: e.target.value, requestId: crypto.randomUUID() }), setConfirming(false))}
              placeholder={draft.mode === 'set' ? 'New balance' : 'Amount'}
              aria-label="Amount"
            />
            <input value={draft.note} maxLength={200} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="Note (why), optional" aria-label="Note" />
          </div>
          {after !== null && after < 0 && <p className="online-error">That would take the balance below zero.</p>}
          <div className="admin-edit-row">
            {confirming && after !== null && after >= 0 ? (
              <>
                <span>
                  {target.name}: {target.shards.toLocaleString()} → <strong>{after.toLocaleString()}</strong>. Apply?
                </span>
                <button className="primary" disabled={busy} onClick={() => void apply()}>
                  {busy ? 'Applying…' : 'Yes, apply'}
                </button>
                <button className="ghost" onClick={() => setConfirming(false)}>
                  Back
                </button>
              </>
            ) : (
              <>
                <button className="primary" disabled={!valid || (after ?? 0) < 0} onClick={() => setConfirming(true)}>
                  Review change
                </button>
                <button className="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </>
            )}
          </div>
        </section>
      )}

      <h3 className="admin-log-title">Recent admin changes</h3>
      {data.actions.length === 0 ? (
        <p className="fineprint">None yet.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Player</th>
                <th className="num">Change</th>
                <th className="num">Balance after</th>
                <th>Note</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {data.actions.map((x, i) => (
                <tr key={i}>
                  <td className="fineprint">{new Date(x.at).toLocaleString()}</td>
                  <td>{nameOf(x.user)}</td>
                  <td className={`num ${x.amount < 0 ? 'down' : 'up'}`}>
                    {x.amount > 0 ? '+' : ''}
                    {x.amount.toLocaleString()}
                  </td>
                  <td className="num">{x.balanceAfter.toLocaleString()}</td>
                  <td>{x.note}</td>
                  <td>{nameOf(x.admin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
