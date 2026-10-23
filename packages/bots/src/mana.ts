// Works out which permanents to tap to pay a cost. Shared by the AI and the
// clients' auto-tapper, so nobody has to tap lands one by one.

import {
  manaAbilityAmount,
  legendaryManaCreatures,
  grantedManaAbilities,
  hasKeyword,
  MANA_TYPES,
  manaChoices,
  parseManaCost,
  planPayment,
  type ManaPool,
  type Action,
  type CardInstance,
  type GameState,
  type InstanceId,
  type ManaCost,
  type ManaType,
  type PlayerId,
} from '@nexus/engine';

export interface ManaTap {
  card: InstanceId;
  mana: ManaType;
  /** A paid mana ability ("{1}, {T}: Add {R}{G}"): which output, and which way to pay. */
  output?: number;
  payWith?: number;
  /** Relic of Legends: the creature tapped as the cost, instead of the source. */
  tapCreature?: InstanceId;
  grantedBy?: InstanceId;
}

export interface TapOptions {
  /** Permanents reserved to pay a spell's convoke, improvise, or other tap costs. */
  exclude?: InstanceId[];
  /** The mana is for an Equipment spell or an equip ability, so Equipment-only mana counts. */
  forEquipment?: boolean;
}

/** Untapped permanents this player can tap for mana right now. */
export function manaSources(s: GameState, playerId: PlayerId, opts: TapOptions = {}): CardInstance[] {
  return Object.values(s.cards).filter((c) => c.zone === 'battlefield' && !c.phasedOut && c.controller === playerId)
    .filter((c) => {
      const def = s.cardDefs[c.defId]!;
      if (opts.exclude?.includes(c.id) || manaChoices(s, c).length === 0 || c.tapped || c.controller !== playerId) return false;
      if (def.manaAbility?.onlyForEquipment && !opts.forEquipment) return false;
      const sick = def.types.includes('creature') && c.summoningSick && !def.keywords?.includes('Haste');
      return !sick;
    });
}

/**
 * How reluctant we are to use a source: lands first, then other permanents,
 * then sources that hurt (pain lands), Treasure (sacrificed) last.
 */
function reluctance(s: GameState, c: CardInstance): number {
  const def = s.cardDefs[c.defId]!;
  if (def.manaAbility?.sacrifice) return 100;
  return (def.types.includes('land') ? 0 : 10) + (def.manaAbility?.painFor || def.manaAbility?.lifeFor ? 5 : 0) + manaChoices(s, c).length;
}

/** Mana a source makes for a symbol: colorless if it can (no pain), otherwise the wanted color. */
function amountFrom(s: GameState, c: CardInstance & { grantedBy?: InstanceId }): number {
  if (c.grantedBy) return 1;
  return manaAbilityAmount(c, s.cardDefs[c.defId]!);
}

/** Untapped permanents with a paid mana ability ("{1}, {T}: Add {R}{G}") this player can use. */
export function paidManaSources(s: GameState, playerId: PlayerId): CardInstance[] {
  return Object.values(s.cards).filter((c) => c.zone === 'battlefield' && !c.phasedOut && c.controller === playerId)
    .filter((c) => {
      const def = s.cardDefs[c.defId]!;
      const sick = def.types.includes('creature') && c.summoningSick && !def.keywords?.includes('Haste');
      return !!def.manaAbility?.paid && !c.tapped && c.controller === playerId && !sick;
    });
}

/** A source option can tap a creature through a Relic instead of tapping itself. */
interface TapSource extends CardInstance { manaVia?: InstanceId; grantedBy?: InstanceId }
function sourceTap(src: TapSource, mana: ManaType): ManaTap {
  return src.manaVia ? { card: src.manaVia, mana, tapCreature: src.id } : { card: src.id, mana, ...(src.grantedBy ? { grantedBy: src.grantedBy } : {}) };
}
function sourceChoices(s: GameState, src: TapSource): ManaType[] {
  return src.grantedBy ? grantedManaAbilities(s, src).find((a) => a.source === src.grantedBy)?.mana ?? [] : manaChoices(s, src);
}
function grantedSources(s: GameState, player: PlayerId, opts: TapOptions): TapSource[] {
  return Object.values(s.cards).filter((c) => c.zone === 'battlefield' && !c.phasedOut && c.controller === player && !c.tapped && !opts.exclude?.includes(c.id) && (!c.summoningSick || hasKeyword(s, c, 'Haste')))
    .flatMap((c) => grantedManaAbilities(s, c).map((a) => ({ ...c, grantedBy: a.source })));
}
function legendarySources(s: GameState, player: PlayerId, opts: TapOptions): TapSource[] {
  const out: TapSource[] = [];
  for (const relic of Object.values(s.cards).filter((c) => c.zone === 'battlefield' && !c.phasedOut && c.controller === player)) {
    for (const creature of legendaryManaCreatures(s, relic)) {
      if (!opts.exclude?.includes(creature.id)) out.push({ ...creature, defId: relic.defId, manaVia: relic.id });
    }
  }
  return out;
}

/**
 * Picks permanents to tap so that the mana pool plus those taps pays `cost`,
 * or returns null if it can't be paid. Sources with fewer color options are
 * used first, so dual lands and Treasure are saved for when they're needed.
 * If plain taps can't do it, up to two paid mana abilities ("{1}, {T}: Add
 * {R}{G}") are worked in: taps to pay for one come first, then the ability,
 * then the rest.
 */
export function planTaps(
  s: GameState,
  playerId: PlayerId,
  cost: string | ManaCost | undefined,
  opts: TapOptions = {},
): ManaTap[] | null {
  const need = typeof cost === 'object' ? cost : parseManaCost(cost);
  const p = s.players[playerId]!;
  const pool = { ...p.manaPool };
  if (opts.forEquipment) for (const t of MANA_TYPES) pool[t] += p.equipmentMana[t];
  const sources: TapSource[] = [...manaSources(s, playerId, opts), ...legendarySources(s, playerId, opts), ...grantedSources(s, playerId, opts)].sort((a, b) => reluctance(s, a) - reluctance(s, b));
  // Paid abilities spend the normal pool, so they're left out when Equipment-only mana is in play.
  const paid = opts.forEquipment ? [] : paidManaSources(s, playerId).filter((c) => !opts.exclude?.includes(c.id));
  return planWith(s, need, pool, sources, paid, 2);
}

function planWith(
  s: GameState,
  need: ManaCost,
  pool: ManaPool,
  sources: TapSource[],
  paid: CardInstance[],
  depth: number,
): ManaTap[] | null {
  const direct = planDirect(s, need, pool, sources);
  if (direct || depth === 0) return direct;
  for (const conv of paid) {
    const ability = s.cardDefs[conv.defId]!.manaAbility!.paid!;
    const others = paid.filter((c) => c !== conv);
    for (let payWith = 0; payWith < ability.costs.length; payWith++) {
      const cost = parseManaCost(ability.costs[payWith]);
      const first = planDirect(s, cost, pool, sources.filter((c) => c.id !== conv.id));
      if (!first) continue;
      // The pool once those taps are made and the ability's cost is paid (the engine pays the same way).
      const after = { ...pool };
      for (const t of first) after[t.mana] += (t.tapCreature || t.grantedBy) ? 1 : amountFrom(s, s.cards[t.card]!);
      const spent = planPayment(after, cost);
      if (!spent) continue;
      for (const t of MANA_TYPES) after[t] -= spent[t] ?? 0;
      const used = new Set(first.map((t) => t.tapCreature ?? t.card));
      const rest = sources.filter((c) => c.id !== conv.id && !used.has(c.id));
      for (let output = 0; output < ability.outputs.length; output++) {
        const made = parseManaCost(ability.outputs[output]);
        const pool2 = { ...after };
        for (const t of MANA_TYPES) pool2[t] += made[t] ?? 0;
        const tail = planWith(s, need, pool2, rest, others.filter((c) => !used.has(c.id)), depth - 1);
        if (!tail) continue;
        const mana = MANA_TYPES.find((t) => (made[t] ?? 0) > 0)!;
        return [...first, { card: conv.id, mana, output, payWith }, ...tail];
      }
    }
  }
  return null;
}

/** Plain taps only: one mana ability per source. */
function planDirect(s: GameState, need: ManaCost, startPool: ManaPool, sources: TapSource[]): ManaTap[] | null {
  const pool = { ...startPool };
  const colored: ManaType[] = [];
  for (const t of MANA_TYPES) {
    for (let i = 0; i < (need[t] ?? 0); i++) {
      if (pool[t] > 0) pool[t] -= 1;
      else colored.push(t);
    }
  }
  const leftoverInPool = MANA_TYPES.reduce((n, t) => n + pool[t], 0);
  let generic = Math.max(0, need.generic - leftoverInPool);

  const used = new Set<InstanceId>();
  const taps: ManaTap[] = [];

  // Depth-first search assigning a source to each colored symbol.
  const assign = (i: number): boolean => {
    if (i === colored.length) return true;
    const want = colored[i]!;
    for (const src of sources) {
      if (used.has(src.id) || !sourceChoices(s, src).includes(want)) continue;
      used.add(src.id);
      taps.push(sourceTap(src, want));
      if (assign(i + 1)) return true;
      used.delete(src.id);
      taps.pop();
    }
    return false;
  };
  if (!assign(0)) return null;

  for (const src of sources) {
    if (generic <= 0) break;
    if (used.has(src.id)) continue;
    used.add(src.id);
    // For generic mana, prefer a type that doesn't hurt (a pain land's {C}).
    const choices = sourceChoices(s, src);
    const ability = s.cardDefs[src.defId]!.manaAbility;
    const pain = src.grantedBy ? [] : [...(ability?.painFor ?? []), ...(ability?.lifeFor ?? [])];
    taps.push(sourceTap(src, choices.find((m) => !pain.includes(m)) ?? choices[0]!));
    generic -= amountFrom(s, src);
  }
  return generic <= 0 ? taps : null;
}

export function tapActions(playerId: PlayerId, taps: ManaTap[]): Action[] {
  return taps.map((t) => ({
    type: 'ActivateManaAbility',
    player: playerId,
    card: t.card,
    mana: t.mana,
    ...(t.grantedBy ? { grantedBy: t.grantedBy } : {}),
    ...(t.tapCreature ? { tapCreature: t.tapCreature } : {}),
    ...(t.output !== undefined ? { output: t.output, payWith: t.payWith ?? 0 } : {}),
  }));
}
