// Online Commander tables: host a table (choose how many seats are for
// players and how many for bots) or join one with its code, pick one of your
// own Commander decks, and wait for the host to start. The game is the usual
// board, fed by the game server (game/online.ts). The server checks
// everything; this page only shows what it says.

import { useEffect, useRef, useState } from 'react';
import type { ServerMessage, TableView } from '@nexus/server/protocol';
import { accessToken } from '../account/AccountBar.tsx';
import { OnlineConnection, OnlineSession } from '../game/online.ts';
import type { SavedDeck } from '../packs/collection.ts';
import { OwnCommanderDecks, commanderArt } from './CommanderDecks.tsx';

/** The table you were last at, so a reload can take you back to your seat. */
const LAST_TABLE = 'nexus:lastTable';
const remember = (code: string | null) => {
  try {
    if (code) sessionStorage.setItem(LAST_TABLE, code);
    else sessionStorage.removeItem(LAST_TABLE);
  } catch {
    // Storage may be off; rejoining by code still works.
  }
};
const remembered = (): string | null => {
  try {
    return sessionStorage.getItem(LAST_TABLE);
  } catch {
    return null;
  }
};

type Mode = 'host' | 'join';

export function TableMenu({ onStart, onBuild }: { onStart: (session: OnlineSession) => void; onBuild: () => void }) {
  const [mode, setMode] = useState<Mode>(() => (remembered() ? 'join' : 'host'));
  const [players, setPlayers] = useState(1);
  const [bots, setBots] = useState(3);
  const [code, setCode] = useState(() => remembered() ?? '');
  const [deck, setDeck] = useState<SavedDeck | null>(null);
  const [table, setTable] = useState<TableView | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connection = useRef<OnlineConnection | null>(null);
  const started = useRef(false);
  const deckRef = useRef<SavedDeck | null>(null);
  deckRef.current = deck;

  useEffect(
    () => () => {
      if (!started.current) connection.current?.close();
    },
    [],
  );

  const reset = (message: string | null) => {
    connection.current?.close();
    connection.current = null;
    setTable(null);
    setConnecting(false);
    setError(message);
  };

  const open = async (first: (token: string) => Parameters<OnlineConnection['send']>[0]) => {
    setError(null);
    const token = await accessToken();
    if (!token) return setError('Your sign-in has expired. Sign in with Discord again.');
    const c = new OnlineConnection();
    connection.current = c;
    setConnecting(true);
    let seated = false;
    c.onClose = () => {
      if (started.current) return;
      reset('Lost the connection to the game server. Is it running (npm run server)?');
    };
    c.listen((m: ServerMessage) => {
      if (m.type === 'table') {
        setConnecting(false);
        setTable(m.table);
        remember(m.table.code);
        // Bring your chosen deck to the table as soon as you're seated.
        if (!seated) {
          seated = true;
          const mine = m.table.seats.find((s) => s.id === m.table.you);
          if (deckRef.current && !mine?.deck && m.table.phase === 'lobby') c.send({ type: 'tableDeck', deck: deckRef.current.id });
        }
      } else if (m.type === 'update') {
        started.current = true;
        onStart(new OnlineSession(c, m, 'RW', 'commander'));
      } else if (m.type === 'tableClosed') {
        remember(null);
        reset('The host closed the table.');
      } else if (m.type === 'error') {
        if (!seated) {
          if (m.code === 'no-event') remember(null);
          reset(m.message);
        } else setError(m.message);
      }
    });
    c.send(first(token));
  };

  const host = () => void open((token) => ({ type: 'tableCreate', token, players, bots }));
  const join = () => void open((token) => ({ type: 'tableJoin', token, code: code.trim() }));
  const leave = () => {
    connection.current?.send({ type: 'tableLeave' });
    remember(null);
    reset(null);
  };

  const chooseDeck = (_: unknown, saved: SavedDeck | null) => {
    setDeck(saved);
    if (saved && table?.phase === 'lobby') connection.current?.send({ type: 'tableDeck', deck: saved.id });
  };

  if (table || connecting) {
    return <TableLobby table={table} error={error} onLeave={leave} onSettings={(p, b) => connection.current?.send({ type: 'tableSettings', players: p, bots: b })} onStart={() => connection.current?.send({ type: 'tableStart' })} deckPicker={<OwnCommanderDecks onChoose={chooseDeck} onBuild={onBuild} />} />;
  }

  const canJoin = /^[A-Za-z0-9]{3,12}$/.test(code.trim());
  return (
    <div className="table-menu">
      <div className="format-choices">
        <button className={mode === 'host' ? 'chosen' : ''} onClick={() => setMode('host')}>
          Host a table <span>Choose the seats: players and bots</span>
        </button>
        <button className={mode === 'join' ? 'chosen' : ''} onClick={() => setMode('join')}>
          Join a table <span>Enter the code from your host</span>
        </button>
      </div>

      {mode === 'host' ? (
        <>
          <h2>Seats</h2>
          <SeatPicker players={players} bots={bots} onChange={(p, b) => (setPlayers(p), setBots(b))} />
        </>
      ) : (
        <label className="table-code-input">
          Table code
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12} placeholder="for example C7KQ2MX" />
        </label>
      )}

      <h2>Your deck</h2>
      <OwnCommanderDecks onChoose={chooseDeck} onBuild={onBuild} />

      {error && <p className="online-error">{error}</p>}
      {mode === 'host' ? (
        <button className="primary big" disabled={!deck} title={deck ? undefined : 'Choose one of your Commander decks first'} onClick={host}>
          Host table
        </button>
      ) : (
        <button className="primary big" disabled={!canJoin || !deck} title={!deck ? 'Choose one of your Commander decks first' : undefined} onClick={join}>
          Join table
        </button>
      )}
      <p className="fineprint">Bots play the Final Fantasy precons. Commander rules: 40 life, the command zone, commander tax and 21 commander damage.</p>
    </div>
  );
}

/** How many seats are for players (you included) and how many for bots: 2-4 seats in all. */
export function SeatPicker({ players, bots, min = 1, onChange }: { players: number; bots: number; min?: number; onChange: (players: number, bots: number) => void }) {
  const total = players + bots;
  return (
    <div className="seat-picker">
      {/* With every seat taken, adding one kind of seat turns a seat of the other kind into it. */}
      <Stepper label="Players" hint="you included" value={players} canDown={players > Math.max(1, min) && total > 2} canUp={total < 4 || bots > 0} onChange={(p) => onChange(p, p > players && total >= 4 ? bots - 1 : bots)} />
      <Stepper label="Bots" value={bots} canDown={bots > 0 && total > 2} canUp={total < 4 || players > Math.max(1, min)} onChange={(b) => (b > bots && total >= 4 ? onChange(players - 1, b) : onChange(players, b))} />
      <div className="seat-dots" aria-label={`${total} seats`}>
        {Array.from({ length: players }, (_, i) => (
          <span key={`p${i}`} className="seat-dot player" title="Player seat" />
        ))}
        {Array.from({ length: bots }, (_, i) => (
          <span key={`b${i}`} className="seat-dot bot" title="Bot seat" />
        ))}
        <span className="seat-total">{total} seats</span>
      </div>
    </div>
  );
}

function Stepper({ label, hint, value, canDown, canUp, onChange }: { label: string; hint?: string; value: number; canDown: boolean; canUp: boolean; onChange: (v: number) => void }) {
  return (
    <div className="stepper">
      <span className="stepper-label">
        {label} {hint && <small>{hint}</small>}
      </span>
      <button aria-label={`Fewer ${label.toLowerCase()}`} disabled={!canDown} onClick={() => onChange(value - 1)}>
        −
      </button>
      <strong>{value}</strong>
      <button aria-label={`More ${label.toLowerCase()}`} disabled={!canUp} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}

function TableLobby({
  table,
  error,
  onLeave,
  onSettings,
  onStart,
  deckPicker,
}: {
  table: TableView | null;
  error: string | null;
  onLeave: () => void;
  onSettings: (players: number, bots: number) => void;
  onStart: () => void;
  deckPicker: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const [changingDeck, setChangingDeck] = useState(false);
  if (!table) {
    return (
      <div className="online-lobby">
        <h2>Connecting…</h2>
        {error && <p className="online-error">{error}</p>}
        <button onClick={onLeave}>Cancel</button>
      </div>
    );
  }
  const isHost = table.you === table.host;
  const humans = table.seats.filter((s) => !s.bot);
  const open = table.players - humans.length;
  const missingDeck = humans.find((s) => !s.deck);
  const startProblem = open > 0 ? `Waiting for ${open} more player${open === 1 ? '' : 's'}` : missingDeck ? `${missingDeck.id === table.you ? 'You haven’t' : `${missingDeck.name} hasn’t`} chosen a deck` : null;
  const me = table.seats.find((s) => s.id === table.you);
  const copy = () => {
    void navigator.clipboard?.writeText(table.code).then(() => setCopied(true));
  };

  if (table.phase !== 'lobby') {
    return (
      <div className="online-lobby">
        <h2>Table {table.code}</h2>
        <p>{table.phase === 'finished' ? 'This game is over.' : 'The game is on. Reconnecting to it…'}</p>
        <button onClick={onLeave}>Back</button>
      </div>
    );
  }

  return (
    <div className="table-lobby">
      <div className="table-code">
        <span>Table code</span>
        <strong>{table.code}</strong>
        <button className="ghost" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
        <p className="fineprint">{open > 0 ? 'Share this code: players join from Play → Online → Commander → Join a table.' : 'Every seat is taken.'}</p>
      </div>

      <ul className="table-seats">
        {table.seats.map((s) => (
          <li key={s.id} className={`table-seat ${s.id === table.you ? 'you' : ''}`}>
            {s.deck && commanderArt(s.deck.commander) ? <img src={commanderArt(s.deck.commander)} alt="" /> : <span className="table-seat-art" />}
            <span className="table-seat-name">
              <strong>{s.name}</strong>
              {s.id === table.host && <em className="seat-badge">Host</em>}
              {s.id === table.you && <em className="seat-badge">You</em>}
              {!s.connected && <em className="seat-badge away">Away</em>}
            </span>
            <span className="table-seat-deck">{s.deck ? s.deck.name : 'Choosing a deck…'}</span>
          </li>
        ))}
        {Array.from({ length: open }, (_, i) => (
          <li key={`open${i}`} className="table-seat open">
            <span className="table-seat-art" />
            <span className="table-seat-name">
              <strong>Open seat</strong>
            </span>
            <span className="table-seat-deck">Waiting for a player</span>
          </li>
        ))}
        {Array.from({ length: table.bots }, (_, i) => (
          <li key={`bot${i}`} className="table-seat bot">
            <span className="table-seat-art bot">🤖</span>
            <span className="table-seat-name">
              <strong>Bot</strong>
            </span>
            <span className="table-seat-deck">Plays a Final Fantasy precon</span>
          </li>
        ))}
      </ul>

      {isHost && (
        <div className="table-host-controls">
          <h2>Seats</h2>
          <SeatPicker players={table.players} bots={table.bots} min={humans.length} onChange={onSettings} />
        </div>
      )}

      {(!me?.deck || changingDeck) ? (
        <>
          <h2>Your deck</h2>
          {deckPicker}
        </>
      ) : (
        <button className="link" onClick={() => setChangingDeck(true)}>
          Play a different deck
        </button>
      )}

      {error && <p className="online-error">{error}</p>}
      <div className="table-actions">
        {isHost ? (
          <button className="primary big" disabled={!!startProblem} onClick={onStart}>
            {startProblem ?? 'Start the game'}
          </button>
        ) : (
          <p className="waiting">{startProblem ?? 'Waiting for the host to start the game…'}</p>
        )}
        <button onClick={onLeave}>{isHost ? 'Close table' : 'Leave'}</button>
      </div>
    </div>
  );
}
