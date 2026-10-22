# Development updates

A running log of progress, open issues and their workarounds. Newest first.
Longer-lived design choices go in [decisions.md](decisions.md).

## 2026-10-22

### "Up to N targets" and support (C2, step 2)

Targets can now be left out when a card says "up to": the board shows a
**No target** button, and "up to two target ..." can't pick the same thing
twice. Also new: searching for several cards ("up to two basic land
cards"), a dead creature's last power ("where X is this creature's power"),
counters you put on someone else's creature, "whenever this becomes
untapped", "return it to its owner's hand when it dies this turn",
intimidate, and putting a land from your hand onto the battlefield.

Fixes found by the Commander fuzz test along the way:

- The AI now finds its creatures by who controls them, not whose
  battlefield list they sit in, so it no longer tries to attack with a
  creature someone took from it.
- Cards in the graveyard of a player who has left the game can't be
  targeted (rule 800.4a).
- With many possible "up to" targets, the list of legal choices could come
  out empty; invalid combinations are now dropped while it is built.
- `node packages/bots/src/repro.ts --seed N --players P --format commander`
  replays one fuzz game and prints how it failed.

11 precon cards built (`packages/bots/test/precon-targets.test.ts`):
General Leo Cristophe, Angel of the Ruins, Sepulchral Primordial, Key to
the City, Generous Patron, Together Forever, Wakka, Rampant Rejuvenator,
Cultivate, Archaeomancer's Map and Barret (with the Rebel token). 137 of
320 distinct precon cards are now built (Revival Trance 56/100, Limit
Break 54, Counter Blitz 49, Scions & Spellcraft 47).

### Choosing cards: discard and sacrifice (C2, step 1)

Players now choose cards as spells and abilities resolve: which cards to
discard, which permanents to sacrifice, which to keep ("keep two creatures,
sacrifice the rest"), or whether to discard their whole hand. On the board
the cards on offer glow; click them and press Confirm. Discard and
sacrifice costs ("As an additional cost, discard a card", "Sacrifice a
creature:") ask which card when you cast or activate. Also new: end-step
triggers ("at the beginning of your end step", "each opponent's end step").

15 precon cards built (`packages/bots/test/precon-choices.test.ts`): Big
Score, Laughing Mad, Syphon Mind, Celes, Snort, Ruin Grinder, Mask of
Memory, Mog (with its Moogle token), High Market, Scavenger Grounds,
Professional Face-Breaker, Shadow, Archfiend of Depravity, Tragic
Arrogance and Fandaniel. 126 of 320 distinct precon cards are now built
(Limit Break 52/100, Revival Trance 52, Scions & Spellcraft 46, Counter
Blitz 45).

### Fix: triggers while paying for a spell

Sacrificing a Treasure for mana could set off a trigger (Al Bhed Salvagers)
that asked for a target in the middle of casting, so the cast failed.
Abilities that trigger from a mana ability now wait: if you then cast a
spell or activate an ability, they go on the stack after it, above it
(paying while casting, rule 601.2i). If you do anything else instead, such
as passing, they go on the stack first and you get priority back (rule
117.3c).

### The AI picks whom to attack

The AI used to attack only the opponent with the lowest life (on a tie,
whoever sits first, usually you) with everything. It now sizes up the
table: each opponent's board (power, evasion, double strike), mana, cards
in hand, life and commander damage dealt, plus a grudge against whoever has
attacked it. It goes for a kill when it has one, sends each attacker where
it gets through and matters most, and keeps blockers home when the biggest
threat could kill it next turn (`packages/bots/test/ai-threat.test.ts`).

### Board: choose which lands to tap, zone piles, animations, trigger spotlight

- **You choose which lands to tap.** After you pick a spell or ability (and
  its targets), your mana sources glow blue: click them to tap them, and a
  land that makes several colors asks which. It is cast once the mana is
  there. Auto-pay taps for you; "Tap mana automatically" on the right does
  that every time. The tutorial teaches it.
- **Library, graveyard and exile piles** beside each battlefield (click a
  graveyard or exile pile to see it all), with simple animations: cards
  slide in, damage and counters pop, piles bump, and life totals flash with
  the change floating up. They switch off when the computer is set to
  reduce motion.
- **Trigger spotlight:** when a card's ability triggers, the card shows
  large in the middle of the table for 2 seconds and in the card viewer.

These were built on the other computer's old branch and ported onto main;
that branch is kept locally as `backup/local-2026-10-21` and can be
deleted.

## Where things stand (end of 2026-10-21)

Read this first when picking the work up on another computer.

### Done so far

| Step | Where | Status |
|---|---|---|
| Starter Kits: every card (K1-K6), browser board, tutorial | `main` (PRs #1-#3) | Merged |
| Commander format and C1 mana cards | `main` (PR #3) | Merged |
| Mulligans (London, first one free in multiplayer) | `main` (PR #4) | Merged |
| C2 removal and board wipes: 24 cards | `main` (PR #4) | Merged |
| C2 Equipment: 16 cards, including Cloud, Ex-SOLDIER | `main` (PR #4) | Merged |
| C2 +1/+1 counters: 11 cards | branch `precon-counters` | Pushed, **no pull request yet** |

Precons fully built: Limit Break 49/100, Counter Blitz 45/100, Scions &
Spellcraft 43/100, Revival Trance 42/100 (111 of 320 distinct cards). Each
group's built and remaining cards are listed in [commander.md](commander.md)
under "C2 groups". Checks at the last commit: 305 tests pass; fuzz clean
(150 Commander and 300 Starter Kit games).

### Next steps, in order

Most of the 209 unbuilt cards wait on a few shared mechanics rather than on
card-by-card work:

1. **Choose cards: sacrifice and discard.** Done 2026-10-22 (15 cards; see
   above). Most of the other cards that mention discarding or sacrificing
   also need a later step (Sagas, X costs, rebound, convoke, crew...).
2. **"Up to N targets" and support.** Done 2026-10-22 (11 cards; see above).
   The rest of that list also needs Sagas, X costs, convoke or copies.
3. **Other counter kinds** (15): stun, shield, page, vow, flying, lore.
4. **New tokens** (14): Clue (investigate), Food, Soldier, Spirit, Bird...
   Add each to `packages/cards/data/tokens.json` by its exact Scryfall
   printing; `npm run scryfall` checks them.
5. **End-step triggers** (13), with the "this turn" tracking they need
   (life lost, a card left your graveyard, a counter was put on it).
6. Then Sagas, graveyard-to-hand, anthems, evolve, counterspells, and the
   remaining one-offs.

### Picking up on the other computer

Everything is on `main`; there are no other branches (2026-10-22: all work
was merged into `main` and every other branch deleted, here and on GitHub).
Work directly on `main` from now on.

```bash
git fetch origin --prune
git checkout main
git reset --hard origin/main
git branch | grep -v main | xargs -r git branch -D
npm install
npm run check
```

`git reset --hard` throws away uncommitted changes on that computer, and
the `git branch -D` line deletes its old local branches; everything worth
keeping is already on `main`. `npm run dev` starts the browser board.

## 2026-10-21

### Precon +1/+1 counters (C2, third group)

11 counter cards now work as printed (`packages/bots/test/precon-counters.test.ts`):
Hardened Scales, Duskshell Crawler, Sphere Grid, Bred for the Hunt,
Chocobo Knights, Inspiring Call, Grateful Apparition, Inexorable Tide,
Sunscorch Regent, Ardbert and Siegfried. New pieces:

- Static abilities can cover a group: "each creature you control with a
  +1/+1 counter on it has trample".
- Hardened Scales' "that many plus one" (also for proliferate and
  "enters with" counters).
- Proliferate. The engine picks your own permanents; choosing others is
  rarely right with only +1/+1 counters in the game.
- "Enters with N +1/+1 counters", "creatures with counters on them",
  "whenever you cast a white spell", and amounts like "twice the number of
  creature cards in your graveyard".

Counter Blitz (Tidus) is now 45/100 fully built.

### Precon Equipment (C2, second group)

16 Equipment-group cards now work as printed, including Limit Break's
commander, **Cloud, Ex-SOLDIER**: he attaches an Equipment to himself as he
enters, draws a card for each equipped attacker, and makes two Treasures at
power 7 or more. Tests: `packages/bots/test/precon-equipment.test.ts`.
New pieces:

- Keywords: hexproof, shroud (nobody can target it, even you) and nonbasic
  landwalk.
- "As long as equipped creature is legendary" (Champion's Helm, Hero's
  Heirloom) and "loses flying" (Colossus Hammer).
- Triggers remember what set them off ("attach this to it": Hero's Blade),
  and "whenever equipped creature dies" looks back at what was attached as
  it died (Skullclamp).
- Untap, "put a land from the top of your library onto the battlefield"
  (Explorer's Scope), and conditions like "if Cloud has power 7 or greater".
- The AI now uses the engine's own blocking rules, so it knows about new
  evasion like landwalk.

Limit Break is now 49/100 fully built.

### Precon removal (C2, first group)

24 removal spells and creatures from the Commander precons now work as
printed, each with a test against its Oracle text (`packages/bots/test/precon-removal.test.ts`).
New building blocks they use:

- "Destroy/exile all ..." with filters for color ("nonblack"), power,
  toughness and mana value thresholds, "with no counters", and non-subtypes
  ("non-Dragon").
- "Choose two" and "choose one or more" spells (Austere Command, Farewell):
  every allowed combination is a separate choice on the board.
- Alternative costs: pay 4 life (Snuff Out, if you control a Swamp) and
  overload (Vandalblast). They appear as their own entries: "Pay 4 life for
  Snuff Out", "Overload Vandalblast".
- Cost reduction per creature on the battlefield (Vanquish the Horde),
  exiling graveyards, "each opponent sacrifices their greatest-power
  creature" (Crackling Doom), Chaos Warp's shuffle-and-reveal, "life equal
  to its power" (Swords to Plowshares), "for each permanent destroyed this
  way" (Bane of Progress), and "tokens with the same name" (Legions to Ashes).
- The AI weighs board wipes: it casts one when the opponents lose more than
  it does, and holds it when it's ahead.
- The precon importer now keeps hand-built cards when re-run.

### Mulligans

Every real game (browser board, terminal, bots, fuzz tests) now starts with
London mulligans (rule 103.5): keep your seven, or shuffle them away and draw
a new seven; once you keep, put one card on the bottom for each mulligan. In
games with three or more players the first mulligan is free (103.5c). Players
decide in turn order, starting with whoever goes first.

- **Board:** the prompt shows how many lands are in the hand and what another
  mulligan costs. After keeping, click cards in your hand to choose what goes
  on the bottom (they lift with a "Bottom" label), then press "Put on
  bottom". The practice game has tips for both steps.
- **AI:** keeps 2-5 lands of 7, always keeps after two mulligans, and bottoms
  surplus lands or its most expensive spells. Across 360 test deals it kept
  about 81% of first hands.
- **Engine:** `createGame({ ..., mulligans: true })`. Off by default so tests
  can start straight at turn 1. Other players never learn which cards you drew
  or bottomed.

### Choices: where your commander goes, and playing a snarl tapped

- When your commander goes to a graveyard, exile, your hand or your library,
  you choose: the command zone, or leave it there (rule 903.9). The board
  asks with two buttons; the terminal asks y/n.
- Snarl lands (Furycalm Snarl and friends): if you have a matching land in
  hand you can reveal it to play the snarl untapped, or play it tapped
  anyway. Clicking one offers both. With nothing to reveal it enters tapped.

### Tutorial: "Learn to play" and a practice game with tips

The menu has a **Learn to play** lesson built on the Starter Kit cards: a
prepared position on your turn 3, with a coach panel that explains one idea
per step (lands and mana, casting an Equipment, Job select, targeting with an
instant, attacking) and only allows the move it's teaching. Winning leads to
a **practice game**: a fresh game from turn 1 with a random hand against the
AI, with tips that pop up as situations first come up (each dismissable).
The lesson lives in `packages/client/src/tutorial/` and is tested end to end.

### Started: the Final Fantasy Commander precons

All four precons (Limit Break, Revival Trance, Counter Blitz, Scions &
Spellcraft) are in the game with every card defined, and the Commander
format works: command zone, commander tax, commander damage, color
identity, 40 life. The first step, C1, built the mana cards Commander decks
rely on (Command Tower, Arcane Signet, Sol Ring, pain lands, checklands,
snarls, temples, Evolving Wilds...). 30-34 of each deck's 100 cards are
fully built; the rest play as "not built yet" for now. The roadmap is in
[commander.md](commander.md).

### Done: every Starter Kit card is built (K2-K6)

All 120 cards in the two Final Fantasy Starter Kits now work as printed,
with a test per card checking it against its Oracle text. Nothing is marked
"not built yet" anymore. Highlights:

- Tokens: Hero, Treasure (sacrifice for any color) and Robot Warrior, with
  their real Final Fantasy token art; Relm's Sketching makes token copies.
- Equipment: equip, Job select (a Hero token comes with each piece),
  Beatrix, Cloud's cheaper equip and Freya's Equipment-only mana.
- Graveyard: flashback, surveil, mill, Evil Reawakened, Plainscycling.
- Others: Coeurl, Suplex (choose a mode), Fate of the Sun-Cryst's cost
  reduction, White Auracite, Lightning playing cards from exile, and the
  legend rule: you choose which copy to keep (counters and Equipment can make
  one better than another).
- The browser board shows current power/toughness, counters, tokens and
  Equipment, lets you pick modes and abilities, cast from your graveyard or
  exile, look through graveyards, and surveil.

**Open issue: speed.** Every action copies the whole game state, which now
dominates the cost of bot games. Fuzz runs take about three times longer
than before. The board is unaffected (one action at a time). A
copy-on-write state would fix it.

### Tokens come from Scryfall too

Each card lists the exact tokens it makes on Scryfall, and many kinds share
a name, so tokens are matched by their Scryfall id, not by name.
`npm run scryfall` warns if a card makes a token that
`packages/cards/data/tokens.json` doesn't define.

### Card types decide which rules apply

Cards are categorized by type (land, creature, artifact, enchantment,
instant, sorcery) and by the broader groupings rules use: permanent,
nonpermanent and spell. The rules for each live in one engine module
(`typerules.ts`) instead of on each card. Permanents resolve onto the
battlefield, nonpermanents go to the graveyard after resolving, lands are
played rather than cast, and basic land types give their own mana. Trigger
filters can name categories ("nonland permanent").
[card-types.md](card-types.md) lists every type and category, the rules it
brings, and whether they're built. Subtypes are checked against Scryfall's
official lists (`packages/cards/data/types.json`) to catch typos.

### Decision: the Final Fantasy Starter Kits are the testbed

Every game (browser board, terminal, bots, fuzz tests) uses the exact
60-card Final Fantasy Starter Kit decklists, Red-White and Blue-Black. No
placeholder cards and no filler cards from other sets.

(Until K2-K6 were finished later the same day, cards whose abilities
weren't built yet were in the decks marked "not built yet":

- **Creatures** can be cast and fight with their real cost, power,
  toughness and printed keywords (Flying, Reach, Vigilance, Menace and so
  on). Their other abilities do nothing yet.
- **Noncreature cards** (Equipment, unbuilt instants and sorceries, White
  Auracite) can't be cast yet and stay in hand.
- The board shows a "not built yet" badge on these cards. As each roadmap
  step (K2–K6, see [starter-kits.md](starter-kits.md)) lands, its cards
  lose the badge and start working, with no deck changes needed.)

### Issue: Scryfall API rate limits

Card images and Oracle text come from Scryfall. Its API (`api.scryfall.com`)
has hard rate limits ([docs](https://scryfall.com/docs/api/rate-limits)):

| Endpoint | Limit |
|---|---|
| `/cards/search`, `/cards/named`, `/cards/collection` | 2 requests a second |
| Most other endpoints | 10 requests a second |
| Image and file servers (`*.scryfall.io`) | No limit |

Going over returns HTTP 429 and blocks the client for 30 seconds. Repeated
overages can get it banned, and ignoring a 429 isn't allowed. Scryfall also
asks that data be cached for at least 24 hours, and that large lookups use
its daily bulk data files instead of the API.

**Workaround in place:**

- The game never calls the API while you play. `npm run scryfall` looks cards
  up once and saves image links and Oracle text to
  `packages/cards/data/scryfall.json`, which is committed. The browser loads
  images straight from `cards.scryfall.io`, which has no limit.
- The script asks for 75 cards per request with `/cards/collection` (a
  whole Starter Kit is one request), waits 600 ms between requests, and
  only fetches cards not already saved. `--refresh` fetches everything again.
- On a 429 it waits out the 30-second lockout once, then stops instead of
  retrying.

**Still to do:**

- If an image fails to load (offline, or Scryfall is down), the browser
  board should fall back to the drawn card frame. Planned in the browser
  client work.
- Before adding Commander precons (hundreds of cards), switch the script to
  Scryfall's bulk data: download the daily `default_cards` file from
  `data.scryfall.io` (no rate limit) and read the needed cards locally.
- Optional, for offline play: a gitignored local image cache that the dev
  server fills on first use.

### Started: browser board

The terminal client is hard to play, so a graphical browser client
(`packages/client`) is in progress on the `browser-client` branch. A Godot
version may come much later for heavier effects; see
[decisions.md](decisions.md).

### Done: K1 triggered abilities

Triggered abilities, target choices and "you may" decisions, plus Al Bhed
Salvagers, G'raha Tia, Shambling Cie'th and Ultimecia, Temporal Threat. On
the `k1-triggered-abilities` branch, not yet merged to `main`.
