import { describe, expect, it } from 'vitest';
import { copyName } from '../src/packs/DecksView.tsx';

describe('duplicating a deck', () => {
  it('names the copy "(copy)", then "(copy 2)" and on, within the 40-character limit', () => {
    expect(copyName('Mono Red', [{ name: 'Mono Red' }])).toBe('Mono Red (copy)');
    expect(copyName('Mono Red', [{ name: 'Mono Red' }, { name: 'Mono Red (copy)' }])).toBe('Mono Red (copy 2)');
    const long = 'A'.repeat(40);
    const named = copyName(long, [{ name: long }]);
    expect(named.length).toBe(40);
    expect(named.endsWith(' (copy)')).toBe(true);
  });
});
