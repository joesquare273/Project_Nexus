// Requests (#/requests): a player tells the admin about a problem — a
// subject, the cards involved and a description — and sees what happened to
// the ones they sent. The game server saves them with the sending account
// (POST /api/requests); the admin page lists them all.

import { useEffect, useMemo, useState } from 'react';
import { CARDS } from '@nexus/cards';
import { accessToken, useSession } from './AccountBar.tsx';

export type RequestStatus = 'not_started' | 'incomplete' | 'complete';
export interface SupportRequest {
  id: number;
  userId: string;
  from?: string;
  subject: string;
  cards: string[];
  description: string;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
}

export const STATUS_LABEL: Record<RequestStatus, string> = { not_started: 'Not started', incomplete: 'Incomplete', complete: 'Complete' };

/** A request to the game server with the player's sign-in; the server's error message on failure. */
export async function requestApi<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const token = await accessToken();
  if (!token) throw new Error('Sign in first.');
  const res = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? 'The game server could not do that. Try again.');
  return json;
}

/** Every card name the game knows (tokens left out), for suggestions. */
function useCardNames(): string[] {
  return useMemo(() => [...new Set(CARDS.filter((c) => !c.token).map((c) => c.name))].sort((a, b) => a.localeCompare(b)), []);
}

export function RequestsPage() {
  const userId = useSession().session?.user.id;
  const names = useCardNames();
  const [subject, setSubject] = useState('');
  const [cardInput, setCardInput] = useState('');
  const [cards, setCards] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [mine, setMine] = useState<SupportRequest[] | null>(null);

  const load = () =>
    requestApi<{ requests: SupportRequest[] }>('/api/requests')
      .then((r) => setMine(r.requests))
      .catch((e: Error) => setProblem(e.message));
  useEffect(() => {
    setMine(null);
    if (userId) void load();
  }, [userId]);

  const addCard = (name: string) => {
    const n = name.trim();
    if (!n || cards.includes(n) || cards.length >= 30) return;
    setCards([...cards, n]);
    setCardInput('');
  };
  const send = async () => {
    setBusy(true);
    setProblem(null);
    setSent(null);
    try {
      const pending = cardInput.trim() && !cards.includes(cardInput.trim()) ? [...cards, cardInput.trim()] : cards;
      await requestApi('/api/requests', 'POST', { subject, cards: pending, description });
      setSent('Sent. You can follow it below.');
      setSubject('');
      setCards([]);
      setCardInput('');
      setDescription('');
      await load();
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="requests-page">
      <section className="request-form" aria-label="Send a request">
        <h2>Send a request</h2>
        <p className="fineprint">Something not working, a card that plays wrong, or an idea? Tell the admin here. Your account is sent with it.</p>
        <label>
          Subject
          <input value={subject} maxLength={120} onChange={(e) => setSubject(e.target.value)} placeholder="For example: Sunfall didn't exile anything" />
        </label>
        <label>
          Cards involved (optional)
          <div className="request-card-input">
            <input
              list="request-card-names"
              value={cardInput}
              maxLength={100}
              onChange={(e) => setCardInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCard(cardInput);
                }
              }}
              placeholder="Type a card name, then Add"
            />
            <button type="button" onClick={() => addCard(cardInput)} disabled={!cardInput.trim()}>
              Add
            </button>
          </div>
          <datalist id="request-card-names">
            {names.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </label>
        {cards.length > 0 && (
          <ul className="request-cards">
            {cards.map((c) => (
              <li key={c}>
                {c}
                <button type="button" className="ghost" aria-label={`Remove ${c}`} onClick={() => setCards(cards.filter((x) => x !== c))}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <label>
          Description of the problem
          <textarea value={description} maxLength={4000} rows={6} onChange={(e) => setDescription(e.target.value)} placeholder="What happened, and what you expected to happen." />
        </label>
        <div className="request-actions">
          <button className="primary" disabled={busy || !subject.trim() || !description.trim()} onClick={() => void send()}>
            {busy ? 'Sending…' : 'Send request'}
          </button>
          <span className="fineprint">{description.length} / 4,000</span>
        </div>
        {sent && <p className="admin-done">{sent}</p>}
        {problem && <p className="online-error">{problem}</p>}
      </section>

      <section className="request-list" aria-label="Your requests">
        <h2>Your requests</h2>
        {mine === null ? (
          <p className="fineprint">Loading…</p>
        ) : mine.length === 0 ? (
          <p className="fineprint">None yet.</p>
        ) : (
          mine.map((r) => <RequestCard key={r.id} r={r} />)
        )}
      </section>
    </div>
  );
}

/** One request: its subject, status, cards and description. */
export function RequestCard({ r, admin }: { r: SupportRequest; admin?: React.ReactNode }) {
  return (
    <article className={`request-card status-${r.status}`}>
      <header>
        <h3>{r.subject}</h3>
        <span className={`request-status ${r.status}`}>{STATUS_LABEL[r.status]}</span>
      </header>
      <p className="fineprint">
        {r.from ? (
          <>
            From <strong>{r.from}</strong> ·{' '}
          </>
        ) : null}
        {new Date(r.createdAt).toLocaleString()}
        {r.updatedAt !== r.createdAt ? ` · updated ${new Date(r.updatedAt).toLocaleString()}` : ''}
      </p>
      {r.cards.length > 0 && (
        <ul className="request-cards">
          {r.cards.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
      <p className="request-description">{r.description}</p>
      {admin}
    </article>
  );
}
