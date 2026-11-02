// Saved decks (economy step E1b): each account's own Commander, Limited and
// 60-card decks, built from the cards in its collection plus free basic
// lands. The server checks ownership when a deck is saved; the size and copy
// notes here are a guide, and a deck in progress can be saved anyway.

import { useEffect, useMemo, useState } from 'react';
import type { BoosterCard, Finish } from '@nexus/cards/boosters';
import { finishLook, finishName } from '@nexus/cards/boosters';
import { accessToken } from '../account/AccountBar.tsx';
import { CardShine } from '../components/Card.tsx';
import { isUnbuilt, PRINTING_CARDS } from './browse.ts';
import { deleteDeck, fetchDecks, saveDeck, type BasicColor, type Basics, type Collection, type DeckDraft, type DeckFormat, type SavedDeck } from './collection.ts';
import {
  addOne,
  basicAllowed,
  canAdd,
  COMMANDER_DECK_SIZE,
  MAX_COPIES,
  deckTotal,
  removeOffColor,
  setBasics,
  artAndFinish,
  chooseCommander,
  commanderIdentity,
  copiesInDeck,
  curve,
  fitsIdentity,
  groupCollection,
  inDeck,
  offColor,
  removeOne,
  section,
  SECTIONS,
  setArtCount,
  type CardGroup,
  type Owned,
} from './deckbuild.ts';

type Boosters = typeof import('@nexus/cards/boosters');

const FORMATS: { format: DeckFormat; label: string }[] = [
  { format: 'limited', label: 'Limited (40-60)' },
  { format: 'constructed', label: '60-card' },
  { format: 'commander', label: 'Commander (100)' },
];
const BASIC_NAMES: Record<BasicColor, string> = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' };
const NO_BASICS: Basics = { W: 0, U: 0, B: 0, R: 0, G: 0 };

const COLORS = ['W', 'U', 'B', 'R', 'G'] as const;
const deckSize = (d: DeckDraft) => d.cards.reduce((n, c) => n + c.count, 0) + COLORS.reduce((n, k) => n + d.basics[k], 0);

/** What the deck still needs to be legal to play, or null. `unbuilt` says which cards can't be used in games yet. */
export function deckNote(d: DeckDraft, names: Map<string, string>, unbuilt: (id: string) => boolean = () => false): string | null {
  const notBuilt = d.cards.filter((c) => unbuilt(c.id)).reduce((n, c) => n + c.count, 0);
  if (notBuilt > 0) return `${notBuilt} ${notBuilt === 1 ? "card isn't" : "cards aren't"} built yet and can't be used in games.`;
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
  const byId = useMemo(() => new Map([...PRINTING_CARDS, ...mod.BOOSTER_CARDS, ...mod.SECRET_LAIR_CARDS].map((c) => [c.id, c])), [mod]);
  const names = useMemo(() => new Map([...byId].map(([id, c]) => [id, c.name])), [byId]);
  const unbuiltId = (id: string) => { const c = byId.get(id); return !!c && isUnbuilt(c); };

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

  const tile = (d: SavedDeck) => {
    const note = deckNote(d, names, unbuiltId);
    const face = byId.get(d.commander ?? d.cards[0]?.id ?? '');
    return (
      <div key={d.id} className="deck-tile">
        {face ? <img src={face.images[0]!.artCrop} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} /> : <div className="deck-tile-blank" />}
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
  };
  const blank = (format: DeckFormat, name: string): DeckDraft => ({ name, format, cards: [], basics: { ...NO_BASICS }, commander: null });
  // Commander (100) and 60-card decks are built separately; Limited decks saved before stay listed.
  const sections: { format: DeckFormat; title: string; blurb: string; button: string | null }[] = [
    { format: 'commander', title: 'Commander decks', blurb: '100 cards with your commander, one of each card (basic lands excepted), in your commander’s colors.', button: 'New Commander deck' },
    { format: 'constructed', title: '60-card decks', blurb: 'At least 60 cards, up to four copies of each card (basic lands are unlimited).', button: 'New 60-card deck' },
    { format: 'limited', title: 'Limited decks', blurb: '40 to 60 cards.', button: null },
  ];

  return (
    <div className="decks">
      {problem && <p className="account-error">{problem}</p>}
      {!decks && !problem && <p className="fineprint">Loading your decks…</p>}
      {decks &&
        sections.map((sec) => {
          const list = decks.filter((d) => d.format === sec.format);
          if (!sec.button && list.length === 0) return null;
          return (
            <section key={sec.format} className="decks-section">
              <div className="decks-section-head">
                <div>
                  <h2>{sec.title}</h2>
                  <p className="fineprint">{sec.blurb}</p>
                </div>
                {sec.button && (
                  <button className="primary" onClick={() => setEditing(blank(sec.format, sec.format === 'commander' ? 'New Commander deck' : 'New 60-card deck'))}>
                    {sec.button}
                  </button>
                )}
              </div>
              {list.length === 0 && <p className="fineprint">No {sec.title.toLowerCase()} yet.</p>}
              <div className="decks-list">{list.map(tile)}</div>
            </section>
          );
        })}
    </div>
  );
}

const COLOR_FILTERS = [
  { key: 'W', label: 'White' },
  { key: 'U', label: 'Blue' },
  { key: 'B', label: 'Black' },
  { key: 'R', label: 'Red' },
  { key: 'G', label: 'Green' },
  { key: 'C', label: 'Colorless' },
] as const;
const TYPE_FILTERS = ['All', 'Creatures', 'Instants', 'Sorceries', 'Artifacts', 'Enchantments', 'Lands'] as const;
const MANA_SYMBOL = (k: string) => `https://svgs.scryfall.io/card-symbols/${k}.svg`;

/** A card picture: the printing's image with its finish's shine, and an optional count badge. */
function CardPic({ o, size = 'small', badge }: { o: { card: BoosterCard; finish: Finish }; size?: 'small' | 'normal'; badge?: number | string }) {
  const look = finishLook(o.card, o.finish);
  return (
    <span className="deck-pic">
      <img src={o.card.images[0]![size]} alt={o.card.name} loading="lazy" />
      {look && <CardShine finish={look} />}
      {badge !== undefined && <span className="deck-pic-badge">{badge}</span>}
    </span>
  );
}

type Modal = { kind: 'art'; name: string } | { kind: 'commander' } | { kind: 'basic'; color: BasicColor } | null;

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
  const [colors, setColors] = useState<string[]>([]);
  const [type, setType] = useState<(typeof TYPE_FILTERS)[number]>('All');
  const [modal, setModal] = useState<Modal>(null);
  const groups = useMemo(() => groupCollection(collection, byId), [collection, byId]);
  const byName = useMemo(() => new Map(groups.map((g) => [g.name, g])), [groups]);
  const identity = deck.format === 'commander' ? commanderIdentity(deck, byId) : null;
  const note = deckNote(deck, names, (id) => { const c = byId.get(id); return !!c && isUnbuilt(c); });
  const wrongColors = identity ? offColor(deck, groups, identity) : [];

  const shown = groups.filter((g) => {
    if (search.trim() && !g.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (type !== 'All' && section(g) !== type) return false;
    if (colors.length) {
      const cs = g.colorIdentity.length ? g.colorIdentity : ['C'];
      if (!colors.some((c) => cs.includes(c))) return false;
    }
    // Commander decks: only cards in the commander's colors (rule 903.5c).
    if (deck.format === 'commander' && (!identity || !fitsIdentity(g, identity))) return false;
    return true;
  });
  const inDeckGroups = groups.filter((g) => copiesInDeck(deck, g) > 0);
  const commanderCard = deck.commander ? byId.get(deck.commander) : undefined;
  const commanderEntry = deck.commander ? deck.cards.find((c) => c.id === deck.commander) : undefined;
  const bars = curve(deck, groups);
  const tallest = Math.max(1, ...bars);
  /** The art shown for a card in the deck: the one with the most copies. */
  const deckFace = (g: CardGroup) => [...g.arts].sort((a, b) => inDeck(deck, b) - inDeck(deck, a))[0]!;

  return (
    <div className="deck-editor v2">
      <div className="deck-editor-head">
        <input value={deck.name} maxLength={40} aria-label="Deck name" onChange={(e) => onChange({ ...deck, name: e.target.value })} />
        <span className="deck-format-badge" aria-label="Format">
          {deck.format === 'commander' ? 'Commander · 100 cards' : deck.format === 'constructed' ? '60-card · up to 4 of each' : 'Limited · 40-60 cards'}
        </span>
        <span className={note ? 'deck-note' : 'deck-ok'}>{note ?? `${deckSize(deck)} cards · ready to play`}</span>
        <button className="primary" disabled={busy || deck.name.trim() === ''} onClick={onSave}>
          Save deck
        </button>
        <button className="ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {problem && <p className="account-error">{problem}</p>}
      {wrongColors.length > 0 && identity && (
        <p className="deck-note">
          Not in your commander's colors: {wrongColors.join(', ')}.{' '}
          <button className="link" onClick={() => onChange(removeOffColor(deck, groups, identity))}>
            Remove them
          </button>
        </p>
      )}

      <div className="deck-editor-body">
        {/* The collection: card pictures, click to add. */}
        <section className="deck-pool">
          <div className="deck-filters">
            <input type="search" placeholder="Search your cards" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="deck-color-filter" role="group" aria-label="Colors">
              {COLOR_FILTERS.filter((c) => !identity || c.key === 'C' || identity.includes(c.key)).map((c) => (
                <button
                  key={c.key}
                  className={colors.includes(c.key) ? 'chosen' : ''}
                  aria-pressed={colors.includes(c.key)}
                  title={c.label}
                  onClick={() => setColors(colors.includes(c.key) ? colors.filter((x) => x !== c.key) : [...colors, c.key])}
                >
                  <img src={MANA_SYMBOL(c.key)} alt={c.label} onError={(e) => (e.currentTarget.replaceWith(document.createTextNode(c.key)))} />
                </button>
              ))}
            </div>
            <select value={type} aria-label="Card type" onChange={(e) => setType(e.target.value as (typeof TYPE_FILTERS)[number])}>
              {TYPE_FILTERS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            {identity && (
              <span className="deck-identity" title="Commander decks can only use cards in the commander's colors">
                Colors:{' '}
                {identity.length ? identity.map((c) => <img key={c} src={MANA_SYMBOL(c)} alt={c} />) : 'colorless'}
              </span>
            )}
          </div>
          {deck.format === 'commander' && !identity ? (
            <div className="deck-choose-first">
              <p>Choose your commander first. Then only cards in its colors are shown here.</p>
              <button className="primary" onClick={() => setModal({ kind: 'commander' })}>
                Choose a commander
              </button>
            </div>
          ) : (
            <p className="deck-help">
              {deck.format === 'commander'
                ? `Click a card to add it: one of each card (basic lands excepted), up to ${COMMANDER_DECK_SIZE} cards with your commander. Click a card in your deck to choose its art or remove it.`
                : deck.format === 'constructed'
                  ? 'Click a card to add a copy (up to four of each). Click a card in your deck to choose its art or remove it.'
                  : 'Click a card to add a copy. Click a card in your deck to choose its art or remove it.'}
            </p>
          )}
          {groups.length === 0 && <p className="fineprint">Your collection is empty. Open some packs first.</p>}
          {SECTIONS.map((sec) => {
            const inSection = shown.filter((g) => section(g) === sec);
            if (!inSection.length) return null;
            return (
              <div key={sec} className="deck-pool-section">
                <h4>
                  {sec} <span>{inSection.length}</span>
                </h4>
                <div className="deck-pool-grid">
                  {inSection.map((g) => {
              const used = copiesInDeck(deck, g);
              const free = g.total - used;
              const addable = canAdd(deck, g, identity);
              const face = used ? deckFace(g) : g.arts[0]!;
              return (
                <button
                  key={g.name}
                  className={`deck-pool-card ${addable ? '' : 'used-up'} ${used ? 'in-deck' : ''}`}
                  disabled={!addable}
                  title={`${g.name}: you own ${g.total}, ${free} not in this deck${g.arts.length > 1 ? ` · ${g.arts.length} arts` : ''}${!addable && free > 0 ? ' · Commander decks have one of each card' : ''}`}
                  onClick={() => onChange(addOne(deck, g, identity))}
                  onMouseEnter={() => onPreview(face.card)}
                  onMouseLeave={() => onPreview(null)}
                >
                  <CardPic o={face} badge={deck.format === 'commander' ? undefined : `${deck.format === 'constructed' ? Math.max(0, Math.min(free, MAX_COPIES - used)) : free} left`} />
                  {g.arts.length > 1 && <span className="deck-arts-chip">{g.arts.length} arts</span>}
                  {used > 0 && <span className="deck-used-chip">{deck.format === 'commander' ? 'In deck' : `${used} in deck`}</span>}
                  {isUnbuilt(face.card) && <span className="binder-unbuilt">Not built</span>}
                </button>
              );
                  })}
                </div>
              </div>
            );
          })}
        </section>

        {/* The deck: commander, curve, cards by type as pictures, basic lands. */}
        <section className="deck-side v2">
          {deck.format === 'commander' && (
            <div className="deck-commander">
              <button className="deck-commander-slot" onClick={() => setModal({ kind: 'commander' })} title="Choose your commander and its art">
                {commanderCard && commanderEntry ? <CardPic o={{ card: commanderCard, finish: commanderEntry.finish }} size="normal" /> : <span className="deck-commander-empty">Choose a commander</span>}
              </button>
              <div>
                <h3>Commander</h3>
                <p className="fineprint">{commanderCard ? commanderCard.name : 'A legendary creature you own leads the deck.'}</p>
                <button onClick={() => setModal({ kind: 'commander' })}>{commanderCard ? 'Change commander or art' : 'Choose a commander'}</button>
              </div>
            </div>
          )}
          <div className="deck-stats">
            <h3>Deck · {deckSize(deck)}</h3>
            <div className="deck-curve" aria-label="Mana curve">
              {bars.map((n, mv) => (
                <div key={mv} className="deck-curve-bar" title={`${n} card${n === 1 ? '' : 's'} with mana value ${mv === 7 ? '7+' : mv}`}>
                  <span style={{ height: `${(n / tallest) * 100}%` }} />
                  <small>{mv === 7 ? '7+' : mv}</small>
                </div>
              ))}
            </div>
          </div>
          {inDeckGroups.length === 0 && <p className="fineprint">Your deck is empty. Click cards on the left to add them.</p>}
          {SECTIONS.map((sec) => {
            const list = inDeckGroups.filter((g) => section(g) === sec && !(deck.commander && g.arts.some((a) => a.id === deck.commander) && copiesInDeck(deck, g) === 1));
            if (!list.length) return null;
            const count = list.reduce((n, g) => n + copiesInDeck(deck, g), 0);
            return (
              <div key={sec} className="deck-section">
                <h4>
                  {sec} <span>{count}</span>
                </h4>
                <div className="deck-section-cards">
                  {list.map((g) => (
                    <button
                      key={g.name}
                      className="deck-card"
                      title={`${g.name}: choose art or remove`}
                      onClick={() => setModal({ kind: 'art', name: g.name })}
                      onMouseEnter={() => onPreview(deckFace(g).card)}
                      onMouseLeave={() => onPreview(null)}
                    >
                      <CardPic o={deckFace(g)} badge={copiesInDeck(deck, g) > 1 ? `×${copiesInDeck(deck, g)}` : undefined} />
                      <span
                        className="deck-card-remove"
                        role="button"
                        aria-label={`Remove one ${g.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onChange(removeOne(deck, g));
                        }}
                      >
                        −
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="deck-section">
            <h4>
              Basic lands <span>{COLORS.reduce((n, k) => n + deck.basics[k], 0)}</span>
            </h4>
            {deck.format === 'commander' && !identity && <p className="fineprint">Choose a commander to add basic lands of its colors.</p>}
            <div className="deck-basics v2">
              {COLORS.filter((k) => basicAllowed(deck, k, identity) || deck.basics[k] > 0).map((k) => {
                const chosen = deck.basics.printings?.[k];
                const art = chosen ? byId.get(chosen.id) : undefined;
                const set = (n: number) => onChange(setBasics(deck, k, n));
                return (
                  <div key={k} className="deck-basic">
                    <button className="deck-basic-art" title={`${BASIC_NAMES[k]}: choose art`} onClick={() => setModal({ kind: 'basic', color: k })}>
                      {art && chosen ? <CardPic o={{ card: art, finish: chosen.finish }} /> : <span className="deck-basic-default">{BASIC_NAMES[k]}</span>}
                    </button>
                    <div className="deck-stepper">
                      <button aria-label={`One fewer ${BASIC_NAMES[k]}`} onClick={() => set(deck.basics[k] - 1)}>
                        −
                      </button>
                      <span>{deck.basics[k]}</span>
                      <button aria-label={`One more ${BASIC_NAMES[k]}`} disabled={!basicAllowed(deck, k, identity) || (deck.format === 'commander' && deckTotal(deck) >= COMMANDER_DECK_SIZE)} onClick={() => set(deck.basics[k] + 1)}>
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {modal?.kind === 'art' && byName.get(modal.name) && (
        <ArtPicker deck={deck} g={byName.get(modal.name)!} onChange={onChange} onPreview={onPreview} onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'commander' && (
        <CommanderPicker
          deck={deck}
          groups={groups.filter((g) => g.legendaryCreature)}
          onPick={(g, o) => {
            onChange(chooseCommander(deck, g, o));
            setModal(null);
          }}
          onPreview={onPreview}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === 'basic' && (
        <BasicArtPicker
          deck={deck}
          color={modal.color}
          options={basicArts(collection, byId, BASIC_NAMES[modal.color])}
          onChange={onChange}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

/** Owned printings of one basic land type (each can be used any number of times). */
function basicArts(collection: Collection, byId: Map<string, BoosterCard>, subtype: string): { id: string; finish: Finish; card: BoosterCard }[] {
  const out: { id: string; finish: Finish; card: BoosterCard }[] = [];
  for (const [id, finishes] of Object.entries(collection.cards)) {
    const card = byId.get(id);
    if (!card || !card.typeLine.startsWith(`Basic Land — ${subtype}`)) continue;
    for (const [finish, count] of Object.entries(finishes) as [Finish, number][]) if (count > 0) out.push({ id, finish, card });
  }
  return out;
}

function DeckModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className="deck-modal" role="dialog" aria-label={title} onClick={onClose}>
      <div className="deck-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="deck-modal-head">
          <h3>{title}</h3>
          <button className="ghost" onClick={onClose}>
            Done
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Every art you own of one card, as pictures: choose how many copies use each one. */
function ArtPicker({ deck, g, onChange, onPreview, onClose }: { deck: DeckDraft; g: CardGroup; onChange: (d: DeckDraft) => void; onPreview: (c: BoosterCard | null) => void; onClose: () => void }) {
  const total = copiesInDeck(deck, g);
  return (
    <DeckModal title={`${g.name} · ${total} in deck`} onClose={onClose}>
      <p className="deck-help">Each picture is an art and finish you own. Use + and − to choose how many copies use it.</p>
      <div className="deck-art-grid">
        {g.arts.map((o) => {
          const n = inDeck(deck, o);
          const commander = deck.commander === o.id && n > 0;
          return (
            <div key={`${o.id}|${o.finish}`} className={`deck-art-option ${n ? 'chosen' : ''}`} onMouseEnter={() => onPreview(o.card)} onMouseLeave={() => onPreview(null)}>
              <button
                className="deck-art-image"
                title="Use this art"
                onClick={() => {
                  // One tap: move every copy of this card to this art (as many as you own of it).
                  let next = deck;
                  for (const other of g.arts) if (other !== o) next = setArtCount(next, other, 0);
                  next = setArtCount(next, o, Math.min(o.count, Math.max(1, total)));
                  if (deck.commander && g.arts.some((a) => a.id === deck.commander)) next = { ...next, commander: o.id, cards: [...next.cards.filter((c) => c.id === o.id && c.finish === o.finish), ...next.cards.filter((c) => !(c.id === o.id && c.finish === o.finish))] };
                  onChange(next);
                }}
              >
                <CardPic o={o} size="normal" badge={n ? `×${n}` : undefined} />
              </button>
              <div className="deck-art-label">{artAndFinish(o)}</div>
              <div className="deck-stepper">
                <button aria-label="One fewer" disabled={!n || (commander && n === 1)} onClick={() => onChange(setArtCount(deck, o, n - 1))}>
                  −
                </button>
                <span>
                  {n} / {o.count}
                </span>
                <button aria-label="One more" disabled={n >= o.count} onClick={() => onChange(setArtCount(deck, o, n + 1))}>
                  +
                </button>
              </div>
              {commander && <span className="deck-art-tag">Commander</span>}
            </div>
          );
        })}
      </div>
    </DeckModal>
  );
}

/** Your legendary creatures in every art you own: pick the commander and its art in one click. */
function CommanderPicker({ deck, groups, onPick, onPreview, onClose }: { deck: DeckDraft; groups: CardGroup[]; onPick: (g: CardGroup, o: Owned) => void; onPreview: (c: BoosterCard | null) => void; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const shown = groups.filter((g) => g.name.toLowerCase().includes(search.trim().toLowerCase()));
  return (
    <DeckModal title="Choose your commander" onClose={onClose}>
      <input type="search" placeholder="Search your legendary creatures" value={search} onChange={(e) => setSearch(e.target.value)} />
      {groups.length === 0 && <p className="fineprint">You don't own a legendary creature yet.</p>}
      <p className="deck-help">Every legendary creature you own, in every art you own. Click one to lead your deck with it.</p>
      <div className="deck-art-grid">
        {shown.flatMap((g) =>
          g.arts.map((o) => {
            const current = deck.commander === o.id && deck.cards[0]?.id === o.id && deck.cards[0]?.finish === o.finish;
            return (
              <div key={`${o.id}|${o.finish}`} className={`deck-art-option ${current ? 'chosen' : ''}`} onMouseEnter={() => onPreview(o.card)} onMouseLeave={() => onPreview(null)}>
                <button className="deck-art-image" onClick={() => onPick(g, o)} title={`Make ${g.name} your commander`}>
                  <CardPic o={o} size="normal" />
                </button>
                <div className="deck-art-label">
                  <strong>{g.name}</strong>
                  <br />
                  {artAndFinish(o)}
                </div>
                {current && <span className="deck-art-tag">Your commander</span>}
              </div>
            );
          }),
        )}
      </div>
    </DeckModal>
  );
}

/** A basic land's art: the default, or any printing of it you own (any number of copies). */
function BasicArtPicker({ deck, color, options, onChange, onClose }: { deck: DeckDraft; color: BasicColor; options: { id: string; finish: Finish; card: BoosterCard }[]; onChange: (d: DeckDraft) => void; onClose: () => void }) {
  const chosen = deck.basics.printings?.[color];
  const pick = (o: { id: string; finish: Finish } | null) => {
    const printings = { ...deck.basics.printings };
    if (o) printings[color] = { id: o.id, finish: o.finish };
    else delete printings[color];
    onChange({ ...deck, basics: { ...deck.basics, printings } });
    onClose();
  };
  return (
    <DeckModal title={`${BASIC_NAMES[color]} art`} onClose={onClose}>
      <p className="deck-help">Basic lands are free and unlimited. Any {BASIC_NAMES[color]} art you own can be used for all of them.</p>
      <div className="deck-art-grid">
        <div className={`deck-art-option ${chosen ? '' : 'chosen'}`}>
          <button className="deck-art-image deck-basic-default big" onClick={() => pick(null)}>
            Default art
          </button>
        </div>
        {options.map((o) => (
          <div key={`${o.id}|${o.finish}`} className={`deck-art-option ${chosen?.id === o.id && chosen.finish === o.finish ? 'chosen' : ''}`}>
            <button className="deck-art-image" onClick={() => pick(o)}>
              <CardPic o={o} size="normal" />
            </button>
            <div className="deck-art-label">{artAndFinish(o)}</div>
          </div>
        ))}
      </div>
      {options.length === 0 && <p className="fineprint">You don't own another {BASIC_NAMES[color]} art yet. Full-art basics come in packs and the Store.</p>}
    </DeckModal>
  );
}
