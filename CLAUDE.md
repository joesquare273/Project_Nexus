# Project Nexus: notes for Claude

A personal, non-commercial Magic: The Gathering engine for 2–4 player games
(Commander pods later). The user works on more than one computer and syncs
through GitHub (joesquare273/Project_Nexus), so keep important context in
this repo, not only in local memory.

## Ground rules from the user

- **Work directly on `main`. No branches, no pull requests.** Commit to
  `main`. **Stop after each commit and report the hash. The user pushes and
  says "proceed" before the next group or implementation step.**
  Before reporting each commit, refresh account usage and include purchased credits,
  remaining allowance, and available reset credits. Continue building the
  remaining precon cards in groups; prefer shared-mechanic batches when possible.
  Keep hand card sizes unchanged; battlefield cards may be larger. AI turns
  should unfold visibly, including automatic resolutions.
  See docs/commander.md for progress.
  Continue with the remaining precon cards.
  Frontend work does not replace the card-completion roadmap.
  Before starting on a computer, sync so it has the other computer's work. Keep
  `main` passing `npm run check`.
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
  The application is browser-based; the client talks to the engine only
  through JSON (`GameView`, legal actions, events, `Action`).
- **Draft events (2026-10-29):** booster drafts with the whole Final Fantasy
  set for 2-4 players: six real Play Boosters each, choose a card and confirm
  it, and packs pass clockwise once everyone has locked in; then a 20-minute
  deckbuilder (40+ cards, unlimited basics), Swiss best-of-3 matches, and
  players keep what they draft on their accounts. Roadmap S1-S4 in `docs/sealed.md`; the set's 320 imported
  cards (`data/fin-set.json`) are the next card target after the precons.
- **Online play (2026-10-28):** `packages/server` (Node + `ws`, many rooms in
  one process) is the only authority; message types live in
  `packages/server/src/protocol.ts` and are checked with zod. Each player gets
  only their own redacted state, view, legal actions and events
  (`engine/src/redact.ts`, an allowlist with per-player card aliases); keep its
  field classification and the hidden-information tests up to date when the
  engine changes. Seed online games from `crypto.randomBytes` only. Later:
  one Render web service serving the built client too, and Supabase Auth with
  Discord login (only the server talks to the database). See docs/decisions.md.
  Database changes go in `supabase/migrations/` as new timestamped SQL files
  (never edit an applied one); the Supabase GitHub integration applies them.
- **Frontend direction (2026-10-23):** an arcane fantasy table, with inspiration
  from Hearthstone, MTG Arena and Dueling Nexus while keeping its own identity.
  Improve layout, controls and animations while following MTG rules. See
  `docs/frontend-roadmap.md`; audit the known rules simplifications rather than
  claiming the engine already implements every rule exactly.

- **Token display:** group six or more identical, unmodified tokens with an upper-right count; tokens with keywords, counters, damage, attachments or individual effects remain separate. Keep individual engine IDs and choices.
- **Damage display:** show remaining damage capacity in red until cleanup, while preserving actual MTG toughness and prevention/indestructible behavior.

## Where things are

- `docs/development-update.md`: running log of progress and open issues.
  Add an entry for notable changes.
- `docs/starter-kits.md`: Starter Kit roadmap (K1–K6, done) and card status.
- `docs/commander.md`: Commander format and precon roadmap (C1–C5).
- `docs/decisions.md`: design decisions and known rules simplifications.
- `docs/card-types.md`: card types and categories (permanent, nonpermanent,
  spell), the rules each brings, and whether they are built. Rules tied to a
  type or category live in the engine (`typerules.ts`), not on each card.
- `docs/packs.md`: the Packs tab (booster odds, card data, collection).
- `docs/sealed.md`: draft events and the Final Fantasy set roadmap (S1-S4).
- `docs/economy.md`: the Aether Shards currency plan (E1-E5): prices, rewards,
  quests, and the server-side rules that keep it safe.
- `packages/server`: online play (rooms, protocol, authority); `npm run server`.
- `HOW-TO-RUN.txt`: instructions for the user.

## Checks

`npm run check` (type-check plus tests) must pass. `npm run fuzz -- --games 1000`
runs in CI. Scenario tests cover 2, 3 and 4 players.
