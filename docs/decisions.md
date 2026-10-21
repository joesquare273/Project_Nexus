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

## Known rules simplifications (to revisit)

| Area | Engine today | Real rule |
|---|---|---|
| First strike | Both damage passes happen in one step, with state-based actions between them but no priority | Rule 510.4: a separate first-strike damage step |
| Damage assignment | Attackers assign lethal damage to blockers in block-declaration order automatically | The attacking player divides damage |
| Mulligans | Everyone keeps their opening seven | Rule 103.5 (and the PRD's free redo) |
| Active player leaves | The rest of their turn is skipped and their spells go to graveyards | Rule 800.4 is more nuanced |
| Elimination mid-round | Priority restarts with the active player | Priority continues from where it was |
| Cleanup step | No priority, no discard to hand size | Rule 514 |
| Mana | Mana abilities need priority; no X costs, hybrid or Phyrexian mana | All supported |
