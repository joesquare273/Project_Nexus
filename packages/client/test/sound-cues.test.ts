import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@nexus/engine';
import { MAX_CUES, SOUND_IDS, soundsFor } from '../src/audio/cues.ts';
import { GameSession, YOU } from '../src/game/session.ts';

const ids = (events: GameEvent[]) => soundsFor(events, 'You').map((c) => c.id);

describe('sound cues', () => {
  it('maps the main game events to sounds, yours and theirs', () => {
    expect(soundsFor([{ type: 'CardDrawn', player: 'Bot1' }], 'You')).toEqual([{ id: 'draw', mine: false }]);
    expect(soundsFor([{ type: 'LandPlayed', player: 'You', card: 'c1', from: 'hand' }], 'You')).toEqual([{ id: 'land', mine: true }]);
    expect(ids([{ type: 'SpellCast', player: 'You', card: 'c1', defId: 'x', targets: [], manaSpent: 2 }])).toEqual(['cast']);
    expect(ids([{ type: 'SpellCast', player: 'You', card: 'c1', defId: 'x', targets: [], manaSpent: 6 }])).toEqual(['castBig']);
    expect(ids([{ type: 'SpellCast', castFrom: 'command', player: 'You', card: 'c1', defId: 'x', targets: [], manaSpent: 6 }])).toEqual(['commander']);
    expect(ids([{ type: 'TurnChanged', activePlayer: 'You', turnNumber: 3 }])).toEqual(['yourTurn']);
    expect(ids([{ type: 'TurnChanged', activePlayer: 'Bot1', turnNumber: 4 }])).toEqual([]);
  });

  it('makes one big sound for a board wipe, and a countered spell does not also resolve', () => {
    const died = (card: string): GameEvent => ({ type: 'CardMoved', card, owner: 'Bot1', from: 'battlefield', to: 'graveyard' });
    expect(ids([died('a')])).toEqual(['die']);
    expect(ids([died('a'), died('b'), died('c'), died('d')])).toEqual(['wipe']);
    expect(ids([{ type: 'SpellCountered', card: 's', defId: 'x', by: 'y' }, { type: 'CardMoved', card: 's', owner: 'You', from: 'stack', to: 'graveyard' }])).toEqual(['countered']);
  });

  it('damage covers the life loss it causes; a win drowns out the rest', () => {
    const hit: GameEvent[] = [
      { type: 'DamageDealt', source: 'c', target: { kind: 'player', player: 'You' }, amount: 7 } as GameEvent,
      { type: 'LifeChanged', player: 'You', from: 20, to: 13 },
    ];
    expect(ids(hit)).toEqual(['damageBig']);
    expect(ids([{ type: 'LifeChanged', player: 'You', from: 20, to: 18 }])).toEqual(['lifeLoss']);
    expect(ids([...hit, { type: 'GameEnded', winner: 'You' }])).toEqual(['win']);
  });

  it('never makes more than a few sounds from one batch, and the session records them', () => {
    const session = new GameSession({ format: 'constructed', deck: 'RW', opponents: 3, seed: 5, bot: 'ai' });
    for (let i = 0; i < 400 && session.state.pending.kind !== 'gameOver'; i++) {
      if ('player' in session.state.pending && session.state.pending.player === YOU) session.submit([session.legal()[0]!]);
      else session.advance();
    }
    expect(session.sounds.length).toBeGreaterThan(5);
    for (const batch of session.sounds) {
      expect(batch.cues.length).toBeLessThanOrEqual(MAX_CUES);
      for (const c of batch.cues) expect(SOUND_IDS).toContain(c.id);
    }
  });
});
