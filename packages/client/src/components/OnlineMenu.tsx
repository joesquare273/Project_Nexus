// The Online tab: a guest name, a room code and a Starter Kit, then a short
// wait for the other player. The game itself is the usual board, fed by the
// game server (see game/online.ts).

import { useEffect, useRef, useState } from 'react';
import { SCRYFALL } from '@nexus/cards';
import type { Deck, LobbyPlayer, ServerMessage } from '@nexus/server/protocol';
import { OnlineConnection, OnlineSession } from '../game/online.ts';

const DECKS: { id: Deck; name: string; art: string }[] = [
  { id: 'RW', name: 'Red-White', art: 'cloud-planets-champion' },
  { id: 'UB', name: 'Blue-Black', art: 'sephiroth-planets-heir' },
];

const NAME_KEY = 'nexus.online.name';

function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

type Phase = { kind: 'form' } | { kind: 'connecting' } | { kind: 'lobby'; room: string; players: LobbyPlayer[] };

export function OnlineMenu({ onStart }: { onStart: (session: OnlineSession) => void }) {
  const [name, setName] = useState(savedName);
  const [room, setRoom] = useState('');
  const [deck, setDeck] = useState<Deck>('RW');
  const [phase, setPhase] = useState<Phase>({ kind: 'form' });
  const [error, setError] = useState<string | null>(null);
  const connection = useRef<OnlineConnection | null>(null);
  const started = useRef(false);

  // Leaving the tab before the game starts closes the connection.
  useEffect(
    () => () => {
      if (!started.current) connection.current?.close();
    },
    [],
  );

  const cancel = () => {
    connection.current?.close();
    connection.current = null;
    setPhase({ kind: 'form' });
  };

  const join = () => {
    setError(null);
    const trimmed = name.trim();
    try {
      localStorage.setItem(NAME_KEY, trimmed);
    } catch {
      // Not remembered; that's fine.
    }
    const c = new OnlineConnection();
    connection.current = c;
    setPhase({ kind: 'connecting' });
    c.onClose = () => {
      if (started.current) return;
      setError('Could not reach the game server. Is it running (npm run server)?');
      setPhase({ kind: 'form' });
    };
    c.listen((m: ServerMessage) => {
      if (m.type === 'error') {
        setError(m.message);
        c.close();
        setPhase({ kind: 'form' });
      } else if (m.type === 'joined') {
        c.send({ type: 'pickDeck', deck });
      } else if (m.type === 'lobby') {
        setPhase({ kind: 'lobby', room: m.room, players: m.players });
      } else if (m.type === 'update') {
        started.current = true;
        onStart(new OnlineSession(c, m, deck));
      }
    });
    c.send({ type: 'join', name: trimmed, room: room.trim() });
  };

  if (phase.kind !== 'form') {
    return (
      <div className="online-lobby">
        <h2>{phase.kind === 'lobby' ? `Room ${phase.room}` : 'Connecting…'}</h2>
        {phase.kind === 'lobby' && (
          <ul className="online-players">
            {phase.players.map((p) => (
              <li key={p.seat}>
                <strong>{p.name}</strong> {p.deck ? `· ${DECKS.find((d) => d.id === p.deck)!.name}` : '· choosing a deck'}
              </li>
            ))}
            {phase.players.length < 2 && <li className="waiting">Waiting for the other player to join room {phase.room}…</li>}
          </ul>
        )}
        <button onClick={cancel}>Leave</button>
      </div>
    );
  }

  const canJoin = /^[A-Za-z0-9](?:[A-Za-z0-9 ]{0,14}[A-Za-z0-9])?$/.test(name.trim()) && name.trim().toLowerCase() !== 'you' && /^[A-Za-z0-9]{3,12}$/.test(room.trim());
  return (
    <div className="online-form">
      <p className="fineprint">Play a Starter Kit game against a friend. Both of you enter the same room code.</p>
      <label>
        Your name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={16} placeholder="1-16 letters or digits" />
      </label>
      <label>
        Room code
        <input value={room} onChange={(e) => setRoom(e.target.value)} maxLength={12} placeholder="for example TABLE7" />
      </label>
      <h2>Your deck</h2>
      <div className="deck-choices">
        {DECKS.map((d) => (
          <button key={d.id} className={`deck ${deck === d.id ? 'chosen' : ''}`} onClick={() => setDeck(d.id)}>
            <img src={SCRYFALL[d.art]?.image.artCrop} alt="" />
            <span className="deck-name">{d.name}</span>
          </button>
        ))}
      </div>
      {error && <p className="online-error">{error}</p>}
      <button className="primary big" disabled={!canJoin} onClick={join}>
        Join room
      </button>
    </div>
  );
}
