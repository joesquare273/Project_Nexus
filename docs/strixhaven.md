# Secrets of Strixhaven (SOS)

Secrets of Strixhaven (released 2026-04-24; user's next set, 2026-11-20) is a
main set of 281 cards (SOS 1-281 with its basic lands; 282-368 are borderless
and other variants), imported with
`node packages/cards/scripts/import-sets.ts sos` into
`packages/cards/data/sos-set.json` (264 new definitions: the rest, mostly
basics, were defined already). `npm run scryfall` caches its card data and
images. Cards not built yet are `notBuilt`: they show everywhere with their
real images but can't be played.

The same import also defines the cards that come in packs: the Mystical
Archive (SOA), the ten Special Guests (SPG 149-158) and the Collector
Boosters' Commander cards (SOC 1-108), 129 more `notBuilt` definitions (the
four SOC cycling dual lands were built automatically). Still to import: the
other tokens (TSOC) and promos (PSOS).

## Commander decks (imported 2026-11-20)

The five college decks, imported with
`node packages/cards/scripts/import-precons.ts soc` into
`packages/cards/data/soc.json` (222 cards no other file defines; 11 built
automatically) and `soc-precons.json` (the exact decklists). Cards the
Collector Boosters' Commander sheet already put in sos-set.json (Dina,
Essence Brewer and the others) aren't defined twice. `npm run scryfall`
cached their data, images and each deck's own printings.

| Deck | Commander | Colors | Built |
|---|---|---|---|
| Lorehold Spirit | Quintorius, History Chaser | RW | 44/100 |
| Prismari Artistry | Rootha, Mastering the Moment | UR | 44/100 |
| Quandrix Unlimited | Zimone, Infinite Analyst | GU | 40/100 |
| Silverquill Influence | Killian, Decisive Mentor | WB | 39/100 |
| Witherbloom Pestilence | Dina, Essence Brewer | BG | 44/100 |

284 of the decks' 391 distinct cards still need building. The decks are sold
in the Store's Secrets of Strixhaven tab (precon price, saved as a deck) and
shown in the Collection's Secrets of Strixhaven tab. They aren't offered as a
free starter yet: a new player's first deck should be playable, so they join
the starter choice once their cards are built. Ohran Frostfang brought the
Snow supertype into the engine's list (no snow rules yet).

## Packs (2026-11-20)

Unlike the earlier sets, whose odds come from Wizards' "Collecting ..."
articles, Strixhaven's packs follow MTGJSON's print sheets:
`node packages/cards/scripts/mtgjson-boosters.ts sos` saves
`packages/cards/data/sos-boosters.json` (each pack kind's weighted layouts and
its sheets, each card by Scryfall id with its weight). `openSheetPack` picks a
layout by weight, then each position's card by weight, never twice from one
sheet; `SOS_POSITIONS` puts the sheets in reveal order and the test checks it
uses every layout card for card. The card data is in booster-cards.json
(`npm run scryfall:boosters`: SOS, SOA, SOC, TSOS, ASOS, SPG 149-158).

| Play Booster (14 cards) | Sheet |
|---|---|
| 5 commons | Common |
| Common or Special Guest | A Special Guest in 5 of 275 packs |
| 3 uncommons | Uncommon |
| Wildcard | Any rarity of the main set |
| Rare or mythic | Rare or mythic |
| Mystical Archive | Uncommon, rare or mythic |
| Land | Common dual land; foil in 1 of 5 packs |
| Foil | Any card, Mystical Archive too |

| Collector Booster (15 cards) | Sheet |
|---|---|
| 4 + 3 | Foil commons and uncommons |
| Foil land | Foil dual land |
| 3 Mystical Archive | Two uncommons and a rare or mythic, some foil |
| Booster Fun | Non-foil Booster Fun rare or mythic |
| Foil Booster Fun | Also Mystical Archive and Special Guests |
| Foil rare or mythic | Main set |
| Commander card | SOC 1-10, 61-108 |

MTGJSON lists no token or art card slot, so none is added. The pack photos
would be `packages/client/public/packs/sos-play-booster.png`,
`sos-collector-booster.png` and `sos-showcase.jpg`; until they're there the
drawn pack shows.

## Mechanics

- **Prepared** (74 cards): the same mechanic as Reality Fracture's, already in
  the engine (`becomePrepared`, `entersPrepared`, `prepare` on a card).
- **Repartee** (12): "whenever you cast an instant or sorcery spell that targets
  a creature, ..." (Graduation Day).
- **Infusion** (12): "if you gained life this turn, ..." (Foolish Fate).
- **Opus** (10): "whenever you cast an instant or sorcery spell, ..., and more
  if five or more mana was spent to cast it" (Deluge Virtuoso).
- **Increment** (9): "whenever you cast a spell, if the amount of mana you
  spent is greater than this creature's power or toughness, put a +1/+1
  counter on it" (Pensive Professor).
- **Paradigm** (5, Lessons): "then exile this spell; after you first resolve
  a spell with this name, you may cast a copy of it from exile without paying
  its mana cost at the beginning of each of your first main phases"
  (Restoration Seminar).
- **Converge** (9): counts the colors of mana spent to cast it.
- Also flashback, ward (some with non-mana costs), surveil, mill, and the
  Fractal, Pest, Inkling, Spirit, Elemental and Treasure tokens.

## Steps

| Step | What | Status |
|---|---|---|
| Import | Main set cards and images (SOS 1-281) | Done (2026-11-20) |
| Packs | Play and Collector Boosters, Packs tab, Collection binder | Done (2026-11-20) |
| Commander | The Commander decks (SOC): import, Store, Collection | Done (2026-11-20) |
| SOC1-SOC5 | The decks' cards, one group per deck | |
| SOS1 | Lands (13) | |
| SOS2 | Prepared (74, in color batches) | |
| SOS3 | Increment and Opus | |
| SOS4 | Repartee and Infusion | |
| SOS5 | Paradigm and Converge | |
| SOS6+ | The rest, by color, then multicolor, artifacts and legends | |
