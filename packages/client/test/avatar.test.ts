import { describe, expect, it } from 'vitest';
import { avatarText } from '../src/components/Zones.tsx';

describe('player avatars', () => {
  it('show You, local bot numbers, or a name\'s initials (online tables)', () => {
    expect(avatarText('You')).toBe('You');
    expect(avatarText('Bot2')).toBe('B2');
    expect(avatarText('Chocobo Bot')).toBe('CB');
    expect(avatarText('Ann')).toBe('AN');
  });
});
