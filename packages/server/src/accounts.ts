// Player accounts (economy step E1). Players sign in with Discord through
// Supabase Auth in the browser and send their access token; the server checks
// it with Supabase and keeps balances in the database (supabase/migrations/20261029000000_accounts.sql).
// The server is the only writer: the browser never sends a balance or amount.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { ECONOMY, loginRef } from './economy.ts';
import { MAX_DECKS, addCards, type DeckInput, type OwnedCard, type SavedDeck } from './collection.ts';
import { NO_FRAGMENTS, type FragmentRarity, type Fragments } from '@nexus/cards/crafting';

export interface AccountUser {
  id: string;
  name: string;
  /** The player's Discord profile picture (only Discord's own image server), if they have one. */
  avatar?: string;
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
  /**
   * Adds shards (or takes them, with a negative amount) once per (kind, ref):
   * a repeat changes nothing. Throws if the balance would go below zero.
   */
  applyShards(userId: string, amount: number, kind: ShardKind, ref: string): Promise<{ balance: number; applied: boolean }>;
  decks(userId: string): Promise<SavedDeck[]>;
  /** Saves a new deck, or changes one of the player's own (by id); null if that deck isn't theirs or they have too many. */
  saveDeck(userId: string, deck: DeckInput): Promise<SavedDeck | null>;
  /** True if the player had that deck. */
  deleteDeck(userId: string, id: string): Promise<boolean>;
  /** Which first-time help the player has finished. */
  onboarding(userId: string): Promise<Onboarding>;
  /** Records a finished step; returns the new state. */
  finishOnboarding(userId: string, step: OnboardingStep): Promise<Onboarding>;
  /** The player's fragment balances. */
  fragments(userId: string): Promise<Fragments>;
  /**
   * Removes one copy and adds its fragments, in one step, once per `ref`
   * (a repeat returns the balances and changes nothing). Throws a
   * CraftingError ('not_owned', 'last_copy') and changes nothing if it can't.
   */
  dismantle(userId: string, request: DismantleRequest): Promise<{ fragments: Fragments; applied: boolean }>;
  /** Spends the fragments and adds one non-foil copy, in one step, once per `ref`; CraftingError 'not_enough' otherwise. */
  craft(userId: string, request: CraftRequest): Promise<{ fragments: Fragments; applied: boolean }>;
  /** Records a finished game for a player; false if it was already recorded (then nothing is paid again). */
  recordMatch(userId: string, match: MatchResult): Promise<boolean>;
  /** The player's recorded games since a time (only wins with `won`). */
  matchCount(userId: string, since: Date, won?: boolean): Promise<number>;
}

/** What the server has already checked and worked out for a dismantle (from the card data and the economy settings). */
export interface DismantleRequest {
  ref: string;
  card: string;
  finish: OwnedCard['finish'];
  rarity: FragmentRarity;
  amount: number;
  /** Every printing id of the card, for the last-copy rule. */
  named: string[];
  protectLast: boolean;
}

export interface CraftRequest {
  ref: string;
  card: string;
  rarity: FragmentRarity;
  cost: number;
}

/** Why a dismantle or craft was refused; nothing changed. */
export class CraftingError extends Error {
  readonly code: 'not_owned' | 'last_copy' | 'not_enough';
  constructor(code: CraftingError['code']) {
    super(code);
    this.code = code;
  }
}

/** Balances from the database's {"common": n, ...}, every rarity present. */
const toFragments = (raw: unknown): Fragments => {
  const out = { ...NO_FRAGMENTS };
  if (raw && typeof raw === 'object') for (const r of Object.keys(out) as FragmentRarity[]) out[r] = Number((raw as Record<string, unknown>)[r] ?? 0) || 0;
  return out;
};

/** A CraftingError for the database function's refusal, or the error itself. */
const craftingFailure = (message: string | undefined): Error => {
  for (const code of ['not_owned', 'last_copy', 'not_enough'] as const) if (message?.includes(code)) return new CraftingError(code);
  return new Error(`Could not change the fragments: ${message ?? 'no data'}`);
};

/** Only the known steps, as booleans (a stored value is never trusted as is). */
function cleanOnboarding(raw: unknown): Onboarding {
  const out: Onboarding = {};
  if (raw && typeof raw === 'object') for (const step of ONBOARDING_STEPS) if ((raw as Record<string, unknown>)[step] === true) out[step] = true;
  return out;
}

/** First-time help the player has finished: the menu tour and the "Learn to play" lesson. */
export const ONBOARDING_STEPS = ['tour', 'lesson'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
export type Onboarding = Partial<Record<OnboardingStep, boolean>>;

/** Shard changes the game server makes on its own (draft entries and prizes); purchases go through grantCards. */
export type ShardKind = 'event_entry' | 'event_prize' | 'match_reward' | 'quest_reward' | 'milestone_reward';

/** A finished game the server ran, for one player. */
export interface MatchResult {
  /** The game's own id (unique per game). */
  ref: string;
  kind: 'bot' | 'friend' | 'draft';
  won: boolean;
}

export interface CardGrant {
  kind: 'pack_open' | 'draft' | 'starter_precon' | 'store_purchase' | 'admin_adjustment';
  ref: string;
  cost: number;
  cards: OwnedCard[];
}

type DeckRow = { id: string; name: string; format: SavedDeck['format']; cards: SavedDeck['cards']; basics: SavedDeck['basics']; commander: string | null; partner?: string | null; updated_at: string };
const fromRow = (r: DeckRow): SavedDeck => ({ id: r.id, name: r.name, format: r.format, cards: r.cards, basics: r.basics, commander: r.commander, partner: r.partner ?? null, updatedAt: r.updated_at });

/** A display name from Discord's profile data, trimmed to something sensible. */
export function displayName(meta: Record<string, unknown> | undefined, fallback: string): string {
  const raw = [meta?.['custom_claims'] && (meta['custom_claims'] as Record<string, unknown>)['global_name'], meta?.['full_name'], meta?.['name'], meta?.['user_name']].find(
    (v): v is string => typeof v === 'string' && v.trim() !== '',
  );
  return (raw ?? fallback).trim().slice(0, 32);
}

/**
 * The player's Discord profile picture from their sign-in, if it's on
 * Discord's image server (anything else is ignored, so a page never loads an
 * image from an address a player chose).
 */
export function discordAvatar(meta: Record<string, unknown> | undefined): string | undefined {
  const raw = [meta?.['avatar_url'], meta?.['picture']].find((v): v is string => typeof v === 'string');
  if (!raw || raw.length > 300) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && url.hostname === 'cdn.discordapp.com' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Rows per collection request (Supabase's default maximum is 1,000). */
const COLLECTION_PAGE = 1000;

/** The real store: Supabase, with the service role key (server only). */
export class SupabaseAccounts implements AccountService {
  private readonly db: SupabaseClient;
  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async verify(token: string): Promise<AccountUser | null> {
    const { data, error } = await this.db.auth.getUser(token);
    if (error || !data.user) return null;
    const avatar = discordAvatar(data.user.user_metadata);
    return { id: data.user.id, name: displayName(data.user.user_metadata, 'Player'), ...(avatar ? { avatar } : {}) };
  }

  async ensure(user: AccountUser): Promise<Account> {
    const { data, error } = await this.db.rpc('ensure_profile', { p_user: user.id, p_name: user.name, p_welcome: ECONOMY.welcomeGrant }).single<{ display_name: string; shards: number }>();
    if (error || !data) throw new Error(`Could not load the account: ${error?.message ?? 'no data'}`);
    // The welcome bonus (once per account) and today's login reward (once per day); repeats change nothing.
    let shards = data.shards;
    for (const [amount, kind, ref] of [
      [ECONOMY.welcomeBonus, 'welcome_grant', 'welcome-bonus'],
      [ECONOMY.dailyLoginReward, 'login_reward', loginRef()],
    ] as const) {
      const paid = await this.db.rpc('apply_shards', { p_user: user.id, p_amount: amount, p_kind: kind, p_ref: ref }).single<{ balance: number }>();
      if (paid.error || !paid.data) throw new Error(`Could not pay the ${kind}: ${paid.error?.message ?? 'no data'}`);
      shards = paid.data.balance;
    }
    return { name: data.display_name, shards };
  }

  async collection(userId: string): Promise<OwnedCard[]> {
    // Supabase answers at most 1,000 rows per request: read the collection page by page (in a stable order).
    const out: OwnedCard[] = [];
    for (let from = 0; ; from += COLLECTION_PAGE) {
      const { data, error } = await this.db
        .from('owned_cards')
        .select('scryfall_id, finish, count')
        .eq('user_id', userId)
        .order('scryfall_id')
        .order('finish')
        .range(from, from + COLLECTION_PAGE - 1);
      if (error) throw new Error(`Could not load the collection: ${error.message}`);
      out.push(...data.map((r) => ({ id: r.scryfall_id as string, finish: r.finish as OwnedCard['finish'], count: r.count as number })));
      if (data.length < COLLECTION_PAGE) return out;
    }
  }

  async grantCards(userId: string, grant: CardGrant): Promise<{ balance: number; applied: boolean }> {
    const { data, error } = await this.db
      .rpc('grant_cards', { p_user: userId, p_kind: grant.kind, p_ref: grant.ref, p_cost: grant.cost, p_cards: grant.cards })
      .single<{ balance: number; applied: boolean }>();
    if (error || !data) throw new Error(`Could not add the cards: ${error?.message ?? 'no data'}`);
    return data;
  }

  async applyShards(userId: string, amount: number, kind: ShardKind, ref: string): Promise<{ balance: number; applied: boolean }> {
    const { data, error } = await this.db.rpc('apply_shards', { p_user: userId, p_amount: amount, p_kind: kind, p_ref: ref }).single<{ balance: number; applied: boolean }>();
    if (error || !data) throw new Error(`Could not change the shards: ${error?.message ?? 'no data'}`);
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
    const row = { name: deck.name, format: deck.format, cards: deck.cards, basics: deck.basics, commander: deck.commander ?? null, partner: deck.partner ?? null, updated_at: new Date().toISOString() };
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

  async onboarding(userId: string): Promise<Onboarding> {
    const { data, error } = await this.db.from('profiles').select('onboarding').eq('id', userId).maybeSingle<{ onboarding: unknown }>();
    if (error) throw new Error(`Could not load the account: ${error.message}`);
    return cleanOnboarding(data?.onboarding);
  }

  async finishOnboarding(userId: string, step: OnboardingStep): Promise<Onboarding> {
    const next = { ...(await this.onboarding(userId)), [step]: true };
    const { error } = await this.db.from('profiles').update({ onboarding: next }).eq('id', userId);
    if (error) throw new Error(`Could not save the account: ${error.message}`);
    return next;
  }

  async recordMatch(userId: string, match: MatchResult): Promise<boolean> {
    const { data, error } = await this.db
      .from('match_results')
      .upsert({ user_id: userId, ref: match.ref, kind: match.kind, won: match.won }, { onConflict: 'user_id,ref', ignoreDuplicates: true })
      .select('ref');
    if (error) throw new Error(`Could not record the game: ${error.message}`);
    return (data ?? []).length > 0;
  }

  async matchCount(userId: string, since: Date, won?: boolean): Promise<number> {
    let q = this.db.from('match_results').select('ref', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since.toISOString());
    if (won) q = q.eq('won', true);
    const { count, error } = await q;
    if (error) throw new Error(`Could not count games: ${error.message}`);
    return count ?? 0;
  }

  async fragments(userId: string): Promise<Fragments> {
    const { data, error } = await this.db.from('fragment_balances').select('rarity, amount').eq('user_id', userId);
    if (error) throw new Error(`Could not load the fragments: ${error.message}`);
    return toFragments(Object.fromEntries(data.map((r) => [r.rarity, r.amount])));
  }

  async dismantle(userId: string, q: DismantleRequest): Promise<{ fragments: Fragments; applied: boolean }> {
    const { data, error } = await this.db
      .rpc('dismantle_card', { p_user: userId, p_ref: q.ref, p_card: q.card, p_finish: q.finish, p_rarity: q.rarity, p_amount: q.amount, p_named: q.named, p_protect_last: q.protectLast })
      .single<{ fragments: unknown; applied: boolean }>();
    if (error || !data) throw craftingFailure(error?.message);
    return { fragments: toFragments(data.fragments), applied: data.applied };
  }

  async craft(userId: string, q: CraftRequest): Promise<{ fragments: Fragments; applied: boolean }> {
    const { data, error } = await this.db
      .rpc('craft_card', { p_user: userId, p_ref: q.ref, p_card: q.card, p_rarity: q.rarity, p_cost: q.cost })
      .single<{ fragments: unknown; applied: boolean }>();
    if (error || !data) throw craftingFailure(error?.message);
    return { fragments: toFragments(data.fragments), applied: data.applied };
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
  readonly onboarded = new Map<string, Onboarding>();
  readonly fragmentBalances = new Map<string, Fragments>();
  readonly fragmentLedger = new Set<string>();
  readonly matches = new Map<string, (MatchResult & { at: Date })[]>();
  /** For tests: the time the next recorded games get (default now). */
  now = () => new Date();

  async verify(token: string): Promise<AccountUser | null> {
    return this.tokens.get(token) ?? null;
  }

  async ensure(user: AccountUser): Promise<Account> {
    if (!this.accounts.has(user.id)) this.accounts.set(user.id, { name: user.name, shards: 0 });
    this.apply(user.id, ECONOMY.welcomeGrant, 'welcome_grant', 'welcome');
    this.apply(user.id, ECONOMY.welcomeBonus, 'welcome_grant', 'welcome-bonus');
    this.apply(user.id, ECONOMY.dailyLoginReward, 'login_reward', loginRef());
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
    if (grant.cost > 0) this.apply(userId, -grant.cost, grant.kind === 'store_purchase' ? 'store_purchase' : 'pack_purchase', grant.ref);
    this.grants.add(key);
    if (!this.owned.has(userId)) this.owned.set(userId, []);
    addCards(this.owned.get(userId)!, grant.cards);
    return { balance: account.shards, applied: true };
  }

  async applyShards(userId: string, amount: number, kind: ShardKind, ref: string): Promise<{ balance: number; applied: boolean }> {
    return this.apply(userId, amount, kind, ref);
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
    const saved: SavedDeck = { id: deck.id ?? randomUUID(), name: deck.name, format: deck.format, cards: deck.cards, basics: deck.basics, commander: deck.commander ?? null, partner: deck.partner ?? null, updatedAt: new Date().toISOString() };
    const at = list.findIndex((d) => d.id === deck.id);
    if (deck.id && at < 0) return null;
    if (at >= 0) list[at] = saved;
    else if (list.length >= MAX_DECKS) return null;
    else list.unshift(saved);
    return structuredClone(saved);
  }

  async onboarding(userId: string): Promise<Onboarding> {
    return { ...(this.onboarded.get(userId) ?? {}) };
  }

  async finishOnboarding(userId: string, step: OnboardingStep): Promise<Onboarding> {
    const next = { ...(this.onboarded.get(userId) ?? {}), [step]: true };
    this.onboarded.set(userId, next);
    return { ...next };
  }

  async fragments(userId: string): Promise<Fragments> {
    return { ...(this.fragmentBalances.get(userId) ?? NO_FRAGMENTS) };
  }

  async recordMatch(userId: string, match: MatchResult): Promise<boolean> {
    const list = this.matches.get(userId) ?? [];
    if (list.some((m) => m.ref === match.ref)) return false;
    list.push({ ...match, at: this.now() });
    this.matches.set(userId, list);
    return true;
  }

  async matchCount(userId: string, since: Date, won?: boolean): Promise<number> {
    return (this.matches.get(userId) ?? []).filter((m) => m.at >= since && (!won || m.won)).length;
  }

  /** Like dismantle_card: checks everything first, then changes cards and fragments together. */
  async dismantle(userId: string, q: DismantleRequest): Promise<{ fragments: Fragments; applied: boolean }> {
    if (!this.accounts.has(userId)) throw new Error(`no profile for ${userId}`);
    const key = `${userId}|dismantle|${q.ref}`;
    if (this.fragmentLedger.has(key)) return { fragments: await this.fragments(userId), applied: false };
    if (q.amount <= 0) throw new Error('bad amount');
    const cards = this.owned.get(userId) ?? [];
    const row = cards.find((c) => c.id === q.card && c.finish === q.finish);
    if (!row || row.count < 1) throw new CraftingError('not_owned');
    if (q.protectLast && cards.filter((c) => q.named.includes(c.id)).reduce((n, c) => n + c.count, 0) <= 1) throw new CraftingError('last_copy');
    row.count -= 1;
    if (row.count === 0) cards.splice(cards.indexOf(row), 1);
    const balances = { ...(this.fragmentBalances.get(userId) ?? NO_FRAGMENTS) };
    balances[q.rarity] += q.amount;
    this.fragmentBalances.set(userId, balances);
    this.fragmentLedger.add(key);
    return { fragments: { ...balances }, applied: true };
  }

  /** Like craft_card. */
  async craft(userId: string, q: CraftRequest): Promise<{ fragments: Fragments; applied: boolean }> {
    if (!this.accounts.has(userId)) throw new Error(`no profile for ${userId}`);
    const key = `${userId}|craft|${q.ref}`;
    if (this.fragmentLedger.has(key)) return { fragments: await this.fragments(userId), applied: false };
    if (q.cost <= 0) throw new Error('bad amount');
    const balances = { ...(this.fragmentBalances.get(userId) ?? NO_FRAGMENTS) };
    if (balances[q.rarity] < q.cost) throw new CraftingError('not_enough');
    balances[q.rarity] -= q.cost;
    if (!this.owned.has(userId)) this.owned.set(userId, []);
    addCards(this.owned.get(userId)!, [{ id: q.card, finish: 'nonfoil', count: 1 }]);
    this.fragmentBalances.set(userId, balances);
    this.fragmentLedger.add(key);
    return { fragments: { ...balances }, applied: true };
  }

  async deleteDeck(userId: string, id: string): Promise<boolean> {
    const list = this.savedDecks.get(userId) ?? [];
    const at = list.findIndex((d) => d.id === id);
    if (at >= 0) list.splice(at, 1);
    return at >= 0;
  }
}
