// Signing in with Discord (Supabase Auth) is required to use the app: there
// are no guest accounts. The account bar shows your Aether Shards; the
// balance always comes from the game server (/api/account), which checks the
// sign-in with Supabase; the browser only displays it.

import { useEffect, useState } from 'react';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env['VITE_SUPABASE_URL'] as string | undefined;
const anonKey = import.meta.env['VITE_SUPABASE_ANON_KEY'] as string | undefined;
/** The browser's Supabase client (public anon key only), or null when accounts aren't set up. */
export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;

interface Account {
  name: string;
  shards: number;
}

type Status = { kind: 'loading' } | { kind: 'ready'; account: Account } | { kind: 'error'; message: string };

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

/** The page shown until you sign in. */
export function SignInPage() {
  return (
    <div className="menu sign-in-page">
      <h1>Project Nexus</h1>
      <p className="tagline">Final Fantasy Magic with your friends</p>
      <div className="sign-in-card">
        <h2>Sign in</h2>
        <p>Sign in with your Discord account to play, draft, open packs and keep your Aether Shards.</p>
        <button className="primary big" onClick={signIn}>
          Sign in with Discord
        </button>
      </div>
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

export function AccountBar() {
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecked(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

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

  if (!supabase || !checked) return null;

  if (!session) return null;

  return (
    <div className="account-bar" aria-live="polite">
      {status.kind === 'loading' && <span className="fineprint">Loading your account…</span>}
      {status.kind === 'error' && <span className="account-error">{status.message}</span>}
      {status.kind === 'ready' && (
        <>
          <span className="account-name">{status.account.name}</span>
          <span className="account-shards" title="Aether Shards">
            <ShardIcon /> {status.account.shards.toLocaleString()} Aether Shards
          </span>
        </>
      )}
      <button onClick={() => supabase!.auth.signOut()}>Sign out</button>
    </div>
  );
}
