// Player accounts (economy step E1). Players sign in with Discord through
// Supabase Auth in the browser and send their access token; the server checks
// it with Supabase and keeps balances in the database (supabase/migrations/20261029000000_accounts.sql).
// The server is the only writer: the browser never sends a balance or amount.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { ECONOMY } from './economy.ts';
import { MAX_DECKS, addCards, type DeckInput, type OwnedCard, type SavedDeck } from './collection.ts';

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
  /** The cards the player owns. */
  collection(userId: string): Promise<OwnedCard[]>;
  /**
   * Adds cards to the collection once per (kind, ref), paying `cost` shards in
   * the same step (nothing changes if the player can't afford it).
   */
  grantCards(userId: string, grant: CardGrant): Promise<{ balance: number; applied: boolean }>;
  /** Whether that grant has happened (the free starter precon, say). */
  hasGrant(userId: string, kind: CardGrant['kind'], ref: string): Promise<boolean>;
  decks(userId: string): Promise<SavedDeck[]>;
  /** Saves a new deck, or changes one of the player's own (by id); null if that deck isn't theirs or they have too many. */
  saveDeck(userId: string, deck: DeckInput): Promise<SavedDeck | null>;
  /** True if the player had that deck. */
  deleteDeck(userId: string, id: string): Promise<boolean>;
}

export interface CardGrant {
  kind: 'pack_open' | 'draft' | 'starter_precon' | 'admin_adjustment';
  ref: string;
  cost: number;
  cards: OwnedCard[];
}

type DeckRow = { id: string; name: string; format: SavedDeck['format']; cards: SavedDeck['cards']; basics: SavedDeck['basics']; commander: string | null; updated_at: string };
const fromRow = (r: DeckRow): SavedDeck => ({ id: r.id, name: r.name, format: r.format, cards: r.cards, basics: r.basics, commander: r.commander, updatedAt: r.updated_at });

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

  async collection(userId: string): Promise<OwnedCard[]> {
    const { data, error } = await this.db.from('owned_cards').select('scryfall_id, finish, count').eq('user_id', userId);
    if (error) throw new Error(`Could not load the collection: ${error.message}`);
    return data.map((r) => ({ id: r.scryfall_id as string, finish: r.finish as OwnedCard['finish'], count: r.count as number }));
  }

  async grantCards(userId: string, grant: CardGrant): Promise<{ balance: number; applied: boolean }> {
    const { data, error } = await this.db
      .rpc('grant_cards', { p_user: userId, p_kind: grant.kind, p_ref: grant.ref, p_cost: grant.cost, p_cards: grant.cards })
      .single<{ balance: number; applied: boolean }>();
    if (error || !data) throw new Error(`Could not add the cards: ${error?.message ?? 'no data'}`);
    return data;
  }

  async hasGrant(userId: string, kind: CardGrant['kind'], ref: string): Promise<boolean> {
    const { count, error } = await this.db.from('card_grants').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('kind', kind).eq('ref', ref);
    if (error) throw new Error(`Could not check the account: ${error.message}`);
    return (count ?? 0) > 0;
  }

  async decks(userId: string): Promise<SavedDeck[]> {
    const { data, error } = await this.db.from('decks').select('*').eq('user_id', userId).order('updated_at', { ascending: false });
    if (error) throw new Error(`Could not load the decks: ${error.message}`);
    return (data as DeckRow[]).map(fromRow);
  }

  async saveDeck(userId: string, deck: DeckInput): Promise<SavedDeck | null> {
    const row = { name: deck.name, format: deck.format, cards: deck.cards, basics: deck.basics, commander: deck.commander ?? null, updated_at: new Date().toISOString() };
    if (deck.id) {
      const { data, error } = await this.db.from('decks').update(row).eq('id', deck.id).eq('user_id', userId).select('*');
      if (error) throw new Error(`Could not save the deck: ${error.message}`);
      return data.length ? fromRow(data[0] as DeckRow) : null;
    }
    const { count, error: countError } = await this.db.from('decks').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    if (countError) throw new Error(`Could not save the deck: ${countError.message}`);
    if ((count ?? 0) >= MAX_DECKS) return null;
    const { data, error } = await this.db.from('decks').insert({ ...row, user_id: userId }).select('*').single<DeckRow>();
    if (error || !data) throw new Error(`Could not save the deck: ${error?.message ?? 'no data'}`);
    return fromRow(data);
  }

  async deleteDeck(userId: string, id: string): Promise<boolean> {
    const { data, error } = await this.db.from('decks').delete().eq('id', id).eq('user_id', userId).select('id');
    if (error) throw new Error(`Could not delete the deck: ${error.message}`);
    return data.length > 0;
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
  readonly owned = new Map<string, OwnedCard[]>();
  readonly grants = new Set<string>();
  readonly savedDecks = new Map<string, SavedDeck[]>();

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

  async collection(userId: string): Promise<OwnedCard[]> {
    return (this.owned.get(userId) ?? []).map((c) => ({ ...c }));
  }

  async grantCards(userId: string, grant: CardGrant): Promise<{ balance: number; applied: boolean }> {
    const account = this.accounts.get(userId);
    if (!account) throw new Error(`no profile for ${userId}`);
    const key = `${userId}|${grant.kind}|${grant.ref}`;
    if (this.grants.has(key)) return { balance: account.shards, applied: false };
    if (grant.cost > 0) this.apply(userId, -grant.cost, 'pack_purchase', grant.ref);
    this.grants.add(key);
    if (!this.owned.has(userId)) this.owned.set(userId, []);
    addCards(this.owned.get(userId)!, grant.cards);
    return { balance: account.shards, applied: true };
  }

  async hasGrant(userId: string, kind: CardGrant['kind'], ref: string): Promise<boolean> {
    return this.grants.has(`${userId}|${kind}|${ref}`);
  }

  async decks(userId: string): Promise<SavedDeck[]> {
    return structuredClone(this.savedDecks.get(userId) ?? []);
  }

  async saveDeck(userId: string, deck: DeckInput): Promise<SavedDeck | null> {
    const list = this.savedDecks.get(userId) ?? [];
    this.savedDecks.set(userId, list);
    const saved: SavedDeck = { id: deck.id ?? randomUUID(), name: deck.name, format: deck.format, cards: deck.cards, basics: deck.basics, commander: deck.commander ?? null, updatedAt: new Date().toISOString() };
    const at = list.findIndex((d) => d.id === deck.id);
    if (deck.id && at < 0) return null;
    if (at >= 0) list[at] = saved;
    else if (list.length >= MAX_DECKS) return null;
    else list.unshift(saved);
    return structuredClone(saved);
  }

  async deleteDeck(userId: string, id: string): Promise<boolean> {
    const list = this.savedDecks.get(userId) ?? [];
    const at = list.findIndex((d) => d.id === id);
    if (at >= 0) list.splice(at, 1);
    return at >= 0;
  }
}
