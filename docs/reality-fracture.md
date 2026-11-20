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
| F5 | White (18) | Done |
| F6 | Blue (13) | Done |
| F7 | Black (17) | Done |
| F8 | Red (20) | Done |
| F9 | Green (20) | Done |
| F10a | Multicolor, FRA 121-147 (20) | Done |
| F10b | Multicolor and artifacts, FRA 148-174 (18; Uldaros Theorix moved to F13) | Done |
| F11a | Echoed pairs legends, white (13) | Done |
| F11b | Echoed pairs legends, blue (11) | |
| F11c | Echoed pairs legends, black (11) | |
| F12 | Echoed pairs legends, red, green and multicolor | |
| F13 | Planeswalkers and the rest (Emrakul, The Theorist, Uldaros Theorix, Chandras, Garruks, Ajanis, Jace, Reality Sculptor) | |

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

### F5 (2026-11-19)

- Enlightened Confidant, Fateshaper Aspirant, Flickering Hound, Generous Revival, Germinate Recruits, Graft Surgeon, Guiding Hydra, Kindred Judgment, Loyal Tutor, Memory Trap, Predictive Preparations, Prophesied End, Refute Destiny, Return to the Light Realms, Shatterwing Pegasus, Surgical Precision, Unflinching Hortimancer and Your Fate Ends Here (with Campus Crier, Hexhaven Battalion, Repurposed Enforcer, Academic Ascent and Blossom-Blessed Angel from F2 and F4, every white card but Emrakul's colorless self is built).
- Engine: "choose a creature type" as a spell resolves (`ChooseCreatureType`, a `chooseOption` with `forResolution`; the choices are the creature types on the battlefield and "Another type"), Destroy's `exceptChosenCreatureType` and `drawIfNotAttacking`, and Surveil's `returnIfManaValueAtMostLifeGained`.

### F6 (2026-11-19)

- Countersculpt, Cruel Calculations, Cryotheory Adept, Divining Duelist, Icy Reception, Perfected Theory, Precise Redaction, Seasoned Cryomancer, Sphinx of False Conclusions, Sphinx's Approach, Surveillance Phantasm, Undulating Witness and Unsummon.
- Engine: behold as an additional cost (`additionalCost.behold`: reveal a card of that type from hand or choose one you control), "up to X" choices counted from the cards already chosen (`upToCount`, `chosenNonlandCount`), cards put from a player's library into their graveyard this turn (`PlayerState.libraryToGraveyard`), "if you've scried or surveilled this turn" (`PlayerState.scriedOrSurveiledTurn`, `attacksDespiteDefenderIfScried`), and Sphinx's Approach's "exile four cards named ... from your graveyard to search" (`ExileNamedToSearch`).
- Simplifications: Seasoned Cryomancer chooses the creatures as it resolves rather than targeting them, and Sphinx's Approach always exiles the four cards and searches when it can (the "you may" is taken).

### F7 (2026-11-20)

- Apex Witchstalker, Break Under Pressure, Cast Away Doubt, Dark Matter Manipulator, Darklight Phoenix, Extended Absence, Extrapolate the Impossible, Last Gasp, Lich's Relic, Multiply by Zero, Rampart Hunter, Rank Rat, Rise of the Deathbringer, Screeching Soulbreaker, Silence the Echo, Terminal Criticism and Theoretical Necromancer. The black echoed-pairs legends are F11 and Garruk, Veiled Butcher is F13.
- Engine: "sacrifices a [creature or planeswalker] with the greatest mana value" (`SacrificeGreatestManaValue`; on a tie that player chooses), "for every seven cards" amounts (`per` on a count amount), "cards drawn this way" (`drawnThisWay`).
- Cards from outside the game (rule 400.11): a player's sideboard is `PlayerSetup.sideboard`, kept as cards in the void marked `outsideGame` that no player is sent. In draft-event games it's the rest of the drafted pool; Commander and constructed games have none, so Extrapolate the Impossible does nothing there. `RevealFromOutsideGame`: reveal exactly two with different names (or none), and the next opponent in turn order chooses the one that goes to your hand (in multiplayer the rules would let the caster choose which opponent).

### F8 (2026-11-20)

- Ajani's Anguish, Artifist Acumen, Awaken the Inferno, Blazing Crescendo, Chandra's Emberling, Command the Stage, Craterclaw Colossus, Curse-Marred Demon, Draconic Visitor, Eardrum Rattler, Essence Burn, Face Yourself, Fulminous Forte, Heartstring Puller, Identity Echo, Master of Barbs, Skilled Battlecarver, Stingcaster Mage, Tether Technician and Wrath of the Bloodmane. The red echoed-pairs legends are F12; Ajani, Unrelenting and Chandra, Torch of Defiance are F13.
- Engine: flashback granted until end of turn with the card's mana cost as its cost (`GrantFlashback`, `CardInstance.flashbackTurn`); discarding at random (`atRandom`); Draconic Visitor's replacement of artifact tokens with Dragons (`artifactTokensBecome`, checked as each token is created, after copy effects); "whenever one or more opponents are dealt noncombat damage" (`OpponentDealtNoncombatDamage`); "if an opponent was dealt noncombat damage last turn" (`ifOpponentDealtNoncombatDamageLastTurn`, `PlayerState.noncombatDamagePreviousTurn`); token copies of each creature a player controls with haste and the planeswalker end-step sacrifice (`eachCreatureOfTarget`, `copyKeywords`, `copySacrificeUnlessPlaneswalker`); a cost reduction while you control a matching permanent (`costReduction.ifYouControl`). The Dragon token (tfra 7).

### F9 (2026-11-20)

- Bestial Incursion, Budding Insurgent, Compel Brutality, Flourishing Grapple, Gardenize, Greenhouse Propagator, Hexhaven Invigorator, Hungering Puppetbeast, Hunter's Axe, Omnipresence, Puppet Crafting, Restore with Empathy, Simulacrum Shaper, Something Worth Saving, Sureshot Sower, Tarmogoyf, Tethermage's Advantage, Verdant Kraken, Vinelasher Adept and Wrecking Gecko. The green echoed-pairs legends are F12; Garruk, Curse-Breaker is F13.
- Engine: "loses all abilities until end of turn" (`LoseAllAbilities`, `CardInstance.lostAbilitiesTurn`); damage from the spell's first target (`damageFromFirstTarget`) and equal to a planeswalker's loyalty (`previousTargetLoyalty`); "your choice of trample, hexproof, or haste" as an ability resolves (`ChooseKeyword` then GrantKeywords `chosenKeyword`); Omnipresence's free spells from hand (`castFromHandFreeUpToCreatures`: like Weftwalking, the spell is simply free, with X as 0); an Aura that makes the enchanted permanent a creature with base power and toughness (`enchantedBecomesCreature`); Tarmogoyf's card types in all graveyards (`CardTypesInAllGraveyards`, `toughnessFromCountPlus`). The Forest Tentacle token (tfra 9).
- Hunter's Axe's attack trigger is the Equipment's own ("whenever equipped creature attacks"), with trample or deathtouch chosen as it triggers.

### F10a (2026-11-20)

- Aerid Konstrari, Blessed Ghoul, Bloombrute, Charge the Sanctum, Clash of Elements, Craftwork Crusher, Denzilore Fatehold, Desperate Futurescribe, Entrust the Spark, Ferocity of the Hunt, Frostbite Pyromental, Grim Repriser, Ingris Stingerquill, Konstrari Charm, Kwia Vigorbloom, Mind Meanderer, Null Summoner, Primal Witchstalker, Proctor of Potential and Recursive Recruitment. Blessed Ghoul, Charge the Sanctum and Ferocity of the Hunt get their hybrid costs.
- Engine: **prowess** (rule 702.108; a keyword whose trigger `currentDefinition` adds); "choose two" triggered abilities (`chooseModes` on a trigger; the browser lists each pair); Clash of Elements' top-or-bottom choice with damage on top (`damageIfTop`); Null Summoner's exile from a revealed hand, castable with any mana while you have threshold (`exileToCastWithThreshold`, `playableFromExile.whileThreshold`); graveyard abilities that need an opponent dealt noncombat damage or a scry or surveil this turn (`ifOpponentDealtNoncombatDamageThisTurn`, `ifScriedOrSurveiledThisTurn`); effects only if you have or haven't scried or surveilled this turn; "if this spell wasn't cast from your hand" (`notCastFromHand`). The Lotus token (tfra 12).

### F10b (2026-11-20)

- Solarium Sentry, Solitary Cell, Stingerquill Charm, Stinging Vitriol, Tenured Tethermage, Theorix Charm, Twinned Vision, Twisted Fates, Vigorbloom Charm, Vindictive Triumph, Warriors' Blades, Afterthought Sentry, Archive Arbiter, The Echoverse Fulcrum, Eye of Jace, Living Library, Medic's Kitesail and Murmuring Volume. Twinned Vision gets its hybrid cost.
- Engine: flashback with an additional discard (`flashbackDiscard`); equip costing {1} less per +1/+1 counter on its target (`equipLessPerTargetCounter`); returning a permanent exiled earlier in the same spell under your control, exiled again at the next end step (Vindictive Triumph: ReturnToBattlefield from `PreviousTarget` with `exileAtEndStep`).
- Uldaros Theorix moves to F13: it needs copies of graveyard cards cast for free within a shared mana value budget.

### F11a (2026-11-20)

- Danitha, Sword of Hope; Ghalta, the Immovable; Gideon's Memorial; Koth of the Homestead; Liliana, the Faultless; Lyra, Archangel of Dawn; Rescue Girl, First Responder; Saheeli, Consul of Oversight; Teyo, Lightshield Expert; Thalia, the Survivor; Tomik, Orzhov Lawmage; Yoshimaru, Beloved Companion; Yuriko, Blade of the Mighty.
- Engine: "whenever you cast an Equipment spell or a spell that targets a creature you control" (`equipmentOrTargetsYourCreature`); the greatest toughness among your creatures (`GreatestToughnessAmongYourCreatures`) and "creatures you control can attack as though they didn't have defender" (`yourCreaturesAttackDespiteDefender`); mana spendable only on planeswalker spells (`planeswalkerSpell` restriction); opponents' noncreature spells costing more (`opponentsNoncreatureSpellsCostMore`); one attacker per planeswalker (`planeswalkersOneAttacker`); no spells or nonmana abilities during combat (`noSpellsOrAbilitiesDuringCombat`). The FRA Thopter token (tfra 14).
- Yuriko's double strike triggers for a creature attacking alone, whether it attacks a player or a planeswalker (the card says a player).
