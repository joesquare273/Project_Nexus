// Player accounts (economy step E1). Players sign in with Discord through
// Supabase Auth in the browser and send their access token; the server checks
// it with Supabase and keeps balances in the database (supabase/migrations/20261029000000_accounts.sql).
// The server is the only writer: the browser never sends a balance or amount.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ECONOMY } from './economy.ts';

export interface AccountUser {
  id: string;
  name: string;
}

export interface Account {
  name: string;
  shards: number;
}

/** What the server needs from the account store. */
export interface AccountService {
  /** The signed-in player for an access token, or null if the token isn't valid. */
  verify(token: string): Promise<AccountUser | null>;
  /** The player's account, created with the welcome grant the first time. */
  ensure(user: AccountUser): Promise<Account>;
}

/** A display name from Discord's profile data, trimmed to something sensible. */
export function displayName(meta: Record<string, unknown> | undefined, fallback: string): string {
  const raw = [meta?.['custom_claims'] && (meta['custom_claims'] as Record<string, unknown>)['global_name'], meta?.['full_name'], meta?.['name'], meta?.['user_name']].find(
    (v): v is string => typeof v === 'string' && v.trim() !== '',
  );
  return (raw ?? fallback).trim().slice(0, 32);
}

/** The real store: Supabase, with the service role key (server only). */
export class SupabaseAccounts implements AccountService {
  private readonly db: SupabaseClient;
  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async verify(token: string): Promise<AccountUser | null> {
    const { data, error } = await this.db.auth.getUser(token);
    if (error || !data.user) return null;
    return { id: data.user.id, name: displayName(data.user.user_metadata, 'Player') };
  }

  async ensure(user: AccountUser): Promise<Account> {
    const { data, error } = await this.db.rpc('ensure_profile', { p_user: user.id, p_name: user.name, p_welcome: ECONOMY.welcomeGrant }).single<{ display_name: string; shards: number }>();
    if (error || !data) throw new Error(`Could not load the account: ${error?.message ?? 'no data'}`);
    return { name: data.display_name, shards: data.shards };
  }
}

/** Accounts from the environment, or null when this server has none set up (guest play still works). */
export function accountsFromEnv(env: NodeJS.ProcessEnv = process.env): AccountService | null {
  const url = env['SUPABASE_URL'];
  const key = env['SUPABASE_SERVICE_ROLE_KEY'];
  return url && key ? new SupabaseAccounts(url, key) : null;
}

/**
 * An in-memory store with the same rules as the database (welcome grant
 * once, ledger references paid once, no negative balances). For tests only:
 * it forgets everything when the server stops.
 */
export class MemoryAccounts implements AccountService {
  readonly tokens = new Map<string, AccountUser>();
  readonly accounts = new Map<string, Account>();
  readonly ledger = new Map<string, { amount: number; balanceAfter: number }>();

  async verify(token: string): Promise<AccountUser | null> {
    return this.tokens.get(token) ?? null;
  }

  async ensure(user: AccountUser): Promise<Account> {
    if (!this.accounts.has(user.id)) this.accounts.set(user.id, { name: user.name, shards: 0 });
    this.apply(user.id, ECONOMY.welcomeGrant, 'welcome_grant', 'welcome');
    return { ...this.accounts.get(user.id)! };
  }

  /** Like the database's apply_shards: once per (user, kind, ref), never below zero. */
  apply(userId: string, amount: number, kind: string, ref: string): { balance: number; applied: boolean } {
    const account = this.accounts.get(userId);
    if (!account) throw new Error(`no profile for ${userId}`);
    const key = `${userId}|${kind}|${ref}`;
    if (this.ledger.has(key)) return { balance: account.shards, applied: false };
    if (account.shards + amount < 0) throw new Error(`insufficient shards: ${-amount} needed, ${account.shards} available`);
    account.shards += amount;
    this.ledger.set(key, { amount, balanceAfter: account.shards });
    return { balance: account.shards, applied: true };
  }
}
