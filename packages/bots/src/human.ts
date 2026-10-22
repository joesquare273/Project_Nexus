// What a human player can do with each card right now, with lands tapped
// automatically. Shared by the terminal game and the browser board so both
// offer exactly the same choices.

import {
  abilityOptions,
  activatedAbilities,
  getLegalActions,
  spellOptions,
  type Action,
  type CostedOption,
  type GameState,
  type InstanceId,
  type PlayerId,
  type Target,
} from '@nexus/engine';
import { planTaps, tapActions } from './mana.ts';
import { activatedText } from './narrate.ts';

/** One complete way to do something: tap these, then take this action. */
export interface PlayChoice {
  taps: Action[];
  action: Action;
  targets: Target[];
  /** For modal spells: the chosen mode, or modes for "choose two" / "one or more" (printed order). */
  modes?: number[];
}

/** Something a card can do: be played as a land, cast, or have an ability activated. */
export interface CardPlay {
  card: InstanceId;
  kind: 'land' | 'spell' | 'ability';
  /** For abilities: which one, and a short description ("Equip {2}"). */
  ability?: number;
  label: string;
  /** Every affordable way to do it (different targets or modes). */
  choices: PlayChoice[];
}

function withTaps(s: GameState, player: PlayerId, o: CostedOption): PlayChoice | null {
  const taps = planTaps(s, player, o.cost, { forEquipment: o.forEquipment });
  if (!taps) return null;
  return {
    taps: tapActions(player, taps),
    action: o.action,
    targets: o.action.targets ?? [],
    ...(o.action.type === 'CastSpell' && (o.action.modes || o.action.mode !== undefined)
      ? { modes: o.action.modes ?? [o.action.mode!] }
      : {}),
  };
}

/** For a snarl: the land type of a card in your hand you'd reveal ("Mountain"). */
function revealable(s: GameState, card: InstanceId, player: PlayerId): string {
  const subtypes = s.cardDefs[s.cards[card]!.defId]!.entersTappedUnless?.revealSubtypes ?? [];
  const hand = s.players[player]!.hand.filter((id) => id !== card).map((id) => s.cardDefs[s.cards[id]!.defId]!);
  return subtypes.find((t) => hand.some((d) => d.subtypes?.includes(t))) ?? 'card';
}

/** Everything the player can do while they have priority, grouped by card. */
export function playableCards(s: GameState, player: PlayerId): CardPlay[] {
  if (s.pending.kind !== 'priority' || s.pending.player !== player) return [];
  const plays: CardPlay[] = [];
  for (const a of getLegalActions(s)) {
    if (a.type !== 'PlayLand') continue;
    const label = a.reveal === true ? `Play untapped (reveal a ${revealable(s, a.card, player)})` : a.reveal === false ? 'Play tapped' : 'Play';
    plays.push({ card: a.card, kind: 'land', label, choices: [{ taps: [], action: a, targets: [] }] });
  }
  const grouped = new Map<string, CardPlay>();
  const add = (o: CostedOption) => {
    const choice = withTaps(s, player, o);
    if (!choice) return;
    const a = o.action;
    const isAbility = a.type === 'ActivateAbility';
    const alternative = a.type === 'CastSpell' && a.alternative;
    const x = a.type === 'CastSpell' ? a.x : undefined;
    const key = isAbility ? `${a.card}#${a.ability}` : `${a.card}${alternative ? '#alt' : ''}${x !== undefined ? `#x${x}` : ''}`;
    let play = grouped.get(key);
    if (!play) {
      const def = s.cardDefs[s.cards[a.card]!.defId]!;
      play = isAbility
        ? {
            card: a.card,
            kind: 'ability',
            ability: a.ability,
            label: activatedText(activatedAbilities(def)[a.ability]!),
            choices: [],
          }
        : {
            card: a.card,
            kind: 'spell',
            // Alternative costs get their own entry: "Pay 4 life for", "Overload".
            label: `${
              alternative
                ? def.alternativeCost!.label
                : s.cards[a.card]!.zone === 'hand'
                  ? 'Cast'
                  : `Cast from ${s.cards[a.card]!.zone}`
            }${x !== undefined ? ` with X = ${x}` : ''}`,
            choices: [],
          };
      grouped.set(key, play);
      plays.push(play);
    }
    play.choices.push(choice);
  };
  for (const o of spellOptions(s, player)) add(o);
  for (const o of abilityOptions(s, player)) add(o);
  return plays;
}
