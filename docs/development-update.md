# Development updates

A running log of progress, open issues and their workarounds. Newest first.
Longer-lived design choices go in [decisions.md](decisions.md).

## 2026-10-21

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
