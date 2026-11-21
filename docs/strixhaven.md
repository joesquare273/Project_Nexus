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

- **Prepared** (37 cards; 38 mention it): the same mechanic as Reality Fracture's, already in
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
| SOS1 | Lands (13, and SOC's five Turbulent lands) | Done (2026-11-20) |
| SOS2 | Prepared (37, in color batches): SOS2a white and blue (14), SOS2b black and red (13), SOS2c green, multicolor and colorless (10) | Done (2026-11-21) |
| SOS3 | Increment and Opus | |
| SOS4 | Repartee and Infusion | |
| SOS5 | Paradigm and Converge | |
| SOS6+ | The rest, by color, then multicolor, artifacts and legends | |

## SOS1: lands (built 2026-11-20)

The five slow lands (Deathcap Glade, Dreamroot Cascade, Shattered Sanctum,
Stormcarved Coast, Sundown Pass), the five college lands that enter tapped
and surveil 1 for {2}{X}{Y} and a tap (Fields of Strife, Forum of Amity,
Paradox Gardens, Spectacle Summit, Titan's Grave), and three one-offs:

- **Great Hall of the Biblioplex:** {C}, or pay 1 life for any color that
  can only cast instant and sorcery spells (a new `instantOrSorcerySpell`
  restricted pool, `manaAbility.lifeRestricted`; automatic payment only ever
  takes its {C}). {5}: if it isn't a creature, it becomes a 2/4 Wizard with
  the +1/+0 spell trigger (an animation can now carry triggers).
- **Petrified Hamlet:** chooses a land card name as it enters; lands with that
  name tap for {C}, and sources with that name (in any zone, cycling included)
  can't activate abilities other than mana abilities.
- **Skycoach Waypoint:** {C}; {3}, {T}: target creature becomes prepared.

The Commander decks' five Turbulent lands (enter tapped unless an opponent
controls eight or more lands) were built with them. Tests:
`packages/bots/test/sos-cards.test.ts`.

## SOS2a: white and blue prepared creatures (built 2026-11-20)

Elite Interceptor (Rejoinder), Emeritus of Truce (Swords to Plowshares),
Honorbound Page (Forum's Favor), Joined Researchers (Secret Rendezvous),
Quill-Blade Laureate (Twofold Intent), Spiritcall Enthusiast (Scrollboost),
Campus Composer (Aqueous Aria), Emeritus of Ideation (Ancestral Recall),
Encouraging Aviator (Jump), Harmonized Trio (Brainstorm), Jadzi, Steward of
Fate (Oracle's Gift, an X spell), Landscape Painter (Vibrant Idea), Skycoach
Conductor (All Aboard) and Spellbook Seeker (Careful Study).

New: `TapOrUntap` (Rejoinder's "you may tap or untap target creature":
tapping a tapped creature or untapping an untapped one does nothing, so it
toggles, and "you may" is the choice), the `OpponentsWithMoreCardsInHand`
count, and the Inkling, Elemental and Fractal tokens (TSOS 7, 3, 5).

## SOS2b: black and red prepared creatures (built 2026-11-20)

Adventurous Eater (Have a Bite), Cheerful Osteomancer (Raise Dead), Emeritus
of Woe (Demonic Tutor), Grave Researcher (Reanimate), Leech Collector
(Bloodletting), Scathing Shadelock (Venomous Words), Scheming Silvertongue
(Sign in Blood), Blazing Firesinger (Seething Song), Emeritus of Conflict
(Lightning Bolt), Goblin Glasswright (Craft with Pride), Maelstrom Artisan
(Rocket Volley), Pigment Wrangler (Striking Palette) and Strife Scholar
(Awaken the Ages).

New: "Ward—Pay N life" (`wardLife`), a LifeGained trigger's
`firstTimeEachTurn` (the gain is all the life gained this turn), and the
red-white Spirit and Treasure tokens (TSOS 11, 12).

## SOS2c: green, multicolor and colorless prepared cards (built 2026-11-21)

Emeritus of Abundance (Regrowth), Infirmary Healer (Stream of Life),
Studious First-Year (Rampant Growth), Vastlands Scavenger (Bind to Life),
Abigale, Poet Laureate (Heroic Stanza), Kirol, History Buff (Pack a Punch),
Lluwen, Exchange Student (Pest Friend), Sanar, Unfinished Genius (Wild Idea),
Tam, Observant Sequencer (Deep Sight) and Biblioplex Tomekeeper (prepare or
unprepare up to one creature as it enters). Every prepared card in the set
is now built.

New: ChooseGraveyardCards `byYou` (Bind to Life puts a creature card milled
this way onto the battlefield), the activation condition
`ifCastInstantOrSorceryThisTurn` with a per-turn count of each player's
instant and sorcery spells (`instantOrSorcerySpellsThisTurn`, public), and
the Pest token (TSOS 9).
