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

## 2026-10-21: Browser board; real card images and text

- The graphical client is a browser app (`packages/client`) because it runs
  the TypeScript engine directly. The application remains browser-based.
- To preserve the engine boundary, the client never reaches into engine internals.
  It works from the same JSON a networked client would get: the player's
  `GameView`, legal actions, and filtered events. Decisions go back as
  `Action` objects. An online browser client can get the same data from a server.
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

## 2026-10-21: Commander format and the precons

- Commander is a FormatConfig (`COMMANDER`), not a separate code path. The
  command zone is a real zone; commander tax and commander damage live on
  the player.
- The precon card data is generated from MTGJSON by
  `scripts/import-precons.ts`, which recognizes common card text (mana
  abilities, conditional "enters tapped", cycling...) and marks the rest
  `notBuilt`. Hand-written abilities for those cards go into fic.json as
  they're built (re-running the importer would overwrite them, so after C2
  starts, the importer should merge rather than replace).

## Cleanup and maximum hand size (2026-10-23)

The active player chooses discards down to seven during cleanup (514.1), with
no discard required while controlling Thought Vessel. Having more than seven
cards during the turn is legal. The choice does not use the stack. Damage
removal and end-of-turn effects finish together afterwards (514.2), including
damage on phased-out permanents. If cleanup produces state-based actions or
triggers, players receive priority and another cleanup follows once the stack
is empty and everyone passes (514.3a). A death-trigger draw during cleanup can
therefore require another discard. Hand counts show the current limit; cleanup
choices keep opponents' hand identities hidden.

## Known rules simplifications (to revisit)

| Area | Engine today | Real rule |
|---|---|---|
| First strike | Both damage passes happen in one step, with state-based actions between them but no priority | Rule 510.4: a separate first-strike damage step |
| Damage assignment | Attackers assign lethal damage to blockers in block-declaration order automatically | The attacking player divides damage |
| Mulligans | London mulligan, first one free in multiplayer (103.5c). Players decide one at a time in turn order, each finishing before the next | Everyone decides, then all mulligans happen at once, repeating (103.5). The PRD's "one free redo" would also make the first one free in duels; the engine follows the official rule |
| Active player leaves | The rest of their turn is skipped and their spells go to graveyards | Rule 800.4 is more nuanced |
| Elimination mid-round | Priority restarts with the active player | Priority continues from where it was |
| Mana | Mana abilities need priority or a pending cost decision; no X costs, hybrid or Phyrexian mana | All supported |
| Order of simultaneous triggers | Each player's triggers go on the stack in the order they were found | The controller chooses the order (rule 603.3b) |
| "One or more" batches | One batch is everything that happened in one action | One batch per simultaneous event |
| Leaves-the-battlefield look-back | Anything that left the battlefield during the action sees every death in it | Only things that left at the same time (rule 603.10a) |
| Beatrix, Loyal General | "You may attach any number of Equipment": all of them or none | Any subset |
| Layers | P/T, keyword and subtype changes are all additive, applied together | Full layer and timestamp order (rule 613) |
| Sacrifice the greatest power (Crackling Doom) | On a tie, the creature that has been on the battlefield longest is sacrificed | The player chooses among the tied creatures |
| Path to Exile | The exiled creature's controller always searches for a basic land | Searching is optional ("may") |
| Explorer's Scope | A land on top of the library is always put onto the battlefield | Optional ("you may") |
| Armory Automaton | "Attach any number of target Equipment": all of your Equipment or none | Any subset, and other players' Equipment too |
| Losing keywords | "Loses flying" applies after every grant, whatever the order | Layer 6 timestamp order (rule 613) |
| Proliferate | Adds one of each kind of counter already on your permanents, except stun counters, and a stun counter to opponents' permanents that have one | You choose any permanents and players (rule 701.27) |
| Counter kinds | +1/+1, shield, stun, flying, page and soul counters exist; lore, vow and others don't yet | Many more kinds (rule 122) |
| "Move a counter" (Rikku, Nesting Grounds) | The engine picks the kind: a stun counter onto an opponent's permanent, otherwise the most useful (+1/+1 first) | The player chooses |
| "Remove a counter" costs (O'aka, Scholar) | The engine removes the least useful kind first (stun, page, soul, then +1/+1) | The player chooses |
| Rikku's Steal | Only offers opponents' creatures that have counters | Any creature an opponent controls is a legal target |
| Scholar of New Horizons | Puts the Plains onto the battlefield whenever it may | Optional ("you may") |
| Yuna, Grand Summoner's mana | "When you next cast a creature spell this turn" is applied as the spell is cast, not as a trigger | A delayed triggered ability |
| Demolition Field | Both players always search for a basic land | Each search is optional ("may") |
| Auto-pay with paid mana abilities | Works in at most two of them, and only when plain taps can't pay | Any combination |
| Partner with (Alphinaud, Alisaie) | You may search for the partner; the "target player" is always you | Any target player may |
| Cut a Deal | You draw one card for each opponent still in the game | One for each opponent who actually drew |
| Yuna's Whistle | The creature to get counters is chosen when the spell is cast | It's chosen when the card is revealed (a reflexive trigger) |
| Explore | The revealed nonland card always stays on top of the library | The player may put it into the graveyard |
| Reflexive "when you do" triggers (Auron) | The target is chosen with the trigger, and may be left out | Chosen when the reflexive trigger happens |
| Summon: Valefor | On a tie for greatest mana value, the creature that has been on the battlefield longest returns | Each opponent chooses |
| Lifestream's Blessing | X is the greatest power among your creatures as it resolves | As it was cast |
| Foretell and the AI | The AI never foretells; it casts foretell cards from hand | The AI could foretell to save mana later |
| Tataru Taru | The target opponent always draws | They may choose not to |
| "Enters from your graveyard" (Flayer of the Hatebound) | Also counts creatures cast from a graveyard | Only creatures put onto the battlefield from it |
| Planeswalkers | Not a card type yet, so "destroy target creature or planeswalker" only finds creatures | Rule 306 |
| Copy tokens | Copy the original's printed card | Also copy other copy effects and face-down status (rule 707) |
| Library search | Takes the first matching card | The player chooses which matching card |
| "Search for up to N cards" | Takes as many as it can (up to N) | The player may take fewer |
| Choices in "each player" effects | Players choose one at a time in turn order from the active player, seeing earlier choices | Simultaneous, in APNAP order (rule 101.4) |
| {X} costs | The caster chooses X from 1 up to what their mana could pay, at most 12 | Any X, including 0 |
| Ward | An opponent's spell or activated ability that targets it simply costs the ward amount more; an opponent's triggered ability can't target it | A triggered ability that counters the spell or ability unless its controller pays (rule 702.21) |
| Convoke | Each creature pays a mana of its color if the cost still has one, otherwise {1}; the legal list taps creatures in board order and skips creatures that make mana | The player assigns each creature (rule 702.51) |
| Connive with several creatures (Lethal Scheme) | Draw one card per creature, discard that many, then each nonland card discarded puts a +1/+1 counter on the next creature | Each creature connives in turn (rule 701.50) |
| "Any number of target" permanents (Clever Concealment) | Up to six | Any number |
| Phased-out permanents | Can't be seen on the battlefield row (a "Phased out" pile instead); a phased-out attacker or blocker simply stops dealing and taking combat damage | Rule 702.26 |
| Blitz and unearth "at the beginning of the next end step" | Done as the end step begins, without using the stack | A delayed triggered ability |
| Rebound | Castable without paying its mana cost at any time during your next turn, then it's gone for good | Only while the upkeep trigger resolves (rule 702.88) |
| "You may cast target card from your graveyard" (Torrential Gearhulk, Emet-Selch) | Castable later that turn, with normal timing rules, instead of during the ability's resolution | Cast while the ability resolves, ignoring timing (rule 608.2g) |
| Dig Through Time | The cards not taken go on the bottom in the order they were on top | Any order |
| Emet-Selch's "once each turn" | Counts only when you say yes | Counts whenever you cast a spell this way |
| Multikicker | Offered up to 6 times, as far as your mana could pay | Any number of times |
| Escalate | The legal list taps your first untapped creatures that don't make mana | The player chooses which creatures |
| Blade Beam (Cloud's Limit Break) | Up to four tapped creatures, each with a different owner | Any number, each with a different controller |

## 2026-10-23: Floating mana with delayed cast triggers

Path of Ancestry mana carries a per-unit scry rider through pool payment.
Mana clears at step boundaries, and spending a unit consumes its rider even
when no scry is earned. Creature types are checked after casting, using the
current visible commander and the spell on the stack.

The existing automatic payment system still selects mana types. Within the
same type, scry-bearing mana is spent first, including on noncreature spells
and activated abilities. Choosing individual floating mana units is not yet
a separate player control; tap sources accordingly when saving this mana.

## Monarch and exile-cost identity (2026-10-23)

The monarch is a player designation, not a card instance. Rule-trigger stack
items carry a captured specification and an explicit monarch rule tag, with
`@monarch` as a serialization key only. Jailer return tracking belongs to the
exiled object and ends on a future opponent monarch transition. Coin of Fate
tracks both card ID and object identity for cards exiled as costs, preventing
an object that left and reentered exile from being returned by the old ability.

## Linked returns and attachment restrictions (2026-10-23)

ReturnToBattlefield can reference an earlier chosen target with
`attachToReturnedTarget`. The resolution records returned object identities,
so only a creature returned by this resolution can receive those attachments.
Aura `enchant` filters govern attachment, without targeting. Illegal Auras stay
in the graveyard; Equipment still returns unattached. All effects finish before
state-based actions check the returned permanents. Cast spells record chosen
card zone-change identities; omitted optional targets do not count as legal
targets when deciding whether a targeted spell fails to resolve.

## Crew and reflexive triggers (2026-10-23)

Crew is an activated cost paid by tapping other creatures; current signed power
is checked and summoning sickness does not prevent paying that cost. The
resolved animation changes effective battlefield types until cleanup, while
preserving printed rules identity. A departure records last battlefield types
for death triggers. Falcon's sacrifice queues a captured reflexive trigger; its
targets are chosen after the sacrifice and it can be countered independently.

## Physical printings and public commander identity (2026-10-23)

Deck printing assignments are parallel to deck card IDs and shuffled together.
They are presentation metadata on each card instance, retained through zone
changes, and never change rules identity or legality. Alternate commander
selection swaps the associated printing as well as the ID. Artwork lookup uses
set/collector number when provided; a missing exact print falls back to a drawn
card rather than silently showing another printing. Hidden-card flights do not
include printing metadata. Public commander IDs/names are available separately
from hidden card views for damage history, without revealing library positions.
