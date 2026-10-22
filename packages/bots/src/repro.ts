// Replays one fuzz game and prints how it ended, for debugging a failing seed:
//
//   node packages/bots/src/repro.ts --seed 108 --players 4 --bot ai --format commander
//
// Seats and bots are set up exactly as in fuzz.ts. On an error it prints the
// last actions taken and the error with its stack.

import { parseArgs } from 'node:util';
import { COMMANDER, FREE_FOR_ALL, type Action, type PlayerSetup } from '@nexus/engine';
import { CARD_DEFS, FIN_PRECONS, preconDeck, starterKitDeck } from '@nexus/cards';
import { basicAi, playGame, randomBot } from './index.ts';
import { checkInvariants } from './invariants.ts';
import { describe } from './narrate.ts';

const { values } = parseArgs({
  options: {
    seed: { type: 'string', default: '1' },
    players: { type: 'string', default: '2' },
    bot: { type: 'string', default: 'ai' },
    format: { type: 'string', default: 'starter' },
    last: { type: 'string', default: '30' },
  },
});
const seed = Number(values.seed);
const players = Number(values.players);
const last = Number(values.last);
const commander = values.format === 'commander';
const make = values.bot === 'random' ? randomBot : basicAi;

function seat(p: number): PlayerSetup {
  if (!commander) return { id: `P${p + 1}`, deck: starterKitDeck(p % 2 ? 'UB' : 'RW') };
  const precon = FIN_PRECONS[(p + seed) % FIN_PRECONS.length]!;
  return { id: `P${p + 1}`, ...preconDeck(precon.name) };
}

const recent: Action[] = [];
try {
  const game = playGame(
    {
      format: commander ? COMMANDER : FREE_FOR_ALL,
      cardDefs: CARD_DEFS,
      seed,
      mulligans: true,
      players: Array.from({ length: players }, (_, p) => seat(p)),
    },
    Object.fromEntries(Array.from({ length: players }, (_, p) => [`P${p + 1}`, make(seed * 7 + p)])),
    {
      onAction: (state, action) => {
        recent.push(action);
        if (recent.length > last) recent.shift();
        const problems = checkInvariants(state);
        if (problems.length) throw new Error(problems.join('; '));
      },
    },
  );
  for (const e of game.events.slice(-last)) {
    const line = describe(game.state, e);
    if (line) console.log(line);
  }
  console.log(`finished: ${game.finished}, actions: ${game.actions.length}`);
} catch (e) {
  for (const a of recent) console.log(JSON.stringify(a));
  console.log('ERROR', (e as Error).stack);
}
