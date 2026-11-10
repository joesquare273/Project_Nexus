// Signing in with Discord (Supabase Auth) is required to use the app: there
// are no guest accounts. The account bar shows your Aether Shards; the
// balance always comes from the game server (/api/account), which checks the
// sign-in with Supabase; the browser only displays it.

import { useEffect, useState } from 'react';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { UI_ART, type UiArtKey } from '@nexus/cards';

const url = import.meta.env['VITE_SUPABASE_URL'] as string | undefined;
const anonKey = import.meta.env['VITE_SUPABASE_ANON_KEY'] as string | undefined;
/** The browser's Supabase client (public anon key only), or null when accounts aren't set up. */
export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;

interface Account {
  name: string;
  shards: number;
}

/** The signed-in player's access token for the game server, or null. */
export async function accessToken(): Promise<string | null> {
  return (await supabase?.auth.getSession())?.data.session?.access_token ?? null;
}

/**
 * A token that's good for a while yet: refreshed first if it expires within
 * two minutes (a laptop that slept can come back with an expired one).
 * Used when rejoining a game after a dropped connection.
 */
export async function freshAccessToken(): Promise<string | null> {
  const session = (await supabase?.auth.getSession())?.data.session;
  if (!session) return null;
  if ((session.expires_at ?? 0) * 1000 - Date.now() > 120_000) return session.access_token;
  const refreshed = await supabase!.auth.refreshSession().catch(() => null);
  return refreshed?.data.session?.access_token ?? session.access_token;
}

/** Tells the account bar the server's new balance (after buying a pack, say). */
export function showShards(balance: number): void {
  window.dispatchEvent(new CustomEvent<number>('nexus:shards', { detail: balance }));
}

export type Status = { kind: 'loading' } | { kind: 'ready'; account: Account } | { kind: 'error'; message: string };

/** The current sign-in: `ready` once Supabase has said whether there is one. */
export function useSession(): { ready: boolean; session: Session | null } {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return { ready, session };
}

const signIn = () => supabase?.auth.signInWithOAuth({ provider: 'discord', options: { redirectTo: window.location.origin } });

const FEATURES: { title: string; text: string; art: UiArtKey }[] = [
  { title: 'Learn as you play', text: 'A guided first game teaches the rules step by step, with tips along the way.', art: 'learn' },
  { title: 'Play the computer or friends', text: 'Your 60-card and Commander decks against the AI or online; the Starter Kits for learning.', art: 'playComputer' },
  { title: 'Open packs and collect', text: 'Real Play and Collector Boosters, with every card kept on your account.', art: 'packs' },
  { title: 'Draft and build decks', text: 'Booster drafts for 2 to 4 players, and a deck builder for your own collection.', art: 'draft' },
];

/** The landing page, shown until you sign in. */
export function SignInPage() {
  return (
    <div className="landing">
      <header className="landing-hero">
        <div className="landing-mark" aria-hidden="true">✦</div>
        <h1>Project Nexus</h1>
        <p className="landing-tagline">Magic: The Gathering in your browser. Learn, collect, draft and play with friends.</p>
        <button className="primary big" onClick={signIn}>
          Sign in with Discord to play
        </button>
        <p className="fineprint">Free to play. Your cards, decks and Aether Shards are saved on your account.</p>
      </header>
      <section className="landing-features" aria-label="What you can do">
        {FEATURES.map((f) => (
          <article key={f.title} className="landing-feature">
            <img src={UI_ART[f.art].artCrop} alt="" title={`${UI_ART[f.art].name}, art by ${UI_ART[f.art].artist}`} loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
            <h2>{f.title}</h2>
            <p>{f.text}</p>
          </article>
        ))}
      </section>
      <p className="fineprint landing-foot">A personal, non-commercial project. Card images courtesy of Scryfall.</p>
    </div>
  );
}

/** Shown when this computer has no Supabase settings: sign-in can't work yet. */
export function AccountsSetupPage() {
  return (
    <div className="menu sign-in-page">
      <h1>Project Nexus</h1>
      <div className="sign-in-card">
        <h2>Accounts aren't set up on this computer</h2>
        <p>
          Copy <code>.env.example</code> to <code>.env</code> in the project folder, fill in the Supabase values, and restart <code>npm run dev</code> and{' '}
          <code>npm run server</code>. See HOW-TO-RUN.txt, section 1.
        </p>
      </div>
    </div>
  );
}

/** The Aether Shard icon (public/icons/aether-shard.png), or a plain diamond until it's there. */
export function ShardIcon({ size = 22 }: { size?: number }) {
  const [ok, setOk] = useState(true);
  if (!ok) return <span aria-hidden="true">◆</span>;
  return <img className="shard-icon" src="/icons/aether-shard.png" alt="" width={size} height={size} onError={() => setOk(false)} />;
}

/** The signed-in player's name and Aether Shards from the game server, kept up to date after purchases. */
export function useAccount(): Status {
  const { session } = useSession();
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const token = session?.access_token;
  useEffect(() => {
    if (!token) return;
    let stale = false;
    setStatus({ kind: 'loading' });
    fetch('/api/account', { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as Partial<Account> & { error?: string };
        if (stale) return;
        if (!res.ok || typeof body.shards !== 'number') setStatus({ kind: 'error', message: body.error ?? 'The game server could not load your account.' });
        else setStatus({ kind: 'ready', account: { name: body.name ?? 'Player', shards: body.shards } });
      })
      .catch(() => !stale && setStatus({ kind: 'error', message: 'Could not reach the game server. Is it running (npm run server)?' }));
    return () => {
      stale = true;
    };
  }, [token]);
  useEffect(() => {
    const update = (e: Event) => {
      const shards = (e as CustomEvent<number>).detail;
      setStatus((s) => (s.kind === 'ready' ? { kind: 'ready', account: { ...s.account, shards } } : s));
    };
    window.addEventListener('nexus:shards', update);
    return () => window.removeEventListener('nexus:shards', update);
  }, []);
  return status;
}

/** The top bar's account corner: shards, name, and a small menu (tour, sign out). */
export function AccountChip({ status }: { status: Status }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open]);
  return (
    <div className="account-chip" aria-live="polite">
      {status.kind === 'loading' && <span className="fineprint">Loading…</span>}
      {status.kind === 'error' && <span className="account-error" title={status.message}>Server offline</span>}
      {status.kind === 'ready' && (
        <span className="account-shards" title="Aether Shards">
          <ShardIcon size={18} /> {status.account.shards.toLocaleString()}
        </span>
      )}
      <button
        className="account-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
      >
        {status.kind === 'ready' ? status.account.name : 'Account'} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="account-menu" role="menu">
          <button role="menuitem" onClick={() => window.dispatchEvent(new Event('nexus:tour'))}>
            Replay the tour
          </button>
          <button role="menuitem" onClick={() => supabase!.auth.signOut()}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
