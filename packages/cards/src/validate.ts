// Build-time validation of card JSON (PRD 10). Catches typos and unsupported
// combinations before a card ever reaches the engine.

import {
  CARD_TYPES,
  EFFECT_KINDS,
  KEYWORDS,
  MANA_TYPES,
  SUPERTYPES,
  TARGET_KINDS,
  TRIGGER_EVENTS,
  parseManaCost,
  type CardDefinition,
  type EffectSpec,
  type TriggerSpec,
} from '@nexus/engine';

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const NO_AMOUNT_EFFECTS = new Set(['Destroy', 'Tap', 'ReturnToHand']);
const PLAYER_ONLY_EFFECTS = new Set(['DrawCards', 'GainLife', 'LoseLife']);
const CREATURE_ONLY_EFFECTS = new Set(['Destroy', 'Tap']);
const PLAYER_TARGETS = new Set(['You', 'EachOpponent', 'EachPlayer', 'TargetOpponent', 'TargetPlayer']);
const CREATURE_TARGETS = new Set(['TargetCreature', 'OpponentCreature', 'EachOpponentCreature']);

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
  if (!isSpell && c.effects?.length) err('permanents use triggers, not effects.');

  for (const e of c.effects ?? []) validateEffect(e, false, err);
  if (c.triggers !== undefined && !Array.isArray(c.triggers)) err('triggers must be a list.');
  for (const t of Array.isArray(c.triggers) ? c.triggers : []) validateTrigger(t, err);
  return errors;
}

function validateEffect(e: EffectSpec, inAbility: boolean, err: (msg: string) => void): void {
  if (!EFFECT_KINDS.includes(e.effect)) err(`unknown effect "${e.effect}".`);
  if (!TARGET_KINDS.includes(e.target)) err(`unknown target "${e.target}".`);
  if (!NO_AMOUNT_EFFECTS.has(e.effect) && (!isNonNegativeInt(e.amount) || e.amount === 0)) {
    err(`${e.effect} needs a positive integer amount.`);
  }
  if (PLAYER_ONLY_EFFECTS.has(e.effect) && !PLAYER_TARGETS.has(e.target)) err(`${e.effect} can only affect players.`);
  if (CREATURE_ONLY_EFFECTS.has(e.effect) && !CREATURE_TARGETS.has(e.target)) err(`${e.effect} needs a creature target.`);
  if (e.effect === 'ReturnToHand' && e.target !== 'This') err('ReturnToHand only supports "This" so far.');
  if (e.target === 'This' && !inAbility) err('"This" can only be used in triggered abilities.');
}

function validateTrigger(t: TriggerSpec, err: (msg: string) => void): void {
  if (!TRIGGER_EVENTS.includes(t.when)) err(`unknown trigger event "${t.when}".`);
  const label = `trigger "${t.when}"`;
  for (const type of [...(t.what?.types ?? []), ...(t.what?.nonTypes ?? [])]) {
    if (!CARD_TYPES.includes(type)) err(`${label}: unknown type "${type}".`);
  }
  if (t.what?.controller !== undefined && t.what.controller !== 'You' && t.what.controller !== 'Opponent') {
    err(`${label}: controller must be "You" or "Opponent".`);
  }
  if (t.when === 'SpellCast' && !t.what) err(`${label}: say which spells with "what".`);
  if (t.turn !== undefined && t.when !== 'BeginCombat' && t.when !== 'Upkeep') err(`${label}: "turn" is only for BeginCombat and Upkeep.`);
  if (t.zone !== undefined && t.zone !== 'battlefield' && t.zone !== 'graveyard') err(`${label}: unknown zone "${t.zone}".`);
  if (t.cost?.mana !== undefined) {
    try {
      parseManaCost(t.cost.mana);
    } catch (e) {
      err(`${label}: ${(e as Error).message}`);
    }
  }
  if (t.cost?.life !== undefined && (!isNonNegativeInt(t.cost.life) || t.cost.life === 0)) err(`${label}: life cost must be positive.`);
  if (!Array.isArray(t.effects) || t.effects.length === 0) {
    err(`${label}: needs at least one effect.`);
    return;
  }
  for (const e of t.effects) validateEffect(e, true, (msg) => err(`${label}: ${msg}`));
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
