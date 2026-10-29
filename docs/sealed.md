# Sealed events: roadmap

Sealed play with the whole Final Fantasy set, for 2 to 4 players, with a
deckbuilder and a tournament. Agreed with the user on 2026-10-29.

## The format

- **Sealed first:** each player opens six Play Boosters (the Packs tab's
  generator) and builds from what they opened. Booster draft (picking cards
  from packs passed around the table) can come later.
- **Deckbuilding:** 20 minutes, with a 5-minute warning; it ends early once
  every player presses Ready.
  - At least 40 cards.
  - Any cards from your pool, lands included, plus unlimited basic lands.
  - Everything not in the deck is your sideboard.
- **Matches are best of 3.** The first game's play/draw is random; afterwards
  the loser of the last game chooses. Between games, players may sideboard.
- **Pairings are Swiss** (winners play winners, losers play losers), not
  random. Round 1 is random.
  - With 4 players, two rounds give one undefeated winner; an optional third
    round settles the other places.
  - With 3 players, each round one player gets a bye (a match win).
  - With 2 players, it's a single best-of-3 match.
- **Players keep the cards they open**, on their own account. This needs
  accounts (Supabase Auth with Discord login, see decisions.md); until then a
  pool lives with the event.

## Steps

| Step | What | Status |
|---|---|---|
| S1 | **Import the set:** every Final Fantasy main-set (FIN 1-309) and Through the Ages (FCA) card gets a definition (`cards/scripts/import-sets.ts`, `data/fin-set.json`). Cards the engine already covers are built; the rest are `notBuilt` (creatures play as their body and keywords). | **Done (2026-10-29):** 320 new definitions, 12 built |
| S2 | **Sealed pools and the deckbuilder**, locally first, against the AI: open six packs, sort and filter (color, type, cost), mana curve, land suggestions, unlimited basics, the 20-minute timer, Ready. | Next |
| S3 | **Online events:** rooms of up to 4, pools dealt by the server, the timer enforced by the server, Swiss pairings, best-of-3 matches with sideboarding, standings, and pools kept on players' accounts once accounts exist. | |
| S4 | **Build the set's cards** in shared-mechanic groups, like the precons, until all of them work. | 12 of 320 imported cards built |

## Card status

Of the cards that appear in Play Boosters:

| Group | Built |
|---|---|
| Main set (300 distinct, including basics) | 42 from the Starter Kits and precons, plus 12 built on import |
| Through the Ages (64) | 1 from the precons; K'rrik, Son of Yawgmoth can't be cast yet (Phyrexian mana) |

Run `node packages/cards/scripts/import-sets.ts` to re-import: cards built
by hand in fin-set.json are kept, the rest are regenerated.
