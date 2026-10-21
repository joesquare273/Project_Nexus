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
exact Final Fantasy Starter Kit decks; cards not fully built yet are marked
"not built yet".

## Status

- **Engine** (`packages/engine`): a pure, deterministic function
  `(state, action) -> (newState, events)`, designed for N players. It covers
  turn steps, priority around the table, the stack, lands and mana, creatures,
  instants and sorceries, combat where each attacker picks a defending player,
  11 combat keywords, triggered abilities (with target choices and "you may"
  decisions), and elimination where the game continues for everyone else.
  Hidden information is filtered per player.
- **Cards** (`packages/cards`): every card in both Final Fantasy Starter
  Kits, as JSON validated at load time. Lands, Sephiroth's Intervention, Al
  Bhed Salvagers, G'raha Tia, Shambling Cie'th and Ultimecia, Temporal Threat
  are fully built; the rest are marked "not built yet" (creatures play as
  their body and keywords, other cards can't be cast yet).
- **Client** (`packages/client`): the browser game board, with real card
  images from Scryfall.
- **Bots** (`packages/bots`): a basic AI, a random bot for fuzzing, a
  terminal game against the AI, a bot-vs-bot simulator and a fuzzer.
- **Tests**: scenario tests for each rule run across 2, 3 and 4 players,
  plus invariant-checked fuzz games, replay determinism, and a check that
  actions never mutate their input state.

Next up is the Starter Kit roadmap in [docs/starter-kits.md](docs/starter-kits.md):
step K1 (triggered abilities) is done, and K2 (tokens and counters) is next.

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

## Design notes

See [docs/decisions.md](docs/decisions.md) for how this differs from the PRD
and for known rules simplifications.
