// The "Learn to play" lesson: a prepared position with real Starter Kit
// cards, and a list of steps. Each step explains one idea, highlights the
// cards involved, allows only the move it's teaching, and finishes when the
// game reaches the right state. No UI code here, so it can be tested.

import { FREE_FOR_ALL, createGame, type Action, type GameState, type InstanceId, type PlayerId, type ZoneName } from '@nexus/engine';
import { CARD_DEFS } from '@nexus/cards';
import { passiveBot } from '@nexus/bots';
import { YOU, type Scenario } from '../game/session.ts';

export const TUTOR: PlayerId = 'Bot1';

export interface LessonStep {
  title: string;
  /** What to do and why, in plain words. */
  text: string;
  /** Cards to point at. */
  focus: (s: GameState) => InstanceId[];
  /** Whether a move is the one this step teaches. Mana taps are always fine. Absent: only the Next button. */
  allows?: (a: Action, s: GameState) => boolean;
  /** The step is finished. Absent: it finishes when the player presses Next. */
  done?: (s: GameState) => boolean;
  /** Shown when the player tries something else. */
  hint?: string;
}

export interface Lesson {
  scenario: Scenario;
  steps: LessonStep[];
}

/** Puts a new card straight into a zone while building the position. */
function put(s: GameState, owner: PlayerId, defId: string, zone: Exclude<ZoneName, 'stack' | 'void'>): InstanceId {
  const id = `l${s.nextId++}`;
  s.cards[id] = {
    id,
    defId,
    owner,
    controller: owner,
    zone,
    tapped: false,
    summoningSick: false,
    damage: 0,
    deathtouched: false,
  };
  if (zone === 'library') s.players[owner]!.library.unshift(id);
  else s.players[owner]![zone].push(id);
  return id;
}

const heroes = (s: GameState) =>
  s.players[YOU]!.battlefield.filter((id) => s.cards[id]!.defId === 'hero-token');

/** Your third turn: lands, a Dwarven Castle Guard, and a hand with an Equipment and an instant. */
export function firstLesson(): Lesson {
  const { state: s } = createGame({
    format: FREE_FOR_ALL,
    cardDefs: CARD_DEFS,
    seed: 3,
    players: [
      { id: YOU, deck: Array(20).fill('plains') },
      { id: TUTOR, deck: Array(20).fill('island') },
    ],
    skipDeckValidation: true,
  });
  // Start from empty hands; the lesson deals its own.
  for (const pid of [YOU, TUTOR]) {
    const p = s.players[pid]!;
    for (const id of p.hand) s.cards[id]!.zone = 'library';
    p.library.push(...p.hand);
    p.hand = [];
  }
  for (const land of ['plains', 'plains', 'plains', 'mountain']) put(s, YOU, land, 'battlefield');
  const guard = put(s, YOU, 'dwarven-castle-guard', 'battlefield');
  const plains = put(s, YOU, 'plains', 'hand');
  const katana = put(s, YOU, 'samurais-katana', 'hand');
  const slash = put(s, YOU, 'slash-of-light', 'hand');

  for (const land of ['island', 'island', 'swamp', 'swamp']) put(s, TUTOR, land, 'battlefield');
  const shinra = put(s, TUTOR, 'shinra-reinforcements', 'battlefield');
  for (const card of ['island', 'swamp', 'island']) put(s, TUTOR, card, 'hand');
  s.players[TUTOR]!.life = 5;

  s.activePlayer = YOU;
  s.turnNumber = 3;
  s.step = 'main1';
  s.pending = { kind: 'priority', player: YOU, passes: 0 };

  const isCast = (a: Action, card: InstanceId) => a.type === 'CastSpell' && a.card === card;
  const steps: LessonStep[] = [
    {
      title: 'Welcome to Project Nexus',
      text:
        "It's your third turn. Your goal: bring your opponent from 5 life to 0. " +
        'Your side of the table is at the bottom: lands (which make mana) and a creature, Dwarven Castle Guard. ' +
        'Your hand is along the bottom edge. Hover over any card to read it on the right.',
      focus: () => [guard],
    },
    {
      title: 'Play a land',
      text:
        'Each turn you may play one land. Lands make the mana you spend on spells. ' +
        'Click the Plains in your hand to put it onto the battlefield.',
      focus: () => [plains],
      allows: (a) => a.type === 'PlayLand',
      done: (st) => st.players[YOU]!.landsPlayedThisTurn > 0,
      hint: 'Click the glowing Plains in your hand.',
    },
    {
      title: 'Cast an Equipment',
      text:
        "Samurai's Katana costs {2}{R}: two mana of any color plus one red. Click it, then pay by tapping lands: " +
        'click your Mountain for {R} and two Plains (or press Auto-pay to let the game pick). ' +
        'It has Job select: when it enters, it makes a 1/1 Hero token and attaches to it.',
      focus: () => [katana],
      allows: (a) => isCast(a, katana),
      done: (st) => !!st.cards[katana]!.attachedTo,
      hint: "Click Samurai's Katana in your hand.",
    },
    {
      title: 'Your Hero',
      text:
        'A Hero token arrived with the Katana attached. Equipped, it gets +2/+2, trample and haste. ' +
        "Haste means it can attack this turn, even though it just arrived. Creatures without haste can't attack the turn they arrive " +
        '(they show a "z" badge). The number box on a creature is its current power/toughness.',
      focus: (st) => heroes(st),
    },
    {
      title: 'Clear the way with an instant',
      text:
        "Your opponent's Shinra Reinforcements (2/3) could block. Slash of Light deals damage equal to the number of creatures you control " +
        "plus your Equipment: that's 2 + 1 = 3, enough to destroy it. Click Slash of Light, then click Shinra Reinforcements as the target.",
      focus: () => [slash, shinra],
      allows: (a) =>
        a.type === 'CastSpell' && a.card === slash && !!a.targets?.some((t) => t.kind === 'card' && t.card === shinra),
      done: (st) => st.cards[shinra]!.zone !== 'battlefield',
      hint: 'Click Slash of Light, then click Shinra Reinforcements.',
    },
    {
      title: 'Attack!',
      text:
        "Nothing can block now. Combat starts: click your Hero and your Dwarven Castle Guard to choose them as attackers, then press Attack. " +
        "They'll deal 3 + 2 = 5 damage, exactly your opponent's life.",
      focus: (st) => [...heroes(st), guard],
      allows: (a, st) =>
        a.type === 'PassPriority' ||
        (a.type === 'DeclareAttackers' &&
          [...heroes(st), guard].every((id) => a.attacks.some((x) => x.attacker === id))),
      done: (st) => st.pending.kind === 'gameOver',
      hint: 'Select both creatures, then press Attack.',
    },
  ];

  return { scenario: { state: s, bots: { [TUTOR]: passiveBot() } }, steps };
}
