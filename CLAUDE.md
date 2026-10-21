# Project Nexus: notes for Claude

A personal, non-commercial Magic: The Gathering engine for 2–4 player games
(Commander pods later). The user works on more than one computer and syncs
through GitHub (joesquare273/Project_Nexus), so keep important context in
this repo, not only in local memory.

## Ground rules from the user

- **The Final Fantasy Starter Kits are the testbed.** Every game uses the
  exact Red-White and Blue-Black kit decklists. Don't add placeholder cards
  or filler from other sets. All kit cards are built (2026-10-21); a new
  card that isn't fully built yet can be marked `notBuilt: true` (creatures
  play as their body and keywords, other cards can't be cast).
- **Tokens come from Scryfall too**, matched by the exact token printing each
  card lists (`packages/cards/data/tokens.json`; `npm run scryfall` checks).
- **Real MTG names, rules text and card images are fine** (personal project).
  Images load from Scryfall's image servers and are never committed.
- **Scryfall API rate limits:** never call `api.scryfall.com` from the game.
  `npm run scryfall` caches card data in `packages/cards/data/scryfall.json`.
  See `docs/development-update.md`.
- **A graphical interface comes first.** The browser board (`packages/client`,
  `npm run dev`) is the main way to play; the terminal client is secondary.
  A Godot client may come much later, so the client talks to the engine only
  through JSON (`GameView`, legal actions, events, `Action`).

## Where things are

- `docs/development-update.md`: running log of progress and open issues.
  Add an entry for notable changes.
- `docs/starter-kits.md`: roadmap (K1–K6) and card status.
- `docs/decisions.md`: design decisions and known rules simplifications.
- `docs/card-types.md`: card types and categories (permanent, nonpermanent,
  spell), the rules each brings, and whether they are built. Rules tied to a
  type or category live in the engine (`typerules.ts`), not on each card.
- `HOW-TO-RUN.txt`: instructions for the user.

## Checks

`npm run check` (type-check plus tests) must pass. `npm run fuzz -- --games 1000`
runs in CI. Scenario tests cover 2, 3 and 4 players.
