# Final Fantasy Starter Kits: roadmap

The first real card target is the two Final Fantasy Starter Kits (60 cards each,
no double-faced cards). Decklists live in
[`packages/cards/data/fin-starter-kits.json`](../packages/cards/data/fin-starter-kits.json),
with each card's status and the engine features it still needs. The cards test
checks that this file and the card definitions agree.

**Status: both kits are complete (2026-10-21).** Every card in both decks is
fully built and tested against its Oracle text
(`packages/bots/test/kit-cards.test.ts`). Card definitions describe behavior
as data; Oracle text and images come from Scryfall.

## What the engine supports today

- Turn structure with every step, priority passing around the table, the stack.
- Lands (including dual Towns that enter tapped), mana abilities, mana costs.
- Creatures, instants, sorceries; Flash.
- Combat in pods: each attacker picks a player; each defender blocks.
- Keywords: Flying, Reach, Vigilance, Haste, First strike, Double strike,
  Menace, Lifelink, Trample, Deathtouch, Indestructible.
- Effects: damage, draw, gain and lose life, destroy, exile, tap, bounce,
  +1/+1 counters, tokens and token copies, "until end of turn" P/T, keywords
  and flags, exile until the source leaves, exile to play later, mill,
  surveil, reanimation, attaching Equipment, and library searches. Amounts
  can count things ("for each Equipment you control").
- Triggered abilities (K1): enters, dies, attacks, spell cast, combat damage to
  a player, beginning of combat, upkeep; from the battlefield or the graveyard;
  "one or more", "only once each turn", "you may", optional mana or life
  costs, an intervening "if" on mana spent, and targets chosen when the
  trigger goes on the stack.
- Tokens (K2): Hero, Treasure, Robot Warrior, and copies; tokens cease to
  exist when they leave the battlefield.
- Continuous effects (K3): static abilities with conditions ("during your
  turn", "as long as it's equipped"), counted P/T, added keywords and
  subtypes, all computed in one characteristics layer.
- Equipment (K4): equip at sorcery speed with target-based discounts, Job
  select, "equipped creature" buffs and triggers, Equipment-only mana.
- Graveyard and library (K5): flashback, surveil, mill, return to the
  battlefield, landcycling.
- The rest (K6): activated abilities, cost reductions, modal spells, the
  Suplex replacement effect, must-be-blocked and can't-be-blocked, playing
  cards from exile, the legend rule.
- Elimination (life, empty library, concede) with the game continuing in pods.

## Build order

Each step is engine work followed by the cards it makes possible. "Needed by"
counts distinct kit cards that use the step's features; "Playable after" is
the running total of newly playable distinct cards (copies in brackets), on
top of the 7 that were done before K1.

| Step | Engine work | Needed by | Playable after |
|---|---|---|---|
| K1 | **Done (2026-10-21).** **Triggered abilities**: enters, dies, attacks, beginning of combat, upkeep, cast, combat damage to a player, from the graveyard. Triggers go on the stack in turn order. Includes **choices during resolution** ("you may", optional costs, choosing targets for triggers). | 21 | 4 (8) |
| K2 | **Done (2026-10-21).** **Tokens and counters**: Hero 1/1, Treasure, Robot 3/3, +1/+1 counters. | 15 | 8 (18) |
| K3 | **Done (2026-10-21).** **Continuous effects**: static buffs, "until end of turn", amounts and P/T that count things, conditional keywords ("during your turn"), adding creature types. A small layer system covering P/T, abilities and types. | 18 | 17 (31) |
| K4 | **Done (2026-10-21).** **Equipment**: attach, equip as a sorcery, Job select. | 8 | 23 (39) |
| K5 | **Done (2026-10-21).** **Graveyard and library**: surveil, mill, flashback, return from graveyard, landcycling (search library). | 6 | 29 (53) |
| K6 | **Done (2026-10-21).** **The rest**: non-mana activated abilities, cost reductions, modal spells, one replacement effect (Suplex), exile until this leaves, play from exile, copy a permanent, must be blocked, mana spending restrictions, "died this turn" history. | 11 | all 40 |

After K6 both kits are fully playable, and the next target is the Limit Break
Commander precon (Equipment-heavy, so K4 pays off twice).

## Card status

### Final Fantasy Starter Kit: Red-White (60/60 cards playable)

| Card | Copies | Status | Needs |
|---|---|---|---|
| G'raha Tia | 1 | Done | - |
| Mountain | 8 | Done | - |
| Plains | 13 | Done | - |
| Rabanastre, Royal City | 4 | Done | - |
| Adelbert Steiner | 1 | Done | - |
| Barret Wallace | 1 | Done | - |
| Beatrix, Loyal General | 1 | Done | - |
| Cloud, Planet's Champion | 1 | Done | - |
| Cloudbound Moogle | 2 | Done | - |
| Coeurl | 2 | Done | - |
| Dragoon's Lance | 1 | Done | - |
| Dwarven Castle Guard | 4 | Done | - |
| Fate of the Sun-Cryst | 2 | Done | - |
| Freya Crescent | 1 | Done | - |
| Item Shopkeep | 3 | Done | - |
| Judgment Bolt | 1 | Done | - |
| Lightning, Security Sergeant | 1 | Done | - |
| Rosa, Resolute White Mage | 1 | Done | - |
| Samurai's Katana | 2 | Done | - |
| Slash of Light | 2 | Done | - |
| Suplex | 1 | Done | - |
| The Crystal's Chosen | 1 | Done | - |
| Ultima Weapon | 1 | Done | - |
| Warrior's Sword | 2 | Done | - |
| White Auracite | 2 | Done | - |
| White Mage's Staff | 1 | Done | - |

### Final Fantasy Starter Kit: Blue-Black (60/60 cards playable)

| Card | Copies | Status | Needs |
|---|---|---|---|
| Al Bhed Salvagers | 3 | Done | - |
| Island | 9 | Done | - |
| Sephiroth's Intervention | 3 | Done | - |
| Shambling Cie'th | 3 | Done | - |
| Swamp | 12 | Done | - |
| Treno, Dark City | 4 | Done | - |
| Ultimecia, Temporal Threat | 1 | Done | - |
| Deadly Embrace | 1 | Done | - |
| Dreams of Laguna | 2 | Done | - |
| Evil Reawakened | 2 | Done | - |
| Il Mheg Pixie | 3 | Done | - |
| Magitek Scythe | 1 | Done | - |
| Overkill | 2 | Done | - |
| Relm's Sketching | 1 | Done | - |
| Retrieve the Esper | 2 | Done | - |
| Sahagin | 1 | Done | - |
| Sephiroth, Planet's Heir | 1 | Done | - |
| Seymour Flux | 1 | Done | - |
| Shinra Reinforcements | 3 | Done | - |
| Undercity Dire Rat | 4 | Done | - |
| Xande, Dark Mage | 1 | Done | - |

