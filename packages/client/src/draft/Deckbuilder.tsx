// The deckbuilder after a draft: your pool plus unlimited basic lands, at
// least 40 cards, against a 20-minute clock (a warning at 5 minutes). Click a
// card to move it between your pool and your deck. When time runs out, basic
// lands fill the deck to 40 and it's locked in.

import { useEffect, useMemo, useState } from 'react';
import { CARD_DEFS } from '@nexus/cards';
import { manaValue, parseManaCost } from '@nexus/engine';
import type { DraftCard } from '@nexus/cards/draft';
import type { Color, LimitedDeck } from '@nexus/cards/limited';

type Limited = typeof import('@nexus/cards/limited');
type DraftModule = typeof import('@nexus/cards/draft');

const COLOR_FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'W', label: 'White' },
  { key: 'U', label: 'Blue' },
  { key: 'B', label: 'Black' },
  { key: 'R', label: 'Red' },
  { key: 'G', label: 'Green' },
  { key: 'multi', label: 'Multicolor' },
  { key: 'colorless', label: 'Colorless' },
];
const TYPE_FILTERS = ['All', 'Creatures', 'Other spells', 'Lands'] as const;
const LAND_NAMES: Record<Color, string> = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' };

interface Props {
  limited: Limited;
  draft: DraftModule;
  pool: DraftCard[];
  deck: LimitedDeck;
  /** When deckbuilding time is up (epoch milliseconds). */
  endsAt: number;
  onChange: (deck: LimitedDeck) => void;
  onReady: () => void;
}

export function Deckbuilder({ limited, draft, pool, deck, endsAt, onChange, onReady }: Props) {
  const [colorFilter, setColorFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<(typeof TYPE_FILTERS)[number]>('All');
  const [preview, setPreview] = useState<DraftCard | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const left = Math.max(0, endsAt - now);
  const timeUp = left === 0;
  const warning = left <= limited.DECKBUILDING_WARNING_MINUTES * 60_000;

  // Time's up: fill the deck to 40 with basic lands, or trim it to 60 (basic
  // lands first, then the last cards added); the deck is then locked.
  useEffect(() => {
    if (!timeUp) return;
    let over = limited.deckSize(deck) - limited.MAX_DECK_SIZE;
    if (over > 0) {
      const basics = { ...deck.basics };
      for (const c of limited.COLORS) {
        const cut = Math.min(over, basics[c]);
        basics[c] -= cut;
        over -= cut;
      }
      onChange({ cards: over > 0 ? deck.cards.slice(0, deck.cards.length - over) : deck.cards, basics });
      return;
    }
    if (limited.deckSize(deck) >= limited.MIN_DECK_SIZE) return;
    const extra = limited.suggestBasics({ cards: deck.cards, basics: limited.noBasics() }, pool);
    const basics = { ...deck.basics };
    let missing = limited.MIN_DECK_SIZE - limited.deckSize(deck);
    for (const c of limited.COLORS) {
      const add = Math.min(missing, extra[c]);
      basics[c] += add;
      missing -= add;
    }
    basics.W += missing;
    onChange({ cards: deck.cards, basics });
  }, [timeUp, deck, pool, limited, onChange]);

  const defOf = (c: DraftCard) => CARD_DEFS[draft.defIdOf(c.card) ?? ''];
  const mv = (c: DraftCard) => manaValue(parseManaCost(defOf(c)?.manaCost));
  const colorKey = (c: DraftCard) => {
    const ids = draft.cardColors(defOf(c));
    return ids.length === 0 ? 'colorless' : ids.length > 1 ? 'multi' : ids[0]!;
  };
  const typeKey = (c: DraftCard) => {
    const types = defOf(c)?.types ?? [];
    return types.includes('land') ? 'Lands' : types.includes('creature') ? 'Creatures' : 'Other spells';
  };

  const inDeck = useMemo(() => new Set(deck.cards), [deck.cards]);
  const sorted = useMemo(() => [...pool].sort((a, b) => mv(a) - mv(b) || a.card.name.localeCompare(b.card.name)), [pool]);
  const shown = sorted.filter(
    (c) => !inDeck.has(c.uid) && (colorFilter === 'all' || colorKey(c) === colorFilter) && (typeFilter === 'All' || typeKey(c) === typeFilter),
  );
  const deckCards = sorted.filter((c) => inDeck.has(c.uid));
  const size = limited.deckSize(deck);
  const problem = limited.deckProblem(deck, pool);
  const basicsCount = limited.COLORS.reduce((n, c) => n + deck.basics[c], 0);
  const lands = deckCards.filter((c) => typeKey(c) === 'Lands').length + basicsCount;
  const creatures = deckCards.filter((c) => typeKey(c) === 'Creatures').length;
  const unplayable = deckCards.filter((c) => {
    const d = defOf(c);
    return d?.uncastable || (d?.notBuilt && !d.types.includes('creature') && !d.types.includes('land'));
  }).length;
  const curve = [0, 1, 2, 3, 4, 5, 6].map((n) => deckCards.filter((c) => typeKey(c) !== 'Lands' && (n === 6 ? mv(c) >= 6 : mv(c) === n)).length);
  const pips = limited.colorPips(deck, pool);

  const add = (uid: string) => !timeUp && onChange({ ...deck, cards: [...deck.cards, uid] });
  const remove = (uid: string) => !timeUp && onChange({ ...deck, cards: deck.cards.filter((x) => x !== uid) });
  const setBasic = (c: Color, n: number) => !timeUp && onChange({ ...deck, basics: { ...deck.basics, [c]: Math.max(0, n) } });

  const minutes = Math.floor(left / 60_000);
  const seconds = Math.floor((left % 60_000) / 1000);
  const columns = [
    { label: '0-1', test: (c: DraftCard) => typeKey(c) !== 'Lands' && mv(c) <= 1 },
    ...[2, 3, 4, 5].map((n) => ({ label: String(n), test: (c: DraftCard) => typeKey(c) !== 'Lands' && mv(c) === n })),
    { label: '6+', test: (c: DraftCard) => typeKey(c) !== 'Lands' && mv(c) >= 6 },
    { label: 'Lands', test: (c: DraftCard) => typeKey(c) === 'Lands' },
  ];

  return (
    <div className="builder">
      <div className="builder-head">
        <div className={`builder-timer ${warning ? 'warning' : ''}`} role="timer" aria-live="polite">
          {timeUp ? "Time's up: your deck is locked in" : `${minutes}:${String(seconds).padStart(2, '0')} left`}
          {warning && !timeUp && <span> · 5-minute warning</span>}
        </div>
        <div className="builder-count">
          <strong>
            {size} / {limited.MIN_DECK_SIZE}–{limited.MAX_DECK_SIZE}
          </strong>{' '}
          cards · {creatures} creatures · {lands} lands
        </div>
        <div className="builder-buttons">
          <button disabled={timeUp} onClick={() => onChange({ ...deck, basics: limited.suggestBasics(deck, pool) })}>
            Suggest lands
          </button>
          <button disabled={timeUp} onClick={() => onChange(limited.aiDeck(pool))}>
            Auto-build
          </button>
          <button disabled={timeUp} onClick={() => onChange({ cards: [], basics: limited.noBasics() })}>
            Clear
          </button>
          <button className="primary" disabled={!!problem} title={problem ?? ''} onClick={onReady}>
            Ready
          </button>
        </div>
      </div>
      {problem && <p className="fineprint builder-problem">{problem}</p>}
      {unplayable > 0 && (
        <p className="fineprint builder-problem">
          {unplayable} {unplayable === 1 ? 'card' : 'cards'} in your deck can't be cast yet (not built in the engine).
        </p>
      )}

      <div className="builder-stats">
        <div className="builder-curve" aria-label="Mana curve">
          {curve.map((n, i) => (
            <div key={i} className="curve-bar">
              <div className="curve-fill" style={{ height: `${Math.min(100, n * 12)}%` }} />
              <span>{n}</span>
              <small>{i === 6 ? '6+' : i}</small>
            </div>
          ))}
        </div>
        <div className="builder-basics">
          {limited.COLORS.map((c) => (
            <div key={c} className="basic-row">
              <span className={`pip pip-${c}`}>{LAND_NAMES[c]}</span>
              <button aria-label={`One fewer ${LAND_NAMES[c]}`} disabled={timeUp || deck.basics[c] === 0} onClick={() => setBasic(c, deck.basics[c] - 1)}>
                −
              </button>
              <strong>{deck.basics[c]}</strong>
              <button aria-label={`One more ${LAND_NAMES[c]}`} disabled={timeUp} onClick={() => setBasic(c, deck.basics[c] + 1)}>
                +
              </button>
              <small>{pips[c] ? `${pips[c]} symbols` : ''}</small>
            </div>
          ))}
        </div>
      </div>

      <h3 className="builder-title">Your deck</h3>
      <div className="builder-columns">
        {columns.map((col) => (
          <div key={col.label} className="builder-column">
            <div className="builder-column-label">{col.label}</div>
            {deckCards.filter(col.test).map((c) => (
              <button
                key={c.uid}
                className="builder-card"
                disabled={timeUp}
                onClick={() => remove(c.uid)}
                onMouseEnter={() => setPreview(c)}
                onMouseLeave={() => setPreview(null)}
                aria-label={`Remove ${c.card.name} from the deck`}
              >
                <img src={c.card.images[0]!.small} alt={c.card.name} loading="lazy" />
              </button>
            ))}
          </div>
        ))}
      </div>

      <h3 className="builder-title">Your pool ({shown.length} shown)</h3>
      <div className="builder-filters">
        {COLOR_FILTERS.map((f) => (
          <button key={f.key} className={colorFilter === f.key ? 'chosen' : ''} onClick={() => setColorFilter(f.key)}>
            {f.label}
          </button>
        ))}
        <span className="builder-filter-gap" />
        {TYPE_FILTERS.map((f) => (
          <button key={f} className={typeFilter === f ? 'chosen' : ''} onClick={() => setTypeFilter(f)}>
            {f}
          </button>
        ))}
      </div>
      <div className="builder-pool">
        {shown.map((c) => (
          <button
            key={c.uid}
            className="builder-card"
            disabled={timeUp}
            onClick={() => add(c.uid)}
            onMouseEnter={() => setPreview(c)}
            onMouseLeave={() => setPreview(null)}
            aria-label={`Add ${c.card.name} to the deck`}
          >
            <img src={c.card.images[0]!.small} alt={c.card.name} loading="lazy" />
          </button>
        ))}
      </div>
      {preview && (
        <div className="packs-preview" aria-hidden="true">
          <img src={preview.card.images[0]!.large} alt="" />
        </div>
      )}
    </div>
  );
}
