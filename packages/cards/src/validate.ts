// Build-time validation of card JSON (PRD 10). Catches typos and unsupported
// combinations before a card ever reaches the engine.

import {
  CHOSEN_TARGET_KINDS,
  CARD_CATEGORIES,
  CARD_TYPES,
  COLORS,
  COUNT_KINDS,
  EFFECT_KINDS,
  KEYWORDS,
  MANA_TYPES,
  SUPERTYPES,
  TARGET_KINDS,
  TEMPORARY_FLAGS,
  TRIGGER_EVENTS,
  parseManaCost,
  type ActivatedSpec,
  type Amount,
  type CardDefinition,
  type CardType,
  type EffectSpec,
  type ObjectFilter,
  type StaticSpec,
  type TriggerSpec,
} from '@nexus/engine';
import typeLists from '../data/types.json' with { type: 'json' };

/** Official subtype lists for each card type (data/types.json, from Scryfall). */
const SUBTYPES_BY_TYPE: Partial<Record<CardType, readonly string[]>> = {
  creature: typeLists.creature,
  artifact: typeLists.artifact,
  enchantment: typeLists.enchantment,
  land: typeLists.land,
  instant: typeLists.spell,
  sorcery: typeLists.spell,
};
const ALL_SUBTYPES = new Set(Object.values(SUBTYPES_BY_TYPE).flat());

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** Effects that need an `amount`. */
const AMOUNT_EFFECTS = new Set(['DealDamage', 'DrawCards', 'GainLife', 'LoseLife', 'AddCounters', 'CreateToken', 'Mill', 'Surveil', 'Scry']);
const PLAYER_ONLY_EFFECTS = new Set([
  'DrawCards',
  'GainLife',
  'LoseLife',
  'Mill',
  'ExileGraveyard',
  'SacrificeGreatestPower',
  'PutTopCardIfLand',
  'Discard',
  'Sacrifice',
  'KeepAndSacrificeRest',
  'PutFromHand',
]);
const PLAYER_TARGETS = new Set([
  'You',
  'EachOpponent',
  'EachPlayer',
  'TargetOpponent',
  'TargetPlayer',
  'DefendingPlayer',
  'PreviousTargetController',
  'ActivePlayer',
  'EachPlayerWhoChose',
  'EachOpponentWhoChose',
  'EachOpponentWhoDidNotChoose',
]);
/** Target kinds that pick from a filter. */
const FILTERED_TARGETS = new Set(['TargetPermanent', 'TargetCardInGraveyard', 'AllPermanents']);
const ABILITY_ONLY_TARGETS = new Set(['This', 'DefendingPlayer', 'TriggeringObject']);

type Err = (msg: string) => void;

function isNonNegativeInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0;
}

function validateCost(text: string | undefined, err: Err): void {
  if (text === undefined) return;
  try {
    parseManaCost(text);
  } catch (e) {
    err((e as Error).message);
  }
}

function validateAmount(a: Amount | undefined, err: Err): void {
  if (a === undefined) return;
  if (typeof a === 'number') {
    if (!Number.isInteger(a)) err('amounts must be whole numbers.');
    return;
  }
  if ('of' in a) {
    if (!['previousTargetPower', 'destroyedThisWay', 'chosenCount', 'chosenManaValue', 'sourcePower'].includes(a.of)) err(`unknown amount "${String(a.of)}".`);
    return;
  }
  if (!Array.isArray(a.count) || a.count.length === 0) err('a counted amount needs a non-empty "count" list.');
  if (a.times !== undefined && !(Number.isInteger(a.times) && a.times > 0)) err('times must be a positive whole number.');
  for (const k of a.count ?? []) if (!COUNT_KINDS.includes(k)) err(`unknown count "${k}".`);
}

function validateFilter(f: ObjectFilter | undefined, err: Err): void {
  if (!f) return;
  for (const type of [...(f.types ?? []), ...(f.nonTypes ?? [])]) {
    if (!CARD_TYPES.includes(type)) err(`unknown type "${type}" in a filter.`);
  }
  for (const cat of f.categories ?? []) {
    if (!CARD_CATEGORIES.includes(cat)) err(`unknown category "${cat}" (use ${CARD_CATEGORIES.join(', ')}).`);
  }
  for (const sub of f.subtypes ?? []) if (!ALL_SUBTYPES.has(sub)) err(`unknown subtype "${sub}" in a filter.`);
  for (const st of f.supertypes ?? []) if (!SUPERTYPES.includes(st)) err(`unknown supertype "${st}" in a filter.`);
  if (f.controller !== undefined && !['You', 'Opponent', 'DefendingPlayer'].includes(f.controller)) {
    err('controller must be "You", "Opponent" or "DefendingPlayer".');
  }
  for (const color of [...(f.colors ?? []), ...(f.nonColors ?? [])]) if (!COLORS.includes(color)) err(`unknown color "${color}" in a filter.`);
  for (const sub of f.nonSubtypes ?? []) if (!ALL_SUBTYPES.has(sub)) err(`unknown subtype "${sub}" in a filter.`);
  for (const key of ['powerAtLeast', 'toughnessAtLeast', 'manaValueAtMost', 'manaValueAtLeast'] as const) {
    if (f[key] !== undefined && !isNonNegativeInt(f[key])) err(`${key} must be a whole number.`);
  }
}

/** Returns a list of problems with one card. Empty means valid. */
export function validateCardDefinition(raw: unknown): string[] {
  const errors: string[] = [];
  if (typeof raw !== 'object' || raw === null) return ['Card must be an object.'];
  const c = raw as Partial<CardDefinition>;
  const label = typeof c.id === 'string' ? c.id : '(no id)';
  const err: Err = (msg) => errors.push(`${label}: ${msg}`);

  if (typeof c.id !== 'string' || !ID_PATTERN.test(c.id)) err('id must be lowercase-kebab-case.');
  if (typeof c.name !== 'string' || c.name.trim() === '') err('name is required.');
  if (!Array.isArray(c.types) || c.types.length === 0 || c.types.some((t) => !CARD_TYPES.includes(t))) {
    err(`types must be a non-empty list drawn from ${CARD_TYPES.join(', ')}.`);
    return errors;
  }
  for (const st of c.supertypes ?? []) if (!SUPERTYPES.includes(st)) err(`unknown supertype "${st}".`);
  // Each subtype must belong to one of the card's types (rule 205.3d), per Scryfall's official lists.
  const allowed = new Set(c.types.flatMap((t) => SUBTYPES_BY_TYPE[t] ?? []));
  for (const sub of c.subtypes ?? []) {
    if (!allowed.has(sub)) err(`"${sub}" is not a ${c.types.join(' or ')} subtype.`);
  }
  for (const k of c.keywords ?? []) if (!KEYWORDS.includes(k)) err(`unknown keyword "${k}".`);
  for (const m of c.produces ?? []) if (!MANA_TYPES.includes(m)) err(`unknown mana type "${m}".`);

  const isLand = c.types.includes('land');
  const isSpell = c.types.includes('instant') || c.types.includes('sorcery');
  if (isLand && c.manaCost !== undefined) err('lands have no mana cost.');
  if (!isLand && !c.token && c.manaCost === undefined) err('nonland cards need a manaCost (use "{0}" for free).');
  if (c.token && c.manaCost !== undefined) err('tokens have no mana cost.');
  validateCost(c.manaCost, err);
  validateCost(c.flashback, (m) => err(`flashback: ${m}`));
  validateCost(c.equip, (m) => err(`equip: ${m}`));
  if (c.equip !== undefined && !c.subtypes?.includes('Equipment')) err('only Equipment has an equip cost.');
  if (c.landcycling) {
    validateCost(c.landcycling.cost, (m) => err(`landcycling: ${m}`));
    if (!c.landcycling.basic && !c.landcycling.subtype) err('landcycling needs a subtype or basic: true.');
  }
  validateCost(c.cycling, (m) => err(`cycling: ${m}`));
  for (const color of c.colorIdentity ?? []) if (!['W', 'U', 'B', 'R', 'G'].includes(color)) err(`unknown color "${color}" in colorIdentity.`);
  if (c.types.includes('creature') && (!isNonNegativeInt(c.power) || !isNonNegativeInt(c.toughness))) {
    err('creatures need non-negative integer power and toughness.');
  }
  if (c.notBuilt !== undefined && typeof c.notBuilt !== 'boolean') err('notBuilt must be true or false.');
  const hasEffects = !!(c.effects?.length || c.modes?.length);
  if (isSpell && !c.notBuilt && !hasEffects) err('instants and sorceries need at least one effect (or modes).');
  if (c.notBuilt && (hasEffects || c.triggers?.length || c.activated?.length || c.statics?.length)) {
    err('a card marked notBuilt has no abilities yet.');
  }
  if (!isSpell && hasEffects) err('permanents use triggers, statics and activated abilities, not effects.');
  if (c.effects && c.modes) err('a card has either effects or modes, not both.');
  if (c.entersWithCounters !== undefined && (!isNonNegativeInt(c.entersWithCounters) || c.entersWithCounters === 0)) {
    err('entersWithCounters must be a positive whole number.');
  }
  if (c.chooseModes) {
    const { min, max } = c.chooseModes;
    if (!c.modes) err('chooseModes needs modes.');
    else if (!isNonNegativeInt(min) || !isNonNegativeInt(max) || min < 1 || max < min || max > c.modes.length) {
      err('chooseModes needs 1 <= min <= max <= number of modes.');
    }
  }
  if (c.alternativeCost) {
    const alt = c.alternativeCost;
    if (typeof alt.label !== 'string' || alt.label === '') err('alternativeCost needs a label.');
    if (alt.mana === undefined && alt.life === undefined) err('alternativeCost needs mana or life.');
    validateCost(alt.mana, (m) => err(`alternativeCost: ${m}`));
    if (alt.life !== undefined && (!isNonNegativeInt(alt.life) || alt.life === 0)) err('alternativeCost life must be positive.');
    validateFilter(alt.ifControls, (m) => err(`alternativeCost: ${m}`));
    for (const e of alt.effects ?? []) validateEffect(e, false, (m) => err(`alternativeCost: ${m}`));
  }
  if (c.costReduction) {
    if (!isNonNegativeInt(c.costReduction.generic)) err('costReduction needs a whole-number generic amount.');
    if (!c.costReduction.ifTargetsTappedCreature && !c.costReduction.perCount) err('costReduction needs a condition or perCount.');
    if (c.costReduction.perCount && !COUNT_KINDS.includes(c.costReduction.perCount)) err(`unknown count "${c.costReduction.perCount}".`);
  }

  for (const e of c.effects ?? []) validateEffect(e, false, err);
  for (const [i, mode] of (c.modes ?? []).entries()) {
    if (!Array.isArray(mode) || mode.length === 0) err(`mode ${i + 1} needs at least one effect.`);
    for (const e of mode ?? []) validateEffect(e, false, (m) => err(`mode ${i + 1}: ${m}`));
  }
  if (c.triggers !== undefined && !Array.isArray(c.triggers)) err('triggers must be a list.');
  for (const t of Array.isArray(c.triggers) ? c.triggers : []) validateTrigger(t, err);
  for (const a of c.activated ?? []) validateActivated(a, err);
  for (const st of c.statics ?? []) validateStatic(st, err);
  return errors;
}

function validateEffect(e: EffectSpec, inAbility: boolean, err: Err): void {
  if (!EFFECT_KINDS.includes(e.effect)) err(`unknown effect "${e.effect}".`);
  if (!TARGET_KINDS.includes(e.target)) err(`unknown target "${e.target}".`);
  if (AMOUNT_EFFECTS.has(e.effect) && e.amount === undefined) err(`${e.effect} needs an amount.`);
  validateAmount(e.amount, (m) => err(`${e.effect}: ${m}`));
  if (PLAYER_ONLY_EFFECTS.has(e.effect) && !PLAYER_TARGETS.has(e.target)) err(`${e.effect} can only affect players.`);
  if (e.effect === 'Discard' && e.amount === undefined && !e.anyNumber && !e.wholeHand) err('Discard needs an amount (or anyNumber / wholeHand).');
  if ((e.effect === 'Sacrifice' || e.effect === 'KeepAndSacrificeRest') && !e.filter) err(`${e.effect} needs a filter saying what qualifies.`);
  if (e.effect === 'Sacrifice' && e.amount === undefined) err('Sacrifice needs an amount.');
  if (e.effect === 'KeepAndSacrificeRest' && e.amount === undefined && !e.onePerType) err('KeepAndSacrificeRest needs an amount (or onePerType).');
  if (FILTERED_TARGETS.has(e.target) && !e.filter) err(`${e.target} needs a filter saying what qualifies.`);
  if (e.sameNameTokens && e.effect !== 'Exile') err('sameNameTokens only works with Exile.');
  if ((e.effect === 'SearchLibraryToHand' || e.effect === 'SearchLibraryToBattlefield') && !e.filter) err(`${e.effect} needs a filter.`);
  validateFilter(e.filter, err);
  if (e.effect === 'CreateToken' && typeof e.token !== 'string') err('CreateToken needs a token id.');
  if (e.effect === 'GrantKeywords' && !e.keywords?.length) err('GrantKeywords needs keywords.');
  for (const k of e.keywords ?? []) if (!KEYWORDS.includes(k)) err(`unknown keyword "${k}".`);
  if (e.effect === 'GrantFlags' && !e.flags?.length) err('GrantFlags needs flags.');
  for (const f of e.flags ?? []) if (!TEMPORARY_FLAGS.includes(f)) err(`unknown flag "${f}".`);
  if (e.effect === 'ModifyPT' && e.power === undefined && e.toughness === undefined) err('ModifyPT needs power or toughness.');
  if (ABILITY_ONLY_TARGETS.has(e.target) && !inAbility) err(`"${e.target}" can only be used in abilities.`);
  if ((e.upTo || e.group) && !CHOSEN_TARGET_KINDS.includes(e.target)) err('upTo and group are only for chosen targets.');
  if (e.effect === 'AttachEquipmentTo' && e.from === undefined) err('AttachEquipmentTo needs "from": which target is the Equipment.');
  if (e.effect === 'PutFromHand' && !e.filter) err('PutFromHand needs a filter.');
}

function validateTrigger(t: TriggerSpec, err: Err): void {
  if (!TRIGGER_EVENTS.includes(t.when)) err(`unknown trigger event "${t.when}".`);
  const label = `trigger "${t.when}"`;
  const e: Err = (msg) => err(`${label}: ${msg}`);
  validateFilter(t.what, e);
  if (t.when === 'SpellCast' && !t.what) e('say which spells with "what".');
  if (t.turn !== undefined && t.when !== 'BeginCombat' && t.when !== 'Upkeep' && t.when !== 'EndStep') {
    e('"turn" is only for BeginCombat, Upkeep and EndStep.');
  }
  if (t.fromGraveyard && t.when !== 'EntersBattlefield') e('"fromGraveyard" is only for EntersBattlefield.');
  if (t.zone !== undefined && t.zone !== 'battlefield' && t.zone !== 'graveyard') e(`unknown zone "${t.zone}".`);
  if (t.ifManaSpentAtLeast !== undefined && t.when !== 'SpellCast') e('ifManaSpentAtLeast is only for SpellCast.');
  validateCost(t.cost?.mana, e);
  if (t.cost?.life !== undefined && (!isNonNegativeInt(t.cost.life) || t.cost.life === 0)) e('life cost must be positive.');
  if (!Array.isArray(t.effects) || t.effects.length === 0) {
    e('needs at least one effect.');
    return;
  }
  for (const effect of t.effects) validateEffect(effect, true, e);
}

function validateActivated(a: ActivatedSpec, err: Err): void {
  const e: Err = (msg) => err(`activated ability: ${msg}`);
  validateCost(a.cost?.mana, e);
  if (a.zone !== undefined && a.zone !== 'battlefield' && a.zone !== 'hand') e(`unknown zone "${a.zone}".`);
  if (!Array.isArray(a.effects) || a.effects.length === 0) e('needs at least one effect.');
  for (const effect of a.effects ?? []) validateEffect(effect, true, e);
}

function validateStatic(st: StaticSpec, err: Err): void {
  const e: Err = (msg) => err(`static ability: ${msg}`);
  if (st.affects !== 'Self' && st.affects !== 'EquippedCreature' && st.affects !== 'EachMatching') {
    e('affects must be "Self", "EquippedCreature" or "EachMatching".');
  }
  if (st.affects === 'EachMatching') {
    if (!st.filter) e('EachMatching needs a filter.');
    // These would ask for the very characteristics the static ability changes.
    for (const key of ['powerAtLeast', 'toughnessAtLeast', 'subtypes', 'nonSubtypes'] as const) {
      if (st.filter?.[key] !== undefined) e(`an EachMatching filter can't use ${key}.`);
    }
  }
  validateFilter(st.filter, e);
  if (st.extraCounters !== undefined && (!isNonNegativeInt(st.extraCounters) || st.affects !== 'EachMatching')) {
    e('extraCounters must be a whole number on an EachMatching static ability.');
  }
  for (const cond of st.conditions ?? []) {
    if (cond !== 'yourTurn' && cond !== 'equipped' && cond !== 'legendary') e(`unknown condition "${cond}".`);
  }
  for (const k of st.removeKeywords ?? []) if (!KEYWORDS.includes(k)) e(`unknown keyword "${k}".`);
  validateAmount(st.power, e);
  validateAmount(st.toughness, e);
  for (const k of st.keywords ?? []) if (!KEYWORDS.includes(k)) e(`unknown keyword "${k}".`);
  for (const sub of st.addSubtypes ?? []) if (!ALL_SUBTYPES.has(sub)) e(`unknown subtype "${sub}".`);
}

/** Validates a whole card list: each card, duplicate ids, and tokens that cards create. */
export function validateCardList(cards: readonly unknown[]): string[] {
  const errors = cards.flatMap(validateCardDefinition);
  const seen = new Set<string>();
  const tokens = new Set<string>();
  for (const c of cards) {
    const { id, token } = c as { id?: unknown; token?: unknown };
    if (typeof id !== 'string') continue;
    if (seen.has(id)) errors.push(`${id}: duplicate id.`);
    seen.add(id);
    if (token) tokens.add(id);
  }
  for (const raw of cards) {
    const c = raw as Partial<CardDefinition>;
    const effects = [
      ...(c.effects ?? []),
      ...(c.modes ?? []).flat(),
      ...(c.alternativeCost?.effects ?? []),
      ...(c.triggers ?? []).flatMap((t) => t.effects ?? []),
      ...(c.activated ?? []).flatMap((a) => a.effects ?? []),
    ];
    for (const e of effects) {
      if (e.effect === 'CreateToken' && e.token && !tokens.has(e.token)) {
        errors.push(`${c.id}: creates "${e.token}", which isn't a token in the card data.`);
      }
    }
  }
  return errors;
}
