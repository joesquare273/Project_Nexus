# Card audit (2026-11-04; rerun 2026-11-12)

## 2026-11-12: every set, statically and by playing each card

All 1,108 built cards (the Final Fantasy set and precons, the Starter Kits,
Secret Lair and Store cards, both Edge of Eternities precons and the Edge of
Eternities main set) were checked two ways:

- **Against Oracle text** (this script; the flags below). The flags new since
  the first audit were read by hand. One real problem: **Tear Asunder had no
  kicker**, so it could never exile a nonland permanent; fixed. The rest are
  false positives of the kinds listed further down (targets chosen as an
  ability resolves, targets inside modes or granted abilities, several
  abilities on one card).
- **By playing them** (`packages/bots/test/card-sweep.test.ts`, part of
  `npm run check`): each card is cast from hand, and each activated ability
  used from the zone it works in, on a crowded board (creatures, artifacts,
  Equipment, Spacecraft, Treasures, varied libraries, graveyards and hands),
  answering every target and choice. It fails on engine errors, stalls,
  rejected legal actions, choices that can't be answered, and broken
  invariants (a player must see the cards they choose among, the Satyr
  Wayfinder bug). Nothing failed. What it notes but allows: abilities that
  need a situation the board doesn't set up (ninjutsu, combat, boast, an
  ability on the stack to copy, a Skeleton to exile), "up to" targets with
  nothing to pick, and looking at cards none of which match.

The sweep plays one path per card (the first legal way to cast it, choosing
as much as allowed), so it finds what breaks, not every rules detail; the
per-card tests cover those.


Every built card (704 of them: the Final Fantasy set, Starter Kits, Commander
precons, Secret Lair and Store cards) was checked against its Oracle text by
`packages/cards/scripts/card-audit.ts`. That script also writes
`docs/card-audit-generated.md`, which lists every flag and **groups every card
by the engine features it uses** (each effect kind, trigger event and static
ability), so a change to one piece of the engine shows which cards to retest.

```
node packages/cards/scripts/card-audit.ts
```

## The checks

1. **Too many targets**: the card asks for more targets than its text says
   "target" (Unexpected Request and Stolen Uniform were this).
2. **Missing targets**: the text says "target" more often than the card asks.
3. **Optional target first**: an "up to one" target is asked before a required
   one (the prompt's "No target" button skips it).
4. **"You may" with nothing optional**: the text says "you may" but no part of
   the card is optional.

The counts are heuristics, so every flag was read by hand. Verdicts:

### Fixed

| Card | Problem | Fix |
| --- | --- | --- |
| Unexpected Request | Equipment was the first target | Only the creature is targeted; the Equipment is chosen as it resolves |
| Stolen Uniform | Equipment asked before the creature | Creature first, as printed |
| Ambrosia Whiteheart, Zell Dincht, Zenos yae Galvus | "Return a" / "choose a" were targets | Chosen as the ability resolves |
| Star of Extinction | "Destroy target land" was missing | Added |
| Sword of Truth and Justice | "A creature you control" was a target | Chosen as it resolves |
| Sidequest: Play Blitzball | "Attach it to a creature you control" was a target | Chosen as it resolves |

### False positives (correct as built)

- **Several abilities on one card, each with its own target** (counts add up):
  Sun Titan, Together Forever, Generous Patron (support 2 is "up to two target
  creatures" in reminder text), Hraesvelgr, Carpet of Flowers, Bruse Tarl, Gogo.
- **Targets inside modes, random modes, reflexive or granted triggers** (the
  count doesn't look inside them): Qutrub Forayer, Coliseum Behemoth, Summon:
  Magus Sisters, Umaro, The Falcon, Eden, Galuf's Final Act, Self-Destruct,
  Chocobo Kick, Tidus, Resourceful Defense, Nesting Grounds, Sephiroth, Joshua,
  Weapons Vendor, Prishe's Wanderings (reflexive since 2026-11-04), Inspirit,
  Flagship Vessel.
- **"Target" in a rule about targeting, not a target**: Cloud, Planet's
  Champion (equip discount), Fate of the Sun-Cryst (cheaper if it targets a
  tapped creature), Gogo, Master of Mimicry ("choose new targets for the
  copies").
- **The meld result's text isn't on the card**: Fang, Fearless l'Cie (Ragnarok
  matches its own text).
- **Optional target first as printed**: Barret, Avalanche Leader; Raubahn.
- **"You may" handled by the choice itself** (looking at cards and picking
  none, choosing modes, revealing a card for a land, an alternative cost):
  Ashe, Commune with Beavers, Town Greeter, Choco, Atraxa, Winota, Garnet,
  Rhystic Study, K'rrik, SOLDIER Military Program, Snuff Out, Unexpected
  Request, and the Snarl and check lands.

### Simplifications fixed (2026-11-04)

Every recorded simplification was reviewed and these now play as printed, each
with a test (`packages/bots/test/simplification-fixes.test.ts`, plus the card's
own group in `fin-set-cards.test.ts`):

- Fury divides its damage among up to four targets chosen as the trigger goes
  on the stack (each gets at least 1).
- Armory Automaton attaches any number of Equipment, anyone's.
- Explorer's Scope's land is optional (it stays on top if you don't).
- Ether's {T}, exile: add {U} is a mana ability; Ether, Summon: G.F. Cerberus
  and Gogo offer new targets for each copy (`chooseCopyTargets`).
- Gogo, Master of Mimicry is one {X}{X} ability (any X of at least 1) that
  can't be copied.
- Gix discards X cards as a cost; K'rrik and {B/P} let you choose how many
  {B} to pay with life (`lifeForB`).
- Muldrotha: you choose which unused permanent type a multi-type card uses.
- Memories Returning and Shinryu choose their opponent; Winota's Human
  attacks the player you choose.
- "Cast it now" permissions (Quistis, Buster Sword, Vaan, Jodah, Gix,
  Mizzix's Mastery) last only until you do something else.
- Ultima keeps the abilities that trigger as it resolves (they go on the
  stack in the cleanup step).
- Blight removes a land's types and abilities; Quina's Frog comes with token
  copies too; Phantom Train is a Spirit; Ragavan's land can't be played.
- Ifrit's lore check is on chapters II and III; Emet-Selch's fourteen cards
  are an intervening if; Tymna pays X life as a cost; Weapons Vendor and
  Prishe's Wanderings use reflexive triggers; Town Greeter mills first;
  Rhystic Study's draw is optional.
- Partner: two commanders in the command zone, the deck checked against both
  colors (engine, server, deck builder; migration `20261104120000_deck_partner.sql`).

### Kept, with the reason

- Phoenix, Warden of Fire chapter III chooses the cards as it resolves rather
  than targeting them: "any number of target cards with total mana value 6 or
  less" would be too many target combinations to list.
- Mizzix's Mastery casts the exiled card itself rather than a copy (it ends in
  exile either way).
- Omega has three "one per opponent" slots (a pod has at most three opponents).
- Kinnan adds the type its permanent made: exact here, since only lands (which
  Kinnan ignores) make two types at once.
- Vial Smasher hits only the player: there are no planeswalkers in the pool.
- Shinryu wins as its rival is eliminated rather than through a trigger.
