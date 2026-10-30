# Draft events: roadmap

Booster drafts with the whole Final Fantasy set, for 2 to 4 players, with a
deckbuilder and a tournament. Agreed with the user on 2026-10-29. (The user
first called it "sealed"; the format they described is a booster draft.)

## The format

- **Booster draft:** each player opens a Final Fantasy Play Booster, chooses
  a card and confirms it to lock it in. Once every player has locked in, all
  picks are taken and every pack moves one seat **clockwise** (to the next
  seat), until the packs are empty; then everyone opens their next pack.
  Six packs each, 14 cards per pack: 84 cards per player. Nobody sees what
  the others pick, or the packs in front of them.
- **The packs are real Play Boosters:** Wizards' slot-by-slot contents, Final
  Fantasy main set and Through the Ages cards only. (The Packs tab's Scene
  Box extras are left out of drafts.)
- **Deckbuilding:** 20 minutes, with a 5-minute warning; it ends early once
  every player presses Ready.
  - 40 to 60 cards.
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
| S1 | **Import the set:** every Final Fantasy main-set (FIN 1-309) and Through the Ages (FCA) card gets a definition (`cards/scripts/import-sets.ts`, `data/fin-set.json`). Cards the engine already covers are built; the rest are `notBuilt` (shown with their images, but they can't be cast or played until built). | **Done (2026-10-29):** 320 new definitions, 12 built |
| S2a | **The draft**, locally against 1-3 AI drafters: choose, confirm, rotate clockwise; six packs; the Draft tab. | **Done (2026-10-29)** |
| S2b | **The deckbuilder**, then playing your drafted deck against an AI drafter's deck: filters by color and type, deck columns by mana value, mana curve, land suggestions, unlimited basics, Auto-build, the 20-minute timer (5-minute warning; at zero, basics fill the deck to 40 and it locks), Ready. | **Done (2026-10-29)** |
| S3 | **Online events:** rooms of up to 4, the draft run by the server (it holds the packs and waits for every player to lock in), the deckbuilding timer enforced by the server, Swiss pairings, best-of-3 matches with sideboarding, standings, and pools kept on players' accounts once accounts exist. | |
| S4 | **Build the set's cards** in shared-mechanic groups, like the precons, until all of them work. | 81 of 320 imported cards built. Group 4 (simple spells and enters-the-battlefield cards, 24) and group 5 (18 more: enters, attacks, chapters) done. Group 3 (transforming double-faced cards) started: Vincent Valentine, Garland, The Emperor of Palamecia, Exdeath, Dion, Jill, Jecht. Group 1 (Job select Equipment, 10 cards) done; group 2 (noncreature spells) in progress: Ultros, Cornered by Black Mages, Blazing Bomb, Mysidian Elder, Prompto Argentum, Queen Brahne, Black Waltz No. 3, Shantotto, Tellah, The Prima Vista; left: Vivi Ornitier (X mana in two colors) and the double-faced Emperor of Palamecia, Garland, Kuja and Lindblum, which wait for transforming double-faced cards (27 set cards need them); tests in `packages/bots/test/fin-set-cards.test.ts`. |

## Card status

Of the cards that appear in Play Boosters:

| Group | Built |
|---|---|
| Main set (300 distinct, including basics) | 42 from the Starter Kits and precons, plus 12 built on import |
| Through the Ages (64) | 1 from the precons; K'rrik, Son of Yawgmoth can't be cast yet (Phyrexian mana) |

Run `node packages/cards/scripts/import-sets.ts` to re-import: cards built
by hand in fin-set.json are kept, the rest are regenerated.
