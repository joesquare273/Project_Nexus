# Packs tab: Final Fantasy booster packs

The menu's **Packs** tab opens Final Fantasy booster packs for collecting.
Pulled cards go into a collection binder; they never change the decks you
play with (those stay the exact Starter Kits and Commander precons).

## Card data

`npm run scryfall:boosters` (`packages/cards/scripts/booster-data.ts`) saves
every printing of these Scryfall sets to `packages/cards/data/booster-cards.json`
(1,263 printings, with image links only; images load from Scryfall's image
servers):

| Set | What |
|---|---|
| FIN | The main set (598): 1–309 main boosters, 310–406 borderless, 407–420 Cid variants, 421–518 extended art, 519–550 surge foils, 551+ Chocobos and others |
| FCA | Through the Ages (65) |
| FIC | The Commander set (486): Booster Fun cards 101–216 appear in Collector Boosters; 442–465 are the Scene Box cards |
| TFIN | Tokens (37) |
| AFIN | Art cards (53) |
| AFIC | Scene Box art cards (24) |

The game never calls the Scryfall API; run the script again only to refresh
the data. `packages/cards/src/boosters.ts` sorts the printings into print
sheets and opens packs (`openPack('play')`); the client loads it on demand.

## Play Booster (built 2026-10-27)

14 Magic cards and a token or art card, following Wizards' "Collecting
Final Fantasy" odds:

| Slot | Contents |
|---|---|
| 6 commons | Main-set commons, no duplicates |
| 1 common or Through the Ages | A Through the Ages card in 1 of 3 packs (uncommon 63.25%, rare 29.75%, mythic 7%) |
| 3 uncommons | Main-set uncommons; 0.9% a Cid, Timeless Artificer variant, 0.3% borderless |
| Wildcard | Common 16.7%, uncommon 58.3%, borderless common 2.6% or uncommon 5.7%, rare or mythic 16.7% |
| Rare | Rare 79%, mythic 10%, borderless rare 8.5% or mythic 1.5%, Scene Box card 1% |
| Foil | Wizards' foil odds (mostly commons and uncommons) |
| Land | Common dual land 55% or basic 45%, foil 20% of the time |
| Token or art card | Token 65%, art card 25%, Scene Box art card 5%, gold-stamped art card 5% |

Our choices, where Wizards' figures don't map directly:

- **Scene Box cards** aren't in real boosters. At the user's request they're
  in: 1% of Play Booster rare slots (taken from the rares' 80%), and Scene
  Box art cards in 5% of token/art slots.
- Wizards' "Final Fantasy artist" rares (0.5% + 0.5%) are folded into the
  borderless rare and mythic odds.
- The wildcard's "rare or mythic 16.7%" is split 7:1 like the rare slot.

## Collector Booster

Next step (shown as "Coming next" in the tab).

## The tab

- **Open packs:** pack choice with floating packs and a "Pack odds" table
  per slot.
- **Opening:** drag across the top of the pack to tear it (or press Space /
  click "Tear open"). A pack holding a mythic, showcase or Through the Ages
  card shivers and leaks light from the seam.
- **Reveal:** the cards come out in a stack with the best ones at the back.
  Rares and better start face down with a glow in their rarity's color; the
  background shifts color for big pulls. Foils have a moving shine, surge
  foils a rainbow one. "Skip" jumps to the summary.
- **Summary:** the whole pack, with NEW badges for first copies.
- **Collection:** a binder by group (main set, Booster Fun, Through the
  Ages, Scene Box, tokens and art cards) with completion counts; missing
  cards are greyed out.
- **Saving:** in this browser's local storage (`nexus.packs.collection.v1`).
  It doesn't follow you to the other computer.
- **Sound:** off by default; a button in the tab turns synthesized tear,
  flip and chime sounds on.
