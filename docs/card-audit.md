# Card audit (2026-11-04)

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
  Chocobo Kick, Tidus, Resourceful Defense, Nesting Grounds, Sephiroth, Joshua.
- **"Target" in a rule about targeting, not a target**: Cloud, Planet's
  Champion (equip discount), Fate of the Sun-Cryst (cheaper if it targets a
  tapped creature).
- **The meld result's text isn't on the card**: Fang, Fearless l'Cie (Ragnarok
  matches its own text).
- **Optional target first as printed**: Barret, Avalanche Leader; Raubahn.
- **"You may" handled by the choice itself** (looking at cards and picking
  none, choosing modes, revealing a card for a land, an alternative cost):
  Ashe, Commune with Beavers, Town Greeter, Choco, Atraxa, Winota, Garnet,
  Rhystic Study, K'rrik, SOLDIER Military Program, Snuff Out, Unexpected
  Request, and the Snarl and check lands.

### Known simplifications (recorded where each card was built)

- Fury divides its damage as it resolves instead of choosing targets on cast.
- Armory Automaton attaches all your Equipment instead of "any number of
  target Equipment".
- Explorer's Scope always puts the land onto the battlefield (the card says
  "you may").
- Espers to Magicite, Ether and Summon: G.F. Cerberus: the copy keeps the
  original's targets, and the exiled creature is chosen rather than targeted.
