import { useEffect, useState } from 'react';
import { FIN_PRECONS, SCRYFALL } from '@nexus/cards';
import { gameDeck, type GameDeck } from '@nexus/cards/decks';
import { BOOSTER_CARDS } from '@nexus/cards/boosters';
import { accessToken } from './account/AccountBar.tsx';
import { fetchDecks, type SavedDeck } from './packs/collection.ts';
import { PRINTING_CARDS } from './packs/browse.ts';
import { GameSession, type DeckChoice, type SessionOptions } from './game/session.ts';
import { ManaCost } from './components/Card.tsx';
import { Game } from './components/Game.tsx';
import { firstLesson, type Lesson } from './tutorial/lesson.ts';
import { PacksTab } from './packs/PacksTab.tsx';
import { StoreTab } from './packs/StoreTab.tsx';
import { OnlineMenu } from './components/OnlineMenu.tsx';
import { DraftTab } from './draft/DraftTab.tsx';
import { StarterPick } from './account/StarterPick.tsx';
import { Tour } from './account/Tour.tsx';
import { AccountChip, AccountsSetupPage, SignInPage, supabase, useAccount, useSession } from './account/AccountBar.tsx';
import { finishOnboarding, useOnboarding } from './account/onboarding.ts';

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

/** Signing in is required: no guest accounts. */
export function App() {
  const { ready, session } = useSession();
  if (!supabase) return <AccountsSetupPage />;
  if (!ready) return null;
  if (!session) return <SignInPage />;
  return <MainApp />;
}

type Page = 'home' | 'play' | 'collection' | 'decks' | 'shop';
type PlayMode = 'ai' | 'online' | 'draft';
type ShopMode = 'packs' | 'store';
interface Route {
  page: Page;
  play: PlayMode;
  shop: ShopMode;
}

const PAGES: { id: Page; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'play', label: 'Play' },
  { id: 'collection', label: 'Collection' },
  { id: 'decks', label: 'Decks' },
  { id: 'shop', label: 'Shop' },
];

/** The page from the address bar (#/play/online), so the browser's back button works. */
function routeFromHash(hash: string): Route {
  const [page, sub] = hash.replace(/^#\/?/, '').split('/');
  const route: Route = { page: 'home', play: 'ai', shop: 'packs' };
  if (PAGES.some((p) => p.id === page)) route.page = page as Page;
  if (route.page === 'play' && (sub === 'online' || sub === 'draft' || sub === 'ai')) route.play = sub;
  if (route.page === 'shop' && (sub === 'store' || sub === 'packs')) route.shop = sub;
  return route;
}

function hashFor(r: Route): string {
  return r.page === 'play' ? `#/play/${r.play}` : r.page === 'shop' ? `#/shop/${r.shop}` : `#/${r.page}`;
}

function useRoute(): [Route, (next: Partial<Route>) => void] {
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash));
  useEffect(() => {
    const sync = () => setRoute(routeFromHash(window.location.hash));
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  const go = (next: Partial<Route>) => {
    const r = { ...route, ...next };
    if (hashFor(r) !== window.location.hash) window.location.hash = hashFor(r);
    setRoute(r);
    window.scrollTo(0, 0);
  };
  return [route, go];
}

function MainApp() {
  const [session, setSession] = useState<GameSession | null>(null);
  const [format, setFormat] = useState<'starter' | 'commander'>('starter');
  const [precon] = useState(FIN_PRECONS[0]!.name);
  /** Commander: the saved deck you play (yours only), converted for the game. */
  const [ownDeck, setOwnDeck] = useState<GameDeck | null>(null);
  const [deck, setDeck] = useState<DeckChoice>('UB');
  const [opponents, setOpponents] = useState(1);
  const [bot, setBot] = useState<SessionOptions['bot']>('ai');
  const [seed, setSeed] = useState('');
  const [tips, setTips] = useState(false);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  /** Changes for each new game so the board starts fresh. */
  const [gameNumber, setGameNumber] = useState(0);
  const [route, go] = useRoute();
  const account = useAccount();
  const onboarding = useOnboarding();

  const quit = () => {
    session?.close();
    setSession(null);
    setLesson(null);
  };

  /** A fresh game from turn 1 with a random hand against the AI, with tips. */
  const practice = () => {
    setLesson(null);
    setGameNumber((n) => n + 1);
    setSession(new GameSession({ deck: 'RW', opponents: 1, bot: 'ai', seed: Math.floor(Math.random() * 1_000_000), coaching: true }));
  };

  const learn = () => {
    const l = firstLesson();
    setLesson(l);
    setGameNumber((n) => n + 1);
    setSession(new GameSession({ deck: 'RW', opponents: 1, bot: 'ai', seed: 0 }, l.scenario));
  };

  const play = (game: GameSession) => {
    setLesson(null);
    setGameNumber((n) => n + 1);
    setSession(game);
  };

  if (session) {
    return (
      <Game
        key={gameNumber}
        session={session}
        onQuit={quit}
        {...(lesson
          ? {
              lesson,
              onLessonDone: () => {
                // Finishing the lesson is saved on the account, so Home stops offering it first.
                void finishOnboarding('lesson');
                practice();
              },
            }
          : {})}
      />
    );
  }

  const start = () => {
    const chosenSeed = seed.trim() === '' ? Math.floor(Math.random() * 1_000_000) : Number(seed);
    play(
      new GameSession({
        format,
        deck,
        precon,
        ...(format === 'commander' && ownDeck ? { ownDeck } : {}),
        opponents,
        bot,
        seed: Number.isFinite(chosenSeed) ? chosenSeed : 1,
        coaching: tips,
      }),
    );
  };

  const name = account.kind === 'ready' ? account.account.name : null;

  return (
    <div className="app-shell">
      <StarterPick />
      <Tour />
      <header className="top-bar">
        <button className="brand ghost" onClick={() => go({ page: 'home' })} aria-label="Project Nexus home">
          <span className="brand-mark" aria-hidden="true">✦</span> Project Nexus
        </button>
        <nav className="top-nav" aria-label="Main">
          {PAGES.map((p) => (
            <button
              key={p.id}
              data-nav={p.id}
              className={route.page === p.id ? 'chosen' : ''}
              aria-current={route.page === p.id ? 'page' : undefined}
              onClick={() => go({ page: p.id })}
            >
              {p.label}
            </button>
          ))}
        </nav>
        <AccountChip status={account} />
      </header>

      <main className="page">
        {route.page === 'home' && (
          <HomePage
            name={name}
            lessonDone={!!onboarding?.lesson}
            onLearn={learn}
            onPractice={practice}
            go={go}
          />
        )}

        {route.page === 'play' && (
          <>
            <PageTitle title="Play" subtitle="Against the computer, a friend online, or a booster draft" />
            <SubTabs
              value={route.play}
              options={[
                ['ai', 'Vs. computer'],
                ['online', 'Online'],
                ['draft', 'Draft'],
              ]}
              onChange={(play) => go({ play })}
            />
            {route.play === 'online' && <OnlineMenu onStart={play} />}
            {route.play === 'draft' && <DraftTab onPlay={play} />}
            {route.play === 'ai' && (
              <div className="play-setup">
                {onboarding && !onboarding.lesson && (
                  <p className="hint-banner">
                    New to Magic? <button className="link" onClick={learn}>Start the lesson</button> first: it teaches the rules in one short game.
                  </p>
                )}
                <h2>Format</h2>
                <div className="format-choices">
                  <button className={format === 'starter' ? 'chosen' : ''} onClick={() => setFormat('starter')}>
                    Starter Kits <span>60 cards · 20 life</span>
                  </button>
                  <button className={format === 'commander' ? 'chosen' : ''} onClick={() => setFormat('commander')}>
                    Commander <span>Your 100-card decks · 40 life</span>
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
                  <OwnCommanderDecks onChoose={setOwnDeck} onBuild={() => go({ page: 'decks' })} />
                )}
                {format === 'commander' && (
                  <p className="fineprint">
                    Commander rules: 40 life, your commander starts in the command zone (it costs {'{2}'} more each time you cast it from there), and 21 combat
                    damage from one commander knocks a player out.
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
                  <label className="checkbox">
                    <input type="checkbox" checked={tips} onChange={(e) => setTips(e.target.checked)} /> Show tips while I play
                  </label>
                </div>
                <details className="more-options">
                  <summary>More options</summary>
                  <div className="settings">
                    <label>
                      Opponent skill
                      <select value={bot} onChange={(e) => setBot(e.target.value as SessionOptions['bot'])}>
                        <option value="ai">Basic AI</option>
                        <option value="random">Random</option>
                      </select>
                    </label>
                    <label>
                      Seed (replay a shuffle)
                      <input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="random" inputMode="numeric" />
                    </label>
                  </div>
                </details>

                <button
                  className="primary big"
                  disabled={format === 'commander' && !ownDeck}
                  title={format === 'commander' && !ownDeck ? 'Choose one of your Commander decks first' : undefined}
                  onClick={start}
                >
                  Start game
                </button>
                <p className="fineprint">Card images courtesy of Scryfall.</p>
              </div>
            )}
          </>
        )}

        {route.page === 'collection' && (
          <>
            <PageTitle title="Collection" subtitle="Every card you own, by set" />
            <PacksTab section="collection" />
          </>
        )}

        {route.page === 'decks' && (
          <>
            <PageTitle title="Decks" subtitle="Build decks from the cards you own" />
            <PacksTab section="decks" />
          </>
        )}

        {route.page === 'shop' && (
          <>
            <PageTitle title="Shop" subtitle="Booster packs and exclusive printings" />
            <SubTabs
              value={route.shop}
              options={[
                ['packs', 'Booster packs'],
                ['store', 'Store'],
              ]}
              onChange={(shop) => go({ shop })}
            />
            {route.shop === 'packs' ? <PacksTab section="packs" onSection={(s) => go({ page: s === 'packs' ? 'shop' : s })} /> : <StoreTab />}
          </>
        )}
      </main>
    </div>
  );
}

function PageTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="page-title">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  );
}

function SubTabs<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="sub-tabs" role="tablist">
      {options.map(([id, label]) => (
        <button key={id} role="tab" aria-selected={value === id} className={value === id ? 'chosen' : ''} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

const TILES: { title: string; text: string; art: string; to: Partial<Route> }[] = [
  { title: 'Play the computer', text: 'Starter Kits or your Commander decks, 1 to 3 opponents.', art: 'sephiroth-planets-heir', to: { page: 'play', play: 'ai' } },
  { title: 'Play a friend', text: 'Both enter the same room code.', art: 'cloud-planets-champion', to: { page: 'play', play: 'online' } },
  { title: 'Booster draft', text: 'Pick cards from packs as they pass, then build a deck.', art: 'terra-herald-of-hope', to: { page: 'play', play: 'draft' } },
  { title: 'Open packs', text: 'Play and Collector Boosters, kept in your collection.', art: 'tifa-lockhart', to: { page: 'shop', shop: 'packs' } },
  { title: 'Your collection', text: 'Every card you own, with its finishes.', art: 'tidus-yunas-guardian', to: { page: 'collection' } },
  { title: 'Your decks', text: 'Build and edit decks from your cards.', art: 'yshtola-nights-blessed', to: { page: 'decks' } },
];

/** The landing page after signing in: the lesson first for new players, then shortcuts to everything. */
function HomePage({ name, lessonDone, onLearn, onPractice, go }: { name: string | null; lessonDone: boolean; onLearn: () => void; onPractice: () => void; go: (r: Partial<Route>) => void }) {
  return (
    <div className="home">
      <div className="page-title">
        <h1>{name ? `Welcome, ${name}` : 'Welcome'}</h1>
        <p>What would you like to do?</p>
      </div>
      {!lessonDone ? (
        <section className="home-hero">
          <div>
            <h2>New to Magic? Start here</h2>
            <p>A short guided game teaches the turn, mana, casting spells and combat. Then try a practice game with tips.</p>
          </div>
          <div className="home-hero-buttons">
            <button className="primary big" onClick={onLearn}>
              Learn to play
            </button>
            <button onClick={onPractice}>Practice game with tips</button>
          </div>
        </section>
      ) : (
        <section className="home-hero compact">
          <p>Want a refresher?</p>
          <button className="ghost" onClick={onLearn}>
            Replay the lesson
          </button>
          <button className="ghost" onClick={onPractice}>
            Practice game with tips
          </button>
        </section>
      )}
      <div className="home-tiles">
        {TILES.map((t) => (
          <button key={t.title} className="home-tile" onClick={() => go(t.to)}>
            {SCRYFALL[t.art] && <img src={SCRYFALL[t.art]!.image.artCrop} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />}
            <span className="home-tile-title">{t.title}</span>
            <span className="home-tile-text">{t.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Commander: the player's own saved Commander decks (only decks they own,
 * user rule 2026-10-30). Picking one converts it for the game; a deck with
 * a card the game doesn't know yet can't be picked.
 */
function OwnCommanderDecks({ onChoose, onBuild }: { onChoose: (deck: GameDeck | null) => void; onBuild: () => void }) {
  const [decks, setDecks] = useState<SavedDeck[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    accessToken()
      .then((token) => (token ? fetchDecks(token) : Promise.reject(new Error('Sign in first.'))))
      .then((all) => setDecks(all.filter((d) => d.format === 'commander' && d.commander)), (e: Error) => setProblem(e.message === 'Failed to fetch' ? 'Could not reach the game server.' : e.message));
  }, []);
  const art = (id: string) => [...PRINTING_CARDS, ...BOOSTER_CARDS].find((c) => c.id === id)?.images[0]?.artCrop;
  if (problem) return <p className="account-error">{problem}</p>;
  if (!decks) return <p className="fineprint">Loading your decks…</p>;
  if (decks.length === 0) {
    return (
      <p className="fineprint">
        You don't own a Commander deck yet. Pick your free precon, buy one in the Store, or{' '}
        <button className="link" onClick={onBuild}>
          build one in Decks
        </button>
        .
      </p>
    );
  }
  return (
    <div className="deck-choices precons">
      {decks.map((d) => {
        const converted = gameDeck(d);
        const playable = !('problem' in converted);
        return (
          <button
            key={d.id}
            className={`deck ${chosen === d.id ? 'chosen' : ''}`}
            disabled={!playable}
            title={playable ? undefined : converted.problem}
            onClick={() => {
              setChosen(d.id);
              onChoose(playable ? converted : null);
            }}
          >
            {d.commander && art(d.commander) && <img src={art(d.commander)} alt="" />}
            <span className="deck-name">{d.name}</span>
            <span className="deck-blurb">{playable ? 'Your deck' : converted.problem}</span>
          </button>
        );
      })}
    </div>
  );
}
