## SOC4d: Silverquill Influence, part four (built 2026-11-25)

Angelic Destiny, Sage's Reverie, Chains of Custody, Sheltered by Ghosts,
Flickering Ward, Darksteel Mutation, Land Tax, Keen Duelist, Shielded by
Faith and Pearl-Ear, Imperial Advisor. 20 Silverquill cards left.

- **Target `ThisCardFromBattlefield`:** the source card, if it went from the
  battlefield to a graveyard since the ability triggered (Angelic Destiny:
  "return this card to its owner's hand").
- **Flickering Ward:** static `protectionFromChosenColor` (the color chosen
  as it enters); `canAttach` lets the Aura stay ("this effect doesn't remove
  this Aura").
- **Darksteel Mutation:** static `setCardTypes` (layer 4: exactly artifact
  creature, keeping only creature subtypes) with `setCreatureTypes`,
  `basePowerToughness`, `losesAllAbilities` and indestructible.
- **Count** `AurasYouControlAttachedToCreatures` (Sage's Reverie).
- **Keen Duelist:** the effect `KeenDuel`.
- **Pearl-Ear:** spellCostReduction per Aura on enchantment spells (affinity
  for Auras) and SpellCast `ifSpellTargetsMatching` (a modified permanent you
  control).

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

## SOC4e: Silverquill Influence, part five (built 2026-11-25)

Screams from Within, Ghoulish Impetus, Gift of Immortality, Forum
Filibuster, Ajani's Chosen, Armored Skyhunter, Songbirds' Blessing and Herald
of Amity. 12 Silverquill cards left.

- **Rule 303.4f:** an Aura put onto the battlefield without being cast (and
  not told what to attach to) has its controller choose what it enchants as
  it enters: the choice `auraHost` among `auraHosts` (the permanents it could
  legally enchant; not targeted). With nothing legal it stays where it was.
  State-based actions leave it alone while that choice is open. Used by
  ReturnToBattlefield, LookAtTopPutMatching onto the battlefield and
  RevealUntil.
- **ReturnToBattlefield** `attachToSubject` (Gift of Immortality's delayed
  return, attached to the creature) and `attachToCreatedToken` (Forum
  Filibuster's reflexive trigger, fixed to the token as it triggers).
- **Armored Skyhunter:** LookAtTopPutMatching `attachEquipmentToYourCreature`.
- **Songbirds' Blessing:** RevealUntil `mayBattlefieldElseHand` (choice
  `battlefieldElseHand`).
- **Herald of Amity:** the effect `ExileTopCastOneFree` (castFree choice with
  `restToBottom`); attacking, +X/+X for Auras you control.
- **Ajani's Chosen:** the effect `AttachSubjectToCreatedToken`; Cat token
  `cat-token-soc` (tsoc 2).
- Known simplification (docs/decisions.md): if Herald's chosen Aura isn't cast
  when you get the chance, it stays in exile.

## SOC4f: Silverquill Influence, part six (built 2026-11-25)

Scriv, the Obligator, Eiganjo Dynastorian (Replenish), Defacing Duskmage
(Vandal's Edit), Intermediate Chirography, Inkshield and Shadrix
Silverquill. 6 Silverquill cards left.

- **Scriv's Contract:** token `contract-token-soc` (tsoc 3), an Aura token
  created attached to the chosen target (CreateToken `attachToPreviousTarget`
  after ChooseTarget). Its attack trigger uses the effect condition
  `ifAttackingYourOpponent` (true: +2/+0; false: its controller loses 2).
- **Replenish:** each returned Aura chooses what it enchants (rule 303.4f).
- **Intermediate Chirography:** trigger `YouLoseLife` with
  `firstTimeEachTurn`; trigger condition `ifModifiedCreatureDiedThisTurn`
  (PlayerState `modifiedCreatureDiedTurn`, set as a modified creature dies).
- **Inkshield:** the effect `PreventCombatDamageToYouMakeTokens` (PlayerState
  `inkshield`): combat damage to you this turn is prevented, and each 1
  prevented makes an Inkling for you.
- **Shadrix Silverquill:** an optional "choose two" trigger with
  `modesTargetDifferentPlayers` (the target choices and the check refuse the
  same player twice).

## SOC4g: Silverquill Influence, done (built 2026-11-26)

Eidolon of Countless Battles, Sentinel's Eyes, Animate Dead, Hateful
Eidolon, Changing Loyalty and Fallen Ideal finish Silverquill Influence, the
fourth complete Strixhaven deck: a free starter choice and a deck the
computer opponents can get.

- **Bestow** (rule 702.103): alternativeCost `bestow`; cast that way the card
  is `bestowed`, an Aura spell targeting a creature and an Aura while
  attached (types, Aura subtype, enchant creature in `currentDefinition`).
  Unattached, it's the creature again and stays on the battlefield. With its
  target gone it resolves as a creature.
- **Escape** (rule 702.138): `def.escape` {cost, exileOthers}; the graveyard
  way `escape`. Legal actions list it once, with `costPool` (every other
  card in your graveyard): the browser picks the cards one at a time and the
  engine accepts any legal set, so every pair can be chosen.
- **Animate Dead:** `enchantGraveyardCreature` (an Aura spell targeting a
  creature card in any graveyard); as it resolves, the card returns under
  your control with the Aura attached (`animatedBy`), and the Aura's
  leaves-the-battlefield trigger (`SacrificeAnimatedCreature`) sacrifices it.
- **Hateful Eidolon:** CardInstance `lastAurasBy` (the controllers of the
  Auras on a permanent as it left); trigger condition `ifSubjectWasEnchanted`
  and amount `subjectAurasYouControlled`.
- **Replicate** (rule 702.56): `replicate` with `multikicker` as its cost; a
  cast trigger copies the spell once per payment (amount `subjectKicks`);
  copies of the Aura become tokens and may choose new targets.
- **Fallen Ideal:** static `grantsActivated` (abilities the enchanted creature
  has, added after its own).
- Known simplification (docs/decisions.md): Animate Dead's return happens as
  the Aura resolves rather than in a separate enters trigger.

## SOC5a: Witherbloom Pestilence, part one (built 2026-11-26)

Witherbloom Campus, Grim Backwoods, Assassin's Trophy, Mortality Spear,
Blood Artist, Zulaport Cutthroat, Viscera Seer, Sakura-Tribe Elder,
Moldervine Reclamation, Haywire Mite, Pawn of Ulamog, Awakening Zone,
Ophiomancer, Dina, Soul Steeper, Yahenni, Undying Partisan, Witherbloom
Charm and Teacher's Pest. 36 Witherbloom cards left.

- **Mortality Spear:** costReduction `ifGainedLifeThisTurn`.
- **Eldrazi Spawn** (`eldrazi-spawn-token-soc`, tsoc 1): manaAbility `noTap`
  with `sacrifice` ("Sacrifice this creature: Add {C}"): no {T}, so a
  summoning-sick or tapped Spawn can make mana.
- **Snake** token `snake-token-soc` (tsoc 11).

## SOC5b: Witherbloom Pestilence, part two (built 2026-11-26)

Feral Appetite, Blight Mound, Pest Rescuer, Beledros Witherbloom, Trudge
Garden, Veinwitch Coven, Defiling Daemogoth, Blossoming Bogbeast, Witch of
the Moors, Jadar, Ghoulcaller of Nephalia and Bloodghast. 25 Witherbloom
cards left.

- **Tokens:** `pest-token-soc` (tsoc 23: "When this creature dies, you gain 1
  life"), `fungus-beast-token-soc` (tsoc 17), `zombie-decayed-token-soc`
  (tsoc 12).
- **Decayed** (rule 702.147): the keyword `Decayed`; it can't block, and
  attacking marks it to be sacrificed at end of combat.
- **Pest Rescuer:** static `lifeGainPlus`. With a doubler too, the +1 is
  applied first (the larger total; the player chooses the order, rule 616.1).
- **Bloodghast:** static condition `opponentAtMostTenLife`; landfall from the
  graveyard.

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
shown in the Collection's Secrets of Strixhaven tab. Each joins the free starter
choice once all of its cards are built (`preconFullyBuilt`), as Lorehold
Spirit did on 2026-11-24; computer opponents use the finished ones too. Ohran Frostfang brought the
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
| SOC1-SOC5 | The decks' cards, one group per deck (each split in parts): SOC1a Lorehold Spirit lands, spells and sacrifice creatures (16), SOC1b recursion and creatures (12), SOC1c Quintorius and friends (5), SOC1d discard and exile tricks (5), SOC1e Warsinger, Sevinne, Ao, Skyclave (4), SOC1f Bitterthorn, Excava, Quintorius Loremaster (3), SOC1g Hofri, Guardian Scalelord, Study Hall (3), SOC1h Augusta, Spirit of Resilience, Serra Paragon (3), SOC1i Classes and voting (2): **Lorehold Spirit complete (2026-11-24)**; SOC2a Prismari Artistry lands, spells and magecraft (16), SOC2b cascade and spell-cast creatures (11), SOC2c token copies, demonstrate and spell copies (7), SOC2d trigger doubling, Goldspan, prepared (7), SOC2e the commander Rootha, Stormsinger, Furygale, Twinflame (4), SOC2f any number of targets, Brudiclad (1), SOC2g Muddle, Surge to Victory, Dance with Calamity (3), SOC2h Magma Opus, Mirrorwing Dragon (2), SOC2i suspend, piles, Plargg and Nassari (3): **Prismari Artistry complete (2026-11-24)**; SOC3a Quandrix Unlimited {X} creatures, counters and spells (23), SOC3b first {X} spell each turn, Fractals (9), SOC3c lands, mana and odd/even (10), SOC3d Tanazir, Oversimplify, Commands, Otter, Shotcaller (6), SOC3e Ooze, Primo, Unbound Flourishing, mana rocks (6), SOC3f Bloomsage, Opal Palace (2): **Quandrix Unlimited complete (2026-11-25)**; SOC4a Silverquill Influence removal, lands and Aura support (14), SOC4b goad Auras, Killian, Decisive Mentor, constellation (8), SOC4c attack restrictions and attack triggers (6), SOC4d Auras and upkeep enchantments (10), SOC4e Auras entering without being cast (8), SOC4f Scriv, prepared cards, Chirography, Inkshield, Shadrix (6), SOC4g bestow, escape, Animate Dead, replicate (6): **Silverquill Influence complete (2026-11-26)**; SOC5a Witherbloom Pestilence sacrifice outlets, death triggers, removal, lands (17), SOC5b Pests, lifegain payoffs, Decayed, Bloodghast (11) | In progress |
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

Still to build in Lorehold Spirit after SOC1h (2); SOC1i finished it.

## SOC1i: Lorehold Spirit, done (built 2026-11-24)

Advanced Reconstruction and Fateful Tempest finish Lorehold Spirit, the first
Strixhaven deck to be complete. It's now a free starter choice and one of the
decks computer opponents can get.

- **Classes (rule 716):** a Class starts at level 1 (`classLevel`, public).
  Its level-up abilities (`classLevelTo`, `GainClassLevel`) work only from
  the level just below. Abilities with `ifClassLevelAtLeast` (triggers,
  statics and cost reductions) apply from that level. Spell cost reductions
  can be `notFromHand`.
- **Advanced Reconstruction:** `ExileRandomFromYourGraveyardToPlay`.
- **Council's dilemma voting:** `Vote` with `voteOptions` asks each player in
  turn order, starting with the caster (a `chooseOption` pending with
  `forResolution: 'vote'`). Later effects read the amount `votesFor` (with
  `vote`), and Fateful Tempest's damage reads `manaValueMilledThisWay`.
- ExileTopCardToPlay with a counted amount of zero exiles nothing.

## SOC2a: Prismari Artistry, part one (built 2026-11-24)

Ferrous Lake, Prismari Campus, Reliquary Tower, Mystic Sanctuary, Prismari
Charm, Prismari Command, Abrade, Deep Analysis, Resculpt, Treasure Cruise,
Stormcatch Mentor, Curiosity Crafter, Mana Geyser, Aether Gale, Faerie
Mastermind and Storm-Kiln Artist.

- **Magecraft:** a SpellCast trigger with `orCopied` also triggers when a
  copy of a spell is made (the `SpellCopied` event). Other SpellCast
  triggers still ignore copies, which aren't cast.
- **Mystic Sanctuary:** `entersTappedUnless.otherSubtypeAtLeast` ("three or
  more other Islands") and an EntersBattlefield trigger with
  `ifSourceUntapped`.
- **Deep Analysis:** `flashbackLife`, life paid with the flashback cost (not
  offered with less life than that).
- **Mana Geyser:** the count `TappedLandsOpponentsControl`.
- Token: Elemental 4/4 (tsoc 20) for Resculpt.

Still to build in Prismari Artistry after SOC2a: 36 cards; SOC2b took 11.

## SOC2b: Prismari Artistry, part two (built 2026-11-24)

Throes of Chaos, Volcanic Torrent, Prismari Pianist, Leitmotif Composer,
Brazen Borrower, Reality Shift, Galazeth Prismari, Hall of Oracles, Manaform
Hellkite, Renegade Bull and Volcanic Salvo.

- **Cascade (rule 702.85):** the keyword `Cascade` adds its trigger in
  `currentDefinition` (each instance separately): ExileUntilFound for a
  nonland card with lesser mana value, cast free right away, the rest on the
  bottom in a random order. A spell whose only ability is cascade passes the
  validator.
- **Manifest** takes a target player: Reality Shift's "its controller
  manifests the top card of their library" (`PreviousTargetController`).
- **CreateToken `exileAtEndStep`** (Manaform Hellkite's X/X Dragon Illusion,
  sized by the mana spent on the spell).
- The count `TotalPowerOfCreaturesYouControl` (Volcanic Salvo's cost).
- Galazeth's granted mana uses the existing `grantsMana` static with the
  `instantOrSorcerySpell` restriction.
- Tokens: Elemental 1/1 (tsoc 21), Dragon Illusion (tsoc 13).

Still to build in Prismari Artistry after SOC2b: 25 cards; SOC2c took 7.

## SOC2c: Prismari Artistry, part three (built 2026-11-24)

Rionya, Fire Dancer, Determined Iteration, Replication Technique, Creative
Technique, Thunderclap Drake, Rootha, Mercurial Artist and Arcane Denial.

- **Demonstrate (rule 702.144):** the keyword adds an optional cast trigger
  (`currentDefinition`): CopySpell with `demonstrate`, which also makes a copy
  for an opponent (the next in turn order, docs/decisions.md). Each copier
  may choose new targets.
- ExileUntilFound `castNow`: the found card is cast free right away
  (Creative Technique).
- Activated cost `returnThisToHand` (Rootha).
- CreateDelayedTrigger `nextTurn` (waits for the next turn, surviving
  cleanup) and `forPreviousTargetController` (Arcane Denial: the countered
  spell's controller gets the draw).
- The count `InstantOrSorcerySpellsYouCastThisTurn` (Rionya, with `plus`).
- Determined Iteration's populate targets a creature token you control.

Still to build in Prismari Artistry after SOC2c: 18 cards; SOC2d took 7.

## SOC2d: Prismari Artistry, part four (built 2026-11-24)

Harmonic Prodigy, Veyran, Voice of Duality, Goldspan Dragon, Expressive
Iteration, Dirgur Focusmage and Inspired Skypainter.

- **Trigger doubling:** the `extraTriggers` static takes `ofSourceMatching`
  (Harmonic Prodigy: "a Shaman or another Wizard you control") and
  `byInstantOrSorcery` (Veyran: abilities of your permanents triggered by
  casting or copying an instant or sorcery spell).
- **Goldspan Dragon:** BecomesTarget `bySpell`; granted mana abilities can
  add more than one mana (`grantsManaAmount`) and sacrifice the permanent
  (`grantsManaSacrifice`), so its Treasures add two mana of one color.
- **Expressive Iteration:** `LookTopHandBottomExile`, two card choices
  (`iterateHand`, then `iterateBottom`); the last card is exiled and may be
  played this turn.
- Dirgur Focusmage uses SpellCast `fromZone: 'hand'`; both are prepared
  cards like the main set's.

Still to build in Prismari Artistry after SOC2d: 12 cards and the commander (13); SOC2e took 4.

## SOC2e: Prismari Artistry, part five (built 2026-11-24)

Rootha, Mastering the Moment (the commander), Redoubled Stormsinger,
Furygale Flocking and Twinflame.

- The count `GreatestInstantOrSorceryManaValueYouCastThisTurn`
  (PlayerState `greatestInstantOrSorceryManaValueThisTurn`, public, reset
  each turn) sizes Rootha's X/X Elemental (tsoc 19).
- CreateTokenCopy `attackingLikeSubject`: copies enter tapped and attacking
  the player the triggering creature attacks (Redoubled Stormsinger).
- CreateToken `eachOpponentMustAttack`: tokens for each opponent that must
  attack that opponent this turn (the encore rule, Furygale Flocking).
- **Strive** (`def.strive`): the cost rises for each target beyond the first.
  Twinflame takes any number of targets (`anyNumberOfTargets`, fixed after
  SOC2e at the user's request; docs/decisions.md).

Still to build in Prismari Artistry after SOC2e: 9 cards (Muddle, Abstract
Performance, Dance with Calamity, Mirrorwing Dragon, Plargg and Nassari,
Rousing Refrain, Surge to Victory, Brudiclad, Magma Opus).

## SOC2f: any number of targets, and Brudiclad (built 2026-11-24)

- Twinflame now takes any number of target creatures you control, as printed
  (it was capped at four): `anyNumberOfTargets` on an effect, and the browser
  asks how many targets before picking them.
- When there are too many target combinations to list, legal actions carry
  `targetSlots` and the browser lets you pick slot by slot (docs/decisions.md).
- **Brudiclad, Telchor Engineer:** creature tokens you control have haste; at
  the beginning of combat a 2/1 Phyrexian Myr (tsoc 8), then
  `OtherTokensBecomeCopy`: you may choose a token you control (`tokenModel`),
  and each other token you control becomes a copy of it, with no end.

Still to build in Prismari Artistry after SOC2f: 8 cards (Muddle, Abstract
Performance, Dance with Calamity, Mirrorwing Dragon, Plargg and Nassari,
Rousing Refrain, Surge to Victory, Magma Opus).

## SOC2g: Prismari Artistry, part seven (built 2026-11-24)

Muddle, the Ever-Changing, Surge to Victory and Dance with Calamity.

- CopyCreature `copyAtOnce` (no "may": Muddle "becomes a copy of up to one
  target") and `copyAddTriggers` ("except it has myriad": the myriad attack
  trigger is added to the copy until end of turn).
- CreateDelayedTrigger `keepPreviousTarget`: the delayed trigger acts on the
  previous target. Surge to Victory's "whenever a creature you control deals
  combat damage to a player this turn" uses `CastCopyOfTriggeringCardFree`:
  the exiled card stays in exile, and a copy may be cast free right away.
- `ExileTopAsManyAsYouChoose` (Dance with Calamity): a `chooseOption` with
  `forResolution: 'exileMore'` ("Exile the top card" or "Stop", without
  looking first); if the total mana value is 13 or less, each spell among them
  may be cast free right away.

Still to build in Prismari Artistry after SOC2g: 5 cards (Abstract
Performance, Mirrorwing Dragon, Plargg and Nassari, Rousing Refrain, Magma
Opus).

## SOC2h: Magma Opus and Mirrorwing Dragon (built 2026-11-24)

- **Divided damage** (`DivideDamage` with `amongTargets`) now includes
  players and planeswalkers among the targets (it was creatures only, which
  also left out Fury's planeswalkers), and `amongGroup` limits it to one
  phrase's targets. A player is offered as a button while dividing.
- **Magma Opus:** 4 damage divided among one to four targets, tap two target
  permanents, a 4/4 Elemental, draw two; from your hand, {U/R}{U/R} and
  discard it for a Treasure.
- **Mirrorwing Dragon:** SpellCast `ifSpellTargetsOnlySource`, and
  `CopySpellForEachOtherCreature`: the spell's controller copies it for each
  other creature they control it could target, each copy targeting a
  different one.

Still to build in Prismari Artistry after SOC2h: 3 cards (Abstract
Performance, Plargg and Nassari, Rousing Refrain).

## SOC2i: Prismari Artistry, done (built 2026-11-24)

Rousing Refrain, Abstract Performance and Plargg and Nassari finish Prismari
Artistry. It's now a free starter choice and a deck computer opponents can get.

- **Suspend (rule 702.62):** `def.suspend` ({ count, cost }); the `Suspend`
  action (a special action from your hand, any time you could cast the card)
  exiles it with time counters (`suspended`, public). While it's exiled, its
  owner's upkeep trigger removes a time counter, and `LastTimeCounterRemoved`
  lets them cast it free right away. `ExileThisSuspended` (Rousing Refrain:
  "Exile Rousing Refrain with three time counters on it") suspends the
  resolving spell.
- AddMana `manaUntilEndOfTurn`: PlayerState `keptMana` keeps that much mana
  as steps and phases end this turn (lost in cleanup). The amount
  `previousTargetHandSize`.
- **Abstract Performance:** `TwoPilesOpponentChooses`: four cards face down
  (nobody may look), four face up; an opponent (the caster picks which, with
  several) chooses the pile for the graveyard (`chooseOption`,
  `forResolution: 'pile'`); the caster looks at the other and may cast one
  spell from it free right away (`castOneFree`; if not cast, it goes to the
  hand), and the rest go to the hand.
- **Plargg and Nassari:** `EachExilesUntilNonlandCastOthers`: each player
  exiles until a nonland card; an opponent picks one of those
  (`denyCast`); a free, immediate cast group allows up to two spells
  (`CastGroup.free`, `remaining`) from the others, at any timing.

## SOC3a: Quandrix Unlimited, part one (built 2026-11-24)

Benevolent Hydra, Ozolith, Kami of Whispered Hopes, Stroke of Genius,
Goldvein Hydra, Lifeblood Hydra, Stonecoil Serpent, Steelbane Hydra,
Primordial Hydra, Rapid Hybridization, Eureka Moment, Quandrix Campus,
Oran-Rief, Commander's Insight, Primal Might, Tyvar's Stand, Biomass
Mutation, Hydroid Krasis, Perplexing Test, Quandrix Charm, Decisive Denial,
Curse of the Swine and Entrancing Melody.

- Amounts can be halved (`half: 'down' | 'up'`), and `x` in a spell's own
  cast trigger reads the spell's X (Hydroid Krasis).
- `protectionFromMulticolored` (Stonecoil Serpent); filter `manaValueIsX`
  (Entrancing Melody); the amount `previousTargetCommanderCasts`
  (Commander's Insight).
- SetBasePT with `toughnessFromAmount` (Biomass Mutation's X/X); Exile
  `controllerCreatesToken` (Curse of the Swine's Boars).
- Biomass Mutation's mana cost ({X}{G/U}{G/U}) was missing from the import.
- Tokens: Frog Lizard (tsoc 16), Boar (tsoc 15).

Still to build in Quandrix Unlimited after SOC3a: 33 cards.

## SOC3b: Quandrix Unlimited, part two (built 2026-11-24)

Zimone, Infinite Analyst (the commander), Owlin Spiralmancer, Nev, Lattice
Library, Expansion Algorithm, Deekah, Fractal Harness, Ingenious Prodigy and
The Goose Mother.

- **"Your first spell with {X} in its mana cost each turn":** PlayerState
  `xSpellsThisTurn` (public, reset each turn); SpellCast `firstXSpellThisTurn`
  (copies don't count); spellCostReduction `firstXSpell`; filter
  `hasXInManaCost`; the amount `subjectX` (that spell's X) and the count
  `PlusOneCountersOnThis`.
- **A copy of a permanent spell becomes a token** as it resolves (rule
  707.10a); before, it ceased to exist (Owlin Spiralmancer).
- Study counters (Lattice Library). Skulk is the existing
  `cantBeBlockedByGreaterPower` static (Ingenious Prodigy).
- Food token (tsoc 27).

Still to build in Quandrix Unlimited after SOC3b: 24 cards.

## SOC3c: Quandrix Unlimited, part three (built 2026-11-25)

Guardian Augmenter, Silkguard, Quandrix Apprentice, Troyan, Zimone,
Quandrix Prodigy, Mana Bloom, Open the Way, Animist's Awakening, Zimone's
Hypothesis and Alchemist's Refuge.

- Mana restriction `bigOrXSpell` (Troyan: spells with mana value 5 or more,
  or with {X} in their mana costs).
- `CastAsThoughFlashThisTurn` (PlayerState `flashTurn`, Alchemist's Refuge).
- manaAbility `oncePerTurn` (CardInstance `manaAbilityTurn`, Mana Bloom).
- `maxXIsPlayers` (Open the Way: X is at most the number of players).
- `RevealTopLandsToBattlefield` and `UntapLandsPutThisWay` (Animist's
  Awakening with spell mastery).
- `ReturnCreaturesOfChosenParity` (`chooseOption`, `forResolution: 'parity'`;
  zero is even).

Still to build in Quandrix Unlimited after SOC3c: 14 cards.

## SOC3d: Quandrix Unlimited, part four (built 2026-11-25)

Tanazir Quandrix, Oversimplify, Quandrix Command, Nexus Mentality, Elusive
Otter and Striding Shotcaller.

- The amount `previousTargetPlusOneCounters` (Tanazir doubles a creature's
  counters); SetBasePT `ptFromSource` (its attack trigger).
- Exile `eachPlayerTokenOfExiledPower` (Oversimplify: every player gets a
  Fractal, with counters for the power they lost).
- `groupOwnerIsTargetPlayer` (Quandrix Command: the cards must come from the
  target player's graveyard); ShuffleIntoLibrary works on graveyard cards.
- `MoveAllCounters` and `RemoveAllCountersDraw` (Nexus Mentality, both modes
  with a commander).
- DivideDamage `divideCounters` (Grove's Bounty divides X +1/+1 counters among
  any number of your creatures, at most X of them: `divideProblem`, also used
  for legal actions); `cantBeBlockedByLesserPower` (Elusive Otter).
- AddCounters `thenGrantKeywords` (Run the Play's flying).

Still to build in Quandrix Unlimited after SOC3d: 8 cards.

## SOC3e: Quandrix Unlimited, part five (built 2026-11-25)

Kinetic Ooze, Primo, the Unbounded, Zimone, All-Questioning, Brass
Infiniscope, Elementalist's Palette and Unbound Flourishing.

- **"Any number of targets" on triggered abilities** (Kinetic Ooze): one "up
  to one" slot per possible target, made as it triggers. Trigger target
  actions carry `targetSlots` too when there are too many combinations to list,
  and the browser picks slot by slot.
- Abilities of a permanent cast with {X} know its X (`xPaid`): targets with
  `manaValueAtMostX`, `ifXAtLeast`.
- `entersWithXCountersTimes` (Primo: twice X); filter `basePower`; TriggerSpec
  `sumBatchAmount` (the damage the batch dealt).
- `ifLandsYouControlPrime` (Zimone, All-Questioning); Primo, the Indivisible
  token (tsoc 24).
- `DoubleSpellX`, and `CopyTriggeringAbility` with AbilityActivated
  `ifAbilityCostHasX` (Unbound Flourishing).
- Mana restriction `xCost` (spells with {X} in their mana costs and
  activation costs with {X}: Elementalist's Palette).
- The mana abilities here are ordinary activated abilities on the stack, a
  known simplification (docs/decisions.md).

Still to build in Quandrix Unlimited after SOC3e: 2 cards (Yavimaya
Bloomsage's Channel, Opal Palace).

## SOC3f: Quandrix Unlimited, done (built 2026-11-25)

Yavimaya Bloomsage and Opal Palace finish Quandrix Unlimited, the third
complete Strixhaven deck: a free starter choice and a deck the computer
opponents can get.

- **Channel** (Bloomsage's prepared spell): `LifeForColorlessThisTurn`
  (PlayerState `lifeManaTurn`); the `PayLifeForMana` action (1 life for {C})
  is offered wherever mana abilities are, and the browser shows a button.
  Bloomsage's end-step prepare uses `ifPreviousTargetPowerAtLeast`.
- **Opal Palace:** AddMana `commanderIdentityColors` (a color in your
  commander's color identity, none if colorless) and `opalMana` (PlayerState
  `opalMana` tracks it). Casting a commander spends that mana first; anything
  else spends other mana first (as its controller would choose; payment is
  automatic). Spent on the commander, it enters with extra +1/+1 counters
  equal to its casts from the command zone.

## SOC4a: Silverquill Influence, part one (built 2026-11-25)

Fracture, Vanishing Verse, Anguished Unmaking, Winds of Rath, Silverquill
Campus, War Room, Arcane Lighthouse, Ghostly Prison, Spirit Mantle,
Raffine's Guidance, Transcendent Envoy, Starfield Mystic, Kor Spiritdancer
and Killian, Ink Duelist. 44 Silverquill cards left.

- **Filters:** `monocolored` (exactly one color) and `enchanted` (an Aura is
  attached; Winds of Rath destroys `enchanted: false` creatures). The engine
  has no regeneration, so "can't be regenerated" changes nothing.
- **Counts:** `AurasAttachedToThis` (Kor Spiritdancer) and `AurasYouControl`.
- **Protection from creatures** (Spirit Mantle): the keyword
  `ProtectionFromCreatures`, from any creature source.
- **Arcane Lighthouse:** the effect `OpponentsCreaturesLoseHexproof`
  (PlayerState `lighthouseTurn`); until end of turn, creatures that player's
  opponents control lose hexproof and shroud and can't have them.
- **War Room:** ability cost `lifeCommanderColors`, life equal to the colors in
  your commanders' color identity (0 outside Commander).
- **Raffine's Guidance:** alternativeCost `onlyFromGraveyard` with
  `fromGraveyard`: {2}{W} from the graveyard, never from the hand.
- **Killian, Ink Duelist:** spellCostReduction `ifTargetsCreature`.


## SOC4b: Silverquill Influence, part two (built 2026-11-25)

Coercive Impetus, Martial Impetus, Parasitic Impetus, Redemption Arc,
Eldrazi Conscription, Killian, Decisive Mentor (the commander), Archon of
Sun's Grace and Doomwake Giant. 36 Silverquill cards left.

- **Goad until your next turn:** the `Goad` effect (CardInstance
  `goadedUntil`, cleared at the start of the goading player's turn). The
  Impetus Auras and Redemption Arc use the existing `goaded` static.
- **Filters:** `enchantedByYou` (an Aura you control is attached: Killian's
  "creatures that are enchanted by an Aura you control attack") and
  `attackingOpponent` (attacking one of your opponents, not a planeswalker:
  Martial Impetus).
- **Pegasus token:** `pegasus-token-soc` (tsoc 5).
- **Eldrazi Conscription:** annihilator 2 is the Aura's attack trigger, and
  the card has no Kindred type or Eldrazi subtype yet (docs/decisions.md).


## SOC4c: Silverquill Influence, part three (built 2026-11-25)

Combat Calligrapher, Eriette of the Charmed Apple, Nils, Discipline
Enforcer, Tomik, Wielder of Law, Firemane Commando and Breena, the Demagogue.
30 Silverquill cards left.

- **"Can't attack you or planeswalkers you control":** static
  `cantAttackYou` (a filter, from the static's controller's view), checked in
  `canAttackPlayer`.
- **Nils's tax:** static `attackTaxPerCounter`; `attackTaxFor` takes the
  attacking creature, and the legal attacks, the bots and the browser use the
  per-creature cost.
- **Nils's end step:** "for each player, up to one target creature that
  player controls" is four up-to-one targets, each with filter
  `controllerSeat` (a seat in the turn order).
- **Attack triggers:** YouAttackPlayer `anyPlayerAttacksOpponent` ("whenever
  a player attacks one of your opponents", once per opponent attacked) and
  `ifDefenderLifeAboveAnotherOpponent` (Breena); YouAttack byOpponent
  `attackingYouAtMost` (Firemane Commando: none attacked you).
- **Breena's counters:** AddCounters `chooseOne` (chosen, not targeted).
- **Inkling token:** `inkling-token-soc` (tsoc 22, a 2/1).

