# Decisions

## 2026-10-20: Real MTG terms; PRD Section 12 dropped

The PRD (v2.0) asked for original names for every card, zone and rule, plus a
lint that bans MTG terminology. The project's real goal is playing Magic,
starting with the Final Fantasy cards, so:

- Code and UI use real terms: tapped, mana, library, graveyard, exile,
  battlefield, commander, and so on. The banned-term lint was removed.
- The repo stays private and the project non-commercial.
- Card rules text and images are not committed. Card definitions describe
  behavior as data, and display text is generated from that data. Fetching
  oracle text from Scryfall into a gitignored cache is an option for later.
  (Superseded on 2026-10-21, below.)

## 2026-10-21: Browser board now, Godot later; real card images and text

- The graphical client is a browser app (`packages/client`) because it runs
  the TypeScript engine directly. A Godot client may replace it much later,
  for heavier visual effects.
- To keep that move cheap, the client never reaches into engine internals.
  It works from the same JSON a networked client would get: the player's
  `GameView`, legal actions, and filtered events. Decisions go back as
  `Action` objects. A future Godot client gets the same data from a server.
- This is a personal, non-commercial project, so the client shows real card
  images and Oracle text. `npm run scryfall` saves each real card's Scryfall
  image links and Oracle text to `packages/cards/data/scryfall.json`; images
  load from Scryfall's servers and are never stored in the repo. If an image
  can't load, the board draws a card frame instead.

## 2026-10-21: The Starter Kits are the testbed

Games use the exact Final Fantasy Starter Kit decklists. Placeholder
"Testbed" cards are gone. Kit cards that aren't fully built are defined
with `notBuilt: true`: creatures play as their real body and printed
keywords, and noncreature cards can't be cast yet. A card is "implemented"
in `fin-starter-kits.json` only when it is fully built.

## 2026-10-20: First card target is the FIN Starter Kits

Two 60-card decks with about 47 distinct cards and no double-faced cards.
The four Commander precons need far more (transform, Sagas, many continuous
effects), so they come after. See [starter-kits.md](starter-kits.md).

## Engine choices

- **TypeScript monorepo, npm workspaces.** Node runs the `.ts` files directly
  (type stripping), so there is no build step for tools and tests.
- **Pure engine.** `applyAction` copies the state, applies one action, runs
  state-based actions, and returns new state plus events. The same seed, decks
  and action list always reproduce the same game.
- **N players everywhere.** Per-player data lives in maps keyed by player id,
  and every rule is tested with 2, 3 and 4 players.

## 2026-10-21: Triggered abilities (K1)

- Cards list `triggers` in JSON: an event (`when`), an optional filter on what
  it happened to (`what`), effects, and flags for "one or more", "only once
  each turn", "you may" and optional costs. Absent `what` means the card itself.
- After every action the engine scans that action's events for triggers,
  queues them in APNAP order, and puts them on the stack when a player would
  next receive priority, after state-based actions (rule 117.5).
- Targets are chosen when a trigger goes on the stack. With exactly one legal
  choice the engine picks it; otherwise the game waits on a `chooseTargets`
  decision. "You may" and optional costs are a `decide` decision when the
  ability resolves; the player can tap lands for mana while deciding.

## 2026-10-21: Both Starter Kits complete (K2-K6)

- One characteristics layer (`engine/src/characteristics.ts`) computes power,
  toughness, keywords and subtypes from the card, static abilities
  (including Equipment), "until end of turn" effects and +1/+1 counters.
  Combat, state-based actions, the AI and the board all read it; the
  browser gets the results in `GameView.stats`.
- Cards are described with a small set of building blocks in JSON:
  effects with counted amounts and filters, triggers, activated abilities,
  statics, equip, flashback, landcycling, modes and cost reductions.
  Every kit card is built from these; there is no per-card code.
- Spells and abilities resolve step by step and can pause for a choice
  (surveil), stored in `GameState.resolving`.
- Tokens are defined in `packages/cards/data/tokens.json` using the exact
  token printing each card lists on Scryfall. `npm run scryfall` checks
  that every token a card makes is defined. Tokens that leave the
  battlefield go to a `void` zone (they cease to exist).

## Known rules simplifications (to revisit)

| Area | Engine today | Real rule |
|---|---|---|
| First strike | Both damage passes happen in one step, with state-based actions between them but no priority | Rule 510.4: a separate first-strike damage step |
| Damage assignment | Attackers assign lethal damage to blockers in block-declaration order automatically | The attacking player divides damage |
| Mulligans | Everyone keeps their opening seven | Rule 103.5 (and the PRD's free redo) |
| Active player leaves | The rest of their turn is skipped and their spells go to graveyards | Rule 800.4 is more nuanced |
| Elimination mid-round | Priority restarts with the active player | Priority continues from where it was |
| Cleanup step | No priority, no discard to hand size | Rule 514 |
| Mana | Mana abilities need priority or a pending cost decision; no X costs, hybrid or Phyrexian mana | All supported |
| Order of simultaneous triggers | Each player's triggers go on the stack in the order they were found | The controller chooses the order (rule 603.3b) |
| "One or more" batches | One batch is everything that happened in one action | One batch per simultaneous event |
| Leaves-the-battlefield look-back | Anything that left the battlefield during the action sees every death in it | Only things that left at the same time (rule 603.10a) |
| Triggers during cleanup | None of the supported triggers can happen then, so cleanup never gives priority | Rule 514.3a |
| Beatrix, Loyal General | "You may attach any number of Equipment": all of them or none | Any subset |
| Layers | P/T, keyword and subtype changes are all additive, applied together | Full layer and timestamp order (rule 613) |
| Copy tokens | Copy the original's printed card | Also copy other copy effects and face-down status (rule 707) |
| Library search | Takes the first matching card | The player chooses which matching card |
