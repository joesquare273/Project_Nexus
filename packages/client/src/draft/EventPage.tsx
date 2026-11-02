// Online draft events (docs/sealed.md, S3): host one (choose the set, and how
// many seats are for players and how many for bots) or join one with its
// code. Then the draft on the server (30 seconds a pick: choose a card, then
// confirm it), 20 minutes of deckbuilding, Swiss rounds of best-of-3 matches
// (the loser of a game chooses play or draw), and the standings. Your
// drafted cards go to your collection. The server runs everything; this page
// shows your view of it and sends your choices.

import { useEffect, useMemo, useReducer, useState } from 'react';
import type { DraftCard } from '@nexus/cards/draft';
import { DRAFT_SETS, type DraftSetCode } from '@nexus/cards/draftSets';
import type { LimitedDeck } from '@nexus/cards/limited';
import type { EventView } from '@nexus/server/protocol';
import type { GameSession } from '../game/session.ts';
import { SeatPicker } from '../components/TableMenu.tsx';
import { Deckbuilder } from './Deckbuilder.tsx';
import { BuildBadge, PicksPanel } from './DraftTab.tsx';
import { eventLink, rememberedEvent } from './eventLink.ts';
import '../packs/packs.css';
import './draft.css';

type DraftModule = typeof import('@nexus/cards/draft');
type Limited = typeof import('@nexus/cards/limited');

function useEventLink() {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => eventLink.subscribe(rerender), []);
  return eventLink;
}

/** Ticks every quarter second while a clock is shown. */
function useNow(on: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!on) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [on]);
  return now;
}

export function EventPage({ onPlay }: { onPlay: (session: GameSession) => void }) {
  const link = useEventLink();
  const [mods, setMods] = useState<{ draft: DraftModule; limited: Limited } | null>(null);
  useEffect(() => {
    void Promise.all([import('@nexus/cards/draft'), import('@nexus/cards/limited')]).then(([draft, limited]) => setMods({ draft, limited }));
  }, []);

  // A game of yours is waiting: go to the board.
  const pending = link.pendingGame;
  useEffect(() => {
    if (!pending) return;
    const session = link.takeGame();
    if (session) onPlay(session);
  }, [pending, link, onPlay]);

  const v = link.view;
  if (!v) return <EventForm connecting={link.connecting} error={link.error} />;
  if (!mods) return <p className="packs-loading">Sorting the print sheets…</p>;
  return (
    <div className="event-page">
      <EventHeader v={v} />
      {v.phase === 'lobby' && <Lobby v={v} />}
      {v.phase === 'drafting' && <Drafting v={v} mod={mods.draft} />}
      {v.phase === 'building' && <Building v={v} mods={mods} />}
      {(v.phase === 'playing' || v.phase === 'finished') && <Matches v={v} />}
      {link.error && <p className="online-error">{link.error}</p>}
    </div>
  );
}

function EventForm({ connecting, error }: { connecting: boolean; error: string | null }) {
  const [mode, setMode] = useState<'host' | 'join'>(() => (rememberedEvent() ? 'join' : 'host'));
  const [set, setSet] = useState<DraftSetCode | null>(DRAFT_SETS.length === 1 ? DRAFT_SETS[0].code : null);
  const [players, setPlayers] = useState(1);
  const [bots, setBots] = useState(3);
  const [code, setCode] = useState(() => rememberedEvent() ?? '');
  if (connecting) return <p className="packs-loading">Connecting to the event…</p>;
  const canJoin = /^[A-Za-z0-9]{3,12}$/.test(code.trim());
  return (
    <div className="table-menu">
      <div className="format-choices">
        <button className={mode === 'host' ? 'chosen' : ''} onClick={() => setMode('host')}>
          Host a draft <span>Choose the set and the seats</span>
        </button>
        <button className={mode === 'join' ? 'chosen' : ''} onClick={() => setMode('join')}>
          Join a draft <span>Enter the code from your host</span>
        </button>
      </div>
      {mode === 'host' ? (
        <>
          <h2>Set</h2>
          <div className="set-choices">
            {DRAFT_SETS.map((s) => (
              <button key={s.code} className={`set-choice ${set === s.code ? 'chosen' : ''}`} aria-pressed={set === s.code} onClick={() => setSet(s.code)}>
                <img src={s.icon} alt="" />
                <strong>{s.name}</strong>
                <span>{s.booster}s · six each</span>
              </button>
            ))}
          </div>
          <p className="fineprint">More sets appear here as their cards are imported. The set can decide the event's prizes.</p>
          <h2>Seats</h2>
          <SeatPicker players={players} bots={bots} onChange={(p, b) => (setPlayers(p), setBots(b))} />
          {error && <p className="online-error">{error}</p>}
          <button className="primary big" disabled={!set} title={set ? undefined : 'Choose a set first'} onClick={() => set && void eventLink.open((token) => ({ type: 'eventCreate', token, players, bots, set }))}>
            Host draft
          </button>
        </>
      ) : (
        <>
          <label className="table-code-input">
            Event code
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12} placeholder="for example DK7Q2MX" />
          </label>
          {error && <p className="online-error">{error}</p>}
          <button className="primary big" disabled={!canJoin} onClick={() => void eventLink.open((token) => ({ type: 'eventJoin', token, code: code.trim() }))}>
            Join draft
          </button>
        </>
      )}
      <p className="fineprint">
        Everyone opens six Play Boosters and picks one card at a time (30 seconds a pick), passing the rest clockwise. Then 20 minutes to build a 40-card
        deck and best-of-3 Swiss matches. You keep every card you draft.
      </p>
    </div>
  );
}

const PHASE_LABEL: Record<EventView['phase'], string> = { lobby: 'Waiting room', drafting: 'Drafting', building: 'Deckbuilding', playing: 'Matches', finished: 'Finished' };

function EventHeader({ v }: { v: EventView }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="table-code">
      <span>Event code</span>
      <strong>{v.code}</strong>
      <button className="ghost" onClick={() => void navigator.clipboard?.writeText(v.code).then(() => setCopied(true))}>
        {copied ? 'Copied' : 'Copy'}
      </button>
      <span className="event-meta">
        {v.set.name} · {v.size} seats · {PHASE_LABEL[v.phase]}
        {v.poolSaved && ' · your picks are in your collection'}
      </span>
      <button className="ghost event-leave" onClick={() => eventLink.leave()}>
        {v.phase === 'lobby' ? (v.you === v.host ? 'Close event' : 'Leave') : 'Leave page'}
      </button>
    </div>
  );
}

const nameOf = (v: EventView, seat: string | null) => (seat ? (v.seats.find((s) => s.id === seat)?.name ?? seat) : 'Bye');

function Lobby({ v }: { v: EventView }) {
  const isHost = v.you === v.host;
  const humans = v.seats.filter((s) => !s.bot);
  const open = v.players - humans.length;
  return (
    <>
      <ul className="table-seats">
        {humans.map((s) => (
          <li key={s.id} className={`table-seat ${s.id === v.you ? 'you' : ''}`}>
            <span className="table-seat-name">
              <strong>{s.name}</strong>
              {s.id === v.host && <em className="seat-badge">Host</em>}
              {s.id === v.you && <em className="seat-badge">You</em>}
              {!s.connected && <em className="seat-badge away">Away</em>}
            </span>
          </li>
        ))}
        {Array.from({ length: open }, (_, i) => (
          <li key={`o${i}`} className="table-seat open">
            <span className="table-seat-name">
              <strong>Open seat</strong>
            </span>
            <span className="table-seat-deck">Waiting for a player</span>
          </li>
        ))}
        {Array.from({ length: v.bots }, (_, i) => (
          <li key={`b${i}`} className="table-seat bot">
            <span className="table-seat-name">
              <strong>🤖 Bot</strong>
            </span>
            <span className="table-seat-deck">Drafts and builds on its own</span>
          </li>
        ))}
      </ul>
      {isHost ? (
        <>
          <h2>Set</h2>
          <div className="set-choices">
            {DRAFT_SETS.map((s) => (
              <button key={s.code} className={`set-choice ${v.set.code === s.code ? 'chosen' : ''}`} onClick={() => eventLink.send({ type: 'eventSettings', players: v.players, bots: v.bots, set: s.code })}>
                <img src={s.icon} alt="" />
                <strong>{s.name}</strong>
              </button>
            ))}
          </div>
          <h2>Seats</h2>
          <SeatPicker players={v.players} bots={v.bots} min={humans.length} onChange={(p, b) => eventLink.send({ type: 'eventSettings', players: p, bots: b })} />
          <button className="primary big" disabled={open > 0} onClick={() => eventLink.send({ type: 'eventStart' })}>
            {open > 0 ? `Waiting for ${open} more player${open === 1 ? '' : 's'}` : 'Start the draft'}
          </button>
        </>
      ) : (
        <p className="waiting">{open > 0 ? `Waiting for ${open} more player${open === 1 ? '' : 's'}…` : 'Waiting for the host to start the draft…'}</p>
      )}
    </>
  );
}

function Drafting({ v, mod }: { v: EventView; mod: DraftModule }) {
  const [preview, setPreview] = useState<DraftCard | null>(null);
  const d = v.draft!;
  const now = useNow(v.pickEndsAt !== null);
  const left = v.pickEndsAt === null ? null : Math.max(0, Math.ceil((v.pickEndsAt - (now - eventLink.offset)) / 1000));
  const choose = d.locked ?? v.selected;
  return (
    <div className="draft">
      <div className="draft-head">
        <strong>
          Pack {d.round + 1} of {mod.PACKS_PER_PLAYER} · Pick {d.pickInRound + 1}
        </strong>
        {d.pack && !d.locked && left !== null && <span className={`pick-clock ${left <= 10 ? 'low' : ''}`}>{left}s</span>}
        <div className="draft-seats">
          {d.seats.map((s) => (
            <span key={s.seat} className={s.seat === v.you ? 'you' : ''}>
              {nameOf(v, s.seat)}: {s.picks}
              {s.locked ? ' ✓' : ''}
            </span>
          ))}
        </div>
      </div>
      <div className="draft-body">
        <div className="draft-pack">
          {d.pack && !d.locked ? (
            <>
              <div className="draft-grid">
                {d.pack.map((c) => (
                  <button
                    key={c.uid}
                    className={`draft-card ${choose === c.uid ? 'selected' : ''}`}
                    aria-pressed={choose === c.uid}
                    onClick={() => eventLink.send({ type: 'eventSelect', uid: c.uid })}
                    onDoubleClick={() => eventLink.send({ type: 'eventPick', uid: c.uid })}
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
                <button className="primary" disabled={!v.selected} onClick={() => v.selected && eventLink.send({ type: 'eventPick', uid: v.selected })}>
                  Confirm pick
                </button>
                <span className="fineprint">
                  {v.selected ? 'Confirm to lock it in. If time runs out, you get this card.' : 'Choose a card (double-click to confirm at once). If time runs out with nothing chosen, one is picked for you.'}
                </span>
              </div>
            </>
          ) : (
            <p className="draft-waiting">{d.locked ? 'Locked in. Waiting for the other players…' : 'Waiting for the next pack…'}</p>
          )}
        </div>
        <PicksPanel picks={d.picks} mod={mod} onPreview={setPreview} />
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

function Building({ v, mods }: { v: EventView; mods: { draft: DraftModule; limited: Limited } }) {
  const pool = v.draft?.picks ?? [];
  const [deck, setDeck] = useState<LimitedDeck>(() => v.deck ?? { cards: [], basics: mods.limited.noBasics() });
  const me = v.seats.find((s) => s.id === v.you);
  const change = (next: LimitedDeck) => {
    setDeck(next);
    eventLink.send({ type: 'eventDeck', deck: next });
  };
  if (me?.ready) {
    const waiting = v.seats.filter((s) => !s.ready);
    return (
      <div className="draft-setup">
        <h2>Your deck is in</h2>
        <p>
          {mods.limited.deckSize(deck)} cards. {waiting.length ? `Waiting for ${waiting.map((s) => s.name).join(', ')}.` : 'Pairing round 1…'}
        </p>
        <button onClick={() => eventLink.send({ type: 'eventReady', ready: false })}>Back to deckbuilding</button>
      </div>
    );
  }
  return (
    <Deckbuilder
      limited={mods.limited}
      draft={mods.draft}
      pool={pool}
      deck={deck}
      endsAt={(v.buildEndsAt ?? 0) + eventLink.offset}
      onChange={change}
      onReady={() => {
        eventLink.send({ type: 'eventDeck', deck });
        eventLink.send({ type: 'eventReady', ready: true });
      }}
    />
  );
}

function Matches({ v }: { v: EventView }) {
  const mine = v.matches.find((m) => m.round === v.round && (m.a === v.you || m.b === v.you));
  const rounds = useMemo(() => [...new Set(v.matches.map((m) => m.round))].sort((a, b) => b - a), [v.matches]);
  const wins = (m: EventView['matches'][number], seat: string) => m.games.filter((g) => g.winner === seat).length;
  return (
    <div className="event-matches">
      {v.phase === 'playing' && mine && (
        <section className="your-match">
          <h2>
            Round {v.round} of {v.rounds}: you vs {nameOf(v, mine.a === v.you ? mine.b : mine.a)}
          </h2>
          {!mine.b ? (
            <p>You have a bye this round (it counts as a match win).</p>
          ) : mine.done ? (
            <p>Match over: {wins(mine, v.you)}-{wins(mine, mine.a === v.you ? mine.b : mine.a)}. Waiting for the round to finish…</p>
          ) : mine.chooser === v.you ? (
            <>
              <p>You lost the last game, so you choose: play first or draw first in game {mine.games.length + 1}?</p>
              <div className="format-choices">
                <button className="primary" onClick={() => eventLink.send({ type: 'eventPlayDraw', play: true })}>
                  Play first
                </button>
                <button onClick={() => eventLink.send({ type: 'eventPlayDraw', play: false })}>Draw first</button>
              </div>
            </>
          ) : mine.live ? (
            <p>Game {mine.games.length + 1} is on. It opens on the board automatically.</p>
          ) : (
            <p>Waiting for {nameOf(v, mine.chooser)} to choose play or draw…</p>
          )}
        </section>
      )}
      {v.phase === 'finished' && <h2>The event is over</h2>}
      <section>
        <h3>Standings</h3>
        <table className="standings">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Points</th>
              <th>Matches</th>
            </tr>
          </thead>
          <tbody>
            {v.standings.map((s, i) => (
              <tr key={s.player} className={s.player === v.you ? 'you' : ''}>
                <td>{i + 1}</td>
                <td>{nameOf(v, s.player)}</td>
                <td>{s.points}</td>
                <td>
                  {s.wins}-{s.losses}
                  {s.draws ? `-${s.draws}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {rounds.map((r) => (
        <section key={r}>
          <h3>Round {r}</h3>
          <ul className="match-list">
            {v.matches
              .filter((m) => m.round === r)
              .map((m) => (
                <li key={m.id} className={m.a === v.you || m.b === v.you ? 'you' : ''}>
                  {nameOf(v, m.a)} {m.b ? `${wins(m, m.a)}-${wins(m, m.b)}` : ''} {m.b ? nameOf(v, m.b) : '(bye)'}
                  <span className="fineprint">{m.done ? ' · done' : m.live ? ` · game ${m.games.length + 1} on` : ''}</span>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
