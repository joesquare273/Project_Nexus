# Development updates

A running log of progress, open issues and their workarounds. Newest first.
Longer-lived design choices go in [decisions.md](decisions.md).

## 2026-10-21

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

Cards whose abilities aren't built yet are still in the decks, marked
"not built yet":

- **Creatures** can be cast and fight with their real cost, power,
  toughness and printed keywords (Flying, Reach, Vigilance, Menace and so
  on). Their other abilities do nothing yet.
- **Noncreature cards** (Equipment, unbuilt instants and sorceries, White
  Auracite) can't be cast yet and stay in hand.
- The board shows a "not built yet" badge on these cards. As each roadmap
  step (K2–K6, see [starter-kits.md](starter-kits.md)) lands, its cards
  lose the badge and start working, with no deck changes needed.

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
