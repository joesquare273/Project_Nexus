# Project Nexus

A multiplayer Magic: The Gathering engine for 2 to 4 player games, built
toward Commander pods. The first real cards being implemented are the two
Final Fantasy Starter Kits.

Private, non-commercial project. Card names and game rules belong to Wizards
of the Coast; the Final Fantasy material also belongs to Square Enix. This
repo stores no card images or card rules text.

**To try it, see [HOW-TO-RUN.txt](HOW-TO-RUN.txt).** In short:

```bash
npm install
npm run play
```

## Status

- **Engine** (`packages/engine`): a pure, deterministic function
  `(state, action) -> (newState, events)`, designed for N players. It covers
  turn steps, priority around the table, the stack, lands and mana, creatures,
  instants and sorceries, combat where each attacker picks a defending player,
  11 combat keywords, and elimination where the game continues for everyone
  else. Hidden information is filtered per player.
- **Cards** (`packages/cards`): JSON card data validated at load time. Basic
  lands, the two Starter Kit Towns, and Sephiroth's Intervention are real;
  the rest are placeholders.
- **Bots** (`packages/bots`): a basic AI, a random bot for fuzzing, a
  terminal game against the AI, a bot-vs-bot simulator and a fuzzer.
- **Tests**: scenario tests for each rule run across 2, 3 and 4 players,
  plus invariant-checked fuzz games, replay determinism, and a check that
  actions never mutate their input state.

Next up is the Starter Kit roadmap in [docs/starter-kits.md](docs/starter-kits.md),
starting with triggered abilities.

## Layout

```
packages/
  engine/   rules: state, actions, events, stack, priority, combat
  cards/    card definitions (JSON), Starter Kit decklists, validators
  bots/     AI, terminal client, simulator, fuzzer
docs/       roadmap and decisions
```

Planned later: `server` (WebSocket rooms) and `client` (browser board), per
the PRD.

## Commands

| Command | What it does |
|---|---|
| `npm run play` | Play against the AI in the terminal |
| `npm run sim` | Watch bots play a seeded game |
| `npm test` | Run all tests |
| `npm run typecheck` | Type-check every package |
| `npm run fuzz` | 10,000 invariant-checked bot games |

## Design notes

See [docs/decisions.md](docs/decisions.md) for how this differs from the PRD
and for known rules simplifications.
