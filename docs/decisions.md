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
| First strike | Fixed 2026-10-24: separate first-strike and normal damage steps, state-based actions and priority between them | Rule 510.4 |
| Damage assignment | Attackers assign lethal damage to blockers in block-declaration order automatically | The attacking player divides damage |
| Mulligans | London mulligan, first one free in multiplayer (103.5c). Players decide one at a time in turn order, each finishing before the next | Everyone decides, then all mulligans happen at once, repeating (103.5). The PRD's "one free redo" would also make the first one free in duels; the engine follows the official rule |
| Active player leaves | The rest of their turn is skipped and their spells go to graveyards | Rule 800.4 is more nuanced |
| Elimination mid-round | Priority restarts with the active player | Priority continues from where it was |
| Mana | Mana abilities need priority or a pending cost decision; no X costs, hybrid or Phyrexian mana | All supported |
| Order of simultaneous triggers | Each player's triggers go on the stack in the order they were found | The controller chooses the order (rule 603.3b) |
| "One or more" batches | One batch is everything that happened in one action | One batch per simultaneous event |
| Leaves-the-battlefield look-back | Anything that left the battlefield during the action sees every death in it | Only things that left at the same time (rule 603.10a) |
| Beatrix, Loyal General | "You may attach any number of Equipment": all of them or none | Any subset |
| Layers | Type/color and base P/T setters use timestamps; counters and P/T modifiers apply after base setters. Keyword removal still wins over grants | Full dependency and layer/timestamp order, including ability removal (rule 613) |
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
| "You may cast that card without paying its mana cost" from exile (Strago and Relm, Kefka, Fight Rigging) | Castable later that turn. Kefka's and Fight Rigging's ignore timing; Strago and Relm's use normal timing, and a land found by Fight Rigging still needs a main phase and an unused land play | Cast while the ability resolves (rule 608.2g) |
| Summon: Esper Valigarmanda's chapter I | The engine exiles the instant or sorcery with the greatest mana value from each graveyard | The Saga's controller chooses |
| Espers to Magicite's "choose up to one target creature card exiled this way" | Chosen as the spell resolves, not by a reflexive trigger | A reflexive triggered ability with a target (rule 603.12) |
| Good King Mog XII's "a copy of a non-Saga token you control" | The token is targeted | Chosen as the ability resolves, without targeting |
| Blue Mage's Cane's copy | The exiled card itself is cast for {3}, at any time that turn, and returns to exile afterwards (as if the copy ceased to exist) | A copy is cast while the ability resolves (rules 707.12, 608.2g) |
| Sin's "as it enters, remove all counters" | Only when Sin is cast (as the spell resolves); put onto the battlefield another way, it enters with no counters | Also when it enters another way (rule 614.1c) |
| "Loses all abilities" (Observed Stasis) | Removes the abilities in its own definition; abilities granted by other permanents or effects still apply | Also removes abilities granted earlier by timestamp (rule 613.1f) |
| Kefka's life loss | As each spell is cast | After all the spells are cast |
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

## Opening-hand resource plans (2026-10-24)

Opening keep/bottom decisions are shared by basic and random opponents. The
policy scores possible London keep subsets, favoring three lands and early
mana access. Two-land exceptions need a cheap curve or a castable ramp plan.
The mana planner evaluates colors and conditional sources on a hypothetical
untapped board. Land searches use unordered remaining deck composition; draw
positions and opposing hidden cards are excluded. This estimates availability
and does not simulate every intervening turn. Requirements soften for small
hands, with legal engine mulligan limits controlling the final fallback.
Normal in-game discard choices continue using their separate evaluator.

## Tifa and combat-event identity (2026-10-24)

Melee counts opponents recorded at attack declaration for the current combat,
including attackers/opponents that later leave. Entering attacking does not add
a declared opponent. A source-object check prevents an old melee trigger from
boosting a returned Tifa. One-or-more combat-damage triggers group by damaged
player within a damage step. Damage events snapshot source power, toughness,
types, counters and controller before simultaneous assignments are applied.
Trigger filters therefore retain the correct source information after deaths
or changes caused by simultaneous damage.

First-strike and normal combat damage have distinct priority windows. The
combat retains object identities of initial first/double strikers; gaining or
losing first/double strike between steps follows normal-damage eligibility.
First-combat-only extra combat effects also check the active player against
the ability controller. Tifa untaps in later combats but adds phases only
during the first combat of her controller's turn. Attack AI rewards a new safe
defender when melee is present, after its lethal and defensive priorities.

## Changing creature status, goad and targeted mana (2026-10-24)

Type and color changes are evaluated in cardface.ts from the printed static
abilities and attachment timestamps; power/toughness and keywords remain in
characteristics.ts. Creature subtype replacements preserve subtypes associated
with other types. The creature vocabulary is copied from the cached type list.
This supports Eye of Nidhogg and Triad, without claiming a full layer-dependency
engine. Keyword removal ordering remains a documented simplification.
The per-state source index invalidates on battlefield size, timestamps, and
definition-map changes; controller, attachment and graveyard conditions are
read live. Future copy mechanics must also invalidate it when changing which
objects supply these static abilities.

Goad is an attack requirement rather than a prohibition. The declaration
validator compares attainable free defender choices and maximizes requirements;
it never obliges payment of Propaganda or another attack cost. Legal-action
samples and AI complete obligatory attacks through the same helper. A blocked
attacker remembers that status even after its blocker leaves combat.

Targeted AddMana effects use ordinary activated abilities and a resolving
ChooseMana prompt controlled by the player adding the mana. They cannot be used
inside payment as mana abilities. Mill costs are paid at activation; countering
an ability does not refund them. This is separate from Millikin's immediate,
non-targeted mana ability.

Triad's mana recipient chooses the color, including when the recipient differs
from the activating player. This was cross-checked against the
[XMage implementation](https://github.com/magefree/mage/blob/master/Mage.Sets/src/mage/cards/t/TheWarringTriad.java).
A recipient conceding during the choice skips the mana and resumes resolution.

## Shared one-spell allowances (2026-10-24)

GameState.castGroups stores a controller, turn, source and exact card-object
references for an allowance shared among several cards. A successful cast
consumes the group; a rejected action leaves it intact. Cleanup expires it.
This models Locke's Mug without overwriting flashback, Edgar or card-specific
permissions. CastSpell.castGroup explicitly selects the group; when omitted,
another available permission is preferred before a group fallback is used.
The human play helper labels and groups these choices separately.

A stack item records whether the spell was actually cast using flashback.
The card merely having flashback does not cause exile when another permission
was used. Cost calculation receives the chosen route and the casting player,
so borrowed spells use their caster's reductions, ward payments and resources.

## 2026-10-28: A 128-bit random number generator

The engine's generator was mulberry32, with one 32-bit word of state. The
code is public, so a player who knows their opening hand could try all 2^32
seeds until one deals that hand, and then know every library and future
shuffle. It is now **sfc32** (`engine/src/rng.ts`), with four 32-bit words
(128 bits) of state in `GameState.rngState`:

- It stays pure and deterministic: `nextRandom` returns the value and the
  next state without changing its input, so the same seed and actions always
  replay the same game, including after a JSON round trip.
- A seed is either an integer (tests, local games, the fuzzer), expanded
  into four words with splitmix32, or four 32-bit words. Each seed is mixed
  with 16 warm-up rounds.
- **Online games must seed from 16 bytes of `crypto.randomBytes`** (via
  `seedFromBytes`), never `Math.random` or a small integer.
- `rngState` is never sent to players.

This changed every seeded game: the same integer seed now deals different
cards than before. Tests that need a particular random outcome set
`rngState` from `seedToState`.

## 2026-10-28: Online play

- **packages/server**: one Node process using the `ws` package hosts many
  rooms. It will later be deployed as one Render free web service that also
  serves the built client (the server already serves `packages/client/dist`
  when it exists). Accounts come later through Supabase Auth with Discord
  login; only the server will talk to the database.
- **The server is the only authority.** It holds the real GameState and runs
  the engine. Players join with a guest name and a room code; the game starts
  when two players have joined and each has picked a Starter Kit (RW or UB).
- **Messages** are defined once, in `packages/server/src/protocol.ts`, and
  shared by the client and server. Every incoming message is checked with zod.
  Actions carry a sequence number (a repeat is a duplicate) and the game
  version they were chosen against (an older one is stale). Wrong-player,
  out-of-turn and illegal actions get an `error` message, never a crash.
  Engine error texts are rewritten so they never quote a real card id.
- Moves are sent as **all-or-nothing batches** of actions (tapping lands
  and casting a spell is one change, as on the local board): the server tries
  the whole batch on a copy and applies it as one version, or none of it.
- **In the browser**, `OnlineSession` gives the board the same interface as a
  local game. The board calls its player "You", so incoming data renames your
  seat to "You" and the other seat to their guest name; outgoing actions are
  renamed back only in player fields (`player`, `opponent`, `defender`).
- **What a player receives** (engine/src/redact.ts, next to view.ts): their
  `GameView`, their legal actions, their filtered events, and a *redacted
  state*: the board reads more than `GameView` today (costs, attack checks,
  choice checks), so it gets a copy of the state with only what that player
  may see. The copy is built from an allowlist: every field of the game, its
  players and its cards is classified (copy, rewrite references, or drop),
  and TypeScript fails the build if a new field isn't classified. The view is
  built from the redacted state, so both follow the same rules.
- **Card identities can't be tracked.** Real card ids are never sent (they
  follow library order after the shuffle and survive zone changes). Each
  player has an AliasBook of random aliases for the cards they can see; a
  card that goes where they can't see it (a library, another player's hand,
  face down into exile) loses its alias, and gets a new one if it comes back.
  Hidden cards are anonymous placeholders, numbered afresh in every message,
  with no definition. Commanders keep one alias: their identity is public.
- **Private looks** are covered: surveil and scry, Urianger's look, choices
  among library cards (hideaway, "look at the top N"), Summoning Materia's
  library top, foretold and other face-down exile, and pending choices inside
  `resolving`.
- **Known limit:** object-change counters (`zoneChanges` and the
  `...Object` numbers that refer to them) are sent as they are. They can
  show how many times a visible card has changed zones (for example that it
  was in a mulliganed hand), but never what a hidden card is.
- **Option B, a possible later cleanup:** make the board read only
  `GameView` plus a few server-computed extras (playable cards and costs,
  attack and choice checks), so no state copy is sent at all. It would
  shrink messages (a starting update is about 24 KB, mostly placeholder
  library cards) but rewrites much of the board, which the tutorial and
  local games also use.

## 2026-10-29: The Final Fantasy set for sealed

- The main set (FIN 1-309) and Through the Ages (FCA 1-64) are imported from
  MTGJSON by `cards/scripts/import-sets.ts` into `data/fin-set.json`, with
  the same recognizer as the precons (`scripts/recognize.ts`, now shared).
  Cards already defined elsewhere keep their definitions; cards built by hand
  in fin-set.json survive a re-import.
- A meld card is named by its own face ("Fang, Fearless l'Cie"), as on
  Scryfall and the card, not "Face // Melded result" as in MTGJSON.
- **Uncastable cards:** a printed cost with mana the engine can't pay yet
  (Phyrexian or hybrid; only K'rrik, Son of Yawgmoth so far) leaves the card
  without a `manaCost` and marks it `uncastable`: it can't be cast at all,
  rather than being given a made-up cost.
- Double-faced cards show their front face's image from Scryfall.

## 2026-10-29: Accounts and the shard ledger (E1)

- Accounts are Supabase Auth with Discord login. The browser holds only the
  public anon key; the game server holds the service role key (from `.env`)
  and is the only writer.
- Balances live in `profiles.shards` (never negative). Every change goes
  through `apply_shards(user, amount, kind, ref)`, which locks the player's
  row, records a `shard_ledger` row with the balance after, and does nothing
  for a (user, kind, ref) it has seen: retries can't pay or charge twice.
  The welcome grant is `ensure_profile`, with the fixed ref "welcome".
- Row-level security lets players read only their own rows; the functions
  can't be called from browsers.
- Tests use `MemoryAccounts`, which follows the same rules; the SQL itself
  is checked when it runs in Supabase.

## 2026-10-29: Booster drafts

- `cards/src/draft.ts` is plain JSON state, ready for the server: packs,
  per-seat lock-ins and picks. A player locks in a card from the pack in
  front of them; packs move only when every player has locked in, all
  together, one seat clockwise. A player's view holds their pack and picks,
  and whether the others have locked in, never what they chose.
- Drafts use real Play Boosters only (`openPack(..., { officialOnly: true })`):
  the Packs tab's own additions (Scene Box cards, surge foil tokens) are
  marked `unofficial` and left out. Tokens and art cards aren't drafted.
- Ragnarok, Divine Deliverance (Fang and Vanille's melded result, "99b") is
  a Scryfall printing but never a pack card; it's removed from every print
  sheet. The main set has 109 uncommons, as Wizards lists.
- **Limited** is a FormatConfig (`LIMITED`): 40-card minimum, 20 life, 2-4
  players; 99 copies stands for "no limit" so the format stays JSON. A deck is
  pool cards (by draft uid) plus basic-land counts.
- **Deckbuilding time:** 20 minutes. When it runs out, basic lands (split by
  the deck's colored symbols) fill the deck to 40, and it's locked in.
- Draft and deck tools read a card's colors with `cardColors`: its color
  identity, or its mana-cost colors for the hand-written Starter Kit cards,
  which have no color identity.
- The AI drafter favors rarer cards and cards the engine can fully play,
  avoids unbuilt spells (they can't be cast), and settles into its two most
  picked colors after five picks.
