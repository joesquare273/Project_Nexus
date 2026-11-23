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
| SOC1-SOC5 | The decks' cards, one group per deck (each split in parts): SOC1a Lorehold Spirit lands, spells and sacrifice creatures (16), SOC1b recursion and creatures (12), SOC1c Quintorius and friends (5), SOC1d discard and exile tricks (5), SOC1e Warsinger, Sevinne, Ao, Skyclave (4), SOC1f Bitterthorn, Excava, Quintorius Loremaster (3), SOC1g Hofri, Guardian Scalelord, Study Hall (3), SOC1h Augusta, Spirit of Resilience, Serra Paragon (3) done 2026-11-23 | In progress |
| SOS1 | Lands (13, and SOC's five Turbulent lands) | Done (2026-11-20) |
| SOS2 | Prepared (37, in color batches): SOS2a white and blue (14), SOS2b black and red (13), SOS2c green, multicolor and colorless (10) | Done (2026-11-21) |
| SOS3 | Increment and Opus (19): SOS3a Opus (10), SOS3b Increment (8 of 9) done 2026-11-21; Tester of the Tangential waits for an {X} trigger cost | Nearly done |
| SOS4 | Repartee and Infusion (24): SOS4a Repartee (12), SOS4b Infusion (12) | Done (2026-11-21) |
| SOS5 | Paradigm and Converge (14): SOS5a Converge (9), SOS5b Paradigm (5) | Done (2026-11-23) |
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

## SOS3a: Opus (built 2026-11-21)

Deluge Virtuoso, Exhibition Tidecaller, Muse Seeker, Expressive Firedancer,
Molten-Core Maestro, Tackle Artist, Thunderdrum Soloist, Colorstorm Stallion,
Elemental Mascot and Spectacular Skywhale. Opus is a SpellCast trigger on your
instants and sorceries; its "if five or more mana was spent to cast that
spell" parts use the effect conditions `ifSubjectManaSpentAtLeast` (it was there already, for Tellah) and (for
"... instead") the new `unlessSubjectManaSpentAtLeast`, read from the triggering spell's
mana spent.

## SOS3b: Increment (built 2026-11-21)

Pensive Professor, Textbook Tabulator, Ambitious Augmenter, Hungry
Graffalon, Topiary Lecturer, Berta, Wise Extrapolator, Cuboid Colony and
Fractal Tender. Increment is a keyword (`Increment`) whose trigger
`currentDefinition` adds, like prowess: whenever you cast a spell, if the
mana spent on it is greater than the creature's power or its toughness
(checked as it triggers and again as it resolves), a +1/+1 counter.

New: `PutSubjectCounters` (every kind of counter the dying creature had,
onto the Fractal: Ambitious Augmenter) with the `ifSubjectHadCounters`
condition, and `manaAbility.amountEqualsPower` (Topiary Lecturer).

Not yet: **Tester of the Tangential** ("you may pay {X}. When you do, move X
+1/+1 counters ..."): a trigger's optional cost can't have an {X} yet.

SOS3a's mana-spent conditions now reuse the engine's existing
`ifSubjectManaSpentAtLeast` (Tellah, Shantotto) instead of a second copy;
the "... instead" half is `unlessSubjectManaSpentAtLeast`.

## SOS4a: Repartee (built 2026-11-21)

Graduation Day, Informed Inkwright, Inkshape Demonstrator, Rehearsed
Debater, Stirring Hopesinger, Forum Necroscribe, Lecturing Scornmage,
Melancholic Poet, Conciliator's Duelist, Inkling Mascot, Scolding
Administrator and Snooping Page. Repartee is a SpellCast trigger on your
instants and sorceries with `ifSpellTargetsCreature` (the spell on the stack
has a creature on the battlefield among its targets).

New: Exile `returnAtNextEndStep` (Conciliator's Duelist: the card comes back
under its owner's control as the next end step begins; the
`returnFromExileAtEndStep` card field, public). "Ward—Discard a card" uses the
ward trigger built for Reality Fracture (`CounterUnlessDiscard`).

## SOS4b: Infusion (built 2026-11-21)

Foolish Fate, Moseo, Vein's New Dean, Poisoner's Apprentice, Tragedy Feaster,
Ulna Alley Shopkeep, Withering Curse, Efflorescence, Follow the Lumarets,
Lumaret's Favor, Tenured Concocter, Thornfist Striker and Old-Growth
Educator. "If you gained life this turn" is the `LifeGainedThisTurn` count
(an effect's `ifCount`, with `not` for "unless").

New: the static condition `gainedLifeThisTurn` ("as long as you gained life
this turn"), the filter `manaValueAtMostLifeGained` (Moseo) and
LookAtTopPutMatching `takeIfGainedLife` (Follow the Lumarets). Lumaret's
Favor copies itself with a "when you cast this spell" trigger. Its copy was
the first spell copy the card sweep saw cease to exist, so the test
invariants now allow spell copies in the void as well as tokens (rule
707.10a).

## SOS5a: Converge (built 2026-11-23)

Rancorous Archaic, Sundering Archaic, Together as One, Transcendent Archaic,
Arcane Omens, Archaic's Agony, Magmablood Archaic, Snarl Song and Wildgrowth
Archaic. Converge counts the colors of mana spent to cast the card
(`converge: true` pays generic with new colors first).

New: every spell now records its colors spent (the stack item's
`colorsSpent`, and the card's `colorsSpentToCast`, kept as a permanent and
public), the amounts `colorsSpent` and `subjectColorsSpent`,
`convergeCounters` (enters with a +1/+1 counter per color), the filter
`manaValueAtMostSourceColorsSpent`, the effect condition `ifDrewThisWay`, and
`SpellEntersWithCounters` (Wildgrowth Archaic gives the triggering creature
spell extra counters). Magmablood and Wildgrowth Archaic use monocolored
hybrid costs ({2/R}, {2/G}).

## SOS5b: Paradigm (built 2026-11-23)

Restoration Seminar, Echocasting Symposium, Decorum Dissertation,
Improvisation Capstone and Germination Practicum. A `paradigm` spell is
exiled as it resolves; the first one of each name its controller resolves is
recorded (`PlayerState.paradigms`, public), and at the beginning of each of
their first main phases that card may be cast as a copy, free
(`castPermission` with `asCopy` and `exileAfter`: the card stays in exile).
See decisions.md for the timing simplification.

New: CreateTokenCopy `from` (Echocasting Symposium: the copy goes to the
player chosen for that target) and `ExileUntilManaValueCastFree`
(Improvisation Capstone: the spells among the exiled cards are castable free
right away, before passing priority).

## SOC1a: Lorehold Spirit, part one (built 2026-11-23)

Lorehold Spirit has 53 cards still to build, in three parts. Part one: Lotus
Field, Lorehold Campus, Emeria, the Sky Ruin, Mistveil Plains, Wave of
Reckoning, Squee, Goblin Nabob, Drumbellower, Monologue Tax, White Orchid
Phantom, Seize the Spoils, Faithless Looting, Rip Apart, Lorehold Charm,
Kami of Ancient Law, Selfless Spirit and Remorseful Cleric.

New: EachMatchingDealsDamage `toItself` (Wave of Reckoning), the static
`untapCreaturesInOthersUntapSteps` (Drumbellower) and the activation
condition `ifYouControlAtLeast` with `ifYouControl` (Mistveil Plains: two or
more white permanents). Tests: `packages/bots/test/soc-cards.test.ts`.

## SOC1b: Lorehold Spirit, part two (built 2026-11-23)

Karmic Guide, Angel of Indemnity, Teshar, Ancestor's Apostle, Primary
Research, Relic Retriever, Guardian of Faith, Moonshaker Cavalry, Tocasia's
Welcome, Ceaseless Conflict, Atsushi, the Blazing Sky, Quintorius, Field
Historian and Claim Jumper, with the 3/2 Spirit token (TSOC 25).

New:
- **Echo** (rule 702.30): `echo` on the card; entering the battlefield makes
  it due (`echoDue`, public), and `currentDefinition` adds the upkeep trigger
  "sacrifice it unless you pay".
- A trigger's `ifDeclined` effects happen instead when its controller
  declines its optional cost.
- The `OpponentsWithMoreLands` count (Claim Jumper).
- The amount `nontokenCreaturesOfYoursDestroyedThisWay` (Ceaseless
  Conflict). It counts the cards you own, so a stolen creature counts for
  its owner.

Guardian of Faith's "any number of other target creatures" is chosen as the
trigger resolves rather than targeted.

## SOC1c: Lorehold Spirit, part three (built 2026-11-23)

Quintorius, History Chaser (the deck's commander, a planeswalker), Naktamun
Lorespinner (Wheel of Fortune), Lorehold Archivist (Restore Relic), Balefire
Liege ({R/W} hybrid) and Patchwork Banner.

New:
- `ifDiscardedThisWay`, with the resolution's discard count: "You may
  discard a card. If you do, ...".
- The counts `PlayersWithOneOrFewerCardsInHand` and
  `ArtifactOrCreatureCardsInYourGraveyard`.
- CreateTokenCopy `copyOfCard`: a copy of a card in exile, for Restore
  Relic.
- `chooseCreatureTypeAsEnters` with the filter `subtypeIsSourceChosenOption`
  (Patchwork Banner). The options are the creature types of cards in public
  zones.
- "Target player or planeswalker" is AnyTarget with a planeswalker filter.

Still to build in Lorehold Spirit after SOC1c (20); SOC1d took five of them.

## SOC1d: Lorehold Spirit, part four (built 2026-11-23)

Containment Construct, Conspiracy Theorist, Perpetual Timepiece, Laelia, the
Blade Reforged and Vanguard of the Restless.

New:
- The trigger `ExiledFromLibraryOrGraveyard` (Laelia).
- `ExileSubjectToPlay`: the discarded card, playable this turn; with
  `castOnly`, castable only.
- `ShuffleChosenFromGraveyard`, with the `shuffleIntoLibrary` choice
  (Perpetual Timepiece).
- The count `CommanderCastsFromCommandZone` (Vanguard of the Restless).

Simplifications:
- Perpetual Timepiece's "target cards" are chosen as it resolves.
- Conspiracy Theorist's "exile one of them" takes the first nonland card of
  the discarded batch.

Still to build in Lorehold Spirit after SOC1d (15); SOC1e took four of them.

## SOC1e: Lorehold Spirit, part five (built 2026-11-23)

Venerable Warsinger, Sevinne's Reclamation, Ao, the Dawn Sky and Skyclave
Apparition, with the X/X Illusion token (TSOC 7).

New:
- A triggered ability's targets can depend on its event's amount: the filter
  `manaValueAtMostTriggerAmount`, with the amount in the target context as
  it's chosen and as it's checked again on resolution (Warsinger).
- CopySpell `copySelf`: Sevinne's Reclamation cast from a graveyard copies
  itself; a copy never copies itself again.
- LookAtTopPutMatching `maxTotalManaValue` (Ao).
- Exile `exileLinked` now also links permanents exiled from the battlefield,
  and `ExiledCardOwnersCreateSizedToken` gives those cards' owners an X/X
  token (Skyclave Apparition).

Fixed for every card that copies a spell: a copy whose target is no longer
legal now gets to choose the one legal target left. Before, it was only asked
when there were two or more choices, so it kept its old target and fizzled.

Still to build in Lorehold Spirit after SOC1e (11); SOC1f took three of them.

## SOC1f: Lorehold Spirit, part six (built 2026-11-23)

Bitterthorn, Nissa's Animus, Excava, the Risen Past and Quintorius
Loremaster, with the Phyrexian Germ token (TSOC 9).

- **Bitterthorn:** living weapon is an enters trigger that creates the Germ
  and attaches the Equipment to it (Attach `CreatedTokens`).
- **Excava:** returns the card, then gives it a finality counter and makes
  it a 1/1 flying Spirit (BecomeCreature on the previous target).

New: `AllowCastFreeThisTurnThenBottom` and the spell flag `bottomAfter`: a
spell cast that way goes to the bottom of its owner's library as it resolves
(Quintorius Loremaster).

Still to build in Lorehold Spirit after SOC1f (8); SOC1g took three of them.

## SOC1g: Lorehold Spirit, part seven (built 2026-11-23)

Hofri, Ghostforge, Guardian Scalelord and Study Hall.

- **Hofri:** exiles the dying card (`TriggeringCard`) and makes a token copy
  of it. That target now also finds the card in exile, for `copyOfCard`. The
  token is a Spirit as well (`copyAddSubtypes`) and has "when this token
  leaves the battlefield, return the exiled card to its owner's graveyard"
  (`copyReturnsExiledCard`, the token's `returnsExiledCard`,
  `ReturnLinkedExiledCard`).
- **Guardian Scalelord:** backup 1 is its enters trigger. It puts a counter
  on the target; if that's another creature (`ifPreviousTargetNotSource`), the
  creature gains flying and the attack trigger until end of turn. Granted
  "whenever this creature attacks" triggers now work (GrantTrigger), and the
  new filter `manaValueAtMostSourcePower` serves the attack trigger.
- **Study Hall:** {C}, or {1}, {T} for any color. That colored mana, spent to
  cast your commander, scries X, the times you've cast commanders from the
  command zone (`scryOnCommanderCast`; the same mechanism as the
  commander-type scry mana).

Still to build in Lorehold Spirit after SOC1g (5); SOC1h took three of them.

## SOC1h: Lorehold Spirit, part eight (built 2026-11-23)

Augusta, Order Returned, Spirit of Resilience and Serra Paragon.

- **Augusta:** `EachPlayerExilesFromGraveyard` asks each player to exile a
  card from their graveyard and counts the nonland ones. A reflexive trigger
  (with `ifNonlandExiledThisWay`) then puts that many +1/+1 counters on
  target attacking creature. The number is fixed as the reflexive trigger is
  created.
- **Spirit of Resilience:** `BecomeCopyOfSubjectCardUntilEndOfTurn` offers
  the artifact and creature cards among those that left your graveyard (the
  `copyCard` choice, with prompt text and an AI answer). The copy lasts until
  end of turn.
- **Serra Paragon:** `castFromGraveyard.paragon` with
  `playLandsFromGraveyard` allows one land or one permanent spell with mana
  value 3 or less each turn between them. A permanent cast or played that way
  gets `paragonRider`, and `currentDefinition` adds the trigger "when this is
  put into a graveyard from the battlefield, exile it and you gain 2 life".

Still to build in Lorehold Spirit (2): Advanced Reconstruction (a Class with
levels) and Fateful Tempest (council's dilemma voting).
