# Development updates

A running log of progress, open issues and their workarounds. Newest first.
Longer-lived design choices go in [decisions.md](decisions.md).

## 2026-10-23

### Casting support: Banon and Inspiring Statuary

- Banon's Pray permission casts one eligible creature from your graveyard on
  each of your turns: it must have arrived there this turn from a zone other
  than the battlefield. Arrival history is recorded on zone changes. Normal
  casting costs and timing still apply. The permission is tracked per permanent,
  so Banon and Edgar can each grant a cast; the board labels which one is used.
- Banon's attack trigger offers its {1} plus discard cost, refuses acceptance
  without a card to discard, and asks which card to discard before drawing.
- Inspiring Statuary grants improvise to nonartifact spells. Untapped artifacts,
  including Statuary itself and summoning-sick artifact creatures, can each pay
  for one generic mana. Treasure can be tapped without being sacrificed.
- Improvise combines with the existing cost helpers without tapping a permanent
  twice. The board and bots reserve the chosen artifacts when planning mana,
  show improvise choices, and account for artifacts when offering X values.
- Thirty new scenarios cover 2, 3 and 4 players, independent graveyard permissions,
  mandatory cost payment, timing, generic-only improvise payment, and auto-tap.

286 of 320 distinct precon cards are built; 34 remain. Validation: type-check,
all 630 tests, and the browser production build passed. Thirty additional
Commander fuzz games (seeds 109-138) completed with no invariant failures or
action-limit timeouts.

### Requested frontend and rules work; commit checkpoint

The user wants an arcane fantasy presentation inspired by Hearthstone, MTG Arena,
and Dueling Nexus, with its own identity: dark stone, engraved gold, crystal light,
readable card art and controls, and event-driven magical effects. See
`frontend-roadmap.md` for the initial source/reference review and rules backlog.
The existing rules simplifications must be audited against Wizards' rules;
visual polish must preserve legal choices, hidden information, and priority.

After every commit, stop and report it. The user will push and then say
**proceed** before the next group or frontend implementation stage begins.

### Counter distribution and ability targets: three more precon cards

- Forgotten Ancient gets an optional +1/+1 counter for any player's spell.
  At upkeep, its controller may distribute any number of its counters among
  other creatures, including opponents' creatures. Choices are collected before
  counters move, with one placement per recipient so Hardened Scales applies
  once to that recipient's allocation. The board shows remaining counters;
  the bot prefers its own creatures.
- Estinien Varlineau gets a counter and temporary flying for your noncreature
  spells. Combat-damage history records distinct opponents damaged by Estinien
  or any Dragon. Its second-main-phase trigger draws and loses that much life.
  History resets each turn and distinguishes successive objects when a physical
  card leaves and returns.
- Professor Hojo discounts your first activated ability targeting your creature
  on your turn. Activations before Hojo enters still count toward that first
  ability. Becoming the target of an activated ability triggers its draw once
  each turn, including when an opponent activates the ability.
- Thirty-three new scenarios cover 2, 3 and 4 players, voluntary choices,
  batch counter placement, immutable input state, turn history, and Hojo's timing.

284 of 320 distinct precon cards are built; 36 remain. Validation: type-check,
all 600 tests, and the browser production build passed. Thirty additional
Commander fuzz games (seeds 79-108) completed with no invariant failures or
action-limit timeouts.

### Commander regression checks after the graveyard/library group

- Expanded Terra, Tidus, Y'shtola, Tifa and G'raha Tia's ability scenarios
  across 2, 3 and 4 players.
- Added 24 integration scenarios using the exact precon decklists: every
  printed and alternate commander is cast from the command zone, destroyed,
  returned to the command zone, checked for the additional {2} tax, and recast.
  Each checkpoint checks game-state invariants; all eight choices are built.
- The Detour scenario explicitly supplies Altered Ego's printed uncounterability
  as a fixture; Altered Ego's copy ability remains unbuilt.
- Validation: type-check and all 567 tests passed. Commander fuzz seeds 1-78
  completed with zero invariant failures and zero action-limit timeouts. The
  browser production build also passed after the engine and UI changes.

These checks cover the implemented commander paths, not every possible rules
interaction. The 39 remaining precon cards and the known simplifications in
`decisions.md` still need work before all four decks can be called complete.

### Graveyard and library choices: four more precon cards

- Rejoin the Fight mills three, then each opponent chooses a different creature
  card from the caster's graveyard, starting with the next opponent in turn order.
  The chosen cards return after every opponent has chosen; empty choices are skipped.
- Promise of Loyalty makes each player keep one creature with a vow counter and
  sacrifice the rest. That creature cannot attack the caster while the counter
  remains. Removing the last vow ends the restriction; moving or adding another
  vow does not transfer or restart it. The AI and board respect the restriction.
- Endless Detour targets a spell, nonland permanent, or graveyard card. Its owner
  chooses top or bottom of their library. Moving a spell this way does not counter it.
- Combustible Gearhulk's targeted opponent chooses whether the controller draws
  three or mills three and deals the milled cards' total mana value in damage.
- Browser controls and bot choices cover the new decisions. Eighteen scenarios
  cover 2, 3 and 4 players, including distinct selections, empty graveyards, vow
  removal, AI attacks, and moving an uncounterable spell off the stack.

281 of 320 distinct precon cards are built; 39 remain. Validation: type-check,
523 tests, browser production build, and 30 Commander fuzz games passed.

### Fix: phased-out Equipment and a dying creature

The Commander fuzz (seed 99, 4 players) found Equipment left attached to a
creature in the graveyard: Clever Concealment phased out only the
Equipment, and phased-out permanents aren't in the battlefield list, so
when the creature died nothing unattached them. Leaving the battlefield now
also unattaches phased-out attachments (they phase in unattached). Test in
`precon-equipment-2.test.ts`.

### Board: clicking your own permanents fixed; attachments move with their creature

- **Fixed:** clicking your own nonland permanents did nothing (choosing
  them as targets, e.g. for Rosa's trigger, picking attackers, using their
  abilities). Drag-and-drop captured the pointer as soon as you pressed, so
  the click went to the drag wrapper instead of the card. A drag now follows
  the pointer with window listeners, so clicks reach the card and fast drags
  still work. Checked with real mouse clicks in the browser.
- Equipment (and later Auras) attached to a creature are drawn with it as
  one unit, tucked behind and peeking out to the right, and move with it
  when you drag it. The grouping follows what's attached right now: re-equip
  it or have an effect move it and it joins the new creature; unattach it
  and it's its own card again.

### Equipment and one-offs (C2, step 15)

`npm run check` passed after pulling (492 tests). New engine pieces:

- **Base power and toughness** ("has base power and toughness 7/7", rule
  613.4b), applied before other changes; "can't be blocked by creatures with
  power 2 or less"; a second, cheaper equip ability for legendary creatures
  (`equipLegendary`).
- Abilities an Equipment grants: triggers on the Equipment can now target
  the equipped creature (`EquippedCreature`), and an EachMatching static
  ability can work only while it's attached (`conditions: ['attached']`)
  and leave out the equipped creature (`equippedBySource: false`, "other
  commanders you control").
- "Opponents can't cast spells during your turn" (Conqueror's Flail),
  colors among your permanents, artifacts your opponents control.
- "Whenever you draw your third card each turn" (`nthDrawThisTurn`). The
  engine now counts draws per turn, and opening hands no longer count toward
  the first turn.
- "Whenever an opponent activates an ability of an artifact they control"
  (`AbilityActivated`, mana abilities included) and "that player".
- "Exile this" as a cost, "Sacrifice a creature. If you do, ..."
  (`ifSacrificed`), an exiled card's mana value, and "until you exile another
  card with this" (Furious Rise).

10 precon cards built (`packages/bots/test/precon-equipment-2.test.ts`):
Wrecking Ball Arm, Conformer Shuriken, Conqueror's Flail, Dancer's Chakrams,
Astrologian's Planisphere, Phoenix Down, Yuna's Decision, Cait Sith,
Furious Rise and Avalanche of Sector 7. 277 of 320 distinct precon cards are
now built; 43 to go.

## 2026-10-22

### Extra costs and random choices (C2, step 14)

- **Kicker** and **multikicker**: `kicks` on the `CastSpell` action. Kicker
  is paid once ("Cast Rite of Replication, kicked"); multikicker is offered
  as many times as your mana could pay (at most 6). Spells check
  `if: 'kicked'` / `'notKicked'`, and a permanent can enter with a counter per
  kick (Everflowing Chalice's charge counters; its mana ability adds one {C}
  per counter).
- **Escalate** (Collective Effort): `tapCreatures` on the action, one
  untapped creature you control per mode beyond the first.
- **Tiered** (Cloud's Limit Break): each mode has its own extra mana cost
  (`modeCosts`).
- **"Choose one at random"** triggers (`randomModes`): the mode is picked
  with the game's seeded random numbers as the ability triggers, and only
  that mode's targets are chosen.
- **Fight**, "discard your hand", "each creature target player controls",
  effects that last "for as long as you control" the source, and a target
  filter for "mana value equal to that spell's mana value".

8 precon cards built (`packages/bots/test/precon-kicker.test.ts`): Rite of
Replication, Everflowing Chalice, Collective Effort, Cloud's Limit Break,
Umaro, Summon: Magus Sisters, Thancred Waters and Krile Baldesion. 267 of 320
distinct precon cards are now built; 53 to go.

### Keywords and casting from the graveyard (C2, step 13)

`npm run check` passed on this computer before starting (463 tests). New
engine pieces, each in MTG terms:

- **Ward {N}** (`ward` on a card, or a static ability granting it): an
  opponent's spell or activated ability that targets the permanent costs {N}
  more; an opponent's triggered ability can't target it.
- **Convoke** and **delve**: `convoke` / `delve` lists on the `CastSpell`
  action. Each convoking creature pays one mana of its color, or {1}; each
  delved card pays {1}. The legal list offers 1, 2, 3... creatures (not ones
  that make mana) or cards, and the board shows each as its own way to cast
  ("Cast, tapping 2 creatures (convoke)").
- **Phasing**: phased-out permanents leave the battlefield list (they're in
  `phasedOut` on the player, still `zone: 'battlefield'`) with their state,
  Equipment phases with its creature, and they phase in at their
  controller's next untap step. The board shows a "Phased out" pile.
- **Connive**, **look at the top N, put K into your hand** (a `chooseCards`
  with purpose `hand`; the chooser sees the cards, nobody else does).
- **Casting from the graveyard**: blitz (an alternative cost with a discard,
  haste, "when this dies, draw a card", sacrificed at the end step; Sabin can
  only be cast from the graveyard this way), Edgar's once-a-turn artifact
  casting (enters tapped), and a per-card permission (`castPermission`) for
  "you may cast target card from your graveyard" (free with Torrential
  Gearhulk; exiled afterwards). Spells cast from a graveyard can be cheaper
  (Emet-Selch).
- **Unearth** (an ability that works from the graveyard), **rebound** (exiled
  as it resolves when cast from hand; free to cast during your next turn),
  "pay N life" in activated-ability costs, "if this spell was cast from your
  hand", "whenever one or more opponents lose life", and counts of artifacts
  and the greatest mana value among them.

11 precon cards built (`packages/bots/test/precon-keywords.test.ts`):
Bronze Guardian, Hraesvelgr of the First Brood, Clever Concealment, Lethal
Scheme, Dig Through Time, Priest of Fell Rites, Sabin, Transpose, Edgar,
Emet-Selch of the Third Seat and Torrential Gearhulk. 259 of 320 distinct
precon cards are now built; 61 to go (mostly copies, Vehicles, Auras,
Adventures, ninjutsu, the monarch, escalate/kicker and one-offs). The
simplifications are listed in [decisions.md](decisions.md).

### Where the previous session stopped (2026-10-22)

Committed before the last full check finished, at the user's request. Last
results: the foretell batch passed both 300-game fuzz runs; `npm run check`
had one timeout in `packages/bots/test/fuzz.test.ts` (random bots, 64s
against a 60s limit) because random bots now have more choices. The limit
is now 180s; rerun `npm run check` first on the next computer. The card
flights and the sectioned exile list were checked in the browser only
briefly (the pane wasn't always drawing). Next card steps: the 72 unbuilt
precon cards are mostly copies, Vehicles, Auras, ward, convoke, delve,
ninjutsu, blitz, unearth, casting from the graveyard, and one-offs.

### Cards fly between zones

When a card changes zones (cast, resolved, died, exiled, drawn, bounced,
foretold) a copy of it flies from where it was to where it went, so players
can follow what happened and see effects resolve; the real card appears as
the copy lands. Hidden cards (an opponent's draws, foretold cards) fly face
down. The board marks cards with `data-card` and zones with `data-pile`;
`packages/client/src/components/Flights.tsx` does the rest. Respects
"reduce motion", and a timer reveals the card even if the page isn't being
drawn (a background tab).

### Foretell, and an exile list that explains itself (C2, step 12)

Foretell (rule 702.143): during your turn, pay {2} to exile a card from your
hand face down (the `Foretell` action; on the board it's a choice on the
card, "Foretell ({2}; cast later for ...)"). From your next turn on you can
cast it from exile for its foretell cost. A foretold card is hidden from
opponents (the view leaves it out; the pile shows a card back) and the log
only says that a card was foretold. Spells can check "if this spell was cast
from exile". Also new: "prevent all damage that would be dealt to you this
turn", "for each opponent, choose an artifact or land they control; destroy
it", and the greatest power among your creatures. The AI doesn't foretell yet
(it casts these cards normally).

Clicking an exile pile now sorts the cards by what they're doing there, in
MTG terms: "Cast from exile" (cards you may cast right now, with how long:
"until end of turn", "until the end of turn N", "while you control X"; click
one to cast it), "Foretold", face-down cards, cards exiled until a permanent
leaves (naming it), and "Exiled". Once a card's permission ends it is just
exiled. Headings only appear when more than one kind is there. "You may play
it until ..." now lasts through the end of that turn, not only that turn.

3 precon cards built (`packages/bots/test/precon-foretell.test.ts`): Ultimate
Magic: Holy, Ultimate Magic: Meteor and Lifestream's Blessing. 248 of 320
distinct precon cards are now built; 72 to go.

### Counterspells and attack taxes (C2, step 11)

Spells on the stack can now be targeted (`TargetSpell`) and countered
(`Counter`): a countered spell goes to its owner's graveyard, or exile if
it was cast with flashback, and "can't be countered" spells stay. On the
board, click the spell in the stack panel to target it; the AI counters an
opponent's spell when it scores well.

Attack taxes: "creatures can't attack you unless their controller pays {2}
for each" (Propaganda, and Summon: Yojimbo until your next turn). The tax is
paid as attackers are declared, so mana abilities work while declaring. The
board taps for it automatically and says what attacking each player costs;
the AI taps for it or leaves out attacks it can't pay for. Also new: "any
of" filters ("artifact, enchantment, or tapped creature") and tokens created
for the target player ("its controller creates two Treasure tokens").

3 precon cards built (`packages/bots/test/precon-interaction.test.ts`): An
Offer You Can't Refuse, Propaganda and Summon: Yojimbo. 245 of 320 distinct
precon cards are now built; 75 to go.

### Sagas (C2, step 10)

Sagas work (rule 714): a lore counter as one enters and as each of your
precombat main phases begins, a chapter ability for each chapter reached
(`when: 'Chapter'`, `chapters: [2, 3]`), and the Saga is sacrificed once its
final chapter has resolved (`saga`: the final chapter number). Proliferate
adds lore counters too. Lore counters show as a badge on the board. Also new:
"can't block this turn", and returning each opponent's creature with the
greatest mana value.

3 precon cards built (`packages/bots/test/precon-sagas.test.ts`): Summon:
Kujata, Summon: Ixion and Summon: Valefor (242 of 320 distinct precon cards
built; 78 to go). The other four Summons need more:
Yojimbo (an attack tax), Magus Sisters (random modes), Good King Mog XII (a
delayed copy trigger) and Esper Valigarmanda (casting exiled cards).

### Alternate commanders and one-offs (C2, step 9)

Both alternate commanders are built. Tifa, Martial Artist: melee, and when
creatures with power 7 or greater connect, untap your creatures and take an
additional combat phase (only after the first combat of the turn). G'raha
Tia: pay life equal to a noncreature spell's mana value for a Hero with that
many counters, once each turn once paid (declining keeps it available).

New engine pieces: extra combat phases, melee, triggered costs paid in life
equal to a spell's mana value, evolve, explore, "whenever a +1/+1 counter is
put on this", mana per counter, static abilities that work from the
graveyard (Anger), "creatures your opponents control enter tapped", "each
other opponent", every card in every graveyard, and "it deals that much
damage".

12 precon cards built (`precon-commanders.test.ts`,
`precon-oneoffs.test.ts`): Tifa, G'raha Tia, Stitcher's Supplier, Authority
of the Consuls, Rise of the Dark Realms, Shelinda, Auron, Gyre Sage, Fathom
Mage, Path of Discovery, Anger and Vincent. 239 of 320 distinct precon cards
are now built (Counter Blitz 83/100, Limit Break 79, Revival Trance 79,
Scions & Spellcraft 75); 81 to go.

### Choose your precon's commander

On the Commander setup screen, "Your commander" lists the cards in your
precon that can lead it: legendary creatures and legendary Vehicles whose
colors cover every card in the deck (rules 903.3, 903.5c). That's the
printed commander and the precon's other legend in all its colors: Tifa,
Celes, Yuna and G'raha Tia. The printed commander goes into the 99. In code: `preconCommanders(name)` and
`preconDeckWithCommander(name, commander)` in `@nexus/cards`
(`packages/bots/test/precon-commander-choice.test.ts`).

Also fixed: on the stack, a spell's mana value counts its X, once per X
symbol (rule 202.3e), so Exsanguinate with X = 1 is mana value 3 and
Y'shtola sees it. And the in-game Settings gear no longer shares its CSS
class with the setup screen's settings.

### X costs (C2, step 8)

Spells with {X} in their cost now work: `CastSpell` takes `x`, the legal
actions offer X from 1 up to what your untapped mana could pay (at most 12),
and the board lists each as "Cast with X = 3". A permanent remembers the X
it was cast with, so "enters with X counters" and "create X tokens" work.
Also new: "whenever you attack with four or more creatures", "you gain life
equal to the life lost this way", and revealing cards until a creature.

5 precon cards built (`packages/bots/test/precon-x.test.ts`): Walking
Ballista, Exsanguinate, Pull from Tomorrow, Champions from Beyond and Yuna's
Whistle. 227 of 320 distinct precon cards are now built (Counter Blitz 78/100,
Limit Break 77, Revival Trance 76, Scions & Spellcraft 73); 93 to go.

### Card draw and graveyard recursion (C2, step 7)

New engine pieces: "whenever one or more cards leave your graveyard",
"whenever you cast your second spell each turn", threshold and metalcraft
checks inside a spell, losing life equal to a card's mana value, "the second
spell you cast each turn costs {2} less", "Equipment spells cost {1} less",
equip {0} with metalcraft, partner-with searches by name, and the
"modified" and "historic" filters.

19 precon cards built (`packages/bots/test/precon-draw.test.ts`): Harmonize,
Night's Whisper, Secret Rendezvous, Cut a Deal, Into the Story, Baleful
Strix, Morbid Opportunist, Archmage Emeritus, Alphinaud and Alisaie
Leveilleur, Stitch Together, Reanimate, Cyan, Elena, Cid, Red XIII, Bastion
Protector, Dispatch and Puresteel Paladin. 222 of 320 distinct precon cards
are now built (Limit Break 77/100, Revival Trance 76, Counter Blitz 75,
Scions & Spellcraft 71); 98 to go.

### Mana: lands, rocks and ramp (C2, step 6)

Mana abilities can now cost mana: "{1}, {T}: Add {R}{G}" and the filter
lands' "{R/G}, {T}: Add {R}{R}, {R}{G}, or {G}{G}" (a hybrid cost is two ways
to pay). `ActivateManaAbility` takes an optional `output` and `payWith`.
Auto-pay (used by the AI and the board) works them in when plain taps aren't
enough: it taps something to pay the land's cost, activates it, then pays
the rest. On the board, clicking such a land offers "Pay {1}: add {R}{G}".
Also new: mana abilities that need five lands, pay life for colored mana
(Spire of Industry) or mill a card (Millikin), and "activate only if you
control a creature with power 4 or greater".

27 precon cards built (`packages/bots/test/precon-mana.test.ts`): Rampant
Growth, Farseek, Nature's Lore, Three Visits, Wayfarer's Bauble, Solemn
Simulacrum, Temple of the False God, Spire of Industry, Millikin, Thought
Vessel, Bonders' Enclave, Slayers' Stronghold, Demolition Field, the eight
"{1}, {T}: add two colors" lands and the six filter lands. 203 of 320
distinct precon cards are now built (Counter Blitz 75/100, Revival Trance
71, Limit Break 69, Scions & Spellcraft 65).

### End-step and upkeep triggers (C2, step 5)

The engine now tracks, each turn, life gained, cards leaving your graveyard,
noncreature spells cast and which permanents entered. Triggers can ask "if
you control a creature with power 7 or greater" (or twenty artifacts). Also
new: gaining control of permanents for good, "you win the game", exiling a
card from a graveyard, proliferating several times, "noncreature spells you
cast cost {1} less", "enters with an additional +1/+1 counter", and "each
opponent who lost life this turn". The board now shows a permanent on the
side of the player who controls it, not its owner. A player who loses has
their side of the table turned black and white, in shadow.

10 precon cards built (`packages/bots/test/precon-end-step.test.ts`):
Bugenhagen, Aerith, Hellkite Tyrant, Gau, Rogue's Passage, Summoner's
Sending, Papalymo Totolymo, Lyse Hext, Forge of Heroes and Tromell. 176 of
320 distinct precon cards are now built (Counter Blitz 68/100, Revival
Trance 61, Limit Break 59, Scions & Spellcraft 57).

### New tokens (C2, step 4)

Seven new tokens, each matched to its exact Scryfall printing in
`tokens.json`: Clue, Spirit, Squid, Bird, Wizard, Soldier and Human Soldier
(`npm run scryfall` cached them). New engine pieces: islandwalk,
"whenever you draw a card" / "whenever an opponent draws a card", "whenever
you sacrifice a Clue", "if you put a counter on a creature this turn",
+X/+0 from a count, tapped tokens, and "create a number of tokens equal to
..." that can be zero.

10 precon cards built (`packages/bots/test/precon-tokens.test.ts`): Pitiless
Plunderer, Lingering Souls, Bastion of Remembrance, Hermes, Circle of Power,
Tireless Tracker, Lord Jyscal Guado, Chasm Skulker, Heidegger and Tataru
Taru. 166 of 320 distinct precon cards are now built (Counter Blitz 65/100,
Revival Trance 59, Limit Break 56, Scions & Spellcraft 55).

### Board: arrange your permanents, pop-out card viewer

- Drag your nonland permanents anywhere on your battlefield; they stay where
  you drop them for the rest of the game (layout only, the engine never sees
  it). A short press is still a click.
- The card viewer pops out on the right edge only while you hover a card
  (or one triggers), so the sidebar is narrower and the board wider.
- "Stop at every step", "Tap mana automatically", the seed and the way back
  to the menu moved into Settings (the gear at the right of the phase track);
  the right sidebar is now just the game log.
- The hand no longer hangs off the bottom of the screen, and the board uses
  the visible viewport height, so the taskbar doesn't cover your cards.

### Other counter kinds (C2, step 3)

Permanents can now carry **shield, stun, flying, page and soul counters**
as well as +1/+1 counters, shown as small badges on the board:

- A shield counter is removed instead of the permanent being dealt damage
  or destroyed. A stun counter is removed instead of the permanent
  untapping. A flying counter gives flying.
- "Remove a counter" can be part of a cost (Tome of Legends, O'aka,
  Scholar of New Horizons), counters of any kind can be moved (Rikku,
  Nesting Grounds, Resourceful Defense), and proliferate adds every kind.
- Abilities can look back at a permanent as it left the battlefield: its
  counters, keywords and Equipment (Luminous Broodmoth, Zack Fair,
  Resourceful Defense, Yuna, undying). New "leaves the battlefield" trigger.
- Also: monstrosity, adapt, "your commander enters or attacks", "whenever
  an opponent attacks you", "damage becomes counters" (Gatta and Luzzu),
  mana of a type your lands could make, and Yuna's "next creature spell
  enters with two more counters".

16 precon cards built (`packages/bots/test/precon-counter-kinds.test.ts`):
Tome of Legends, Protection Magic, Lulu, Luminous Broodmoth, O'aka,
Scholar of New Horizons, Rikku, Nesting Grounds, Resourceful Defense, Zack
Fair, Maester Seymour, Incubation Druid, Reaper's Scythe, Yuna, Flayer of
the Hatebound, Gatta and Luzzu.

### Commanders: Terra, Tidus and Y'shtola

Three of the four precon commanders now play their full text
(`packages/bots/test/precon-commanders.test.ts`): Terra mills two and
flies at each combat, and can return a creature after combat damage; Tidus
moves a counter at combat and proliferates when creatures with counters
connect; Y'shtola drains for 2 on big noncreature spells and draws at end
steps after a player lost 4 or more life. 156 of 320 distinct precon cards
are now built (Counter Blitz 62/100, Revival Trance 58, Limit Break 55,
Scions & Spellcraft 50).

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
3. **Other counter kinds.** Done 2026-10-22 (16 cards; see above). Still
   waiting: lore counters (Sagas) and vow counters (Promise of Loyalty).
4. **New tokens.** Done 2026-10-22 (10 cards; see above). The other token
   makers wait on Sagas, X costs, counterspells, kicker, rebound, Vehicles
   or copies.
5. **End-step triggers.** Done 2026-10-22 (10 cards; see above). Still
   waiting on their own mechanics: Estinien (combat damage by Dragons),
   Kefka and Furious Rise (casting exiled cards), Sabin (blitz), Priest of
   Fell Rites (unearth), Hraesvelgr (ward), Gogo (copies).
6. **Mana: lands, rocks and ramp.** Done 2026-10-22 (27 cards; see above).
   Still waiting: Path of Ancestry (its scry rider), Relic of Legends
   (tapping a creature for mana), Everflowing Chalice (multikicker).
7. **Card draw and graveyard recursion.** Done 2026-10-22 (19 cards; see
   above).
8. **X costs.** Done 2026-10-22 (5 cards; see above). Blitzball Stadium
   (support X) and Altered Ego (copies) still wait.
9. Then Sagas, counterspells, evolve, Vehicles, ward, convoke and the
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
