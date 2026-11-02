import { describe, expect, it } from 'vitest';
import { GameSession } from '../src/game/session.ts';
import { gameAssets, preloadImages } from '../src/game/precheck.ts';
import { playerAvatar, setPlayerAvatars } from '../src/game/avatars.ts';

describe('the precheck before a game opens', () => {
  it('finds every visible card’s image and no problems in a normal game', () => {
    const s = new GameSession({ format: 'commander', deck: 'RW', opponents: 3, seed: 4, bot: 'ai' });
    const { images, problems } = gameAssets(s);
    expect(problems).toEqual([]);
    expect(images.length).toBeGreaterThan(7);
    expect(images.every((u) => u.startsWith('https://'))).toBe(true);
  });

  it('reports a card this browser does not know', () => {
    const s = new GameSession({ deck: 'RW', opponents: 1, seed: 1, bot: 'ai' });
    const id = Object.keys(s.state.cards)[0]!;
    s.state = { ...s.state, cards: { ...s.state.cards, [id]: { ...s.state.cards[id]!, defId: 'no-such-card' } } };
    expect(gameAssets(s).problems.join(' ')).toMatch(/doesn't know the card "no-such-card"/);
  });

  it('nothing to load is done at once (and outside a browser)', async () => {
    expect(await preloadImages([])).toBe(0);
  });

  it('a new local game clears online profile pictures', () => {
    setPlayerAvatars([['Ann', 'https://cdn.discordapp.com/a.png']]);
    expect(playerAvatar('Ann')).toBe('https://cdn.discordapp.com/a.png');
    new GameSession({ deck: 'RW', opponents: 1, seed: 1, bot: 'ai' });
    expect(playerAvatar('Ann')).toBeUndefined();
  });
});
