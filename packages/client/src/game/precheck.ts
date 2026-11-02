// The check before a game opens on the board (online Commander tables and
// draft event games): every card the game shows is one this browser knows,
// the board can read the game, and the card images are loaded, so the game
// doesn't start with blank cards. Images that fail to load aren't fatal: the
// board draws those cards' frames instead.

import { CARD_DEFS } from '@nexus/cards';
import type { GameSession } from './session.ts';
import { scryfallOf } from './cards.ts';

export interface PrecheckProgress {
  /** Card images loaded (or given up on) so far, out of `total`. */
  loaded: number;
  total: number;
}

export interface PrecheckResult {
  /** Problems that would break the game on the board (unknown cards, an unreadable game). */
  problems: string[];
  images: number;
  /** Images that didn't load (shown as drawn frames). */
  failed: number;
}

/** Loads images, at most `limit` ms in all; resolves how many failed or timed out. */
export function preloadImages(urls: readonly string[], onProgress?: (loaded: number, total: number) => void, limit = 10_000): Promise<number> {
  const unique = [...new Set(urls)];
  if (unique.length === 0 || typeof Image === 'undefined') return Promise.resolve(0);
  let loaded = 0;
  let failed = 0;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(failed + (unique.length - loaded)), limit);
    for (const url of unique) {
      const img = new Image();
      const done = (ok: boolean) => {
        loaded++;
        if (!ok) failed++;
        onProgress?.(loaded, unique.length);
        if (loaded === unique.length) {
          clearTimeout(timer);
          resolve(failed);
        }
      };
      img.onload = () => done(true);
      img.onerror = () => done(false);
      img.src = url;
    }
  });
}

/** The image URLs and problems for the cards a session can see. */
export function gameAssets(session: GameSession): { images: string[]; problems: string[] } {
  const problems: string[] = [];
  const images: string[] = [];
  try {
    session.view();
  } catch (e) {
    problems.push(`The board can't read this game: ${e instanceof Error ? e.message : String(e)}`);
  }
  for (const card of Object.values(session.state.cards)) {
    // Hidden cards (other players' hands, libraries) have no definition to check.
    if (card.defId.startsWith('?')) continue;
    if (!CARD_DEFS[card.defId]) {
      problems.push(`This browser doesn't know the card "${card.defId}". Reload the page to get the latest version.`);
      continue;
    }
    const info = scryfallOf(card.defId, card.printing);
    if (info) images.push(info.image.normal);
  }
  return { images, problems: [...new Set(problems)] };
}

export async function precheckGame(session: GameSession, onProgress?: (p: PrecheckProgress) => void): Promise<PrecheckResult> {
  const { images, problems } = gameAssets(session);
  const total = new Set(images).size;
  onProgress?.({ loaded: 0, total });
  const failed = await preloadImages(images, (loaded) => onProgress?.({ loaded, total }));
  return { problems, images: total, failed };
}
