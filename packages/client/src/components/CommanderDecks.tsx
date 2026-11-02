// The player's own saved Commander decks to play with (only decks they own,
// user rule 2026-10-30): the Vs. computer page and online Commander tables.

import { useEffect, useState } from 'react';
import { BOOSTER_CARDS } from '@nexus/cards/boosters';
import { gameDeck, type GameDeck } from '@nexus/cards/decks';
import { accessToken } from '../account/AccountBar.tsx';
import { fetchDecks, type SavedDeck } from '../packs/collection.ts';
import { PRINTING_CARDS } from '../packs/browse.ts';

/** A deck's commander art (its printing's art crop). */
export function commanderArt(id: string | null | undefined): string | undefined {
  return id ? [...PRINTING_CARDS, ...BOOSTER_CARDS].find((c) => c.id === id)?.images[0]?.artCrop : undefined;
}

/**
 * Commander: the player's own saved Commander decks (only decks they own,
 * user rule 2026-10-30). Picking one converts it for the game; a deck with
 * a card the game doesn't know yet can't be picked.
 */
export function OwnCommanderDecks({ onChoose, onBuild }: { onChoose: (deck: GameDeck | null, saved: SavedDeck | null) => void; onBuild: () => void }) {
  const [decks, setDecks] = useState<SavedDeck[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    accessToken()
      .then((token) => (token ? fetchDecks(token) : Promise.reject(new Error('Sign in first.'))))
      .then((all) => setDecks(all.filter((d) => d.format === 'commander' && d.commander)), (e: Error) => setProblem(e.message === 'Failed to fetch' ? 'Could not reach the game server.' : e.message));
  }, []);
  const art = (id: string) => [...PRINTING_CARDS, ...BOOSTER_CARDS].find((c) => c.id === id)?.images[0]?.artCrop;
  if (problem) return <p className="account-error">{problem}</p>;
  if (!decks) return <p className="fineprint">Loading your decks…</p>;
  if (decks.length === 0) {
    return (
      <p className="fineprint">
        You don't own a Commander deck yet. Pick your free precon, buy one in the Store, or{' '}
        <button className="link" onClick={onBuild}>
          build one in Decks
        </button>
        .
      </p>
    );
  }
  return (
    <div className="deck-choices precons">
      {decks.map((d) => {
        const converted = gameDeck(d);
        const playable = !('problem' in converted);
        return (
          <button
            key={d.id}
            className={`deck ${chosen === d.id ? 'chosen' : ''}`}
            disabled={!playable}
            title={playable ? undefined : converted.problem}
            onClick={() => {
              setChosen(d.id);
              onChoose(playable ? converted : null, playable ? d : null);
            }}
          >
            {d.commander && art(d.commander) && <img src={art(d.commander)} alt="" />}
            <span className="deck-name">{d.name}</span>
            <span className="deck-blurb">{playable ? 'Your deck' : converted.problem}</span>
          </button>
        );
      })}
    </div>
  );
}
