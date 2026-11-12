import { GameErrorBoundary } from './components/GameErrorBoundary.tsx';
import { useEffect, useState } from 'react';
import { FIN_PRECONS, SCRYFALL, UI_ART, type UiArtKey } from '@nexus/cards';
import type { GameDeck } from '@nexus/cards/decks';
import { GameSession, type DeckChoice, type SessionOptions } from './game/session.ts';
import { ManaCost, ManaText } from './components/Card.tsx';
import { Game } from './components/Game.tsx';
import { CreditsPage, LegalFooter } from './components/Credits.tsx';
import { firstLesson, type Lesson } from './tutorial/lesson.ts';
import { PacksTab } from './packs/PacksTab.tsx';
import { CraftTab } from './craft/CraftTab.tsx';
import { StoreTab } from './packs/StoreTab.tsx';
import { OwnCommanderDecks } from './components/CommanderDecks.tsx';
import { TableMenu } from './components/TableMenu.tsx';
import { GameLoading, LoadingScreen } from './components/LoadingScreen.tsx';
import { hostBotGame } from './game/serverGame.ts';
import type { OnlineSession } from './game/online.ts';
import type { SavedDeck } from './packs/collection.ts';
import { Quests, RewardToast } from './account/Rewards.tsx';
import { DraftTab } from './draft/DraftTab.tsx';
import { EventPage } from './draft/EventPage.tsx';
import { eventLink } from './draft/eventLink.ts';
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

type Page = 'home' | 'play' | 'collection' | 'decks' | 'craft' | 'shop' | 'credits';
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
  { id: 'craft', label: 'Craft' },
  { id: 'shop', label: 'Shop' },
];

/** The page from the address bar (#/play/online), so the browser's back button works. */
function routeFromHash(hash: string): Route {
  const [page, sub] = hash.replace(/^#\/?/, '').split('/');
  const route: Route = { page: 'home', play: 'ai', shop: 'packs' };
  // The credits page isn't in the top menu; the link at the foot of every page opens it.
  if (PAGES.some((p) => p.id === page) || page === 'credits') route.page = page as Page;
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
  const [format, setFormat] = useState<'constructed' | 'commander'>('constructed');
  const [precon] = useState(FIN_PRECONS[0]!.name);
  /** Commander: the saved deck you play (yours only), converted for the game. */
  const [ownDeck, setOwnDeck] = useState<GameDeck | null>(null);
  /** The saved deck behind ownDeck: games against the computer run on the server with it (rewarded). */
  const [savedDeck, setSavedDeck] = useState<SavedDeck | null>(null);
  /** A server game against the computer being set up, then loaded. */
  const [hosting, setHosting] = useState<{ cancel: () => void } | null>(null);
  const [hosted, setHosted] = useState<OnlineSession | null>(null);
  const [hostError, setHostError] = useState<string | null>(null);
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
      <GameErrorBoundary key={gameNumber} onQuit={quit}>
      <Game
        key={gameNumber}
        session={session}
        onQuit={quit}
        onContinue={() => {
          // After a draft game, back to the event (the page you were on); otherwise Home.
          const draft = session.draftGame;
          quit();
          if (!draft) go({ page: 'home' });
        }}
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
      </GameErrorBoundary>
    );
  }

  /** New players: a Starter Kit game against the computer, with tips (the Starter Kits are only for practice). */
  const tryStarterKit = (kit: DeckChoice) => {
    setDeck(kit);
    play(new GameSession({ deck: kit, opponents: 1, bot: 'ai', seed: Math.floor(Math.random() * 1_000_000), coaching: true }));
  };

  /**
   * Signed in with a saved deck, the game runs on the server (so it earns
   * rewards); a random opponent or a chosen seed is a local practice game.
   */
  const rewarded = account.kind === 'ready' && !!savedDeck && bot === 'ai' && seed.trim() === '';
  const start = () => {
    if (rewarded && savedDeck) {
      setHostError(null);
      const h = hostBotGame({ format, deckId: savedDeck.id, bots: opponents, coaching: tips });
      setHosting(h);
      h.game.then(
        (game) => {
          setHosting(null);
          setHosted(game);
        },
        (e: Error) => {
          setHosting(null);
          setHostError(e.message);
        },
      );
      return;
    }
    const chosenSeed = seed.trim() === '' ? Math.floor(Math.random() * 1_000_000) : Number(seed);
    play(
      new GameSession({
        format,
        deck,
        precon,
        ...(ownDeck ? { ownDeck } : {}),
        opponents,
        bot,
        seed: Number.isFinite(chosenSeed) ? chosenSeed : 1,
        coaching: tips,
      }),
    );
  };

  const name = account.kind === 'ready' ? account.account.name : null;

  if (hosted) {
    return (
      <GameLoading
        session={hosted}
        title={format === 'commander' ? 'Commander against the computer' : '60-card game against the computer'}
        minMs={1200}
        onReady={() => {
          const game = hosted;
          setHosted(null);
          play(game);
        }}
      />
    );
  }
  if (hosting) {
    return <LoadingScreen title="Setting up your game" steps={[{ label: 'Connecting to the game server', state: 'working' }, { label: 'Shuffling your deck', state: 'waiting' }]} />;
  }

  return (
    <div className="app-shell">
      <StarterPick />
      <Tour />
      <RewardToast />
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
            <PageTitle title="Play" subtitle="Against the computer, a friend online, or a booster draft" art={route.play === 'online' ? 'playFriends' : route.play === 'draft' ? 'draft' : 'playComputer'} />
            <SubTabs
              value={route.play}
              options={[
                ['ai', 'Vs. computer'],
                ['online', 'Online'],
                ['draft', 'Draft'],
              ]}
              onChange={(play) => go({ play })}
            />
            {route.play === 'online' && <OnlinePlay onStart={play} onBuild={() => go({ page: 'decks' })} />}
            {route.play === 'draft' && <DraftPlay onPlay={play} />}
            {route.play === 'ai' && (
              <div className="play-setup">
                <section className="new-player">
                  <h2>New to Magic?</h2>
                  <p>
                    <button className="link" onClick={learn}>Start the lesson</button>
                    {onboarding && !onboarding.lesson ? ' first: it teaches the rules in one short game.' : ' again, or try a ready-made Starter Kit against the computer, with tips:'}
                  </p>
                  <div className="deck-choices">
                    {DECKS.map((d) => (
                      <button key={d.id} className="deck" onClick={() => tryStarterKit(d.id)}>
                        <img src={SCRYFALL[d.art]?.image.artCrop} alt="" />
                        <span className="deck-name">Try {d.name}</span>
                        <span className="deck-blurb">{d.blurb}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <h2>Format</h2>
                <div className="format-choices">
                  <button className={format === 'constructed' ? 'chosen' : ''} onClick={() => (setFormat('constructed'), setOwnDeck(null), setSavedDeck(null))}>
                    60-card decks <span>Decks you built · 20 life</span>
                  </button>
                  <button className={format === 'commander' ? 'chosen' : ''} onClick={() => (setFormat('commander'), setOwnDeck(null), setSavedDeck(null))}>
                    Commander <span>Your 100-card decks · 40 life</span>
                  </button>
                </div>

                <h2>Your deck</h2>
                <OwnCommanderDecks key={format} format={format} onChoose={(d, saved) => (setOwnDeck(d), setSavedDeck(saved))} onBuild={() => go({ page: 'decks' })} />
                {format === 'commander' && (
                  <p className="fineprint">
                    Commander rules: 40 life, your commander starts in the command zone (it costs <ManaText text="{2}" size={14} /> more each time you cast it from there), and 21 combat
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
                  disabled={!ownDeck}
                  title={!ownDeck ? `Choose one of your ${format === 'commander' ? 'Commander' : '60-card'} decks first` : undefined}
                  onClick={start}
                >
                  Start game
                </button>
                {hostError && <p className="account-error">{hostError}</p>}
                <p className="fineprint">
                  {rewarded
                    ? 'Played on the game server: you earn Aether Shards for finishing it, more for winning, and it counts for your quests.'
                    : account.kind === 'ready' && savedDeck
                      ? 'A practice game (random opponent or a chosen seed): no rewards.'
                      : null}{' '}
                  Card images courtesy of Scryfall.
                </p>
              </div>
            )}
          </>
        )}

        {route.page === 'collection' && (
          <>
            <PageTitle title="Collection" subtitle="Every card you own, by set" art="collection" />
            <PacksTab section="collection" />
          </>
        )}

        {route.page === 'decks' && (
          <>
            <PageTitle title="Decks" subtitle="Build decks from the cards you own" art="decks" />
            <PacksTab section="decks" />
          </>
        )}

        {route.page === 'craft' && (
          <>
            <PageTitle title="Craft" subtitle="Dismantle cards for fragments, and craft the cards you want" art="craft" />
            <CraftTab />
          </>
        )}

        {route.page === 'shop' && (
          <>
            <PageTitle title="Shop" subtitle="Booster packs and exclusive printings" art={route.shop === 'store' ? 'store' : 'packs'} />
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

        {route.page === 'credits' && <CreditsPage />}
      </main>
      <LegalFooter onCredits={() => go({ page: 'credits' })} />
    </div>
  );
}

/** Draft: an online event (host or join, players and bots, a chosen set) or a practice draft in this browser. */
function DraftPlay({ onPlay }: { onPlay: (s: GameSession) => void }) {
  const [kind, setKind] = useState<'event' | 'practice'>('event');
  const [, rerender] = useState(0);
  useEffect(() => eventLink.subscribe(() => rerender((n) => n + 1)), []);
  return (
    <div className="play-setup">
      {!eventLink.active && (
        <div className="format-choices">
          <button className={kind === 'event' ? 'chosen' : ''} onClick={() => setKind('event')}>
            Draft event <span>Online · host or join · players and bots</span>
          </button>
          <button className={kind === 'practice' ? 'chosen' : ''} onClick={() => setKind('practice')}>
            Practice draft <span>Offline · AI drafters · nothing kept</span>
          </button>
        </div>
      )}
      {kind === 'event' || eventLink.active ? <EventPage onPlay={onPlay} /> : <DraftTab onPlay={onPlay} />}
    </div>
  );
}

/**
 * Online: a table (host or join, players and bots) for Commander or your own
 * 60-card decks. Booster drafts are the Draft tab; the Starter Kits are only
 * for new players' practice against the computer (user rule 2026-11-04).
 */
function OnlinePlay({ onStart, onBuild }: { onStart: (s: GameSession) => void; onBuild: () => void }) {
  const [kind, setKind] = useState<'commander' | 'constructed'>('commander');
  return (
    <div className="play-setup online-play">
      <h2>Format</h2>
      <div className="format-choices">
        <button className={kind === 'commander' ? 'chosen' : ''} onClick={() => setKind('commander')}>
          Commander <span>2-4 seats · players and bots · your Commander decks</span>
        </button>
        <button className={kind === 'constructed' ? 'chosen' : ''} onClick={() => setKind('constructed')}>
          60-card decks <span>2-4 seats · players and bots · decks you built</span>
        </button>
      </div>
      <p className="fineprint">Looking for a booster draft? It's the Draft tab.</p>
      <TableMenu key={kind} format={kind} onStart={onStart} onBuild={onBuild} />
    </div>
  );
}

/** A page's heading, with its menu art (from any Magic card, scripts/ui-art.ts) behind it. */
function PageTitle({ title, subtitle, art }: { title: string; subtitle: string; art?: UiArtKey }) {
  const a = art ? UI_ART[art] : undefined;
  return (
    <div className={`page-title ${a ? 'with-art' : ''}`}>
      {a && <img className="page-title-art" src={a.artCrop} alt="" title={`${a.name}, art by ${a.artist}`} onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />}
      <div className="page-title-text">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
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

const TILES: { title: string; text: string; art: UiArtKey; to: Partial<Route> }[] = [
  { title: 'Play the computer', text: 'Your 60-card or Commander decks, 1 to 3 opponents. Earns Aether Shards.', art: 'playComputer', to: { page: 'play', play: 'ai' } },
  { title: 'Play friends', text: 'Host or join a Commander or 60-card table, with bots in any empty seats.', art: 'playFriends', to: { page: 'play', play: 'online' } },
  { title: 'Booster draft', text: 'Host or join a draft: pick the set, then players and bots.', art: 'draft', to: { page: 'play', play: 'draft' } },
  { title: 'Open packs', text: 'Play and Collector Boosters, kept in your collection.', art: 'packs', to: { page: 'shop', shop: 'packs' } },
  { title: 'Your collection', text: 'Every card you own, with its finishes.', art: 'collection', to: { page: 'collection' } },
  { title: 'Your decks', text: 'Build and edit decks from your cards.', art: 'decks', to: { page: 'decks' } },
  { title: 'Craft', text: 'Dismantle spare cards for fragments and craft the ones you want.', art: 'craft', to: { page: 'craft' } },
  { title: 'Store', text: 'Precons, Secret Lairs and Store-only printings.', art: 'store', to: { page: 'shop', shop: 'store' } },
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
      <Quests />
      <div className="home-tiles">
        {TILES.map((t) => (
          <button key={t.title} className="home-tile" onClick={() => go(t.to)}>
            <img src={UI_ART[t.art].artCrop} alt="" title={`${UI_ART[t.art].name}, art by ${UI_ART[t.art].artist}`} loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
            <span className="home-tile-title">{t.title}</span>
            <span className="home-tile-text">{t.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

