// Build-time validation of card JSON (PRD 10). Catches typos and unsupported
// combinations before a card ever reaches the engine.

import {
  CARD_TYPES,
  EFFECT_KINDS,
  KEYWORDS,
  MANA_TYPES,
  SUPERTYPES,
  TARGET_KINDS,
  parseManaCost,
  type CardDefinition,
} from '@nexus/engine';

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PLAYER_ONLY_EFFECTS = new Set(['DrawCards', 'GainLife']);
const CREATURE_ONLY_EFFECTS = new Set(['Destroy']);
const PLAYER_TARGETS = new Set(['You', 'EachOpponent', 'EachPlayer', 'TargetPlayer']);

function isNonNegativeInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0;
}

/** Returns a list of problems with one card. Empty means valid. */
export function validateCardDefinition(raw: unknown): string[] {
  const errors: string[] = [];
  if (typeof raw !== 'object' || raw === null) return ['Card must be an object.'];
  const c = raw as Partial<CardDefinition>;
  const label = typeof c.id === 'string' ? c.id : '(no id)';
  const err = (msg: string) => errors.push(`${label}: ${msg}`);

  if (typeof c.id !== 'string' || !ID_PATTERN.test(c.id)) err('id must be lowercase-kebab-case.');
  if (typeof c.name !== 'string' || c.name.trim() === '') err('name is required.');
  if (!Array.isArray(c.types) || c.types.length === 0 || c.types.some((t) => !CARD_TYPES.includes(t))) {
    err(`types must be a non-empty list drawn from ${CARD_TYPES.join(', ')}.`);
    return errors;
  }
  for (const st of c.supertypes ?? []) if (!SUPERTYPES.includes(st)) err(`unknown supertype "${st}".`);
  for (const k of c.keywords ?? []) if (!KEYWORDS.includes(k)) err(`unknown keyword "${k}".`);
  for (const m of c.produces ?? []) if (!MANA_TYPES.includes(m)) err(`unknown mana type "${m}".`);

  const isLand = c.types.includes('land');
  const isSpell = c.types.includes('instant') || c.types.includes('sorcery');
  if (isLand && c.manaCost !== undefined) err('lands have no mana cost.');
  if (!isLand && c.manaCost === undefined) err('nonland cards need a manaCost (use "{0}" for free).');
  if (c.manaCost !== undefined) {
    try {
      parseManaCost(c.manaCost);
    } catch (e) {
      err((e as Error).message);
    }
  }
  if (c.types.includes('creature') && (!isNonNegativeInt(c.power) || !isNonNegativeInt(c.toughness))) {
    err('creatures need non-negative integer power and toughness.');
  }
  if (isSpell && !c.effects?.length) err('instants and sorceries need at least one effect.');
  if (!isSpell && c.effects?.length) err('permanent abilities are not supported yet; only spells have effects.');

  for (const e of c.effects ?? []) {
    if (!EFFECT_KINDS.includes(e.effect)) err(`unknown effect "${e.effect}".`);
    if (!TARGET_KINDS.includes(e.target)) err(`unknown target "${e.target}".`);
    if (e.effect !== 'Destroy' && (!isNonNegativeInt(e.amount) || e.amount === 0)) {
      err(`${e.effect} needs a positive integer amount.`);
    }
    if (PLAYER_ONLY_EFFECTS.has(e.effect) && !PLAYER_TARGETS.has(e.target)) err(`${e.effect} can only affect players.`);
    if (CREATURE_ONLY_EFFECTS.has(e.effect) && e.target !== 'TargetCreature' && e.target !== 'OpponentCreature') {
      err(`${e.effect} needs a creature target.`);
    }
  }
  return errors;
}

/** Validates a whole card list, including duplicate ids. */
export function validateCardList(cards: readonly unknown[]): string[] {
  const errors = cards.flatMap(validateCardDefinition);
  const seen = new Set<string>();
  for (const c of cards) {
    const id = (c as { id?: unknown }).id;
    if (typeof id !== 'string') continue;
    if (seen.has(id)) errors.push(`${id}: duplicate id.`);
    seen.add(id);
  }
  return errors;
}
