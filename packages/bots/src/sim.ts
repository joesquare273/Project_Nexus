// Command-line harness: plays a seeded bot game and prints a readable log.
//
//   npm run sim -- --players 3 --seed 7
//   npm run sim -- --players 4 --seed 7 --bot random --quiet

import { FREE_FOR_ALL } from '@nexus/engine';
import { CARD_DEFS, starterKitDeck } from '@nexus/cards';
import { parseArgs } from 'node:util';
import { basicAi, playGame, randomBot } from './index.ts';
import { describe } from './narrate.ts';

const { values } = parseArgs({
  options: {
    players: { type: 'string', default: '2' },
    seed: { type: 'string', default: '1' },
    bot: { type: 'string', default: 'ai' },
    quiet: { type: 'boolean', default: false },
  },
});

const count = Number(values.players);
const seed = Number(values.seed);
const ids = Array.from({ length: count }, (_, i) => `P${i + 1}`);
const makeBot = values.bot === 'random' ? randomBot : basicAi;

const game = playGame(
  {
    format: FREE_FOR_ALL,
    cardDefs: CARD_DEFS,
    seed,
    players: ids.map((id, i) => ({ id, deck: starterKitDeck(i % 2 === 0 ? 'RW' : 'UB') })),
    mulligans: true,
  },
  Object.fromEntries(ids.map((id, i) => [id, makeBot(seed * 31 + i)])),
);

if (!values.quiet) {
  for (const e of game.events) {
    const line = describe(game.state, e);
    if (line) console.log(line);
  }
}
console.log(
  `\n${count} players, seed ${seed}: ${game.finished ? `winner ${game.state.winner ?? 'none'}` : 'unfinished'} ` +
    `after ${game.state.turnNumber} turns and ${game.actions.length} actions.`,
);
