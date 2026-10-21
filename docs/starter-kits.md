# Final Fantasy Starter Kits: roadmap

The first real card target is the two Final Fantasy Starter Kits (60 cards each,
no double-faced cards). Decklists live in
[`packages/cards/data/fin-starter-kits.json`](../packages/cards/data/fin-starter-kits.json),
with each card's status and the engine features it still needs. The cards test
checks that this file and the card definitions agree.

Card rules text is not stored in this repo. Card definitions describe behavior
as data, and the terminal client generates a summary from that data.

## What the engine supports today

- Turn structure with every step, priority passing around the table, the stack.
- Lands (including dual Towns that enter tapped), mana abilities, mana costs.
- Creatures, instants, sorceries; Flash.
- Combat in pods: each attacker picks a player; each defender blocks.
- Keywords: Flying, Reach, Vigilance, Haste, First strike, Double strike,
  Menace, Lifelink, Trample, Deathtouch, Indestructible.
- Effects: deal damage, draw, gain life, lose life, destroy target creature,
  tap creatures, return this card to hand.
- Triggered abilities (K1): enters, dies, attacks, spell cast, combat damage to
  a player, beginning of combat, upkeep; from the battlefield or the graveyard;
  "one or more", "only once each turn", "you may", optional mana or life costs,
  and targets chosen when the trigger goes on the stack.
- Elimination (life, empty library, concede) with the game continuing in pods.

## Build order

Each step is engine work followed by the cards it makes possible. "Needed by"
counts distinct kit cards that use the step's features; "Playable after" is
the running total of newly playable distinct cards (copies in brackets), on
top of the 7 that were done before K1. "Needs" in the card tables below lists
only what is still missing.

| Step | Engine work | Needed by | Playable after |
|---|---|---|---|
| K1 | **Done (2026-10-21).** **Triggered abilities**: enters, dies, attacks, beginning of combat, upkeep, cast, combat damage to a player, from the graveyard. Triggers go on the stack in turn order. Includes **choices during resolution** ("you may", optional costs, choosing targets for triggers). | 21 | 4 (8) |
| K2 | **Tokens and counters**: Hero 1/1, Treasure, Robot 3/3, +1/+1 counters. | 15 | 8 (18) |
| K3 | **Continuous effects**: static buffs, "until end of turn", amounts and P/T that count things, conditional keywords ("during your turn"), adding creature types. A small layer system covering P/T, abilities and types. | 18 | 17 (31) |
| K4 | **Equipment**: attach, equip as a sorcery, Job select. | 8 | 23 (39) |
| K5 | **Graveyard and library**: surveil, mill, flashback, return from graveyard, landcycling (search library). | 6 | 29 (53) |
| K6 | **The rest**: non-mana activated abilities, cost reductions, modal spells, one replacement effect (Suplex), exile until this leaves, play from exile, copy a permanent, must be blocked, mana spending restrictions, "died this turn" history. | 11 | all 40 |

After K6 both kits are fully playable, and the next target is the Limit Break
Commander precon (Equipment-heavy, so K4 pays off twice).

## Card status

### Final Fantasy Starter Kit: Red-White (26/60 cards playable)

| Card | Copies | Status | Needs |
|---|---|---|---|
| G'raha Tia | 1 | Done | - |
| Mountain | 8 | Done | - |
| Plains | 13 | Done | - |
| Rabanastre, Royal City | 4 | Done | - |
| Adelbert Steiner | 1 | Not yet | count-based-pt |
| Barret Wallace | 1 | Not yet | attack-triggers, count-based-amounts |
| Beatrix, Loyal General | 1 | Not yet | begin-combat-triggers, equipment, choices |
| Cloud, Planet's Champion | 1 | Not yet | equipment, conditional-keywords, cost-modification |
| Cloudbound Moogle | 2 | Not yet | etb-triggers, counters, landcycling |
| Coeurl | 2 | Not yet | activated-abilities, targeted-tap |
| Dragoon's Lance | 1 | Not yet | equipment, job-select, tokens, static-buffs, conditional-keywords, type-changing |
| Dwarven Castle Guard | 4 | Not yet | dies-triggers, tokens |
| Fate of the Sun-Cryst | 2 | Not yet | cost-modification, destroy-permanent |
| Freya Crescent | 1 | Not yet | conditional-keywords, mana-abilities-on-creatures, mana-spend-restrictions |
| Item Shopkeep | 3 | Not yet | attack-triggers, until-end-of-turn-effects |
| Judgment Bolt | 1 | Not yet | count-based-amounts |
| Lightning, Security Sergeant | 1 | Not yet | combat-damage-triggers, play-from-exile |
| Rosa, Resolute White Mage | 1 | Not yet | begin-combat-triggers, counters, until-end-of-turn-effects |
| Samurai's Katana | 2 | Not yet | equipment, job-select, tokens, static-buffs, granted-keywords, type-changing |
| Slash of Light | 2 | Not yet | count-based-amounts |
| Suplex | 1 | Not yet | modal-spells, replacement-effects, exile-artifact |
| The Crystal's Chosen | 1 | Not yet | tokens, counters |
| Ultima Weapon | 1 | Not yet | equipment, static-buffs, granted-triggers |
| Warrior's Sword | 2 | Not yet | equipment, job-select, tokens, static-buffs, type-changing |
| White Auracite | 2 | Not yet | etb-triggers, exile-until-leaves, mana-abilities-on-artifacts |
| White Mage's Staff | 1 | Not yet | equipment, job-select, tokens, static-buffs, granted-triggers, type-changing |

### Final Fantasy Starter Kit: Blue-Black (35/60 cards playable)

| Card | Copies | Status | Needs |
|---|---|---|---|
| Al Bhed Salvagers | 3 | Done | - |
| Island | 9 | Done | - |
| Sephiroth's Intervention | 3 | Done | - |
| Shambling Cie'th | 3 | Done | - |
| Swamp | 12 | Done | - |
| Treno, Dark City | 4 | Done | - |
| Ultimecia, Temporal Threat | 1 | Done | - |
| Deadly Embrace | 1 | Not yet | destroy-permanent, turn-history-tracking |
| Dreams of Laguna | 2 | Not yet | surveil, flashback |
| Evil Reawakened | 2 | Not yet | reanimation, counters |
| Il Mheg Pixie | 3 | Not yet | attack-triggers, surveil |
| Magitek Scythe | 1 | Not yet | equipment, etb-triggers, choices, must-be-blocked, static-buffs |
| Overkill | 2 | Not yet | until-end-of-turn-effects |
| Relm's Sketching | 1 | Not yet | copy-effects, tokens |
| Retrieve the Esper | 2 | Not yet | tokens, flashback, counters, cast-source-tracking |
| Sahagin | 1 | Not yet | cast-triggers, mana-spent-tracking, counters, evasion-effects |
| Sephiroth, Planet's Heir | 1 | Not yet | etb-triggers, until-end-of-turn-effects, dies-triggers, counters |
| Seymour Flux | 1 | Not yet | upkeep-triggers, optional-costs, counters |
| Shinra Reinforcements | 3 | Not yet | etb-triggers, mill |
| Undercity Dire Rat | 4 | Not yet | dies-triggers, tokens, treasure |
| Xande, Dark Mage | 1 | Not yet | count-based-pt |

