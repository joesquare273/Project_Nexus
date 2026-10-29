// Sign in with Discord (Supabase Auth) and show your Aether Shards. The
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

  if (!session) {
    return (
      <div className="account-bar">
        <button onClick={() => supabase!.auth.signInWithOAuth({ provider: 'discord', options: { redirectTo: window.location.origin } })}>Sign in with Discord</button>
      </div>
    );
  }

  return (
    <div className="account-bar" aria-live="polite">
      {status.kind === 'loading' && <span className="fineprint">Loading your account…</span>}
      {status.kind === 'error' && <span className="account-error">{status.message}</span>}
      {status.kind === 'ready' && (
        <>
          <span className="account-name">{status.account.name}</span>
          <span className="account-shards" title="Aether Shards">
            ◆ {status.account.shards.toLocaleString()} Aether Shards
          </span>
        </>
      )}
      <button onClick={() => supabase!.auth.signOut()}>Sign out</button>
    </div>
  );
}
