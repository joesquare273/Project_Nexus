// The Packs tab: choose a Final Fantasy booster, tear it open, flip through
// the cards (the best one waits at the back), see what was new, and browse
// the collection. Opening packs is for collecting only; it never changes the
// decks you play with.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { BoosterCard, Pack, PackKind, Pull } from '@nexus/cards/boosters';
import { addPack, loadCollection, owned, resetCollection, type Collection } from './collection.ts';
import { sound, soundOn, setSoundOn } from './sound.ts';
import './packs.css';

type Boosters = typeof import('@nexus/cards/boosters');

/** Photos of the real packs (packages/client/public/packs). Until they're there, the drawn pack shows. */
const PACK_PHOTOS: Record<PackKind, string> = { play: '/packs/ff-play-booster.png', collector: '/packs/ff-collector-booster.png' };

const PACKS: { kind: PackKind; title: string; blurb: string; art: string; ready: boolean }[] = [
  {
    kind: 'play',
    title: 'Play Booster',
    blurb: '14 cards and a token or art card. One rare or mythic, one foil, and a chance at Through the Ages.',
    art: "Cloud, Planet's Champion",
    ready: true,
  },
  {
    kind: 'collector',
    title: 'Collector Booster',
    blurb: '15 cards and a foil token: 8+ foils, extended art, borderless showcases, Through the Ages and chase Chocobos.',
    art: 'Sephiroth, Fabled SOLDIER // Sephiroth, One-Winged Angel',
    ready: true,
  },
];

/** The Magic card back, from Scryfall's image servers. */
const CARD_BACK = 'https://backs.scryfall.io/large/0/a/0aeebaf5-8c7d-4636-9e82-8c27447861f7.jpg';

type View = { kind: 'shop' } | { kind: 'open'; pack: Pack; fresh: boolean[] } | { kind: 'summary'; pack: Pack; fresh: boolean[] } | { kind: 'collection' };

export function PacksTab() {
  const [mod, setMod] = useState<Boosters | null>(null);
  const [failed, setFailed] = useState(false);
  const [collection, setCollection] = useState<Collection>(loadCollection);
  const [view, setView] = useState<View>({ kind: 'shop' });
  const [odds, setOdds] = useState<PackKind | null>(null);
  const [preview, setPreview] = useState<BoosterCard | null>(null);
  const [muted, setMuted] = useState(!soundOn());

  useEffect(() => {
    import('@nexus/cards/boosters').then(setMod, () => setFailed(true));
    // Load the card back early so the first face-down card never shows an empty side.
    new Image().src = CARD_BACK;
  }, []);

  const open = (kind: PackKind) => {
    if (!mod) return;
    const pack = mod.openPack(kind);
    const { collection: next, fresh } = addPack(collection, pack);
    setCollection(next);
    setView({ kind: 'open', pack, fresh });
  };

  if (failed) return <p className="packs-loading">The pack data couldn't be loaded.</p>;
  if (!mod) return <p className="packs-loading">Shuffling the print sheets…</p>;

  return (
    <div className="packs">
      <div className="packs-bar">
        <button className={view.kind === 'shop' || view.kind === 'open' || view.kind === 'summary' ? 'chosen' : ''} onClick={() => setView({ kind: 'shop' })}>
          Open packs
        </button>
        <button className={view.kind === 'collection' ? 'chosen' : ''} onClick={() => setView({ kind: 'collection' })}>
          Collection
        </button>
        <button
          className="packs-mute"
          aria-pressed={!muted}
          title={muted ? 'Sound off' : 'Sound on'}
          onClick={() => {
            setSoundOn(muted);
            setMuted(!muted);
          }}
        >
          {muted ? 'Sound off' : 'Sound on'}
        </button>
      </div>

      {view.kind === 'shop' && <Shop mod={mod} onOpen={open} onOdds={setOdds} />}
      {view.kind === 'open' && (
        <Opening pack={view.pack} fresh={view.fresh} art={packArt(mod, view.pack.kind)} onDone={() => setView({ kind: 'summary', pack: view.pack, fresh: view.fresh })} />
      )}
      {view.kind === 'summary' && (
        <Summary
          pack={view.pack}
          fresh={view.fresh}
          onPreview={setPreview}
          onAgain={() => open(view.pack.kind)}
          onCollection={() => setView({ kind: 'collection' })}
          onShop={() => setView({ kind: 'shop' })}
        />
      )}
      {view.kind === 'collection' && <Binder mod={mod} collection={collection} onPreview={setPreview} onReset={() => setCollection(resetCollection())} />}

      {odds && <Odds mod={mod} kind={odds} onClose={() => setOdds(null)} />}
      {preview && (
        <div className="packs-preview" aria-hidden="true">
          <img src={preview.images[0]!.large} alt="" />
          {preview.images[1] && <img src={preview.images[1].large} alt="" />}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Choosing a pack
// ---------------------------------------------------------------------------

function Shop({ mod, onOpen, onOdds }: { mod: Boosters; onOpen: (k: PackKind) => void; onOdds: (k: PackKind) => void }) {
  return (
    <div className="pack-shop">
      {PACKS.map((p) => {
        const art = packArt(mod, p.kind);
        return (
          <div key={p.kind} className={`pack-tile ${p.ready ? '' : 'soon'}`}>
            <PackArt kind={p.kind} art={art} />
            <h3>{p.title}</h3>
            <p>{p.blurb}</p>
            <div className="pack-tile-buttons">
              {p.ready ? (
                <>
                  <button className="primary" onClick={() => onOpen(p.kind)}>
                    Open a pack
                  </button>
                  <button onClick={() => onOdds(p.kind)}>Pack odds</button>
                </>
              ) : (
                <span className="tag">Coming next</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The artwork on a pack's front (never a card from inside it). */
function packArt(mod: Boosters, kind: PackKind): BoosterCard | undefined {
  const name = PACKS.find((p) => p.kind === kind)!.art;
  return mod.BOOSTER_CARDS.find((c) => c.name === name && c.set === 'fin');
}

function PackArt({ kind, art, glow = 0, tear = 0 }: { kind: PackKind; art: BoosterCard | undefined; glow?: number; tear?: number }) {
  const [photo, setPhoto] = useState(true);
  if (photo) {
    return (
      <div className={`pack-art pack-photo pack-${kind} glow-${glow}`} style={{ ['--tear' as string]: tear }}>
        <img src={PACK_PHOTOS[kind]} alt={`FINAL FANTASY ${kind === 'play' ? 'Play' : 'Collector'} Booster`} draggable={false} onError={() => setPhoto(false)} />
        <div className="pack-seam" />
      </div>
    );
  }
  return (
    <div className={`pack-art pack-${kind} glow-${glow}`} style={{ ['--tear' as string]: tear }}>
      <div className="pack-crimp top" />
      <div className="pack-window">{art && <img src={art.images[0]!.artCrop} alt="" draggable={false} />}</div>
      <div className="pack-label">
        <span className="pack-brand">FINAL FANTASY</span>
        <span className="pack-kind">{kind === 'play' ? 'Play Booster' : 'Collector Booster'}</span>
      </div>
      <div className="pack-crimp bottom" />
      <div className="pack-seam" />
    </div>
  );
}

function Odds({ mod, kind, onClose }: { mod: Boosters; kind: PackKind; onClose: () => void }) {
  const odds = useMemo(() => mod.packOdds(kind), [mod, kind]);
  return (
    <div className="packs-modal" role="dialog" aria-label="Pack odds" onClick={onClose}>
      <div className="packs-modal-body" onClick={(e) => e.stopPropagation()}>
        <h3>{kind === 'play' ? 'Play Booster' : 'Collector Booster'} odds</h3>
        {odds.map((s, i) => (
          <div key={i} className="odds-slot">
            <div className="odds-slot-name">
              {s.count > 1 ? `${s.count} × ` : ''}
              {s.slot}
            </div>
            <table>
              <tbody>
                {s.outcomes.map((x) => (
                  <tr key={x.label}>
                    <td>{x.label}</td>
                    <td className="odds-cards">{x.cards} cards</td>
                    <td className="odds-pct">{x.percent < 1 ? x.percent.toFixed(2) : x.percent.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <p className="fineprint">
          Odds follow Wizards of the Coast's published Final Fantasy booster odds. Scene Box cards aren't in real boosters; they're added here at small odds.
          {kind === 'collector' && ' At most one of the three Booster Fun rare slots is foil.'}
        </p>
        <button className="primary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tearing it open and revealing the cards
// ---------------------------------------------------------------------------

/** The best cards go to the back, so the reveal builds up to them. */
function revealOrder(pack: Pack): number[] {
  return pack.cards.map((_, i) => i).sort((a, b) => pack.cards[a]!.hype - pack.cards[b]!.hype || a - b);
}

function Opening({ pack, fresh, art, onDone }: { pack: Pack; fresh: boolean[]; art: BoosterCard | undefined; onDone: () => void }) {
  const [torn, setTorn] = useState(false);
  const [tear, setTear] = useState(0);
  const [step, setStep] = useState(0);
  const [faceUp, setFaceUp] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const order = useMemo(() => revealOrder(pack), [pack]);
  const best = Math.max(...pack.cards.map((c) => c.hype));
  const current = pack.cards[order[step]!]!;
  const special = current.hype >= 1;
  const shown = !special || faceUp;

  const rip = () => {
    if (torn) return;
    setTear(1);
    sound('tear');
    window.setTimeout(() => setTorn(true), 380);
  };

  const advance = () => {
    if (!torn) return rip();
    if (leaving) return;
    if (!shown) {
      setFaceUp(true);
      sound(current.hype >= 2 ? 'chime' : 'flip');
      return;
    }
    if (step === order.length - 1) return onDone();
    setLeaving(true);
    sound('flip');
    window.setTimeout(() => {
      setLeaving(false);
      setFaceUp(false);
      setStep((n) => n + 1);
    }, 220);
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault();
        advance();
      } else if (e.key === 'Escape') onDone();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  if (!torn) {
    return (
      <div className={`pack-stage sealed hype-${best}`}>
        <div
          className="pack-tear-zone"
          onPointerDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            drag.current = { x: e.clientX, width: r.width };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const t = Math.max(0, Math.min(1, (e.clientX - drag.current.x) / (drag.current.width * 0.8)));
            setTear(t);
            if (t >= 1) {
              drag.current = null;
              rip();
            }
          }}
          onPointerUp={() => {
            drag.current = null;
            if (tear < 1) setTear(0);
          }}
        >
          <PackArt kind={pack.kind} art={art} glow={best} tear={tear} />
        </div>
        <p className="pack-hint">Drag across the top of the pack to tear it open, or press Space.</p>
        <button onClick={rip}>Tear open</button>
      </div>
    );
  }

  return (
    <div className={`pack-stage reveal hype-${shown ? current.hype : 0}`}>
      <div className="reveal-count">
        {step + 1} / {order.length}
      </div>
      <button className="reveal-pile" onClick={advance} aria-label={shown ? 'Next card' : 'Turn the card over'}>
        {order.slice(step + 1, step + 4).map((i, k) => (
          <div key={i} className="reveal-under" style={{ ['--k' as string]: k + 1 }} />
        ))}
        <div className={`reveal-card ${leaving ? 'leaving' : ''} ${shown ? 'up' : 'down'} rarity-${current.card.rarity}`} key={order[step]}>
          <div className="reveal-face">
            <PullImage pull={current} />
          </div>
          <div className="reveal-back">
            <img src={CARD_BACK} alt="" draggable={false} />
          </div>
        </div>
      </button>
      <div className="reveal-caption" aria-live="polite">
        {shown ? (
          <>
            <strong>{current.card.name.split(' // ')[0]}</strong>
            <span>
              {current.slot}
              {fresh[order[step]!] && <span className="new-badge">NEW</span>}
            </span>
          </>
        ) : (
          <span>Something special… click to turn it over.</span>
        )}
      </div>
      <div className="reveal-buttons">
        <button className="primary" onClick={advance}>
          {!shown ? 'Turn over' : step === order.length - 1 ? 'See the pack' : 'Next card'}
        </button>
        <button onClick={onDone}>Skip</button>
      </div>
    </div>
  );
}

function PullImage({ pull, size = 'normal' }: { pull: Pull; size?: 'small' | 'normal' }) {
  return (
    <div className={`pull-image finish-${pull.finish} ${pull.stamped ? 'stamped' : ''}`}>
      <img src={pull.card.images[0]![size]} alt={pull.card.name} draggable={false} />
      {pull.finish !== 'nonfoil' && <div className="pull-shine" />}
      {pull.stamped && <div className="pull-stamp">✦</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// After the pack
// ---------------------------------------------------------------------------

function Summary({
  pack,
  fresh,
  onPreview,
  onAgain,
  onCollection,
  onShop,
}: {
  pack: Pack;
  fresh: boolean[];
  onPreview: (c: BoosterCard | null) => void;
  onAgain: () => void;
  onCollection: () => void;
  onShop: () => void;
}) {
  const order = revealOrder(pack);
  return (
    <div className="pack-summary">
      <h2>Your {pack.kind === 'play' ? 'Play Booster' : 'Collector Booster'}</h2>
      <div className="summary-grid">
        {order.map((i) => {
          const p = pack.cards[i]!;
          return (
            <div key={i} className={`summary-card hype-${p.hype}`} onMouseEnter={() => onPreview(p.card)} onMouseLeave={() => onPreview(null)}>
              <PullImage pull={p} />
              {fresh[i] && <span className="new-badge">NEW</span>}
              <span className="summary-slot">{p.finish === 'nonfoil' || p.slot.toLowerCase().includes(p.finish) ? p.slot : `${p.slot} (${p.finish})`}</span>
            </div>
          );
        })}
      </div>
      <div className="summary-buttons">
        <button className="primary big" onClick={onAgain}>
          Open another
        </button>
        <button className="big" onClick={onCollection}>
          Collection
        </button>
        <button className="big" onClick={onShop}>
          Back to packs
        </button>
      </div>
    </div>
  );
}

const GROUPS: { name: string; test: (c: BoosterCard) => boolean }[] = [
  { name: 'Main set', test: (c) => c.set === 'fin' && !!c.booster },
  { name: 'Booster Fun', test: (c) => c.set === 'fin' && !c.booster && !c.promoTypes?.includes('starterdeck') },
  { name: 'Through the Ages', test: (c) => c.set === 'fca' },
  {
    name: 'Commander Booster Fun',
    test: (c) => c.set === 'fic' && ((parseInt(c.number, 10) >= 101 && parseInt(c.number, 10) <= 219) || (parseInt(c.number, 10) >= 466 && parseInt(c.number, 10) <= 482)) && !c.promoTypes?.includes('buyabox'),
  },
  { name: 'Scene Box', test: (c) => c.set === 'afic' || (c.set === 'fic' && parseInt(c.number, 10) >= 442 && parseInt(c.number, 10) <= 465) },
  { name: 'Tokens and art cards', test: (c) => c.set === 'tfin' || c.set === 'afin' },
];

function Binder({ mod, collection, onPreview, onReset }: { mod: Boosters; collection: Collection; onPreview: (c: BoosterCard | null) => void; onReset: () => void }) {
  const [group, setGroup] = useState(0);
  const [onlyOwned, setOnlyOwned] = useState(false);
  const cards = useMemo(() => mod.BOOSTER_CARDS.filter(GROUPS[group]!.test), [mod, group]);
  const have = cards.filter((c) => owned(collection, c.id) > 0).length;
  const shown = onlyOwned ? cards.filter((c) => owned(collection, c.id) > 0) : cards;
  const opened = (collection.packsOpened.play ?? 0) + (collection.packsOpened.collector ?? 0);
  return (
    <div className="binder">
      <div className="binder-head">
        <div className="binder-groups">
          {GROUPS.map((g, i) => (
            <button key={g.name} className={i === group ? 'chosen' : ''} onClick={() => setGroup(i)}>
              {g.name}
            </button>
          ))}
        </div>
        <div className="binder-stats">
          <span>
            {have} / {cards.length} collected
          </span>
          <progress value={have} max={cards.length} />
          <label>
            <input type="checkbox" checked={onlyOwned} onChange={(e) => setOnlyOwned(e.target.checked)} /> Only cards I own
          </label>
          <span className="fineprint">{opened} packs opened</span>
          <button
            className="binder-reset"
            onClick={() => {
              if (window.confirm('Clear your whole collection?')) onReset();
            }}
          >
            Reset
          </button>
        </div>
      </div>
      <div className="binder-grid">
        {shown.map((c) => {
          const n = collection.cards[c.id] ?? {};
          const total = owned(collection, c.id);
          return (
            <div key={c.id} className={`binder-card ${total ? 'have' : 'missing'}`} onMouseEnter={() => total && onPreview(c)} onMouseLeave={() => onPreview(null)}>
              <img src={c.images[0]!.small} alt={c.name} loading="lazy" />
              {total > 0 && (
                <span className="binder-count">
                  {total}
                  {(n.foil ?? 0) + (n.surge ?? 0) > 0 ? ' ✦' : ''}
                </span>
              )}
              <span className="binder-number">#{c.number}</span>
            </div>
          );
        })}
        {shown.length === 0 && <p className="fineprint">No cards from this group yet. Open some packs!</p>}
      </div>
    </div>
  );
}
