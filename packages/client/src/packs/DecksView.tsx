// Saved decks (economy step E1b): each account's own Commander, Limited and
// 60-card decks, built from the cards in its collection plus free basic
// lands. The server checks ownership when a deck is saved; the size and copy
// notes here are a guide, and a deck in progress can be saved anyway.

import { useEffect, useMemo, useState } from 'react';
import type { BoosterCard, Finish } from '@nexus/cards/boosters';
import { accessToken } from '../account/AccountBar.tsx';
import { PRINTING_CARDS } from './browse.ts';
import { deleteDeck, fetchDecks, saveDeck, type Basics, type Collection, type DeckDraft, type DeckFormat, type SavedDeck } from './collection.ts';

type Boosters = typeof import('@nexus/cards/boosters');

const FORMATS: { format: DeckFormat; label: string }[] = [
  { format: 'limited', label: 'Limited (40-60)' },
  { format: 'constructed', label: '60-card' },
  { format: 'commander', label: 'Commander (100)' },
];
const BASIC_NAMES: Record<keyof Basics, string> = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' };
const NO_BASICS: Basics = { W: 0, U: 0, B: 0, R: 0, G: 0 };
const FINISH_MARK: Record<Finish, string> = { nonfoil: '', foil: ' ✦', surge: ' ✦✦' };

const deckSize = (d: DeckDraft) => d.cards.reduce((n, c) => n + c.count, 0) + Object.values(d.basics).reduce((n, k) => n + k, 0);

/** What the deck still needs to be legal to play, or null. */
export function deckNote(d: DeckDraft, names: Map<string, string>): string | null {
  const size = deckSize(d);
  const copies = new Map<string, number>();
  for (const c of d.cards) {
    const name = names.get(c.id) ?? c.id;
    copies.set(name, (copies.get(name) ?? 0) + c.count);
  }
  const most = Math.max(0, ...copies.values());
  if (d.format === 'commander') {
    if (!d.commander) return 'Choose a commander.';
    if (size !== 100) return `${size} / 100 cards.`;
    if (most > 1) return 'Commander decks have one copy of each card (except basic lands).';
  } else {
    const min = d.format === 'limited' ? 40 : 60;
    if (size < min) return `${size} / ${min} cards.`;
    if (d.format === 'limited' && size > 60) return `${size} cards; Limited decks have at most 60.`;
    if (d.format === 'constructed' && most > 4) return 'At most four copies of each card (except basic lands).';
  }
  return null;
}

export function DecksView({ mod, collection, onPreview }: { mod: Boosters; collection: Collection; onPreview: (c: BoosterCard | null) => void }) {
  const [decks, setDecks] = useState<SavedDeck[] | null>(null);
  const [editing, setEditing] = useState<DeckDraft | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const byId = useMemo(() => new Map([...PRINTING_CARDS, ...mod.BOOSTER_CARDS].map((c) => [c.id, c])), [mod]);
  const names = useMemo(() => new Map([...byId].map(([id, c]) => [id, c.name])), [byId]);

  useEffect(() => {
    accessToken()
      .then((token) => (token ? fetchDecks(token) : Promise.reject(new Error('Sign in first.'))))
      .then(setDecks, (e: Error) => setProblem(e.message));
  }, []);

  const withToken = async (work: (token: string) => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    try {
      const token = await accessToken();
      if (!token) throw new Error('Sign in first.');
      await work(token);
    } catch (e) {
      setProblem(e instanceof Error && e.message !== 'Failed to fetch' ? e.message : 'Could not reach the game server.');
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <DeckEditor
        deck={editing}
        collection={collection}
        byId={byId}
        names={names}
        busy={busy}
        problem={problem}
        onPreview={onPreview}
        onChange={setEditing}
        onCancel={() => {
          setEditing(null);
          setProblem(null);
        }}
        onSave={() =>
          void withToken(async (token) => {
            const saved = await saveDeck(token, editing);
            setDecks((list) => [saved, ...(list ?? []).filter((d) => d.id !== saved.id)]);
            setEditing(null);
          })
        }
      />
    );
  }

  return (
    <div className="decks">
      {problem && <p className="account-error">{problem}</p>}
      <div className="decks-head">
        <button className="primary" disabled={!decks} onClick={() => setEditing({ name: 'New deck', format: 'limited', cards: [], basics: { ...NO_BASICS }, commander: null })}>
          New deck
        </button>
      </div>
      {!decks && !problem && <p className="fineprint">Loading your decks…</p>}
      {decks?.length === 0 && <p className="fineprint">No decks yet. Build one from the cards in your collection.</p>}
      <div className="decks-list">
        {decks?.map((d) => {
          const note = deckNote(d, names);
          const face = byId.get(d.commander ?? d.cards[0]?.id ?? '');
          return (
            <div key={d.id} className="deck-tile">
              {face ? <img src={face.images[0]!.artCrop} alt="" /> : <div className="deck-tile-blank" />}
              <div className="deck-tile-text">
                <strong>{d.name}</strong>
                <span className="fineprint">
                  {FORMATS.find((f) => f.format === d.format)!.label} · {deckSize(d)} cards
                </span>
                <span className={note ? 'deck-note' : 'deck-ok'}>{note ?? 'Ready to play'}</span>
              </div>
              <div className="deck-tile-buttons">
                <button onClick={() => setEditing(structuredClone(d))}>Edit</button>
                <button
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm(`Delete "${d.name}"?`)) return;
                    void withToken(async (token) => {
                      await deleteDeck(token, d.id);
                      setDecks((list) => (list ?? []).filter((x) => x.id !== d.id));
                    });
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DeckEditor({
  deck,
  collection,
  byId,
  names,
  busy,
  problem,
  onPreview,
  onChange,
  onCancel,
  onSave,
}: {
  deck: DeckDraft;
  collection: Collection;
  byId: Map<string, BoosterCard>;
  names: Map<string, string>;
  busy: boolean;
  problem: string | null;
  onPreview: (c: BoosterCard | null) => void;
  onChange: (d: DeckDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const [search, setSearch] = useState('');
  const inDeck = (id: string, finish: Finish) => deck.cards.find((c) => c.id === id && c.finish === finish)?.count ?? 0;
  // Every owned printing and finish, with how many are still free to add.
  const pool = useMemo(
    () =>
      Object.entries(collection.cards)
        .flatMap(([id, finishes]) => (Object.entries(finishes) as [Finish, number][]).map(([finish, count]) => ({ id, finish, count, card: byId.get(id) })))
        .filter((e): e is { id: string; finish: Finish; count: number; card: BoosterCard } => !!e.card && e.count > 0 && !/Basic Land/.test(e.card.typeLine))
        .sort((a, b) => a.card.name.localeCompare(b.card.name)),
    [collection, byId],
  );
  const shown = pool.filter((e) => e.card.name.toLowerCase().includes(search.trim().toLowerCase()));

  const setCount = (id: string, finish: Finish, count: number) => {
    const rest = deck.cards.filter((c) => !(c.id === id && c.finish === finish));
    const cards = count > 0 ? [...rest, { id, finish, count }] : rest;
    const commander = deck.commander && cards.some((c) => c.id === deck.commander) ? deck.commander : null;
    onChange({ ...deck, cards, commander });
  };
  const legends = deck.cards.filter((c) => /Legendary/.test(byId.get(c.id)?.typeLine ?? '') && /Creature/.test(byId.get(c.id)?.typeLine ?? ''));
  const note = deckNote(deck, names);

  return (
    <div className="deck-editor">
      <div className="deck-editor-head">
        <input value={deck.name} maxLength={40} aria-label="Deck name" onChange={(e) => onChange({ ...deck, name: e.target.value })} />
        <select value={deck.format} aria-label="Format" onChange={(e) => onChange({ ...deck, format: e.target.value as DeckFormat, commander: e.target.value === 'commander' ? deck.commander : null })}>
          {FORMATS.map((f) => (
            <option key={f.format} value={f.format}>
              {f.label}
            </option>
          ))}
        </select>
        <span className={note ? 'deck-note' : 'deck-ok'}>{note ?? `${deckSize(deck)} cards · ready to play`}</span>
        <button className="primary" disabled={busy || deck.name.trim() === ''} onClick={onSave}>
          Save
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
      {problem && <p className="account-error">{problem}</p>}
      <div className="deck-editor-body">
        <section>
          <h3>Your collection</h3>
          <input type="search" placeholder="Search cards" value={search} onChange={(e) => setSearch(e.target.value)} />
          {pool.length === 0 && <p className="fineprint">Your collection is empty. Open some packs first.</p>}
          <div className="binder-grid">
            {shown.map((e) => {
              const free = e.count - inDeck(e.id, e.finish);
              return (
                <button
                  key={`${e.id}|${e.finish}`}
                  className={`binder-card deck-pick ${free > 0 ? 'have' : 'missing'}`}
                  disabled={free <= 0}
                  title={`${e.card.name}${FINISH_MARK[e.finish]}: ${free} left`}
                  onClick={() => setCount(e.id, e.finish, inDeck(e.id, e.finish) + 1)}
                  onMouseEnter={() => onPreview(e.card)}
                  onMouseLeave={() => onPreview(null)}
                >
                  <img src={e.card.images[0]!.small} alt={e.card.name} loading="lazy" />
                  <span className="binder-count">
                    {free}
                    {FINISH_MARK[e.finish]}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
        <section className="deck-side">
          <h3>Deck · {deckSize(deck)}</h3>
          {deck.format === 'commander' && (
            <label>
              Commander{' '}
              <select value={deck.commander ?? ''} onChange={(e) => onChange({ ...deck, commander: e.target.value || null })}>
                <option value="">Choose…</option>
                {legends.map((c) => (
                  <option key={c.id} value={c.id}>
                    {names.get(c.id)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <ul className="deck-cards">
            {[...deck.cards]
              .sort((a, b) => (names.get(a.id) ?? '').localeCompare(names.get(b.id) ?? ''))
              .map((c) => (
                <li key={`${c.id}|${c.finish}`} onMouseEnter={() => onPreview(byId.get(c.id) ?? null)} onMouseLeave={() => onPreview(null)}>
                  <button aria-label="Remove one" onClick={() => setCount(c.id, c.finish, c.count - 1)}>
                    −
                  </button>
                  <span>
                    {c.count} {names.get(c.id) ?? 'Unknown card'}
                    {FINISH_MARK[c.finish]}
                  </span>
                </li>
              ))}
          </ul>
          <h3>Basic lands</h3>
          <div className="deck-basics">
            {(Object.keys(BASIC_NAMES) as (keyof Basics)[]).map((k) => (
              <label key={k}>
                {BASIC_NAMES[k]}
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={deck.basics[k]}
                  onChange={(e) => onChange({ ...deck, basics: { ...deck.basics, [k]: Math.max(0, Math.min(99, Math.floor(Number(e.target.value) || 0))) } })}
                />
              </label>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
