// Which sounds a batch of game events makes (docs/audio.md, "Sound map").
// Pure: the session turns each batch of events it shows into a few cues,
// and the board plays them as it draws that batch. One batch makes at most
// a handful of sounds, so a board wipe is one big sound, not twenty.

import type { GameEvent, PlayerId } from '@nexus/engine';

export type SoundId =
  | 'draw'
  | 'shuffle'
  | 'land'
  | 'cast'
  | 'castBig'
  | 'commander'
  | 'permanent'
  | 'resolve'
  | 'countered'
  | 'tap'
  | 'untap'
  | 'attack'
  | 'block'
  | 'damage'
  | 'damageBig'
  | 'die'
  | 'wipe'
  | 'exile'
  | 'lifeGain'
  | 'lifeLoss'
  | 'counter'
  | 'token'
  | 'yourTurn'
  | 'dice'
  | 'coin'
  | 'win'
  | 'lose';

export const SOUND_IDS: readonly SoundId[] = [
  'draw', 'shuffle', 'land', 'cast', 'castBig', 'commander', 'permanent', 'resolve', 'countered', 'tap', 'untap', 'attack', 'block',
  'damage', 'damageBig', 'die', 'wipe', 'exile', 'lifeGain', 'lifeLoss', 'counter', 'token', 'yourTurn', 'dice', 'coin', 'win', 'lose',
];

/** One sound to play; `mine` is false for what other players do (played a little quieter). */
export interface SoundCue {
  id: SoundId;
  mine: boolean;
}

/** Most sounds one batch of events makes. */
export const MAX_CUES = 4;

/** When a batch would make more than MAX_CUES sounds, the earlier ones here win. */
const PRIORITY: readonly SoundId[] = [
  'win', 'lose', 'wipe', 'commander', 'countered', 'damageBig', 'castBig', 'cast', 'permanent', 'resolve', 'land', 'attack', 'block',
  'damage', 'die', 'exile', 'token', 'lifeGain', 'lifeLoss', 'yourTurn', 'dice', 'coin', 'counter', 'shuffle', 'draw', 'tap', 'untap',
];

export function soundsFor(events: readonly GameEvent[], viewer: PlayerId): SoundCue[] {
  const cues = new Map<SoundId, boolean>();
  const add = (id: SoundId, mine: boolean) => cues.set(id, (cues.get(id) ?? false) || mine);
  let deaths = 0;
  let deathsMine = false;
  const countered = events.some((e) => e.type === 'SpellCountered');
  const damaged = events.some((e) => e.type === 'DamageDealt');
  for (const e of events) {
    switch (e.type) {
      case 'CardDrawn':
        add('draw', e.player === viewer);
        break;
      case 'LibraryShuffled':
        add('shuffle', e.player === viewer);
        break;
      case 'LandPlayed':
        add('land', e.player === viewer);
        break;
      case 'SpellCast':
        add(e.castFrom === 'command' ? 'commander' : e.manaSpent >= 5 ? 'castBig' : 'cast', e.player === viewer);
        break;
      case 'SpellCountered':
        add('countered', true);
        break;
      case 'CardMoved': {
        const mine = (e.controller ?? e.owner) === viewer;
        if (e.from === 'stack' && e.to === 'battlefield') add('permanent', mine);
        else if (e.from === 'stack' && e.to === 'graveyard' && !countered) add('resolve', mine);
        else if (e.from === 'battlefield' && e.to === 'graveyard') {
          deaths++;
          deathsMine ||= mine;
        } else if (e.to === 'exile' && e.from !== 'library' && e.from !== 'hand') add('exile', mine);
        break;
      }
      case 'CardTapped':
        // The event doesn't say whose card it was; taps are small sounds anyway.
        add('tap', false);
        break;
      case 'CardsUntapped':
        if (e.cards.length) add('untap', e.player === viewer);
        break;
      case 'AttackDeclared':
        add('attack', e.defendingPlayer !== viewer);
        break;
      case 'BlockDeclared':
        add('block', true);
        break;
      case 'DamageDealt':
        add(e.amount >= 5 ? 'damageBig' : 'damage', e.target.kind === 'player' && e.target.player === viewer);
        break;
      case 'LifeChanged':
        if (e.to > e.from) add('lifeGain', e.player === viewer);
        else if (e.to < e.from && !damaged) add('lifeLoss', e.player === viewer);
        break;
      case 'CountersAdded':
      case 'PoisonChanged':
        add('counter', true);
        break;
      case 'TokenCreated':
        add('token', e.controller === viewer);
        break;
      case 'TurnChanged':
        if (e.activePlayer === viewer) add('yourTurn', true);
        break;
      case 'DieRolled':
        add('dice', e.player === viewer);
        break;
      case 'CoinFlipped':
        add('coin', e.player === viewer);
        break;
      case 'GameEnded':
        add(e.winner === viewer ? 'win' : 'lose', true);
        break;
      default:
        break;
    }
  }
  if (deaths >= 3) add('wipe', deathsMine);
  else if (deaths > 0) add('die', deathsMine);
  // A win or loss drowns out the rest.
  if (cues.has('win') || cues.has('lose')) for (const id of [...cues.keys()]) if (id !== 'win' && id !== 'lose') cues.delete(id);
  return PRIORITY.filter((id) => cues.has(id))
    .slice(0, MAX_CUES)
    .map((id) => ({ id, mine: cues.get(id)! }));
}
