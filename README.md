# Project Nexus

A multiplayer Magic: The Gathering engine for 2 to 4 player games, built
toward Commander pods. The first real cards being implemented are the two
Final Fantasy Starter Kits.

Private, non-commercial project. Card names and game rules belong to Wizards
of the Coast; the Final Fantasy material also belongs to Square Enix. Card
images and Oracle text load from Scryfall; no image files are stored here.

**To try it, see [HOW-TO-RUN.txt](HOW-TO-RUN.txt).** In short:

```bash
npm install
npm run dev
```

then open http://localhost:5173 to play on the browser board. Games use the
exact Final Fantasy Starter Kit decks, with every card working as printed.

## Status

- **Engine** (`packages/engine`): a pure, deterministic function
  `(state, action) -> (newState, events)`, designed for N players. It covers
  turn steps, priority around the table, the stack, lands and mana, creatures,
  instants and sorceries, artifacts and Equipment, combat where each attacker
  picks a defending player, 11 combat keywords, triggered and activated
  abilities, tokens, counters, continuous effects, flashback, surveil,
  modal spells, and elimination where the game continues for everyone else.
  Hidden information is filtered per player.
- **Cards** (`packages/cards`): every card in both Final Fantasy Starter
  Kits plus the tokens they make, as JSON validated at load time. All of
  them are fully built and tested against their Oracle text.
- **Client** (`packages/client`): the browser game board, with real card
  images from Scryfall, a "Learn to play" tutorial, and a practice game
  with tips.
- **Commander** ([docs/commander.md](docs/commander.md)): the Commander
  format and all four Final Fantasy Commander precons; their cards are being
  built step by step (289 of 320 distinct cards are built).
- **Bots** (`packages/bots`): a basic AI, a random bot for fuzzing, a
  terminal game against the AI, a bot-vs-bot simulator and a fuzzer.
- **Tests**: scenario tests for each rule run across 2, 3 and 4 players,
  plus invariant-checked fuzz games, replay determinism, and a check that
  actions never mutate their input state.

Both Starter Kits are complete ([docs/starter-kits.md](docs/starter-kits.md)).
Next is the remaining Commander card work in [docs/commander.md](docs/commander.md).

## Layout

```
packages/
  engine/   rules: state, actions, events, stack, priority, combat
  cards/    card definitions (JSON), Starter Kit decklists, validators
  bots/     AI, terminal client, simulator, fuzzer
  client/   browser game board (React + Vite)
docs/       development log, roadmap, card types, decisions
```

Planned later: `server` (WebSocket rooms) for online play, and possibly a
Godot client for heavier visual effects.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Play against the AI on the browser board |
| `npm run play` | Play against the AI in the terminal |
| `npm run sim` | Watch bots play a seeded game |
| `npm test` | Run all tests |
| `npm run typecheck` | Type-check every package |
| `npm run fuzz` | 10,000 invariant-checked bot games |
| `npm run scryfall` | Cache Scryfall card data and type lists (rate-limit safe) |
| `node packages/cards/scripts/import-precons.ts` | Re-import the Commander precons from MTGJSON |

## Design notes

See [docs/decisions.md](docs/decisions.md) for how this differs from the PRD
and for known rules simplifications.
