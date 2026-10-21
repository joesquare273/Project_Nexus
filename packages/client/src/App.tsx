import { useState } from 'react';
import { SCRYFALL } from '@nexus/cards';
import { GameSession, type DeckChoice, type SessionOptions } from './game/session.ts';
import { Game } from './components/Game.tsx';

const DECKS: { id: DeckChoice; name: string; blurb: string; art: string }[] = [
  {
    id: 'RW',
    name: 'Red-White',
    blurb: 'The Red-White Starter Kit: Cloud, Barret, Beatrix and friends, with Equipment.',
    art: 'cloud-planets-champion',
  },
  {
    id: 'UB',
    name: 'Blue-Black',
    blurb: 'The Blue-Black Starter Kit: Sephiroth, Ultimecia and value from the graveyard.',
    art: 'sephiroth-planets-heir',
  },
];

export function App() {
  const [session, setSession] = useState<GameSession | null>(null);
  const [deck, setDeck] = useState<DeckChoice>('UB');
  const [opponents, setOpponents] = useState(1);
  const [bot, setBot] = useState<SessionOptions['bot']>('ai');
  const [seed, setSeed] = useState('');

  if (session) return <Game key={session.options.seed} session={session} onQuit={() => setSession(null)} />;

  const start = () => {
    const chosenSeed = seed.trim() === '' ? Math.floor(Math.random() * 1_000_000) : Number(seed);
    setSession(new GameSession({ deck, opponents, bot, seed: Number.isFinite(chosenSeed) ? chosenSeed : 1 }));
  };

  return (
    <div className="menu">
      <h1>Project Nexus</h1>
      <p className="tagline">Final Fantasy Starter Kits · play against the AI</p>

      <h2>Your deck</h2>
      <div className="deck-choices">
        {DECKS.map((d) => (
          <button key={d.id} className={`deck ${deck === d.id ? 'chosen' : ''}`} onClick={() => setDeck(d.id)}>
            <img src={SCRYFALL[d.art]?.image.artCrop} alt="" />
            <span className="deck-name">{d.name}</span>
            <span className="deck-blurb">{d.blurb}</span>
          </button>
        ))}
      </div>

      <div className="settings">
        <label>
          Opponents
          <select value={opponents} onChange={(e) => setOpponents(Number(e.target.value))}>
            <option value={1}>1 (duel)</option>
            <option value={2}>2 (3-player pod)</option>
            <option value={3}>3 (4-player pod)</option>
          </select>
        </label>
        <label>
          Opponent skill
          <select value={bot} onChange={(e) => setBot(e.target.value as SessionOptions['bot'])}>
            <option value="ai">Basic AI</option>
            <option value="random">Random</option>
          </select>
        </label>
        <label>
          Seed (optional)
          <input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="random" inputMode="numeric" />
        </label>
      </div>

      <button className="primary big" onClick={start}>
        Start game
      </button>
      <p className="fineprint">

        Both decks are the exact Final Fantasy Starter Kits. Cards marked “not built yet” play as their body and
        keywords only (creatures) or can’t be cast yet (other cards). Card images courtesy of Scryfall.
      </p>
    </div>
  );
}
