// Play against the AI in your terminal.
//
//   npm run play
//   npm run play -- --opponents 2 --deck UB --seed 42
//
// You choose from numbered options. Lands tap automatically when you cast a
// spell. Priority passes automatically when you have nothing to do, so you
// only stop when a decision matters (type "f" to stop at every step).

import {
  currentDefinition,
  queuedTriggerSpec,
  choiceProblem,
  FREE_FOR_ALL,
  applyAction,
  canBlock,
  cardsToBottom,
  createGame,
  filterEventsFor,
  getLegalActions,
  triggerLifeCost,
  triggerSpec,
  viewFor,
  type Action,
  type Block,
  type CardInstance,
  type GameEvent,
  type GameState,
  type PlayerId,
} from '@nexus/engine';
import { CARD_DEFS, starterKitDeck } from '@nexus/cards';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { basicAi, planTaps, playableCards, randomBot, tapActions, type Bot } from './index.ts';
import { cardName, describe, rulesSummary, stepName, targetName, triggerText } from './narrate.ts';

const YOU: PlayerId = 'You';

const { values } = parseArgs({
  options: {
    opponents: { type: 'string', default: '1' },
    deck: { type: 'string', default: 'RW' },
    seed: { type: 'string' },
    bot: { type: 'string', default: 'ai' },
  },
});

const opponentCount = Math.min(3, Math.max(1, Number(values.opponents) || 1));
const yourDeck = values.deck?.toUpperCase() === 'UB' ? 'UB' : 'RW';
const seed = values.seed !== undefined ? Number(values.seed) : Math.floor(Math.random() * 1_000_000);
const botIds = Array.from({ length: opponentCount }, (_, i) => `Bot${i + 1}`);
const makeBot = values.bot === 'random' ? randomBot : basicAi;
const bots: Record<PlayerId, Bot> = Object.fromEntries(botIds.map((id, i) => [id, makeBot(seed + i)]));

class Quit extends Error {}

// Lines are queued as they arrive, so typed and piped input (used for
// scripted smoke tests) both work, and closing input ends the game cleanly.
const rl = createInterface({ input: process.stdin });
const queued: string[] = [];
let waiting: ((line: string | null) => void) | null = null;
let inputClosed = false;
rl.on('line', (line) => {
  if (waiting) {
    const resolve = waiting;
    waiting = null;
    resolve(line);
  } else {
    queued.push(line);
  }
});
rl.on('close', () => {
  inputClosed = true;
  waiting?.(null);
  waiting = null;
});

async function ask(question: string): Promise<string> {
  process.stdout.write(question);
  const next = queued.shift();
  if (next !== undefined) {
    if (!process.stdin.isTTY) process.stdout.write(`${next}\n`);
    return next.trim();
  }
  if (inputClosed) throw new Quit();
  const line = await new Promise<string | null>((resolve) => {
    waiting = resolve;
  });
  if (line === null) throw new Quit();
  if (!process.stdin.isTTY) process.stdout.write(`${line}\n`);
  return line.trim();
}

let stopEverywhere = false;

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

const defOf = currentDefinition;

function creatureText(s: GameState, c: CardInstance): string {
  const d = defOf(s, c);
  const kw = d.keywords?.length ? ` [${d.keywords.join(', ')}]` : '';
  const flags = [c.tapped && 'tapped', c.summoningSick && d.types.includes('creature') && 'new', c.damage > 0 && `${c.damage} dmg`]
    .filter(Boolean)
    .join(', ');
  return `${d.name} ${d.power}/${d.toughness}${kw}${flags ? ` (${flags})` : ''}`;
}

function battlefieldText(s: GameState, ids: string[]): string[] {
  const cards = ids.map((id) => s.cards[id]!);
  const lands = new Map<string, { total: number; tapped: number }>();
  const others: string[] = [];
  for (const c of cards) {
    const d = defOf(s, c);
    if (d.types.includes('land')) {
      const e = lands.get(d.name) ?? { total: 0, tapped: 0 };
      e.total += 1;
      if (c.tapped) e.tapped += 1;
      lands.set(d.name, e);
    } else if (d.types.includes('creature')) {
      others.push(creatureText(s, c));
    } else {
      others.push(`${d.name}${c.tapped ? ' (tapped)' : ''}`);
    }
  }
  const landLine = [...lands].map(([name, e]) => `${e.total} ${name}${e.tapped ? ` (${e.tapped} tapped)` : ''}`).join(', ');
  return [...(landLine ? [`    Lands: ${landLine}`] : []), ...others.map((o) => `    ${o}`)];
}

function render(s: GameState): void {
  const view = viewFor(s, YOU);
  const out: string[] = [];
  const whose = s.activePlayer === YOU ? 'Your' : `${s.activePlayer}'s`;
  out.push('', `---------- Turn ${s.turnNumber} | ${whose} turn | ${stepName(s.step)} ----------`);
  const seats = [...view.turnOrder.filter((p) => p !== YOU), YOU];
  for (const pid of seats) {
    const p = view.players[pid]!;
    const name = pid === YOU ? 'You' : pid;
    if (p.eliminated) {
      out.push(`  ${name}: out of the game`);
      continue;
    }
    out.push(
      `  ${name}: ${p.life} life${view.monarch === pid ? ' [monarch]' : ''} | hand ${p.handCount} | library ${p.libraryCount} | graveyard ${p.graveyard.length}`,
    );
    out.push(...battlefieldText(s, p.battlefield));
  }
  if (s.stack.length > 0) {
    out.push('  Stack (top first):');
    for (const item of [...s.stack].reverse()) {
      const targets = item.targets.length ? ` -> ${item.targets.map((t) => targetName(s, t, YOU)).join(', ')}` : '';
      const name = item.kind === 'spell' ? cardName(s, item.card) : `${cardName(s, item.source)}'s ability`;
      out.push(`    ${name} (${item.controller === YOU ? 'yours' : item.controller})${targets}`);
    }
  }
  const hand = view.players[YOU]!.hand ?? [];
  out.push(`  Your hand: ${hand.map((id) => `${cardName(s, id)} ${defOf(s, s.cards[id]!).manaCost ?? ''}`.trim()).join(', ') || '(empty)'}`);
  console.log(out.join('\n'));
}

/** Engine errors name cards by instance id ("c12"); show card names instead. */
function readable(s: GameState, error: string): string {
  return error.replace(/"([ct]\d+)"/g, (_, id: string) => (s.cards[id] ? cardName(s, id) : id));
}

function narrate(s: GameState, events: GameEvent[]): void {
  const lines: string[] = [];
  let draws = null as { player: string; names: string[]; hidden: number } | null;
  // Consecutive draws by one player become one line ("Bot1 drew 7 cards.").
  const flushDraws = () => {
    if (!draws) return;
    const who = draws.player === YOU ? 'You' : draws.player;
    if (draws.names.length > 0) lines.push(`${who} drew ${draws.names.join(', ')}.`);
    if (draws.hidden > 0) lines.push(`${who} drew ${draws.hidden === 1 ? 'a card' : `${draws.hidden} cards`}.`);
    draws = null;
  };
  for (const e of filterEventsFor(events, YOU)) {
    if (e.type === 'CardDrawn') {
      if (draws?.player !== e.player) flushDraws();
      draws ??= { player: e.player, names: [], hidden: 0 };
      if (e.card) draws.names.push(cardName(s, e.card));
      else draws.hidden += 1;
      continue;
    }
    flushDraws();
    const line = describe(s, e, YOU);
    if (line) lines.push(line);
  }
  flushDraws();
  if (lines.length > 0) console.log(lines.join('\n'));
}

// ---------------------------------------------------------------------------
// Your decisions
// ---------------------------------------------------------------------------

interface Option {
  label: string;
  /** Returns the actions to apply in order, or null to go back. */
  choose: () => Promise<Action[] | null>;
}

/** Applies a sequence of actions all-or-nothing. */
function applyAll(s: GameState, actions: Action[]): { state: GameState; events: GameEvent[] } | { error: string } {
  const events: GameEvent[] = [];
  for (const a of actions) {
    const r = applyAction(s, a);
    if (!r.ok) return { error: r.error };
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

function priorityOptions(s: GameState): Option[] {
  const legal = getLegalActions(s);
  const options: Option[] = [];
  const seenLand = new Set<string>();
  for (const a of legal) {
    if (a.type !== 'PlayLand') continue;
    const name = cardName(s, a.card);
    const how = a.reveal === true ? ' untapped (reveal a matching card)' : a.reveal === false ? ' tapped' : '';
    if (seenLand.has(name + how)) continue;
    seenLand.add(name + how);
    options.push({ label: `Play ${name}${how}`, choose: async () => [a] });
  }

  // Spells, from the same list the browser board uses: costs include reductions
  // and alternative costs, and each mode combination and target is a choice.
  const seenSpell = new Set<string>();
  for (const play of playableCards(s, YOU)) {
    if (play.kind !== 'spell') continue;
    const d = defOf(s, s.cards[play.card]!);
    const key = `${d.id}|${play.label}|${play.detail ?? ''}`;
    if (seenSpell.has(key)) continue;
    seenSpell.add(key);
    options.push({
      label: `${play.label} ${d.name}${play.detail ?? ''} ${play.label === 'Cast' ? (d.manaCost ?? '') : ''}  - ${rulesSummary(d)}`,
      choose: async () => {
        const choices = play.choices;
        if (choices.length === 1) return [...choices[0]!.taps, choices[0]!.action];
        console.log(`  Choose how to cast ${d.name}:`);
        choices.forEach((c, i) => {
          const modes = c.modes?.map((m) => `mode ${m + 1}`).join(' + ');
          const targets = c.targets.map((t) => targetName(s, t, YOU)).join(', ');
          console.log(`    ${i + 1}) ${[modes, targets && `targeting ${targets}`].filter(Boolean).join(', ')}`);
        });
        const pick = choices[Number(await ask('  Number (Enter = cancel): ')) - 1];
        return pick ? [...pick.taps, pick.action] : null;
      },
    });
  }
  return options;
}

/** Whether to stop and ask, given that you have something you could do. */
function worthStopping(s: GameState): boolean {
  if (stopEverywhere) return true;
  const top = s.stack.at(-1);
  if (top) return top.controller !== YOU;
  if (s.activePlayer === YOU) return s.step === 'main1' || s.step === 'main2';
  return s.step === 'declareAttackers' || s.step === 'declareBlockers' || s.step === 'end';
}

const HELP = `
  Type an option's number and press Enter. Press Enter on its own to pass.
  Other commands:  b = show the board   f = toggle stopping at every step
                   q = concede          ? = this help
  Lands tap automatically when you cast a spell. Priority passes for you when
  you have nothing to do, unless stopping at every step is on.`;

async function decidePriority(s: GameState): Promise<Action[]> {
  const options = priorityOptions(s);
  const pass: Action[] = [{ type: 'PassPriority', player: YOU }];
  if (options.length === 0 || !worthStopping(s)) return pass;
  render(s);
  for (;;) {
    console.log('\n  What do you want to do? (Enter = pass)');
    options.forEach((o, i) => console.log(`    ${i + 1}) ${o.label}`));
    const input = (await ask('> ')).toLowerCase();
    if (input === '') return pass;
    if (input === 'b') {
      render(s);
      continue;
    }
    if (input === '?' || input === 'h') {
      console.log(HELP);
      continue;
    }
    if (input === 'f') {
      stopEverywhere = !stopEverywhere;
      console.log(`  Stopping at every step: ${stopEverywhere ? 'on' : 'off'}.`);
      continue;
    }
    if (input === 'q') {
      if ((await ask('  Concede this game? (y/N) ')).toLowerCase() === 'y') return [{ type: 'Concede', player: YOU }];
      continue;
    }
    const option = options[Number(input) - 1];
    if (!option) {
      console.log('  Not an option. Type ? for help.');
      continue;
    }
    const actions = await option.choose();
    if (actions) return actions;
  }
}

function parseNumbers(input: string, max: number): number[] | null {
  if (input === '') return [];
  const nums = input.split(/[\s,]+/).map(Number);
  return nums.every((n) => Number.isInteger(n) && n >= 1 && n <= max) ? [...new Set(nums)] : null;
}

async function decideAttacks(s: GameState): Promise<Action[]> {
  const legal = getLegalActions(s).filter(
    (a): a is Extract<Action, { type: 'DeclareAttackers' }> => a.type === 'DeclareAttackers',
  );
  const attackers = [...new Set(legal.flatMap((a) => a.attacks.map((x) => x.attacker)))];
  const defenders = s.turnOrder.filter((p) => p !== YOU && !s.players[p]!.eliminated);
  render(s);
  console.log('\n  Your creatures that can attack:');
  attackers.forEach((id, i) => console.log(`    ${i + 1}) ${creatureText(s, s.cards[id]!)}`));
  for (;;) {
    const input = (await ask('  Attack with (e.g. "1 2", a = all, Enter = no attack): ')).toLowerCase();
    if (input === 'b') {
      render(s);
      continue;
    }
    const picks = input === 'a' ? attackers.map((_, i) => i + 1) : parseNumbers(input, attackers.length);
    if (!picks) {
      console.log('  Please type creature numbers separated by spaces.');
      continue;
    }
    let defender = defenders[0]!;
    if (picks.length > 0 && defenders.length > 1) {
      defenders.forEach((p, i) => console.log(`    ${i + 1}) ${p} (${s.players[p]!.life} life)`));
      const d = Number(await ask('  Attack which player? '));
      defender = defenders[d - 1] ?? defender;
    }
    const action: Action = {
      type: 'DeclareAttackers',
      player: YOU,
      attacks: picks.map((n) => ({ attacker: attackers[n - 1]!, defender })),
    };
    const check = applyAction(s, action);
    if (check.ok) return [action];
    console.log(`  ${readable(s, check.error)}`);
  }
}

async function decideBlocks(s: GameState): Promise<Action[]> {
  const attacks = (s.combat?.attacks ?? []).filter((a) => a.defender === YOU && s.cards[a.attacker]?.zone === 'battlefield');
  const mine = s.players[YOU]!.battlefield
    .map((id) => s.cards[id]!)
    .filter((c) => defOf(s, c).types.includes('creature') && !c.tapped);
  const none: Action[] = [{ type: 'DeclareBlockers', player: YOU, blocks: [] }];
  if (mine.length === 0) return none;
  render(s);
  for (;;) {
    const blocks: Block[] = [];
    const used = new Set<string>();
    for (const a of attacks) {
      const attacker = s.cards[a.attacker]!;
      // Only offer creatures that are free and able to block this attacker.
      const able = mine.filter((b) => !used.has(b.id) && canBlock(s, b, attacker));
      const menace = defOf(s, attacker).keywords?.includes('Menace') ? ' It has menace: block with two or more, or none.' : '';
      console.log(`\n  ${creatureText(s, attacker)} is attacking you.${menace}`);
      if (able.length === 0) {
        console.log('  None of your creatures can block it.');
        continue;
      }
      able.forEach((c, i) => console.log(`    ${i + 1}) ${creatureText(s, c)}`));
      const input = await ask('  Block with (numbers, Enter = no block): ');
      for (const n of parseNumbers(input, able.length) ?? []) {
        const blocker = able[n - 1]!;
        used.add(blocker.id);
        blocks.push({ blocker: blocker.id, attacker: a.attacker });
      }
    }
    const action: Action = { type: 'DeclareBlockers', player: YOU, blocks };
    const check = applyAction(s, action);
    if (check.ok) return [action];
    console.log(`  ${readable(s, check.error)} Let's try that again.`);
  }
}

async function decideTriggerTargets(s: GameState): Promise<Action[]> {
  const options = getLegalActions(s).filter(
    (a): a is Extract<Action, { type: 'ChooseTargets' }> => a.type === 'ChooseTargets',
  );
  const t = s.triggerQueue[0]!;
  const spec = queuedTriggerSpec(s, t);
  console.log(`\n  ${cardName(s, t.source)} triggered: ${triggerText(spec)}`);
  options.forEach((o, i) => console.log(`    ${i + 1}) ${o.targets.map((x) => targetName(s, x, YOU)).join(', ')}`));
  for (;;) {
    const pick = options[Number(await ask('  Choose a target: ')) - 1];
    if (pick) return [pick];
    console.log('  Please type one of the numbers.');
  }
}

async function decideLegend(s: GameState, cards: string[]): Promise<Action[]> {
  console.log(`
  Legend rule: you control more than one ${cardName(s, cards[0])}. Choose one to keep:`);
  cards.forEach((id, i) => {
    const c = s.cards[id]!;
    const extras = [c.counters ? `+${c.counters} counters` : '', c.isToken ? 'token' : ''].filter(Boolean).join(', ');
    console.log(`    ${i + 1}) ${creatureText(s, c)}${extras ? ` (${extras})` : ''}`);
  });
  for (;;) {
    const keep = cards[Number(await ask('  Keep which? ')) - 1];
    if (keep) return [{ type: 'ChooseLegend', player: YOU, keep }];
    console.log('  Please type one of the numbers.');
  }
}

async function decideYesNo(s: GameState): Promise<Action[]> {
  const item = s.stack.at(-1)!;
  if (item.kind !== 'ability') throw new Error('Expected an ability to decide on.');
  const spec = triggerSpec(s, item)!;
  const no: Action[] = [{ type: 'Decide', player: YOU, accept: false }];
  const taps = planTaps(s, YOU, spec.cost?.mana);
  const life = triggerLifeCost(s, item);
  const canAfford = taps !== null && (life === undefined || s.players[YOU]!.life >= life);
  console.log(`\n  ${cardName(s, item.source)}: ${triggerText(spec)}`);
  if (!canAfford) {
    console.log("  You can't pay the cost, so the answer is no.");
    return no;
  }
  const answer = (await ask(`  ${spec.cost ? 'Pay the cost' : 'Do it'}? (y/N) `)).toLowerCase();
  if (answer !== 'y') return no;
  return [...tapActions(YOU, taps), { type: 'Decide', player: YOU, accept: true }];
}

function showHand(s: GameState): void {
  s.players[YOU]!.hand.forEach((id, i) => {
    const d = s.cardDefs[s.cards[id]!.defId]!;
    const rules = rulesSummary(d);
    console.log(`    ${i + 1}) ${`${d.name} ${d.manaCost ?? ''}`.trim()}${rules ? ` - ${rules}` : ''}`);
  });
}

async function decideMulligan(s: GameState, taken: number): Promise<Action[]> {
  const lands = s.players[YOU]!.hand.filter((id) => s.cardDefs[s.cards[id]!.defId]!.types.includes('land')).length;
  console.log(`
  Your opening hand${taken > 0 ? ` after ${taken} mulligan${taken === 1 ? '' : 's'}` : ''} (${lands} land${lands === 1 ? '' : 's'}):`);
  showHand(s);
  const canMulligan = getLegalActions(s).some((a) => a.type === 'Mulligan' && !a.keep);
  if (!canMulligan) {
    console.log('  You can’t mulligan any further, so you keep this hand.');
    return [{ type: 'Mulligan', player: YOU, keep: true }];
  }
  const bottom = cardsToBottom(s, taken + 1);
  const cost = bottom === 0 ? 'free' : `you'd put ${bottom} card${bottom === 1 ? '' : 's'} on the bottom`;
  const answer = (await ask(`  Keep this hand? (Y = keep, n = mulligan for a new seven; ${cost}) `)).toLowerCase();
  return [{ type: 'Mulligan', player: YOU, keep: answer !== 'n' }];
}

async function decideBottom(s: GameState, count: number): Promise<Action[]> {
  const hand = s.players[YOU]!.hand;
  console.log(`
  You kept. Choose ${count} card${count === 1 ? '' : 's'} to put on the bottom of your library:`);
  showHand(s);
  for (;;) {
    const picks = parseNumbers(await ask(`  Card number${count === 1 ? '' : 's'} (e.g. "${count === 1 ? '3' : '3 5'}"): `), hand.length);
    if (picks && picks.length === count) return [{ type: 'BottomCards', player: YOU, cards: picks.map((n) => hand[n - 1]!) }];
    console.log(`  Please type exactly ${count} different number${count === 1 ? '' : 's'} from the list.`);
  }
}

/** Choosing cards to discard, sacrifice or keep while something resolves. */
async function decideCards(s: GameState, p: Extract<GameState['pending'], { kind: 'chooseCards' }>): Promise<Action[]> {
  const verb =
    p.purpose === 'discard' || p.purpose === 'handSize'
      ? 'discard'
      : p.purpose === 'sacrifice'
        ? 'sacrifice'
        : p.purpose === 'battlefield'
          ? 'put onto the battlefield'
          : p.purpose === 'hand'
            ? 'put into your hand (the rest go on the bottom)'
            : p.purpose === 'fateBottom' ? 'put on the bottom of the caster’s library (the other returns tapped)'
            : p.purpose === 'addCounters' ? `receive a ${p.counter ?? '+1/+1'} counter each`
            : p.purpose === 'copyOnEntry' ? 'copy as your creature enters (none: it enters as itself)'
            : 'keep (the rest are sacrificed)';
  if (p.allOrNothing) {
    const yes = (await ask(`\n  Discard your whole hand (${p.cards.length} cards)? (y/N) `)).toLowerCase() === 'y';
    return [{ type: 'ChooseCards', player: YOU, cards: yes ? [...p.cards] : [] }];
  }
  const how = p.min === p.max ? `${p.min}` : `${p.min} to ${p.max}`;
  console.log(`\n  Choose ${how} card${p.max === 1 ? '' : 's'} to ${verb}:`);
  p.cards.forEach((id, i) => console.log(`    ${i + 1}) ${cardName(s, id)}`));
  for (;;) {
    const answer = await ask('  Numbers separated by spaces (Enter for none): ');
    const picks = answer.trim() === '' ? [] : parseNumbers(answer, p.cards.length);
    const cards = picks?.map((n) => p.cards[n - 1]!);
    if (cards && !choiceProblem(s, p, cards)) return [{ type: 'ChooseCards', player: YOU, cards }];
    console.log(`  ${cards ? choiceProblem(s, p, cards) : 'Please type numbers from the list.'}`);
  }
}

// ---------------------------------------------------------------------------
// Game loop
// ---------------------------------------------------------------------------

async function playOneGame(gameSeed: number): Promise<void> {
  const decks: Record<PlayerId, ReturnType<typeof starterKitDeck>> = { [YOU]: starterKitDeck(yourDeck) };
  botIds.forEach((id, i) => {
    decks[id] = starterKitDeck((yourDeck === 'RW') === (i % 2 === 0) ? 'UB' : 'RW');
  });
  const created = createGame({
    format: FREE_FOR_ALL,
    cardDefs: CARD_DEFS,
    seed: gameSeed,
    players: [YOU, ...botIds].map((id) => ({ id, deck: decks[id]! })),
    mulligans: true,
  });
  let s = created.state;
  console.log(`\nNew game (seed ${gameSeed}). You are playing the ${yourDeck === 'RW' ? 'red-white' : 'blue-black'} deck`);
  console.log(`against ${botIds.join(', ')}. ${s.activePlayer === YOU ? 'You go' : `${s.activePlayer} goes`} first. Type ? for help.`);
  narrate(s, created.events);

  while (s.pending.kind !== 'gameOver') {
    const pending = s.pending;
    let actions: Action[];
    if (pending.player !== YOU) {
      actions = [bots[pending.player]!(s, getLegalActions(s))];
    } else if (pending.kind === 'declareAttackers') {
      actions = await decideAttacks(s);
    } else if (pending.kind === 'declareBlockers') {
      actions = await decideBlocks(s);
    } else if (pending.kind === 'chooseModes') {
      const options = getLegalActions(s).filter((a): a is Extract<Action, { type: 'ChooseModes' }> => a.type === 'ChooseModes');
      const spec = queuedTriggerSpec(s, s.triggerQueue[0]!);
      options.forEach((a, i) => console.log(`  ${i + 1}) ${a.modes.map((m) => spec.modes![m]!.map((e) => e.effect).join(', ')).join(' + ')}`));
      const choice = options[Number(await ask('  Choose modes: ')) - 1];
      if (!choice) continue;
      actions = [choice];
    } else if (pending.kind === 'copyCreature') {
      const accept = /^y/i.test(await ask('  Become a copy? [y/N] '));
      actions = [{type:'CopyCreature',player:YOU,accept}];
    } else if (pending.kind === 'chooseOpponent') {
      console.log('  Choose the opponent who chooses the card for the bottom of your library:');
      pending.opponents.forEach((id, i) => console.log('    ' + (i + 1) + ') ' + id));
      const opponent = pending.opponents[Number(await ask('  Opponent: ')) - 1];
      if (!opponent) continue;
      actions = [{ type: 'ChooseOpponent', player: YOU, opponent }];
    } else if (pending.kind === 'chooseDefender') {
      console.log('  Choose which player the returning creature attacks:');
      pending.defenders.forEach((id, i) => console.log('    ' + (i + 1) + ') ' + id));
      const defender = pending.defenders[Number(await ask('  Defending player: ')) - 1];
      if (!defender) continue;
      actions = [{ type: 'ChooseDefender', player: YOU, defender }];
    } else if (pending.kind === 'chooseTargets') {
      actions = await decideTriggerTargets(s);
    } else if (pending.kind === 'decide') {
      actions = await decideYesNo(s);
    } else if (pending.kind === 'chooseLegend') {
      actions = await decideLegend(s, pending.cards);
    } else if (pending.kind === 'commanderZone') {
      const stay = (await ask(`  Your commander ${cardName(s, pending.card)} went to your ${pending.zone}. Move it to the command zone? (Y/n) `)).toLowerCase() === 'n';
      actions = [{ type: 'CommanderZone', player: YOU, toCommand: !stay }];
    } else if (pending.kind === 'mulligan') {
      actions = await decideMulligan(s, pending.taken);
    } else if (pending.kind === 'bottomCards') {
      actions = await decideBottom(s, pending.count);
    } else if (pending.kind === 'chooseCards') {
      actions = await decideCards(s, pending);
    } else if (pending.kind === 'chooseMana') {
      const answer = (await ask('  Mana color for ' + pending.recipient + ' (W/U/B/R/G): ')).trim().toUpperCase();
      const mana = (['W','U','B','R','G'].includes(answer) ? answer : 'W') as 'W'|'U'|'B'|'R'|'G';
      actions = [{type:'ChooseMana',player:YOU,mana}];
    } else if (pending.kind === 'exileTop') {
      const exile = (await ask('  Exile ' + cardName(s, pending.card) + ' face down? (y/N) ')).toLowerCase() === 'y';
      actions = [{ type: 'ExileTop', player: YOU, exile }];
    } else if (pending.kind === 'surveil') {
      const scrying = !!pending.scry;
      const toGraveyard = (await ask(`  ${scrying ? 'Scry' : 'Surveil'}: put ${cardName(s, pending.card)} ${scrying ? 'on the bottom of your library' : 'into your graveyard'}? (y/N) `)).toLowerCase() === 'y';
      actions = [{ type: 'Surveil', player: YOU, toGraveyard }];
    } else {
      actions = await decidePriority(s);
    }
    const result = applyAll(s, actions);
    if ('error' in result) {
      // Shouldn't happen: every human option is checked first and bots only pick legal moves.
      console.log(`  That didn't work: ${readable(s, result.error)}`);
      continue;
    }
    s = result.state;
    narrate(s, result.events);
  }
}

async function main(): Promise<void> {
  console.log('Project Nexus - play against the AI');
  console.log('Final Fantasy Starter Kit cards so far, plus real cards from other sets. Try npm run dev for the graphical board.');
  let gameSeed = seed;
  try {
    for (;;) {
      await playOneGame(gameSeed);
      const again = (await ask('\nPlay again? (y/N) ')).toLowerCase();
      if (again !== 'y') break;
      gameSeed += 1;
    }
  } catch (e) {
    if (!(e instanceof Quit)) throw e;
  } finally {
    rl.close();
  }
  console.log(`\nThanks for playing. Replay this exact game with: npm run play -- --seed ${seed}`);
}

await main();
