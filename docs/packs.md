# Packs tab: Final Fantasy booster packs

The menu's **Packs** tab opens Final Fantasy booster packs for collecting.
Each pack costs Aether Shards (100 for a Play Booster, 500 for a Collector
Booster); the game server opens it and adds the cards to your account's
collection. Pulled cards don't change the Starter Kit and precon games.

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

## Collector Booster (built 2026-10-27)

15 Magic cards and a foil token:

| Slot | Contents |
|---|---|
| 3 foil commons | Main-set commons and common dual lands |
| 3 foil uncommons | Main-set uncommons; the 14 Cid variants together as often as one uncommon |
| Booster Fun common or uncommon | Extended-art legendary uncommon 66.7%, borderless common 5% or uncommon 26.7%, Secret Rendezvous alternate art 1.6% |
| Foil Booster Fun common or uncommon | Foil borderless common 13.75% or uncommon 72.75%, foil Secret Rendezvous 4.5%, surge foil borderless uncommon 9% |
| Foil basic land | A full-art basic |
| Foil rare or mythic | Rare 87.75%, mythic 12.25% |
| 3 Booster Fun rares or mythics | Borderless and extended-art FIN cards, and the Commander set's extended-art and borderless cards (about half the time), at Wizards' odds; at most one of the three is foil, and they never repeat |
| Through the Ages | Uncommon 68.3%, rare 25.7%, mythic 6%; foil half the time |
| Premium rare or mythic | Foil borderless rare 70% or mythic 11.6%, surge foil borderless rare 15.1% or mythic 3%, Traveling Chocobo or Chocobo track foil 0.29%, serialized golden Traveling Chocobo 0.01%, foil Scene Box card (ours) |
| Foil token | Foil double-sided token 90%, surge foil token 10% (ours) |

Our choices, where Wizards' figures don't map directly:

- **Scene Box cards** are a foil outcome of the premium slot, weighted 4
  against the other outcomes' 100 (about 3.8%).
- Wizards lists the three Booster Fun rare slots as one set of outcomes; each
  of the three slots uses those odds.
- The premium slot's "Final Fantasy artist" foils are folded into the foil
  borderless odds, and the Chocobos' "under 1%" is 0.29% (colorful and track
  foils) plus 0.01% (golden).
- Surge foil tokens (10% of token slots) aren't in Wizards' list.

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
  Ages, Commander Booster Fun, Scene Box, tokens and art cards) with completion counts; missing
  cards are greyed out.
- **Saving:** on your account (`owned_cards`, through `POST /api/packs/open`
  and `GET /api/collection`), so it follows you to every computer. The
  server rolls the pack with a cryptographic random source and charges the
  price and adds the cards in one database transaction. Cards opened before
  this (2026-10-29) were only in the browser and aren't carried over.
- **Sound:** off by default; a button in the tab turns synthesized tear,
  flip and chime sounds on.

## Sets (planned, user requirement 2026-10-29)

Packs must be split by set: the Packs tab (and the store, drafts and the
collection) will offer each set's own Play and Collector Boosters. Final
Fantasy is the only set for now; **Edge of Eternities** cards and precons
come after Final Fantasy testing is complete.

- Each set gets its own print sheets and slot odds (`boosters.ts` is
  Final Fantasy-specific today and should become one config per set), its
  own card data from Scryfall, and its own pack images, named by set code
  (`public/packs/ff-play-booster.png`, later `eoe-play-booster.png`).
- A set that isn't imported yet is shown greyed out with **Coming soon**
  (not openable or draftable), so players can see what's next. Once its
  cards and images are imported it can open, even before every card is
  built: unbuilt cards are collectable but marked "Not built" and can't be
  used in games (decisions.md).
- The collection already records each card's exact printing (Scryfall id
  and set), so cards from different sets stay distinct.

## Collection browser (built 2026-10-29, user requirement)

- See your collection by set (Final Fantasy now; each set added later gets
  its own tab, unfinished ones greyed out as Coming soon).
- Filters: owned, unowned, all.
- Sort by mana value, alphabetical, or color in WUBRG order (then
  multicolor and colorless).
- Includes every card the account owns, precon printings too (the
  "Commander decks" group), with counts per finish on hover.
- Code: `packages/client/src/packs/browse.ts` (filtering and sorting,
  tested in `packages/client/test/collection-browse.test.ts`).
