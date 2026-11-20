# Packs tab: Final Fantasy booster packs

The booster page and pack opening show the set's showcase art behind them,
fixed to the window, blurred under a soft gray wash (lighter and grayer at the user's request, 2026-11-05; `.set-showcase` in
`packs/packs.css`; each set's class picks its picture: `set-fin` uses
`public/packs/ff-showcase.jpg`). The buy buttons read "1 pack" and "10 + 1 pack" with the Aether Shard price
underneath (user, 2026-11-05). The pack and showcase pictures in
`public/packs/` were supplied by the user (2026-11-05).

The menu's **Packs** tab opens Final Fantasy booster packs for collecting.
Each pack costs Aether Shards (100 for a Play Booster, 500 for a Collector
Booster; buying 10 at once adds an 11th free); the game server opens it and adds the cards to your account's
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
| EOE | Edge of Eternities (400): 1–276 main set with basics, 277–316 borderless, 317–356 extended art, 357–366 and 383–392 Japan Showcase, 367–381 galaxy foils, 382 the Sothera headliner, 393+ promos |
| EOS | Stellar Sights (180): the bonus sheet's 45 lands, with borderless, poster and galaxy foil versions |
| EOC | The Commander set (191) |
| TEOE | Tokens (12) |
| AEOE | Art cards (54) |

The game never calls the Scryfall API; run the script again only to refresh
the data. `packages/cards/src/boosters.ts` sorts the printings into print
sheets and opens packs (`openPack('play')`); the client loads it on demand.

## Edge of Eternities (built 2026-11-05)

The booster page has a set choice (Final Fantasy, Edge of Eternities); each
set shows its own pack photos and showcase art behind the page and while its
packs open. Edge of Eternities packs cost the same as Final Fantasy's (100
and 500 Aether Shards) and are opened by the server (`/api/packs/open` with
`set: 'eoe'`). The Collection binder's Edge of Eternities tab groups the
main set, Booster Fun, Stellar Sights, Commander Booster Fun, Special Guests,
and tokens and art cards.

Card data: the printings are in `booster-cards.json` (EOE, EOS, EOC, TEOE,
AEOE, SPG 119-128), and the main set's 261 cards no other file defines are in
`data/eoe-set.json` (`node packages/cards/scripts/import-sets.ts eoe`; 3
built, the rest `notBuilt`, Tezzeret, Cruel Captain included: the engine has
no planeswalkers yet, so that type is allowed only on unbuilt cards).

Odds follow Wizards' "Collecting Edge of Eternities" exactly (`EOE_PLAY_BOOSTER`,
`EOE_COLLECTOR_BOOSTER` in `src/boosters.ts`). Where Wizards writes "less than
1%", those outcomes share what the slot's listed odds leave over (noted
beside each in the code; e.g. the Play Booster wildcard's 0.9% is mythic
0.5, viewport mythic 0.1, triumphant/surreal rare 0.2, mythic 0.1).

| Play Booster slot | Contents |
|---|---|
| 6 commons | Main-set commons (81), no duplicates |
| Common or Special Guests | A non-foil Special Guests card in 1.8% of packs |
| 3 uncommons | Main-set uncommons (100) |
| Wildcard | Common 12.5%, uncommon 62.5%, rare 10.6%, Stellar Sights rare 10% or mythic 2.5% (1 in 8 packs), borderless viewport land 1%, and smaller chances |
| Rare | Rare 80.4%, mythic 14.2%, borderless triumphant or surreal space rare 2% each |
| Foil | Common 58%, uncommon 32%, rare 6.4%, mythic 1.1%, Stellar Sights 1%+ |
| Land | Basic 64% (foil 16%), celestial basic 16% (foil 4%) |
| Token | A double-sided token |

| Collector Booster slot | Contents |
|---|---|
| 5 + 4 | Foil commons and uncommons |
| Celestial basic | Foil 66.6%, galaxy foil 33.3% |
| Foil rare | Rare 86%, mythic 14% |
| Commander card | Non-foil: borderless mythic 9%, extended-art rare 91% |
| Booster Fun | Extended art 52%, viewport lands 11%, triumphant 20%, surreal space 17% |
| Stellar Sights land | Non-foil, foil or galaxy foil; poster versions in 33.3% |
| Foil Booster Fun | Extended art, borderless, Special Guests 6%, Japan Showcase 9% (fracture foil 1%), galaxy viewport lands 3%, the singularity foil Sothera |
| Art card or token | Foil token 65%, art card 30%, gold-stamped art card 5% |

Galaxy, fracture and singularity foils are their own printings; they're named
as such and shown with the regular foil shine for now. Japan Showcase cards
are in English (real non-Japanese boosters have them in Japanese a third of
the time).

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
| Premium rare or mythic | Foil borderless rare 70% or mythic 11.6%, surge foil borderless rare 15.1% or mythic 3%, Traveling Chocobo variant 0.29% (Chocobo Track foils are sold in the Store instead, user decision 2026-10-30), serialized golden Traveling Chocobo 0.01%, foil Scene Box card (ours) |
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

## Finishes everywhere (built 2026-10-30, user requirement)

- The collection and the deck editor show each card's finish visibly:
  non-foil, foil, surge foil, Chocobo Track foil (and later sets' own,
  such as fracture foil), with the pack opening's shine: rainbow for surge,
  gold for Chocobo Track.
- The same shine shows during games, but only for a finish the player owns:
  a game's finishes come from the player's saved deck, which the server
  checks against their collection. Local drafts (not saved to accounts
  yet) and the Starter Kits play non-foil.
- Code: finish names and looks in `cards/src/boosters.ts` (`SPECIAL_FOILS`,
  `finishName`, `finishLook`; add a later set's special foils there), the
  shared `.card-shine` in the client's styles.css, `deckFinishes` /
  `commanderFinish` in the engine's game setup and `finish` on each card
  (public in redaction). Saved decks can't start games yet, so no game
  sets finishes until they can.

## Art choices in decks (built 2026-10-30, user requirement)

- **Basic lands:** a deck can use any number of a basic land printing the
  player owns at least one copy of (in that finish); each basic type picks
  its printing in the deck editor, or the default art. The server checks
  the player owns it and that it really is that basic land
  (`basics.printings` in a saved deck).
- **Any card:** when the player owns more than one printing of a card
  (different art or finish), the deck list's Art menu switches copies to
  another owned printing.

## Reality Fracture (packs added 2026-11-16)

The booster page's set choice has Reality Fracture too (same prices; the
server opens them with `set: 'fra'`). The photos of the real packs are
`packages/client/public/packs/fra-play-booster.png` and
`fra-collector-booster.png` (white background cut away), and the showcase art
behind the page is `fra-showcase.jpg` (2026-11-20). The Collection binder's
Reality Fracture tab groups the main set, Booster Fun, the facet foil shattered
mirror cards, the Secret Lair Bundle cards, Commander Booster Fun, the
Multiverse Reforged deck, Special Guests, and tokens and art cards.

**Secret Lair Bundle (Store, 2026-11-20).** Reality Fracture's Secret Lair
tie-in is its Secret Lair Bundle, not Commander Reinforcements drops: its
eleven borderless foils are FRA 438-448 (Emrakul, the Exigent Doom; Enlightened
Confidant; Return to the Light Realms; Seasoned Cryomancer; Sphinx's Approach;
The Theorist, Jace Beleren; Darklight Phoenix; Overwrite the Multiverse;
Craterclaw Colossus; Stingcaster Mage; Omnipresence), which no booster sheet
uses. The Store's Reality Fracture tab sells all eleven together at the Secret
Lair drop price (`sld-bundle-fra`) and each on its own at the single price,
foil (`packages/server/src/store.ts`). The bundle's boosters and basics aren't
sold with it. FRA 432-437 (promo-pack Charms and the Bundle promo) and the
stamped PFRA promos aren't sold. The Secret Lair drop released 2026-09-28 (SLD
2116-2132) isn't included: nothing ties it to Reality Fracture.

Card data: `npm run scryfall:boosters` saves FRA, FRC, TFRA, AFRA and the ten
Special Guests (SPG 159-168). Print sheets by collector number
(`buildFraSheets`): 1-194 the main set apart from the echoed pairs (the 10
common dual lands on their own sheet), 195-280 the 43 echoed pairs
(`FRA_ECHOED_PAIRS`, paired as Wizards' "The Legends of Reality Fracture" shows
them; the five "Way of the ..." pairs follow their planeswalkers), 281-290
basics, 291-320 borderless echoed pairs, 321-333 shattered mirror (facet foil
449-461), 334-358 sculptor's stronghold, 359-381 braintwister series, 382-396
tower basics, 397-401 portal view lands, 402 the serialized headliner, 403-422
Japan Showcase (fracture foil 413-422), 423-431 extended art; FRC 1-2
borderless mythics and 88-103 extended-art rares.

Odds follow Wizards' "Collecting Reality Fracture" exactly (`FRA_PLAY_BOOSTER`,
`FRA_COLLECTOR_BOOSTER`); "less than 1%" outcomes share what each slot's listed
odds leave over, as noted in the code. Of the three echoed pairs cards in each
pack, the first two are always the two halves of one pair (same rarity,
treatment and finish).

| Play Booster slot | Contents |
|---|---|
| 5-6 commons | Commons; in 1 of 55 packs a non-foil Special Guests card replaces one |
| Uncommon | Uncommon 96.2%, braintwister uncommon 3.8% |
| Common or uncommon | Common 23%, uncommon 74%, braintwister uncommon 3% |
| 3 echoed pairs | Uncommon 88.9%, rare 6.7%, mythic 1.4%, borderless uncommon 1.7% (rarer borderless rare and mythic) |
| Rare | Rare 74.4%, mythic 14.8%, sculptor's stronghold 3.8%/1%, braintwister rare 3.1%, shattered mirror rare 1%, portal view land 1% |
| Foil | Common 49.5%, uncommon 40.5%, rare 6%, mythic 1.2%, Booster Fun 2.8% |
| Land | Dual land 43.6% (foil 10.9%), tower basic 21.8% (foil 5.5%), basic 14.6% (foil 3.6%) |
| Token | A counter card or double-sided token |

| Collector Booster slot | Contents |
|---|---|
| 4 + 2 | Foil commons (and dual lands) and uncommons (braintwister 10.4%) |
| 3 echoed pairs | Foil uncommon 86.8%, borderless 13.2% |
| Tower basic | Foil |
| Foil rare | Rare 83.1%, mythic 16.9% |
| Braintwister or Commander | Braintwister rare 44.8% or mythic 4.5%, FRC extended-art rare 47.8%, FRC borderless mythic 3% |
| 2 Booster Fun | Borderless echoed pairs, shattered mirror, sculptor's stronghold, portal view lands, extended art |
| Foil Booster Fun | Also Special Guests 6.1%, Japan Showcase 9% (fracture foil 1%), facet foil shattered mirror and the serialized Bloodline Recollector |
| Token or art card | Foil double-sided token 65%, art card 35% |


## Secrets of Strixhaven (packs added 2026-11-20)

The set choice has Secrets of Strixhaven too (same prices; `set: 'sos'`).
Its packs come from MTGJSON's print sheets rather than a hand-written slot
table: see [strixhaven.md](strixhaven.md#packs-2026-11-20). The Collection
binder's tab groups the main set, Booster Fun, the Mystical Archive, the
Collector Boosters' Commander cards, Special Guests, and tokens and art cards.
