# Reality Fracture (FRA) main set

The main set of Reality Fracture (released 2026-10-02), separate from its
Commander precon Multiverse Reforged (docs/commander.md). Cards 1-290 are
imported (`node packages/cards/scripts/import-sets.ts fra`, data in
`packages/cards/data/fra-set.json`); its packs and Collection tab are in
docs/packs.md. Cards not built yet are `notBuilt`: they show everywhere with
their real images but can't be played.

Tests: `packages/bots/test/fra-cards.test.ts`.

## Mechanics

- **Empower Jace N** (33 cards): loyalty counters on a Jace token you control,
  creating the Jace planeswalker token first (built for the precon, `Empower`).
- **Prepared** (24 cards): a creature with a spell attached. While it's
  prepared, you may cast a copy of its spell; doing so unprepares it. Needs a
  new engine feature (group F4).
- **Surveil and "whenever you scry or surveil"** (42 cards).
- **Echoed pairs** (FRA 195-280): legendary pairs; the "Way of the ..."
  enchantments give planeswalkers loyalty abilities.
- **Behold a Jace**, threshold, flashback, landcycling, prowess.
- Hybrid mana costs: the importer dropped costs it couldn't pay at the time
  (`{W/B}` and Karn's `{2/W}`...); each card gets its real cost as it's built.

## Groups

| Group | Cards | Status |
|---|---|---|
| F1 | Lands (19): the Commons and Annexes, portal view lands, Hall of Echoes, Roiling Canopy, Room of Refuge, Theorist's Sanctum | Done |
| F2 | Empower Jace spells and creatures (17) | Done |
| F3 | The ten "Way of the ..." enchantments and other cards that give planeswalkers abilities (Sanctum Lurker, Avatar of Burgeoning Echoes, Kiora of Salt and Sand) | Done |
| F4 | Prepared (24): the 21 creatures with prepare spells, Codie, Hexhaven Dueling Arena, Infinite Coursework | Done |
| F5 | White commons, uncommons and rares | |
| F6 | Blue | |
| F7 | Black | |
| F8 | Red | |
| F9 | Green | |
| F10 | Multicolor and artifacts | |
| F11 | Echoed pairs legends, white, blue and black | |
| F12 | Echoed pairs legends, red, green and multicolor | |
| F13 | Planeswalkers and the rest (Emrakul, The Theorist, Chandras, Garruks, Ajanis, Jace, Reality Sculptor) | |

### F1 (2026-11-16)

- The ten Commons and Annexes: "enters tapped unless you control a planeswalker" (`entersTappedUnless.planeswalker`).
- The five portal view lands: "unless you control two or more other lands" (`otherLands`).
- Theorist's Sanctum: "As this land enters, you may behold a Jace. If you don't, it enters tapped" (`beholdSubtype`: a Jace you control counts; otherwise reveal one from your hand with PlayLand's `reveal`); {2}{U}, {T}: empower Jace 2.
- Hall of Echoes: becomes a copy of your creature until end of turn, and the legend rule doesn't apply to your permanents this turn (`legendRuleOffThisTurn`, `PlayerState.legendRuleOffTurn`).
- Roiling Canopy (the `ForestsYouControl` count) and Room of Refuge.
- Hexhaven Dueling Arena waits for prepared (F4).

### F2 (2026-11-16)

- Academic Ascent, Campus Crier (from the graveyard), Hexhaven Battalion (three Cadets, basic landcycling), Repurposed Enforcer (empower X, X creatures you control), Mindseeker Oculus, Protégé's Awakening, Theorist's Proxy, Overwrite the Multiverse, Rewrite Regrets, Solve for Disappointment, Vraska's Final Mercy, No Admittance, Violent Echoes, Arcane Amphisbaena, Inspired Tethermage, Tam's Resistance, Keeper of the Quiet Hour.
- Engine: the `excessDamage` amount (DealDamage `recordExcess`, for creatures and planeswalkers; empowering 0 does nothing), "the next spell you cast this turn can't be countered" (`NextSpellCantBeCountered`), and `counterKind` on CountersAdded triggers. The Cadet token (tfra 1).
- Countersculpt (behold a Jace or pay {1}) and Jace's Machinations (loyalty abilities at instant speed) come with F13.

### F3 (2026-11-16)

- The ten "Way of the ..." enchantments, Sanctum Lurker, Avatar of Burgeoning Echoes and Kiora of Salt and Sand.
- Engine: `planeswalkersHave` statics give each planeswalker you control loyalty abilities after its own (`currentDefinition`); "whenever you activate a loyalty ability" triggers (`loyaltyAbility`, `loyaltyRemovedAtLeast` for Way of the Mind Sculptor); "if you've activated a loyalty ability this turn" (`ifActivatedLoyaltyThisTurn`, `PlayerState.loyaltyActivatedTurn`); planeswalkers that survive at 0 loyalty (`planeswalkersSurviveZeroLoyalty`). Beast (tfra 8) and Leviathan (tfra 6) tokens.

### F4 (2026-11-16)

- **Prepared**, as Wizards' release notes describe it: when a creature with a prepare spell becomes prepared (`becomePrepared`; "enters prepared" is `entersPrepared`), its controller gets a copy of that spell in exile (`prepareSpellOf` on the copy). Only the creature's current controller may cast it, with the spell's own cost and timing, for as long as the creature stays prepared; casting it unprepares the creature, and the copy ceases to exist when it leaves the stack or when the creature leaves or is unprepared. A creature can't be prepared twice, and one without a prepare spell can't become prepared.
- A card's prepare spell is `prepare` on its definition (name, cost, type, effects), like an Adventure. On the board the creature shows a "Prepared" badge and the cast option appears on the creature; the copies aren't listed in the exile pile.
- The 21 creatures (eleven spells: Seed Suture, Unwind History, Peer Review, Arc of Fortune, Ancestral Craving, Omit Variables, Vicious Verse, Improvised Act, Molten Tide, Enroot, Soul Tether), Codie, Ravenous Codex (copies prepared spells; makes your creatures prepared), Hexhaven Dueling Arena and Infinite Coursework. Their hybrid costs are set.
- Also new: threshold and "an opponent was dealt noncombat damage this turn" as static conditions, "each player may discard their hand and draw seven", "whenever you tap a Mountain for mana, add an additional {R}" until end of turn, and the Heartwood token (tfra 11; "Heartwood" isn't in Scryfall's artifact-type catalog yet, so the validator adds it).
