// A board to look at during development, without signing in: a Commander
// game with the precons (?players=2-4, ?turns=N, ?seed=N) played on by the AI
// for every seat, then shown on the usual board. Only the development server
// serves it (npm run dev, then /preview.html); the built app doesn't include it.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FIN_PRECONS } from '@nexus/cards';
import { basicAi } from '@nexus/bots';
import { GameSession, YOU } from './game/session.ts';
import { Game } from './components/Game.tsx';
import './styles.css';

const params = new URLSearchParams(location.search);
const players = Math.min(4, Math.max(2, Number(params.get('players') ?? 4)));
const turns = Number(params.get('turns') ?? 6);
const seed = Number(params.get('seed') ?? 7);
const session = new GameSession({ format: 'commander', deck: 'RW', precon: FIN_PRECONS[0]!.name, opponents: players - 1, seed, bot: 'ai' });
const me = basicAi(seed);
for (let guard = 0; guard < 4000 && session.state.turnNumber <= turns && session.state.pending.kind !== 'gameOver'; guard++) {
  const s = session.state;
  if ('player' in s.pending && s.pending.player === YOU) {
    const error = session.submit([me(s, session.legal())]);
    if (error) break;
  } else session.advance();
}

// ?control=1: you control the next opponent's turn (The Dominion Bracelet), to see that board.
if (params.get('control')) {
  for (let guard = 0; guard < 400 && session.state.activePlayer === YOU; guard++) {
    const s = session.state;
    if ('player' in s.pending && s.pending.player === YOU) session.submit([me(s, session.legal())]);
    else session.advance();
  }
  const s = session.state;
  s.turnControl = [{ player: s.activePlayer, by: YOU, turn: s.turnNumber }];
}

// ?over=win|loss|none: the game ends there, to see the reward screen (with sample rewards, or none).
const over = params.get('over');
if (over) {
  const s = session.state;
  s.winner = over === 'loss' ? s.turnOrder.find((p) => p !== YOU)! : YOU;
  s.pending = { kind: 'gameOver' } as typeof s.pending;
  if (over !== 'none') {
    session.rewards = over === 'win'
      ? { lines: [{ label: 'Game against the computer', amount: 75 }, { label: 'Win bonus', amount: 50 }, { label: 'Your first win', amount: 500 }, { label: 'Daily quest: Win a game', amount: 300 }], balance: 6025 }
      : { lines: [{ label: 'Game against the computer', amount: 75 }], balance: 5175 };
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Game session={session} onQuit={() => location.reload()} />
  </StrictMode>,
);
