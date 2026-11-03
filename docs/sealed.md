# Draft events: roadmap

Booster drafts with the whole Final Fantasy set, for 2 to 4 players, with a
deckbuilder and a tournament. Agreed with the user on 2026-10-29. (The user
first called it "sealed"; the format they described is a booster draft.)

## The format

- **Booster draft:** each player opens a Final Fantasy Play Booster, chooses
  a card and confirms it to lock it in. Once every player has locked in, all
  picks are taken and every pack moves one seat **clockwise** (to the next
  seat), until the packs are empty; then everyone opens their next pack.
  Six packs each, 14 cards per pack: 84 cards per player. Nobody sees what
  the others pick, or the packs in front of them.
- **The packs are real Play Boosters:** Wizards' slot-by-slot contents, Final
  Fantasy main set and Through the Ages cards only. (The Packs tab's Scene
  Box extras are left out of drafts.)
- **Deckbuilding:** 20 minutes, with a 5-minute warning; it ends early once
  every player presses Ready.
  - 40 to 60 cards.
  - Any cards from your pool, lands included, plus unlimited basic lands.
  - Everything not in the deck is your sideboard.
- **Matches are best of 3.** The first game's play/draw is random; afterwards
  the loser of the last game chooses. Between games, players may sideboard.
- **Pairings are Swiss** (winners play winners, losers play losers), not
  random. Round 1 is random.
  - With 4 players, two rounds give one undefeated winner; an optional third
    round settles the other places.
  - With 3 players, each round one player gets a bye (a match win).
  - With 2 players, it's a single best-of-3 match.
- **Players keep the cards they open**, on their own account. This needs
  accounts (Supabase Auth with Discord login, see decisions.md); until then a
  pool lives with the event.

## Steps

| Step | What | Status |
|---|---|---|
| S1 | **Import the set:** every Final Fantasy main-set (FIN 1-309) and Through the Ages (FCA) card gets a definition (`cards/scripts/import-sets.ts`, `data/fin-set.json`). Cards the engine already covers are built; the rest are `notBuilt` (shown with their images, but they can't be cast or played until built). | **Done (2026-10-29):** 320 new definitions, 12 built |
| S2a | **The draft**, locally against 1-3 AI drafters: choose, confirm, rotate clockwise; six packs; the Draft tab. | **Done (2026-10-29)** |
| S2b | **The deckbuilder**, then playing your drafted deck against an AI drafter's deck: filters by color and type, deck columns by mana value, mana curve, land suggestions, unlimited basics, Auto-build, the 20-minute timer (5-minute warning; at zero, basics fill the deck to 40 and it locks), Ready. | **Done (2026-10-29)** |
| S3 | **Online events:** rooms of up to 4, the draft run by the server (it holds the packs and waits for every player to lock in), the deckbuilding timer enforced by the server, Swiss pairings, best-of-3 matches with sideboarding, standings, and pools kept on players' accounts once accounts exist. | **In progress (2026-11-03):** built in steps, with bots first (user order: bots, then players, then mixed). S3a **event core done:** `server/src/draftEvent.ts` and `swiss.ts` (rules only, no networking). S3b **event server done:** `server/src/events.ts` (messages, bots playing on the server, pools saved to accounts, 30 seconds per pick, AI drafters and deckbuilder). Next: S3c the Draft page on top of it, S3d players joining by code, S3e mixed tables. Rewards: the user will set them after. |
| S4 | **Build the set's cards** in shared-mechanic groups, like the precons, until all of them work. | 310 of 320 imported cards built. Group 57 (Y'shtola Rhul, Mizzix's Mastery, Terra, Magical Adept // Esper Terra; engine: an additional end step (`AdditionalEndStep`, `endStepsThisTurn`), `ExileToCastFree` (with overload over every instant and sorcery in your graveyard), and optional ReturnFromGraveyardToHand. Simplifications: Mizzix's Mastery casts the exiled card itself rather than a copy (it ends in exile either way)) done; Terra reviewed afterwards: a copied Saga now gets up to three lore counters one at a time (you may stop), the copies are sacrificed at your next end step only, a Saga token's entry lore counter triggers its chapter I, and lore counters added at once trigger each chapter they pass. Group 56 (Muldrotha, the Gravetide, Vaan, Street Thief, Firion, Wild Rose Warrior; engine: `castFromGraveyard.perPermanentType` with a once-each-turn land from the graveyard, `CastExiledOrTreasure`, the `notOwnedByYou` filter, and token copies whose equip costs less and are sacrificed at the next upkeep. Simplifications: a multi-type permanent card uses its first unused type for Muldrotha; Vaan's spell is cast later this turn (any timing) rather than during the trigger) done. Group 55 (Jodah, the Unifier, Emet-Selch, Unsundered // Hades, Sorcerer of Eld, Memories Returning; engine: ExileUntilFound `lesserThanSubject` and `restToBottom`, playing lands from your graveyard (`playLandsFromGraveyard`), `exileInsteadOfYourGraveyard`, and `MemoriesReturning`. Simplifications: Memories Returning's opponent is the next one in turn order, and Emet-Selch's fourteen-card check is made as the transform resolves) done. Group 54 (Summon: Brynhildr, Triple Triad, Sin, Spira's Punishment; engine: exile permissions tied to a Saga's lore turns (`whileSourceGetsLore`), `NextCreatureGainsHaste`, `TripleTriad`, and `ExileRandomPermanentCopy`) done; all the Summons are now built. Group 53 (Ultima, The Lunar Whale, Balamb Garden, SeeD Academy // Balamb Garden, Airborne, Clive's Hideaway, Zanarkand, Ancient Metropolis // Lasting Fayth; engine: `EndTheTurn` (rule 724: the stack is exiled and the turn goes to cleanup), `playFromLibraryTopIfAttacked`, and transforming land back faces without a mana cost. Simplification: abilities that triggered during Ultima's resolution are dropped with the rest of the stack rather than put on it in the cleanup step) done. Group 52 (Ragavan, Nimble Pilferer, Bolas's Citadel, Yuriko, the Tiger's Shadow; engine: dash (`alternativeCost.dash`), `libraryTopCostsLife` (life instead of the mana cost from the top of your library), commander ninjutsu (`alsoFromCommandZone`), and RevealTopToHandLoseLife `opponentsLose`. Simplification: a land Ragavan exiles can be played too) done. Group 51 (Cargo Ship, Urza, Lord High Artificer with the Construct token tbig 3, Kinnan, Bonder Prodigy; engine: an artifact-only mana pool (`artifactMana`, `onlyForArtifacts`), "tap an untapped artifact you control: add {U}" (`tapArtifactForBlue`), ExileTopCardToPlay `free`, and Kinnan's extra mana (`extraManaFromNonlandTaps`, the same type as the mana made). Simplification: Kinnan's bonus is the same type the permanent just made) done. Group 50 (Yawgmoth, Thran Physician, Fynn, the Fangbearer, Strixhaven Stadium; engine: -1/-1 counters (with +1/+1 annihilation, rule 704.5q), poison counters (`GivePoison`, losing at ten, shown in the life totals), point counters, protection from subtypes, proliferate on opponents' -1/-1 and poison counters, `toOpponent` and damage-to-you triggers, `sourceCounterKind`, and mana abilities that add a counter) done. Group 49 (Carpet of Flowers, Ardyn, the Usurper, Balthier and Fran; engine: `onceKey` (abilities sharing one once-each-turn mark), the `previousTargetPlayerMatching` amount, `CreateDemonCopy`, and `crewedByThisTurn` with the `crewedBySource` filter) done. Group 48 (Garnet, Princess of Alexandria, Buster Sword, Chocobo Kick, Serah Farron // Crystallized Serah; engine: `RemoveLoreFromSagas`, `CastFreeFromHand` (a free cast permission for a card in hand), kicker by returning a land (`kickerReturnsToHand`), `doubleIfKicked`, and the `firstLegendaryCreature` cost reduction. Simplification: Buster Sword's free spell is cast any time later this turn rather than during the trigger) done. Group 47 (Omega, Heartless Evolution, Cecil, Dark Knight // Cecil, Redeemed Paladin, Isshin, Two Heavens as One, Quistis Trepe, Esper Origins // Summon: Esper Maduin; engine: the `DealsDamage` trigger, `ifLifeAtMostHalfStarting`, Isshin's `extraTriggers.attacking`, `AllowCastTargetFromAnyGraveyard` (a cast group with any mana type, exiled afterwards), `SpellToBattlefieldTransformed`, and PutTopCardIfLand with a `filter` into the hand. Simplifications: Omega has three "one per opponent" target slots (enough for a 4-player pod); Quistis's spell is cast later this turn rather than during her ability) done. Group 46 (Venat, Heart of Hydaelyn // Hydaelyn, the Mothercrystal, Crystal Fragments // Summon: Alexander, Ultimecia, Time Sorceress // Ultimecia, Omnipotent, Sephiroth, Fabled SOLDIER // Sephiroth, One-Winged Angel; engine: emblems (permanent delayed triggers), `ifNthResolutionThisTurn`, "until your next turn" temporary effects, `PreventDamageToYourCreatures`, and trigger costs that exile cards from your graveyard (`exileGraveyard`, chosen as it resolves). Simplification: Ultimecia's extra turn comes from the paid end-step trigger, which is when she transforms) done. Group 45 (Kefka, Court Mage // Kefka, Ruler of Ruin, Clive, Ifrit's Dominant // Ifrit, Warden of Inferno, Joshua, Phoenix's Dominant // Phoenix, Warden of Fire, Najeela, the Blade-Blossom with the Warrior token tfrc 5; engine: the `DevotionToRed` count, amounts `chosenCardTypes` and `lifeLostInEvent`, `ReturnFromGraveyardTotalManaValue` (a choice capped by total mana value), CreateToken `attackingLikeSubject`, `duringCombat` activations, and bot choices that respect one-per-type and mana value caps. Simplifications: Phoenix's chapter III cards are chosen as it resolves rather than targeted; Ifrit's "three or more lore counters" check is on chapter III; Najeela's extra combat comes right after the current one) done. Group 44 (Ignis Scientia, Jenova, Ancient Calamity, The Wandering Minstrel with the Elemental token tfin 21, Winota, Joiner of Forces, Atraxa, Grand Unifier; engine: LookAtTopPutMatching `lookEntersTapped`, `lookAttacking` and `onePerType`, the `ifPreviousTargetIs` condition, `AddSubtypes` (kept as last-known information when it dies), `duringYourTurn` triggers, and the `yourLandsEnterUntapped` static. Simplification: Winota's Human attacks the player the triggering creature attacks) done. Group 43 (Sazh Katzroy, Cid, Timeless Artificer, Golbez, Crystal Collector, PuPu UFO, The Regalia; engine: AddCounters `thenDouble`, `anyNumberInDeck` for deck checks, the `ArtificersYouControlAndInYourGraveyard` count, SetBasePT `powerFromAmount`, RevealUntil `entersTapped`, and a previous target's printed power when it's a card outside the battlefield. Cargo Ship waits for artifact-only mana) done. Group 42 (Teferi, Mage of Zhalfir, Varragoth, Bloodsky Sire, Bruse Tarl, Boorish Herder, Ishai, Ojutai Dragonspeaker, Vial Smasher the Fierce; engine: statics that give your creature cards flash and hold opponents to sorcery timing, boast (`ifAttackedThisTurn`, from the new `attackedTurn`), `SearchLibraryToTop`, and the `RandomOpponent` target. Simplification: Vial Smasher only hits the player, not their planeswalkers) done. Group 41 (Syr Konrad, the Grim, Rhystic Study, Kraum, Ludevic's Opus, Thrasios, Triton Hero, Smuggler's Copter; engine: the `PutIntoGraveyard` trigger (from anywhere but the battlefield), the `Blocks` trigger, `DrawUnlessPays` (the caster may pay, tapping mana while choosing) and `RevealTopLandOrDraw`. Simplifications: Rhystic Study's draw isn't optional, and Partner isn't supported yet (it only matters for commanders)) done. Group 40 (Giott, King of the Dwarves, Nyxbloom Ancient, Noctis, Prince of Lucis, Raubahn, Bull of Ala Mhigo; engine: unlimited graveyard casting with a life cost and finality counter, ward paid in life equal to power (spells and activated abilities; triggered abilities targeting it don't pay), and mana tripling) done; Rydia waits for X-dependent targets. Group 39 (the Town lands with Adventures: Ishgard, the Holy See // Faith & Grief, Jidoor, Aristocratic Capital // Overture, Lindblum, Industrial Regency // Mage Siege, Midgar, City of Mako // Reactor Raid; engine: Adventures on land cards (the land is played from exile afterwards) and Mill `halfLibrary`) done. Group 38 (Lightning, Army of One, Kain, Traitorous Dragoon, Zodiark, Umbral God, Quina, Qu Gourmet with the Frog token tfin 18, Purphoros, God of the Forge; engine: `Stagger` (damage doubled until your next turn), GainControl `giveTo: 'DefendingPlayer'`, Sacrifice `halfOfMatching`, Quina's extra Frog, and devotion-gated creature types (printed mana costs). Simplification: Quina adds its Frog for tokens made by CreateToken effects, the way nearly all tokens are made) done. Group 37 (Zell Dincht, Traxos, Scourge of Kroog, Tymna the Weaver, Torgal, A Fine Hound; engine: the `OpponentsDealtCombatDamageThisTurn` count and `SubjectEntersWithCounters`. Simplifications: Zell's "return a land you control" is chosen as a target; Tymna's "pay X life" is losing X life when you choose to) done. Group 36 (Adeline, Resplendent Cathar, Absolute Virtue, Aettir and Priwen, Blitzball; engine: `powerFromCount` (a characteristic-defining power), tokens entering attacking each opponent, player protection from opponents (no damage from their sources, no targeting by them; Auras enchanting players don't exist here), `basePTFromLife`, and Blitzball's activation condition) done. Group 35 (Venser, Shaper Savant, Brainstorm, Laboratory Maniac, Elixir, Relentless X-ATM092; engine: `spellOrPermanent` targets and bouncing spells off the stack, `PutFromHandOnTop`, `winOnEmptyDraw`, `ShuffleGraveyardIntoLibrary`, `minBlockers`) done. Group 34 (Cryptic Command, Genji Glove, Godo, Bandit Warlord, Matoya, Archon Elder, Ranger-Captain of Eos; engine: the `ScryOrSurveil` trigger (one per scry or surveil), "can't cast noncreature spells this turn" (`noncreatureOnly`), and `onlyFirstCombat` on any effect) done. Group 33 (Random Encounter, Reno and Rude; engine: `ShuffleLibrary`, the `milledThisWay` filter, ReturnToBattlefield `returnToHandAtEndStep`, ExileTopCardToPlay `fromDefendersLibrary`, `AllowPlayExiledThisWay`, and exile permissions where any type of mana can be spent) done. Group 32 (Zidane, Tantalus Thief and Stolen Uniform; engine: the `OpponentGainsControlFromYou` trigger and `ControlChanged.from`. Zidane's Treasure also comes when a creature he borrowed goes back to its owner) done. Group 31 (Swallowed by Leviathan, The Final Days with the Horror token tfin 13, Unexpected Request; engine: GainControl and AttachEquipmentTo `untilEndOfTurn`, ended at cleanup. Simplification: the lent Equipment comes off at cleanup rather than at the beginning of the end step) done. Group 30 (Clash of the Eikons, Phantom Train, Syncopate; engine: Fight from a chosen creature, `RemoveCounters`, and `CounterUnlessPays`: the spell's controller chooses to pay, and may tap mana while choosing. Simplification: Phantom Train doesn't gain the Spirit type when it becomes a creature) done. Group 29 (Galuf's Final Act, Self-Destruct; engine: granted "when this creature dies" abilities trigger as it dies, `damageItself`, and a damage source that stays the previous target) done. Group 28 (Crossroads Village, Delivery Moogle; engine: the `chooseColor` choice as a permanent enters (`chooseColorAsEnters`, asked like the legend rule) and searches with `alsoGraveyard`) done. Group 27 (Town Greeter, Reach the Horizon, Ride the Shoopuf; engine: LookAtTopPutMatching `restToGraveyard`, the `ifChoseSubtype` condition, `differentNames` searches, and `BecomeCreature`. Simplification: Town Greeter's land goes from the top of the library to your hand rather than being milled first) done. Group 26 (7: Ambrosia Whiteheart, Gladiolus Amicitia, Cloud of Darkness, Coral Sword, Qutrub Forayer, Rufus Shinra with the Darkstar token tfin 20, Rinoa Heartilly with the Angelo token tfin 19; engine: the `damagedThisTurn` filter, `groupSameOwner` targets, the `ifYouControlNone` condition. Simplification: Ambrosia's return is chosen as a target when it enters rather than as it resolves) done. Group 25 (Summon: Fenrir, Summon: Leviathan; engine: `NextCreatureEntersWithCounters` and the `ifYouControlGreatestPower` condition) done; of the Summons only Brynhildr is left. Group 24 (copying spells, 2: Ether, Summon: G.F. Cerberus; engine: the `CopySpell` effect, spell copies that cease to exist off the stack (rule 707.10a), and `next` delayed triggers that fire once. Simplifications: a copy keeps the original's targets (choosing new ones isn't offered yet), and Ether's {T}, exile: add {U} uses the stack rather than resolving at once like a mana ability) done. Group 23 (Summon: Bahamut, Summon: Primal Odin; engine: the `LoseGame` effect and the `TotalManaValueOfYourOtherPermanents` count; Odin's Zantetsuken is granted until cleanup, which covers the Saga's remaining life since it's sacrificed after chapter III on your next turn) done. Group 22 (the last two Sidequests: Catch a Fish // Cooking Campsite with the Food token tfin 22, Play Blitzball // World Champion; engine: `restStayOnTop` for looking at the top card, the `EndCombat` trigger, combat damage to each player this turn) done: all five Sidequests built. Group 21 (Auras, 2: Sleep Magic, Stuck in Summoner's Sanctum; engine: statics `doesntUntap` and `cantActivateAbilities` (mana abilities too), and the `DealtDamage` trigger) done. Group 20 (Sidequests and more, 4: Card Collection // Magicked Card, Raise a Chocobo // Black Chocobo, Hunt the Mark // Yiazmat, Stroke of Midnight with the Human token ttdc 5; back faces from the `faces` data in scryfall.json; engine: creature deaths tracked by controller, counts `CardsInYourGraveyard` and `OpponentCreaturesDiedThisTurn`) done. Black Chocobo's "when this transforms" search runs as part of its transform trigger. Group 19 (3: Danitha Capashen, Prishe's Wanderings, Weapons Vendor) done. Simplifications: Weapons Vendor's targets are chosen as the trigger goes on the stack rather than when {1} is paid, and Prishe's Wanderings puts the counter even if the search finds nothing. Group 18 (Summon Saga creatures, 6: Knights of Round, Primal Garuda, Shiva, Anima, Esper Ramuh, Titan; new: the indestructible counter) done; G.F. Cerberus (copy your next spell), Brynhildr comes later. Group 17 (Chocobo Birds, 5: Gysahl Greens, Call the Mountain Chocobo, Choco-Comet, Chocobo Racetrack, Summon: Fat Chocobo; the green 2/2 Bird token tfin 17 with its landfall +1/+0, `chocobo-bird-token`) done; Chocobo Kick (a land as its kicker) and Sidequest: Raise a Chocobo (transforms with four Birds) come later. Group 16 (Tiered spells, 6: Ice Magic, Fire Magic, Thunder Magic, Restoration Magic, Tifa's Limit Break, Vincent's Limit Break; new engine pieces: `multiplyPT` on ModifyPT for doubling and tripling, the `ShuffleIntoLibrary` effect, and the `returnToBattlefieldTappedIfDies` flag) done. Group 15 (costs less for each, 5: Travel the Overworld, Diamond Weapon, Bartz and Boko, Qiqirn Merchant, Ancient Copper Dragon) done. Group 14 (the Crystals, 4: The Fire, Water, Earth and Darkness Crystals; The Wind Crystal came with group 9) done. Group 13 (attacking alone and more, 5: Seifer Almasy, Squall, Kenrith, Mangara, Akroma's Will) done. Group 12 (impulse draw and more, 6: Haste Magic, Opera Love Song, Light Up the Stage, Rydia's Return, Cactuar, Demon Wall) done. Group 11 (lands and mana, 7: Capital City, Starting Town, Command Beacon, Chromatic Lantern, Azusa, The Gold Saucer, Eden) done. Group 10 (look at the top cards and more, 6: Commune with Beavers, Ashe, Gilgamesh, Light of Judgment, Fatal Push, Edgar) done. Group 9 (whenever you gain life and more, 8: Aerith Gainsborough, Minwu, Excalibur II, Hope Estheim, The Wind Crystal, Poison the Waters, Gaius van Baelsar, World Map) done. Group 8 (flashback spells and triggers, 7: Resentful Revelation, Sorceress's Schemes, Nibelheim Aflame, From Father to Son, Sandworm, Malboro, Dark Confidant) done. Group 7 (sacrifice as a cost and token modes, 8: Deadly Dispute, Diabolic Intent, Vayne's Treachery, Louisoix's Sacrifice, Namazu Trader, Moogle's Valor, Battle Menu, Aerith Rescue Mission) done; Fang and Vanille with meld (2026-11-02) (plus Snapcaster Mage, a Store-only card, in store-cards.json). Group 6 ("as long as you control N or more" and simple triggers, 9: Gaelicat, Gigantoad, Scorpion Sentinel, Magitek Infantry, Gran Pulse Ochu, Sram, Primeval Titan, Captain Lannery Storm, Ring of the Lucii) done. Group 4 (simple spells and enters-the-battlefield cards, 24) and group 5 (18 more: enters, attacks, chapters) done. Group 3 (transforming double-faced cards) started: Vincent Valentine, Garland, The Emperor of Palamecia, Exdeath, Dion, Jill, Jecht. Group 1 (Job select Equipment, 10 cards) done; group 2 (noncreature spells) in progress: Ultros, Cornered by Black Mages, Blazing Bomb, Mysidian Elder, Prompto Argentum, Queen Brahne, Black Waltz No. 3, Shantotto, Tellah, The Prima Vista; left: Vivi Ornitier (X mana in two colors) and the double-faced Emperor of Palamecia, Garland, Kuja and Lindblum, which wait for transforming double-faced cards (27 set cards need them); tests in `packages/bots/test/fin-set-cards.test.ts`. |

## The event, as built (S3a)

- **Seats:** 2-4, each a player or a bot. A player creates the event; others
  join by code while it's in the lobby; when it starts, bots take the empty
  seats (Chocobo Bot, Moogle Bot, Cactuar Bot).
- **Draft:** as in S2a, on the server; bots lock in at once.
- **Deckbuilding:** 20 minutes. A deck in progress can be saved at any size;
  Ready needs 40-60 cards. At time-out, each unfinished deck is locked as
  saved, with basic lands added to reach 40 (or the AI's build if nothing
  was saved). Bots build with the AI deckbuilder. Play starts once everyone
  is ready or time is up.
- **Rounds:** 1 for two players, 3 for three or four (with three, everyone
  plays both others and has one bye). Round 1 is random; later rounds are
  Swiss by standings, avoiding rematches; byes go to the lowest-ranked
  player without one.
- **Matches:** best of 3 (two game wins, or three games). Game 1's first
  player is random; then the last game's loser chooses play or draw (after a
  draw, the last chooser chooses again); bots choose to play. Decks can be
  changed between games of a match (sideboarding), legal decks only.
- **Standings:** 3 points a match win (a bye is a win), 1 a draw; ties by
  opponents' match-win %, game-win %, opponents' game-win % (each at least
  33%).
- Games use the Limited format with each drafted card's own printing and
  finish. A game that runs too long between bots is a draw.

## The event server (S3b)

- Messages (`protocol.ts`): `eventCreate {size}`, `eventJoin {code}` (also
  to come back after a reload), `eventStart` (the creator), `eventPick`,
  `eventDeck`, `eventReady`, `eventPlayDraw`, `eventLeave`; game moves are
  the usual `actions`. The server sends `event` (your view: your pack,
  picks and deck, everyone's progress, matches and standings) and, for your
  games, the usual `update` with the match and game number. Every game has
  seats P1 and P2, so the browser plays it like any online game.
- Events live in the server's memory (`EventHub`); a seat stays yours while
  you're away. Event codes start with D. A finished event is dropped after
  an hour; a lobby nobody is in is dropped at once.
- Bots act one move at a time with a short pause (450 ms) in games against
  a player, so their turns can be followed; bot-vs-bot games are played in
  chunks of 250 moves between other work (6,000 moves at most, then a draw).
- When the draft ends, each player's 84 cards are added to their
  collection once (`card_grants` kind `draft`, ref `draft-<event>-<seat>`).
- Nothing is saved across a server restart yet: an event in progress is
  lost then (the drafted cards are already on the account).
- **30 seconds per pick:** each pick has a 30-second clock, held by the
  server. Clicking a card selects it (`eventSelect`); confirming locks it in.
  When the time is up, a player who hasn't confirmed gets the card they
  selected, or the AI's choice if they selected none. The clock restarts
  for every new pick.

- **The host sets the seats (2026-11-03):** `eventCreate {players, bots}`
  (2-4 seats, at least one for a player) and `eventSettings` before the
  draft. The draft starts when the host says so and every player seat is
  taken; bot seats get bots then. All bots but the host, all players, or a
  mix.

- **The host picks the set (2026-11-03):** `eventCreate` needs a `set`
  from `DRAFT_SETS` (`cards/src/draftSets.ts`; only Final Fantasy so far,
  more as sets are imported). The event keeps it (`DraftEvent.set`), opens
  that set's Play Boosters, and shows it to everyone; prizes can depend on
  it once the reward system is set.
- **The Draft page (S3c, 2026-11-03):** Play → Draft → *Draft event*: host
  (set, player and bot seats) or join by code; the waiting room; the draft
  with the 30-second clock (click to choose, Confirm or double-click to
  lock in); the deckbuilder against the server's 20-minute clock (each
  change saved on the server); then your match (play/draw choice when you
  lose a game), all matches and the standings. Your games open on the board
  automatically (`draft/eventLink.ts` keeps the event's connection while
  you play). *Practice draft* is the old offline draft. Not yet:
  sideboarding between games in the browser (the server allows it).

- **The tournament (user, 2026-11-03):** always four seats (players, bots
  or a mix). Round 1: two random semifinals, best of 3. Round 2: the
  winners play the final (1st and 2nd), the losers play for 3rd and 4th.
  A finished match waits for the other one; the page shows the bracket,
  who moved up (▲ Final / ▼ 3rd place match) and the other match's score.
  Every match has a winner: drawn games mean more games (five at most),
  then a coin flip. Swiss pairing code (`swiss.ts`) stays for later
  formats; standings use the bracket's places once it's over.
- **Entry and prizes:** see docs/economy.md (600 entry; 1,000/800/600/400).
- **Loading screens and the precheck (2026-11-03):** before an online game
  opens (Commander tables and draft games), `game/precheck.ts` checks every
  visible card is known to this browser, that the board can read the game,
  and loads the card images; `components/LoadingScreen.tsx` shows the steps
  and a progress bar (with who moved up, for the final and the match for
  third). Draft events also show loading screens while joining, while the
  print sheets load, and while the first pack's images load.
- **Discord profile pictures:** the server reads each player's picture from
  their sign-in (only `https://cdn.discordapp.com` addresses,
  `discordAvatar`) and shows it in waiting rooms, the bracket, the results
  and on the board's player icons; initials otherwise.

## The AI drafters and deckbuilder

- `cards/src/rating.ts` (`cardRating`) rates a card for Limited on a rough
  0-10 scale from its engine definition: a creature's stats for its cost and
  its keywords; removal (destroy, exile, damage, fight, -X/-X) highest, then
  card draw, tokens and other abilities; expensive cards lose a little; rares
  and mythics gain a little. Cards that aren't built yet (or can't be cast)
  are worth 0, so bots never draft or play them.
- Drafting (`aiScore` in `draft.ts`): the first four picks take the best
  card; after that, bots lean more and more into their two strongest colors
  (weighted by the ratings of what they've picked).
- Deckbuilding (`aiDeck` in `limited.ts`): tries every color pair (and
  single colors), keeps the one whose best 23 spells rate highest, builds a
  curve (at most five cards of mana value 5+, about 14 creatures), plays up
  to three useful nonbasic lands, and fills to 40 with basics in proportion
  to the mana symbols.

## Card status

Of the cards that appear in Play Boosters:

| Group | Built |
|---|---|
| Main set (300 distinct, including basics) | 42 from the Starter Kits and precons, plus 12 built on import |
| Through the Ages (64) | 1 from the precons; K'rrik, Son of Yawgmoth can't be cast yet (Phyrexian mana) |

Run `node packages/cards/scripts/import-sets.ts` to re-import: cards built
by hand in fin-set.json are kept, the rest are regenerated.
