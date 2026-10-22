# Project Nexus: notes for Claude

A personal, non-commercial Magic: The Gathering engine for 2–4 player games
(Commander pods later). The user works on more than one computer and syncs
through GitHub (joesquare273/Project_Nexus), so keep important context in
this repo, not only in local memory.

## Ground rules from the user

- **Work directly on `main`. No branches, no pull requests.** Commit to
  `main` and push it (when asked to commit or push). Before starting on a
  computer, `git pull` so it has the other computer's work; push when done
  so the other computer can pick it up. Keep `main` passing `npm run check`.
- **The Final Fantasy Starter Kits are the testbed.** Every game uses the
  exact Red-White and Blue-Black kit decklists. Don't add placeholder cards
  or filler from other sets. All kit cards are built (2026-10-21); a new
  card that isn't fully built yet can be marked `notBuilt: true` (creatures
  play as their body and keywords, other cards can't be cast).
- **The Commander precons are the next card target** (`docs/commander.md`):
  all four Final Fantasy precons are imported (`scripts/import-precons.ts`);
  build their cards step by step (C2-C5), keeping the exact decklists.
- **The tutorial uses the Starter Kits** (`packages/client/src/tutorial/`);
  keep it working when engine behavior changes (its test walks the lesson).
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
- `docs/starter-kits.md`: Starter Kit roadmap (K1–K6, done) and card status.
- `docs/commander.md`: Commander format and precon roadmap (C1–C5).
- `docs/decisions.md`: design decisions and known rules simplifications.
- `docs/card-types.md`: card types and categories (permanent, nonpermanent,
  spell), the rules each brings, and whether they are built. Rules tied to a
  type or category live in the engine (`typerules.ts`), not on each card.
- `HOW-TO-RUN.txt`: instructions for the user.

## Checks

`npm run check` (type-check plus tests) must pass. `npm run fuzz -- --games 1000`
runs in CI. Scenario tests cover 2, 3 and 4 players.
