import { useState } from 'react';
import { CARD_IDS_BY_NAME, FIN_PRECONS, SCRYFALL, preconCommanders } from '@nexus/cards';
import { GameSession, type DeckChoice, type SessionOptions } from './game/session.ts';
import { ManaCost } from './components/Card.tsx';
import { Game } from './components/Game.tsx';
import { firstLesson, type Lesson } from './tutorial/lesson.ts';
import { PacksTab } from './packs/PacksTab.tsx';
import { OnlineMenu } from './components/OnlineMenu.tsx';
import { DraftTab } from './draft/DraftTab.tsx';
import { StarterPick } from './account/StarterPick.tsx';
import { AccountBar, AccountsSetupPage, SignInPage, supabase, useSession } from './account/AccountBar.tsx';

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

/** How much of a precon is fully built, for the menu. */
function builtCount(p: (typeof FIN_PRECONS)[number]): number {
  return p.cards.filter((c) => c.implemented).reduce((n, c) => n + c.count, 0) + (p.commander.implemented ? 1 : 0);
}

/** Signing in is required: no guest accounts. */
export function App() {
  const { ready, session } = useSession();
  if (!supabase) return <AccountsSetupPage />;
  if (!ready) return null;
  if (!session) return <SignInPage />;
  return <MainApp />;
}

function MainApp() {
  const [session, setSession] = useState<GameSession | null>(null);
  const [format, setFormat] = useState<'starter' | 'commander'>('starter');
  const [precon, setPrecon] = useState(FIN_PRECONS[0]!.name);
  /** Which legend leads your precon; undefined means its printed commander. */
  const [commander, setCommander] = useState<string | undefined>(undefined);
  const [deck, setDeck] = useState<DeckChoice>('UB');
  const [opponents, setOpponents] = useState(1);
  const [bot, setBot] = useState<SessionOptions['bot']>('ai');
  const [seed, setSeed] = useState('');
  const [tips, setTips] = useState(false);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  /** Changes for each new game so the board starts fresh. */
  const [gameNumber, setGameNumber] = useState(0);
  /** The menu's tabs: set up a game, play online, or open booster packs. */
  const [tab, setTab] = useState<'play' | 'online' | 'draft' | 'packs'>('play');

  const quit = () => {
    session?.close();
    setSession(null);
    setLesson(null);
  };

  /** A fresh game from turn 1 with a random hand against the AI, with tips. */
  const practice = () => {
    setLesson(null);
    setGameNumber((n) => n + 1);
    setSession(
      new GameSession({ deck: 'RW', opponents: 1, bot: 'ai', seed: Math.floor(Math.random() * 1_000_000), coaching: true }),
    );
  };

  const learn = () => {
    const l = firstLesson();
    setLesson(l);
    setGameNumber((n) => n + 1);
    setSession(new GameSession({ deck: 'RW', opponents: 1, bot: 'ai', seed: 0 }, l.scenario));
  };

  if (session) {
    return (
      <Game
        key={gameNumber}
        session={session}
        onQuit={quit}
        {...(lesson ? { lesson, onLessonDone: practice } : {})}
      />
    );
  }

  const start = () => {
    const chosenSeed = seed.trim() === '' ? Math.floor(Math.random() * 1_000_000) : Number(seed);
    setGameNumber((n) => n + 1);
    setSession(
      new GameSession({
        format,
        deck,
        precon,
        ...(format === 'commander' && commander ? { commander } : {}),
        opponents,
        bot,
        seed: Number.isFinite(chosenSeed) ? chosenSeed : 1,
        coaching: tips,
      }),
    );
  };

  const tabs = (
    <>
    <AccountBar />
    <StarterPick />
    <div className="menu-tabs" role="tablist">
      <button role="tab" aria-selected={tab === 'play'} className={tab === 'play' ? 'chosen' : ''} onClick={() => setTab('play')}>
        Play
      </button>
      <button role="tab" aria-selected={tab === 'online'} className={tab === 'online' ? 'chosen' : ''} onClick={() => setTab('online')}>
        Online
      </button>
      <button role="tab" aria-selected={tab === 'draft'} className={tab === 'draft' ? 'chosen' : ''} onClick={() => setTab('draft')}>
        Draft
      </button>
      <button role="tab" aria-selected={tab === 'packs'} className={tab === 'packs' ? 'chosen' : ''} onClick={() => setTab('packs')}>
        Packs
      </button>
    </div>
    </>
  );

  if (tab === 'online') {
    return (
      <div className="menu">
        <h1>Project Nexus</h1>
        <p className="tagline">Starter Kit games against a friend, through the game server</p>
        {tabs}
        <OnlineMenu
          onStart={(online) => {
            setLesson(null);
            setGameNumber((n) => n + 1);
            setSession(online);
          }}
        />
      </div>
    );
  }

  if (tab === 'draft') {
    return (
      <div className="menu">
        <h1>Project Nexus</h1>
        <p className="tagline">Draft Final Fantasy Play Boosters · pick a card, pass the rest</p>
        {tabs}
        <DraftTab
          onPlay={(game) => {
            setLesson(null);
            setGameNumber((n) => n + 1);
            setSession(game);
          }}
        />
      </div>
    );
  }

  if (tab === 'packs') {
    return (
      <div className="menu">
        <h1>Project Nexus</h1>
        <p className="tagline">Open Final Fantasy booster packs · for collecting only</p>
        {tabs}
        <PacksTab />
      </div>
    );
  }

  return (
    <div className="menu">
      <h1>Project Nexus</h1>
      <p className="tagline">Final Fantasy Starter Kits and Commander precons · play against the AI</p>
      {tabs}

      <h2>New to Magic?</h2>
      <div className="menu-learn">
        <button className="primary big" onClick={learn}>
          Learn to play
        </button>
        <button className="big" onClick={practice}>
          Practice game with tips
        </button>
      </div>

      <h2>Format</h2>
      <div className="format-choices">
        <button className={format === 'starter' ? 'chosen' : ''} onClick={() => setFormat('starter')}>
          Starter Kits <span>60 cards · 20 life</span>
        </button>
        <button className={format === 'commander' ? 'chosen' : ''} onClick={() => setFormat('commander')}>
          Commander <span>100-card precons · 40 life</span>
        </button>
      </div>

      <h2>Your deck</h2>
      {format === 'starter' ? (
        <div className="deck-choices">
          {DECKS.map((d) => (
            <button key={d.id} className={`deck ${deck === d.id ? 'chosen' : ''}`} onClick={() => setDeck(d.id)}>
              <img src={SCRYFALL[d.art]?.image.artCrop} alt="" />
              <span className="deck-name">{d.name}</span>
              <span className="deck-blurb">{d.blurb}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="deck-choices precons">
          {FIN_PRECONS.map((p) => (
            <button
              key={p.name}
              className={`deck ${precon === p.name ? 'chosen' : ''}`}
              onClick={() => {
                setPrecon(p.name);
                setCommander(undefined);
              }}
            >
              <img src={SCRYFALL[CARD_IDS_BY_NAME[p.commander.name]!]?.image.artCrop} alt="" />
              <span className="deck-name">{p.name.replace(/ \(.*\)$/, '')}</span>
              <span className="deck-blurb">
                {p.commander.name} · {p.name.match(/\((.*)\)/)?.[1]} · {builtCount(p)}/100 cards fully built
              </span>
            </button>
          ))}
        </div>
      )}
      {format === 'commander' && <CommanderPicker precon={precon} chosen={commander} onChoose={setCommander} />}
      {format === 'commander' && (
        <p className="fineprint">
          Commander rules are on: 40 life, your commander starts in the command zone (cast it from there; it costs
          {' {2}'} more each time), and 21 combat damage from one commander knocks a player out. Cards marked “not
          built yet” are still being built: creatures play as their body and keywords, other cards can’t be cast.
        </p>
      )}

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
        <label className="checkbox">
          <span>Tips</span>
          <span>
            <input type="checkbox" checked={tips} onChange={(e) => setTips(e.target.checked)} /> Show tips
          </span>
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
        {format === 'starter'
          ? 'Both decks are the exact Final Fantasy Starter Kits, with every card working as printed.'
          : 'The four Final Fantasy Commander precons, exactly as printed; the rest of their cards are being built step by step.'}{' '}
        Card images courtesy of Scryfall.
      </p>
    </div>
  );
}

/**
 * Choose which card leads your precon: the printed commander or another
 * legendary creature (or Vehicle) in all of the deck's colors.
 */
function CommanderPicker({ precon, chosen, onChoose }: { precon: string; chosen: string | undefined; onChoose: (name: string | undefined) => void }) {
  const choices = preconCommanders(precon);
  const current = chosen ?? choices.find((c) => c.printed)?.name;
  return (
    <div className="commander-picker">
      <div className="commander-picker-title">Your commander</div>
      <div className="commander-choices">
        {choices.map((c) => (
          <button
            key={c.name}
            className={`commander-choice ${current === c.name ? 'chosen' : ''}`}
            aria-pressed={current === c.name}
            onClick={() => onChoose(c.printed ? undefined : c.name)}
          >
            <img src={SCRYFALL[c.defId]?.image.artCrop} alt="" />
            <span className="commander-name">{c.name}</span>
            <span className="commander-tags">
              <ManaCost cost={c.colorIdentity.map((k) => `{${k}}`).join('')} size={12} />
              {c.printed && <span className="tag">printed commander</span>}
              {!c.built && <span className="tag">not built yet</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
