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
import { GameLoading, LoadingScreen } from '../components/LoadingScreen.tsx';
import { avatarText } from '../components/Zones.tsx';
import { showShards } from '../account/AccountBar.tsx';
import { preloadImages } from '../game/precheck.ts';
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

  // A game of yours is waiting: check and load it, then go to the board.
  const pending = link.pendingGame;
  const [loading, setLoading] = useState<{ session: GameSession; match: string | undefined; game: number } | null>(null);
  useEffect(() => {
    if (!pending || loading) return;
    const session = link.takeGame();
    if (session) setLoading({ session, match: pending.match, game: pending.game ?? 1 });
  }, [pending, link, loading]);

  // Your balance after paying the entry or winning a prize.
  const balance = link.view?.balance ?? null;
  useEffect(() => {
    if (balance !== null) showShards(balance);
  }, [balance]);

  const v = link.view;
  if (loading && v) {
    const m = v.matches.find((x) => x.id === loading.match);
    const them = m ? otherSeat(m, v.you) : null;
    const movedUp = m?.stage === 'final' ? 'You moved up to the Final: playing for 1st place.' : m?.stage === 'third' ? 'Playing for 3rd place.' : null;
    return (
      <GameLoading
        session={loading.session}
        title={`${m ? STAGE_NAME[m.stage] : 'Draft'} · game ${loading.game}`}
        subtitle={
          <>
            {movedUp && <p className="moved-up">{movedUp}</p>}
            <p>You vs {nameOf(v, them)}</p>
          </>
        }
        minMs={movedUp && loading.game === 1 ? 3000 : 1500}
        onReady={() => {
          setLoading(null);
          onPlay(loading.session);
        }}
      />
    );
  }
  if (!v) {
    if (link.connecting) return <LoadingScreen title="Joining the draft" steps={[{ label: 'Connecting to the game server', state: 'working' }, { label: 'Checking your sign-in and entry', state: 'waiting' }]} />;
    return <EventForm connecting={false} error={link.error} />;
  }
  if (!mods) return <LoadingScreen title={`${v.set.name} draft`} steps={[{ label: 'Loading the print sheets and card data', state: 'working' }]} />;
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
          <p className="fineprint">More sets appear here as their cards are imported.</p>
          <h2>Seats</h2>
          <SeatPicker players={players} bots={bots} fixedTotal={4} onChange={(p, b) => (setPlayers(p), setBots(b))} />
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
        Four seats, players and bots. Everyone opens six Play Boosters and picks one card at a time (30 seconds a pick), passing the rest clockwise. Then 20
        minutes to build a 40-card deck, and a best-of-3 tournament: the semifinal winners play the final, the losers play for 3rd. Entry 600 Aether Shards,
        paid when the draft starts. Prizes: 1st 1,000 · 2nd 800 · 3rd 600 · 4th 400. You keep every card you draft.
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
              <Avatar v={v} seat={s.id} />
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
          <SeatPicker players={v.players} bots={v.bots} min={humans.length} fixedTotal={4} onChange={(p, b) => eventLink.send({ type: 'eventSettings', players: p, bots: b })} />
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
  // The first pack: a loading screen while its card images load (the others load as they come).
  const first = d.round === 0 && d.pickInRound === 0 && !!d.pack;
  const [opened, setOpened] = useState(!first);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (opened || !d.pack) return;
    void preloadImages(d.pack.map((c) => c.card.images[0]!.normal), (l, t) => setProgress(l / t), 8000).then(() => setOpened(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const now = useNow(v.pickEndsAt !== null);
  const left = v.pickEndsAt === null ? null : Math.max(0, Math.ceil((v.pickEndsAt - (now - eventLink.offset)) / 1000));
  const choose = d.locked ?? v.selected;
  if (!opened) {
    return (
      <LoadingScreen
        title={`Opening ${v.set.name} boosters`}
        subtitle={<p>{v.seats.map((s) => s.name).join(' · ')}</p>}
        steps={[
          { label: 'Six Play Boosters for each seat', state: 'done' },
          { label: 'Card images for your first pack', state: 'working', detail: `${Math.round(progress * 100)}%` },
        ]}
        progress={progress}
      />
    );
  }
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

type MatchView = EventView['matches'][number];
const STAGE_NAME: Record<MatchView['stage'], string> = { semifinal: 'Semifinal', final: 'Final', third: 'Match for 3rd place' };
const PLACE = ['1st', '2nd', '3rd', '4th'];
const winsOf = (m: MatchView, seat: string) => m.games.filter((g) => g.winner === seat).length;
const otherSeat = (m: MatchView, seat: string) => (m.a === seat ? m.b : m.a);

function Matches({ v }: { v: EventView }) {
  const mine = v.matches.find((m) => m.round === v.round && (m.a === v.you || m.b === v.you));
  const others = v.matches.filter((m) => m.round === v.round && m !== mine);
  return (
    <div className="event-matches">
      {v.phase === 'finished' ? <Results v={v} /> : mine && <YourMatch v={v} m={mine} others={others} />}
      <Bracket v={v} />
      <p className="fineprint">
        Entry {v.entry} Aether Shards. Prizes: {v.prizes.map((p, i) => `${PLACE[i]} ${p}`).join(' · ')}. Everyone keeps the cards they drafted.
      </p>
    </div>
  );
}

function YourMatch({ v, m, others }: { v: EventView; m: MatchView; others: MatchView[] }) {
  const them = otherSeat(m, v.you);
  const waitingOn = others.filter((o) => !o.done);
  return (
    <section className="your-match">
      <h2>
        {STAGE_NAME[m.stage]}: you vs {nameOf(v, them)}
      </h2>
      {m.done ? (
        <>
          <p className={m.winner === v.you ? 'moved-up' : ''}>
            {m.winner === v.you ? 'You won' : 'You lost'} {winsOf(m, v.you)}-{winsOf(m, them!)}.{' '}
            {m.stage === 'semifinal' ? (m.winner === v.you ? 'You move up to the Final!' : 'You play for 3rd place next.') : ''}
          </p>
          {waitingOn.length > 0 && (
            <p className="waiting">
              Waiting for {waitingOn.map((o) => `${nameOf(v, o.a)} vs ${nameOf(v, o.b)} (${o.live ? `game ${o.games.length + 1}` : 'between games'}, ${winsOf(o, o.a)}-${winsOf(o, o.b!)})`).join(' and ')} to finish…
            </p>
          )}
        </>
      ) : m.chooser === v.you && !m.nextFirst ? (
        <>
          <p>You lost the last game, so you choose: play first or draw first in game {m.games.length + 1}?</p>
          <div className="format-choices">
            <button className="primary" onClick={() => eventLink.send({ type: 'eventPlayDraw', play: true })}>
              Play first
            </button>
            <button onClick={() => eventLink.send({ type: 'eventPlayDraw', play: false })}>Draw first</button>
          </div>
        </>
      ) : m.live ? (
        <p>Game {m.games.length + 1} is on. It opens on the board automatically.</p>
      ) : m.nextFirst || !m.chooser ? (
        <p>Game {m.games.length + 1} is starting…</p>
      ) : (
        <p>Waiting for {nameOf(v, m.chooser)} to choose play or draw…</p>
      )}
    </section>
  );
}

/** The four seats' bracket: the semifinals, then the final and the match for third, with who moved up. */
function Bracket({ v }: { v: EventView }) {
  const semis = v.matches.filter((m) => m.stage === 'semifinal');
  const final = v.matches.find((m) => m.stage === 'final');
  const third = v.matches.find((m) => m.stage === 'third');
  return (
    <div className="bracket">
      <div className="bracket-col">
        <h3>Semifinals</h3>
        {semis.map((m) => (
          <BracketMatch key={m.id} v={v} m={m} up="Final" down="3rd place match" />
        ))}
      </div>
      <div className="bracket-col">
        <h3>Final · 1st and 2nd</h3>
        {final ? <BracketMatch v={v} m={final} /> : <PendingMatch semis={semis} v={v} winners />}
        <h3>3rd and 4th</h3>
        {third ? <BracketMatch v={v} m={third} /> : <PendingMatch semis={semis} v={v} winners={false} />}
      </div>
    </div>
  );
}

function BracketMatch({ v, m, up, down }: { v: EventView; m: MatchView; up?: string; down?: string }) {
  const mine = m.a === v.you || m.b === v.you;
  const status = m.done ? 'Done' : m.live ? `Game ${m.games.length + 1} on` : m.games.length ? `After game ${m.games.length}` : 'Starting';
  return (
    <div className={`bracket-match ${mine ? 'mine' : ''}`}>
      <div className="bracket-match-head">
        <span>{STAGE_NAME[m.stage]}</span>
        <span>{status}</span>
      </div>
      {[m.a, m.b!].map((seat) => (
        <div key={seat} className={`bracket-row ${m.done ? (m.winner === seat ? 'won' : 'lost') : ''}`}>
          <Avatar v={v} seat={seat} />
          <span className="who">{nameOf(v, seat)}</span>
          {m.done && up && <span className={`tag ${m.winner === seat ? '' : 'down'}`}>{m.winner === seat ? `▲ ${up}` : `▼ ${down}`}</span>}
          <span className="score">{winsOf(m, seat)}</span>
        </div>
      ))}
    </div>
  );
}

/** Round 2 before it's paired: whoever has already moved up, and who's still to come. */
function PendingMatch({ v, semis, winners }: { v: EventView; semis: MatchView[]; winners: boolean }) {
  return (
    <div className="bracket-match">
      <div className="bracket-match-head">
        <span>{winners ? 'Final' : 'Match for 3rd place'}</span>
        <span>Waiting</span>
      </div>
      {semis.map((m) => {
        const seat = m.done ? (winners ? m.winner : otherSeat(m, m.winner!)) : null;
        return (
          <div key={m.id} className="bracket-row">
            {seat && <Avatar v={v} seat={seat} />}
            <span className="who">{seat ? nameOf(v, seat) : `${winners ? 'Winner' : 'Loser'} of ${nameOf(v, m.a)} vs ${nameOf(v, m.b)}`}</span>
          </div>
        );
      })}
    </div>
  );
}

function Results({ v }: { v: EventView }) {
  const places = v.places ?? v.standings.map((s) => s.player);
  return (
    <section>
      <h2>The event is over</h2>
      <div className="event-results">
        {places.map((seat, i) => {
          const bot = v.seats.find((s) => s.id === seat)?.bot;
          return (
            <div key={seat} className={`event-result ${seat === v.you ? 'you' : ''}`}>
              <div className="place">{PLACE[i]}</div>
              <div>
                <Avatar v={v} seat={seat} /> {nameOf(v, seat)}
              </div>
              <div className="prize">{bot ? 'Bot (no prize)' : `${v.prizes[i] ?? 0} Aether Shards`}</div>
            </div>
          );
        })}
      </div>
      <p className="fineprint">{v.prizePaid ? 'Your prize was added to your account.' : 'Adding your prize to your account…'} Your drafted cards are in your collection.</p>
    </section>
  );
}

/** A seat's Discord profile picture, or its initials. */
function Avatar({ v, seat }: { v: EventView; seat: string }) {
  const s = v.seats.find((x) => x.id === seat);
  const [broken, setBroken] = useState(false);
  if (s?.avatar && !broken) return <img className="seat-avatar" src={s.avatar} alt="" onError={() => setBroken(true)} />;
  return <span className="seat-avatar initials">{s?.bot ? '🤖' : avatarText(s?.name ?? '?')}</span>;
}
