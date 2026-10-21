// Long fuzz run (PRD 18: 10,000 games without invariant violations).
//
//   npm run fuzz                    # 10,000 games across 2, 3 and 4 players
//   npm run fuzz -- --games 500 --start 20000
//   npm run fuzz -- --format commander --games 200   # the Commander precons
//
// Any failing seed is printed so it can be replayed with `npm run sim`.

import { COMMANDER, FREE_FOR_ALL, type PlayerSetup } from '@nexus/engine';
import { CARD_DEFS, FIN_PRECONS, preconDeck, starterKitDeck } from '@nexus/cards';
import { parseArgs } from 'node:util';
import { basicAi, playGame, randomBot } from './index.ts';
import { checkInvariants } from './invariants.ts';

const { values } = parseArgs({
  options: {
    games: { type: 'string', default: '10000' },
    start: { type: 'string', default: '1' },
    format: { type: 'string', default: 'starter' },
  },
});
const commander = values.format === 'commander';

/** Each seat's deck: Starter Kits alternating, or a different precon per seat. */
function seat(p: number, seed: number): PlayerSetup {
  if (!commander) return { id: `P${p + 1}`, deck: starterKitDeck(p % 2 ? 'UB' : 'RW') };
  const precon = FIN_PRECONS[(p + seed) % FIN_PRECONS.length]!;
  return { id: `P${p + 1}`, ...preconDeck(precon.name) };
}
const games = Number(values.games);
const start = Number(values.start);

let failures = 0;
let unfinished = 0;
const began = performance.now();
for (let i = 0; i < games; i++) {
  const seed = start + i;
  const players = 2 + (i % 3);
  const make = i % 2 === 0 ? randomBot : basicAi;
  try {
    const game = playGame(
      {
        format: commander ? COMMANDER : FREE_FOR_ALL,
        cardDefs: CARD_DEFS,
        seed,
        players: Array.from({ length: players }, (_, p) => seat(p, seed)),
      },
      Object.fromEntries(Array.from({ length: players }, (_, p) => [`P${p + 1}`, make(seed * 7 + p)])),
      {
        onAction: (state) => {
          const problems = checkInvariants(state);
          if (problems.length > 0) throw new Error(problems.join('; '));
        },
      },
    );
    if (!game.finished) unfinished++;
  } catch (e) {
    failures++;
    console.error(`seed ${seed} (${players} players, ${make.name}): ${(e as Error).message}`);
  }
  if ((i + 1) % 1000 === 0) console.log(`${i + 1}/${games} games...`);
}
const seconds = ((performance.now() - began) / 1000).toFixed(1);
console.log(`\n${games} games in ${seconds}s: ${failures} failed, ${unfinished} hit the action limit.`);
process.exit(failures > 0 || unfinished > 0 ? 1 : 0);
