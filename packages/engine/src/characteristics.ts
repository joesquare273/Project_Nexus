// What a permanent is right now (rule 613): its printed card, then static
// abilities (including Equipment), "until end of turn" effects and +1/+1
// counters. Every rule that asks about power, toughness, keywords or
// subtypes goes through here, so a buff only has to be described once.
//
// Simplified layers: type changes only add subtypes, ability changes only add
// keywords, and power/toughness changes are all additive, so the order
// within a layer doesn't matter.

import type {
  Amount,
  CardDefinition,
  CardInstance,
  CountKind,
  GameState,
  InstanceId,
  Keyword,
  PlayerId,
  StaticSpec,
  TemporaryFlag,
} from './types.ts';

export interface Characteristics {
  power: number;
  toughness: number;
  keywords: Set<Keyword>;
  subtypes: string[];
}

const def = (s: GameState, c: CardInstance): CardDefinition => s.cardDefs[c.defId]!;

function battlefieldCards(s: GameState): CardInstance[] {
  return s.turnOrder.flatMap((pid) => s.players[pid]!.battlefield.map((id) => s.cards[id]!));
}

export function isEquipment(s: GameState, c: CardInstance): boolean {
  return def(s, c).subtypes?.includes('Equipment') ?? false;
}

/** Equipment attached to this creature. */
export function equipmentOn(s: GameState, creature: InstanceId): CardInstance[] {
  return battlefieldCards(s).filter((e) => e.attachedTo === creature);
}

export function isEquipped(s: GameState, c: CardInstance): boolean {
  return c.zone === 'battlefield' && equipmentOn(s, c.id).length > 0;
}

/** How many of something there are, from `player`'s point of view. */
export function countOf(s: GameState, kind: CountKind, player: PlayerId): number {
  const yours = () => battlefieldCards(s).filter((c) => c.controller === player);
  const creature = (c: CardInstance) => def(s, c).types.includes('creature');
  switch (kind) {
    case 'EquipmentYouControl':
      return yours().filter((c) => isEquipment(s, c)).length;
    case 'CreaturesYouControl':
      return yours().filter(creature).length;
    case 'EquippedCreaturesYouControl':
      return yours().filter((c) => creature(c) && isEquipped(s, c)).length;
    case 'NoncreatureNonlandCardsInYourGraveyard':
      return s.players[player]!.graveyard.filter((id) => {
        const types = def(s, s.cards[id]!).types;
        return !types.includes('creature') && !types.includes('land');
      }).length;
    case 'CreaturesDiedThisTurn':
      return s.creaturesDiedThisTurn;
    case 'CreaturesOnBattlefield':
      return battlefieldCards(s).filter(creature).length;
    case 'EquippedAttackingCreaturesYouControl':
      return yours().filter((c) => creature(c) && isEquipped(s, c) && (s.combat?.attacks.some((a) => a.attacker === c.id) ?? false)).length;
  }
}

export function amountOf(s: GameState, amount: Amount | undefined, player: PlayerId): number {
  if (amount === undefined) return 0;
  if (typeof amount === 'number') return amount;
  // Amounts that refer back to earlier in the same spell or ability are worked out while it resolves.
  if ('of' in amount) return 0;
  return amount.count.reduce((n, kind) => n + countOf(s, kind, player), 0);
}

function staticApplies(s: GameState, source: CardInstance, spec: StaticSpec): InstanceId | null {
  const affected = spec.affects === 'Self' ? source.id : source.attachedTo;
  if (!affected) return null;
  for (const condition of spec.conditions ?? []) {
    if (condition === 'yourTurn' && s.activePlayer !== source.controller) return null;
    if (condition === 'equipped' && !isEquipped(s, s.cards[affected]!)) return null;
    if (condition === 'legendary' && !def(s, s.cards[affected]!).supertypes?.includes('Legendary')) return null;
  }
  return affected;
}

/** The card's current characteristics. Cards off the battlefield are just their printed card. */
export function characteristics(s: GameState, c: CardInstance): Characteristics {
  const d = def(s, c);
  const out: Characteristics = {
    power: d.power ?? 0,
    toughness: d.toughness ?? 0,
    keywords: new Set(d.keywords ?? []),
    subtypes: [...(d.subtypes ?? [])],
  };
  if (c.zone !== 'battlefield') return out;

  const removed: Keyword[] = [];
  for (const source of battlefieldCards(s)) {
    for (const spec of def(s, source).statics ?? []) {
      if (staticApplies(s, source, spec) !== c.id) continue;
      out.power += amountOf(s, spec.power, source.controller);
      out.toughness += amountOf(s, spec.toughness, source.controller);
      for (const k of spec.keywords ?? []) out.keywords.add(k);
      for (const t of spec.addSubtypes ?? []) if (!out.subtypes.includes(t)) out.subtypes.push(t);
      removed.push(...(spec.removeKeywords ?? []));
    }
  }
  for (const e of s.temporaryEffects) {
    if (e.affected !== c.id) continue;
    out.power += e.power ?? 0;
    out.toughness += e.toughness ?? 0;
    for (const k of e.keywords ?? []) out.keywords.add(k);
  }
  // "Loses flying" wins over grants (a simplification of layer 6 timestamps).
  for (const k of removed) out.keywords.delete(k);
  out.power += c.counters ?? 0;
  out.toughness += c.counters ?? 0;
  return out;
}

export function powerOf(s: GameState, c: CardInstance): number {
  return characteristics(s, c).power;
}

export function toughnessOf(s: GameState, c: CardInstance): number {
  return characteristics(s, c).toughness;
}

export function hasKeyword(s: GameState, c: CardInstance, keyword: Keyword): boolean {
  if (c.zone !== 'battlefield') return def(s, c).keywords?.includes(keyword) ?? false;
  return characteristics(s, c).keywords.has(keyword);
}

/** Whether an "until end of turn" flag such as "can't be blocked" applies to this object. */
export function hasFlag(s: GameState, c: CardInstance, flag: TemporaryFlag): boolean {
  return s.temporaryEffects.some((e) => e.affected === c.id && e.flags?.includes(flag));
}
