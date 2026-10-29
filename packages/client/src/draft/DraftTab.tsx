// The Draft tab: a booster draft against AI drafters. Everyone opens a Final
// Fantasy Play Booster and chooses a card, then confirms it to lock it in;
// once everyone has, the packs rotate clockwise. Six packs each. You see only
// the pack in front of you and your own picks.

import { useEffect, useMemo, useState } from 'react';
import { CARD_DEFS } from '@nexus/cards';
import type { DraftCard, DraftState } from '@nexus/cards/draft';
import '../packs/packs.css';
import './draft.css';

type DraftModule = typeof import('@nexus/cards/draft');

const YOU = 'You';
const POOL_KEY = 'nexus.draft.pool.v1';
const COLOR_GROUPS: { key: string; label: string }[] = [
  { key: 'W', label: 'White' },
  { key: 'U', label: 'Blue' },
  { key: 'B', label: 'Black' },
  { key: 'R', label: 'Red' },
  { key: 'G', label: 'Green' },
  { key: 'multi', label: 'Multicolor' },
  { key: 'colorless', label: 'Colorless' },
  { key: 'land', label: 'Lands' },
];

export function DraftTab() {
  const [mod, setMod] = useState<DraftModule | null>(null);
  const [failed, setFailed] = useState(false);
  const [ais, setAis] = useState(3);
  const [state, setState] = useState<DraftState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<DraftCard | null>(null);

  useEffect(() => {
    import('@nexus/cards/draft').then(setMod, () => setFailed(true));
  }, []);

  if (failed) return <p className="packs-loading">The draft couldn't be loaded.</p>;
  if (!mod) return <p className="packs-loading">Sorting the print sheets…</p>;

  const start = () => {
    const seats = [YOU, ...Array.from({ length: ais }, (_, i) => `AI ${i + 1}`)];
    // The AI drafters lock in straight away; the packs pass when you confirm.
    setState(aisLockIn(mod, mod.createDraft(seats, Math.floor(Math.random() * 2 ** 31))));
    setSelected(null);
  };

  if (!state) {
    return (
      <div className="draft-setup">
        <p>
          Everyone opens a Final Fantasy Play Booster, picks one card, and passes the rest clockwise until the packs are empty. Six packs each:
          84 cards. You see only the pack in front of you and your own picks.
        </p>
        <h2>Players</h2>
        <div className="format-choices">
          {[1, 2, 3].map((n) => (
            <button key={n} className={ais === n ? 'chosen' : ''} onClick={() => setAis(n)}>
              You + {n} AI {n === 1 ? 'drafter' : 'drafters'}
            </button>
          ))}
        </div>
        <button className="primary big" onClick={start}>
          Start the draft
        </button>
      </div>
    );
  }

  const view = mod.draftView(state, YOU);
  /** Locks in your choice: the packs rotate (the AI drafters have locked in), and the AI drafters choose from their new packs. */
  const confirm = () => {
    if (!selected) return;
    setState(aisLockIn(mod, mod.lockPick(state, YOU, selected)));
    setSelected(null);
    setPreview(null);
  };

  if (view.done) return <DraftDone picks={view.picks} onAgain={() => setState(null)} />;

  return (
    <div className="draft">
      <div className="draft-head">
        <strong>
          Pack {view.round + 1} of {mod.PACKS_PER_PLAYER} · Pick {view.pickInRound + 1} of {state.packSize}
        </strong>
        <div className="draft-seats">
          {view.seats.map((s) => (
            <span key={s.seat} className={s.seat === YOU ? 'you' : ''}>
              {s.seat}: {s.picks} picked{s.locked ? ' · locked in' : ''}
            </span>
          ))}
        </div>
      </div>
      <div className="draft-body">
        <div className="draft-pack">
          {view.pack ? (
            <>
              <div className="draft-grid">
                {view.pack.map((c) => (
                  <button
                    key={c.uid}
                    className={`draft-card ${selected === c.uid ? 'selected' : ''}`}
                    aria-pressed={selected === c.uid}
                    onClick={() => setSelected(c.uid)}
                    onMouseEnter={() => setPreview(c)}
                    onMouseLeave={() => setPreview(null)}
                  >
                    <div className={`pull-image finish-${c.finish}`}>
                      <img src={c.card.images[0]!.normal} alt={c.card.name} draggable={false} />
                      {c.finish !== 'nonfoil' && <div className="pull-shine" />}
                    </div>
                    <BuildBadge card={c} mod={mod} />
                  </button>
                ))}
              </div>
              <div className="draft-actions">
                <button className="primary" disabled={!selected} onClick={confirm}>
                  Confirm pick
                </button>
                <span className="fineprint">
                  {selected ? 'Confirm to lock it in. The packs pass once everyone has.' : 'Choose a card; you can change your mind until you confirm.'}
                </span>
              </div>
            </>
          ) : (
            <p className="draft-waiting">Waiting for the other players…</p>
          )}
        </div>
        <PicksPanel picks={view.picks} mod={mod} onPreview={setPreview} />
      </div>
      {preview && (
        <div className="packs-preview" aria-hidden="true">
          <img src={preview.card.images[0]!.large} alt="" />
          {preview.card.images[1] && <img src={preview.card.images[1].large} alt="" />}
        </div>
      )}
    </div>
  );
}

/** The AI drafters lock in their choices at once (for the pick that has just started). */
function aisLockIn(mod: DraftModule, s: DraftState): DraftState {
  for (const seat of s.seats) if (seat !== YOU && s.packs[seat] && !s.locked[seat]) s = mod.lockPick(s, seat, mod.aiPick(s, seat));
  return s;
}

/** Whether the engine can play this card yet: drafting decisions depend on it. */
function BuildBadge({ card, mod }: { card: DraftCard; mod: DraftModule }) {
  const def = CARD_DEFS[mod.defIdOf(card.card) ?? ''];
  if (!def || !def.notBuilt) return null;
  const body = def.types.includes('creature') && !def.uncastable;
  return <span className={`build-badge ${body ? 'body' : 'blocked'}`}>{body ? 'Plays as body only' : "Can't be cast yet"}</span>;
}

function groupOf(mod: DraftModule, c: DraftCard): string {
  const def = CARD_DEFS[mod.defIdOf(c.card) ?? ''];
  if (!def) return 'colorless';
  if (def.types.includes('land')) return 'land';
  const colors = def.colorIdentity ?? [];
  return colors.length === 0 ? 'colorless' : colors.length > 1 ? 'multi' : colors[0]!;
}

function PicksPanel({ picks, mod, onPreview }: { picks: DraftCard[]; mod: DraftModule; onPreview: (c: DraftCard | null) => void }) {
  const groups = useMemo(() => {
    const g: Record<string, DraftCard[]> = {};
    for (const c of picks) (g[groupOf(mod, c)] ??= []).push(c);
    return g;
  }, [picks, mod]);
  return (
    <aside className="draft-picks">
      <h3>Your picks ({picks.length})</h3>
      {COLOR_GROUPS.filter((g) => groups[g.key]?.length).map((g) => (
        <div key={g.key} className="draft-group">
          <div className="draft-group-name">
            {g.label} · {groups[g.key]!.length}
          </div>
          <ul>
            {groups[g.key]!.map((c) => (
              <li key={c.uid} onMouseEnter={() => onPreview(c)} onMouseLeave={() => onPreview(null)}>
                {c.card.name.split(' // ')[0]}
                {c.finish !== 'nonfoil' && <span className="foil-mark"> ✦</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </aside>
  );
}

function DraftDone({ picks, onAgain }: { picks: DraftCard[]; onAgain: () => void }) {
  // Kept for the deckbuilder (the next step).
  useEffect(() => {
    try {
      localStorage.setItem(POOL_KEY, JSON.stringify(picks));
    } catch {
      // Not saved; the pool is still shown below.
    }
  }, [picks]);
  return (
    <div className="draft-done">
      <h2>Draft complete: {picks.length} cards</h2>
      <p className="fineprint">The deckbuilder comes next; your pool is saved in this browser for it.</p>
      <div className="summary-grid">
        {picks.map((c) => (
          <div key={c.uid} className="summary-card">
            <div className={`pull-image finish-${c.finish}`}>
              <img src={c.card.images[0]!.small} alt={c.card.name} loading="lazy" />
              {c.finish !== 'nonfoil' && <div className="pull-shine" />}
            </div>
          </div>
        ))}
      </div>
      <button className="primary big" onClick={onAgain}>
        Draft again
      </button>
    </div>
  );
}
