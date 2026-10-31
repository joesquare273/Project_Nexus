# Development updates

A running log of progress, open issues and their workarounds. Newest first.
Longer-lived design choices go in [decisions.md](decisions.md).

## 2026-10-30

### Secret Lair card: Blade of Selves (myriad); every Store card is built

- Myriad (`Myriad` effect): when the equipped creature attacks, a token copy
  of it enters tapped and attacking each opponent other than the defending
  player. The copies are marked `exileAtEndOfCombat` (redacted as a copy) and
  exiled as the end of combat step begins. Equip {4}.
- With this, all 24 FINAL FANTASY Secret Lair printings and every Store-only
  card are built. Tests in `fin-set-cards.test.ts` cover 2, 3 and 4 players.

### Secret Lair cards: Temporal Extortion and Praetor's Grasp

- Extra turns (`extraTurns` on the game, redacted as a copy): the newest is
  taken first, before the normal next turn (rule 500.7).
- "When you cast this spell" triggers (`zone: 'stack'` on a SpellCast
  trigger). Temporal Extortion's asks each opponent in turn order whether to
  pay half their life, rounded up; the first who pays counters it.
- Praetor's Grasp searches an opponent's library (`libraryOf` on the search
  choice) and exiles the card face down; only you can see it, and you may
  play it for as long as it stays exiled (`playableFromExile.whileExiled`).

### Secret Lair cards: Prismatic Ending, Staff of the Storyteller, Forge Anew

- Converge: a spell records how many colors of mana were spent on it
  (`colorsSpent`); generic mana is paid with colors not spent yet when the
  pool allows. Prismatic Ending exiles only if the target's mana value fits.
- A `TokensCreated` trigger ("whenever you create one or more creature
  tokens") and story counters for Staff of the Storyteller; its Spirit token
  is the Secret Lair printing (sld 1341, `spirit-token-sld`).
- Forge Anew: during your turn equip abilities work at instant speed, and the
  first one each turn costs {0} (`equipActivatedTurn`, redacted as a copy).

### Secret Lair cards: the five Elemental Incarnations (evoke)

- Evoke: an alternative cost can exile a card of a color from your hand
  (`exileFromHand`, chosen with `costCards`); an evoked permanent is
  marked (`evoked`, redacted as a copy) and its `ifEvoked` trigger
  sacrifices it (`SacrificeIt`).
- Solitude exiles a creature (its controller gains life equal to its power);
  Subtlety puts a creature spell on the top or bottom of its owner's library;
  Grief makes an opponent discard the nonland card you choose (`Discard` with
  `chooser: 'You'`); Fury divides 4 damage (`DivideDamage`); Endurance puts a
  player's graveyard on the bottom of their library (`GraveyardToLibraryBottom`).
- The board prompts for divided damage and shows the opponent's revealed
  cards for Grief; the bots handle both choices.

### Secret Lair cards: Umezawa's Jitte and Sword of Truth and Justice

- Protection from a color is a keyword now (`ProtectionFromWhite` …
  `ProtectionFromGreen`): damage from sources of that color is prevented,
  and it can't be blocked by, targeted by, or enchanted or equipped by
  anything of that color.
- A new trigger, `CombatDamage`, for "whenever equipped creature deals combat
  damage" (to a creature or a player; once per damage step with `oneOrMore`).
- Umezawa's Jitte gets two charge counters each time; Sword of Truth and
  Justice gives +2/+2, protection from white and blue, and a +1/+1 counter
  then proliferate on combat damage to a player.

### Secret Lair cards: Silence and Toxic Deluge

- Silence: a new effect, `CantCastSpellsThisTurn`, marks each opponent
  (`cantCastTurn`, redacted as a copy) so they can't cast spells for the rest
  of the turn.
- Toxic Deluge: an additional cost of X life (`additionalCost.lifeX`), paid
  after the mana and refused when the caster has less life than X; ModifyPT
  can now subtract the amount (`subtractAmount`) for -X/-X.

### Starting balance 2,000 and a daily login reward

- Every account starts with 2,000 Aether Shards: the 1,000 welcome grant
  and a 1,000 welcome bonus, each paid once (accounts made before get the
  bonus on their next sign-in). Signing in also pays 50 shards once a day.
  New migration: `20261030180000_login_reward.sql` (the `login_reward`
  ledger kind).
- Planned with the rewards step (E2/E3): 250 for finishing the tutorial,
  100 for a first win, daily quests 100-200, weekly quests 300-500
  (docs/economy.md).

### Secret Lair cards: Gilded Lotus, Damn, Cyclonic Rift

- Built with tests (Damn and Cyclonic Rift with their overload costs).
- Still to build, each needing an engine feature first: Sword of Truth and
  Justice (protection), Umezawa's Jitte (combat damage to creatures as a
  trigger), Silence (can't cast spells this turn), Toxic Deluge (pay X
  life), Temporal Extortion (extra turns), Praetor's Grasp, Staff of the
  Storyteller, Blade of Selves (myriad), Forge Anew, Prismatic Ending
  (converge), and the five Elemental Incarnations (evoke).

### Commander games use your own decks

- The Play tab's Commander setup lists your saved Commander decks instead
  of the four precons (user rule: players only play decks they own); the
  AI opponents still play the precons. Start waits until you pick one.
- Saved decks start games: `gameDeck` turns one into card definitions with
  each card's printing and finish, the chosen basic land art, and the
  commander (tested in `packages/cards/test/decks.test.ts`), so owned foils
  shine in games.

### Precons in the Store

- The Store sells the four FINAL FANTASY Commander precons for 2,000 shards
  each: the 100 cards go to the collection and the deck is saved, ready to
  play, like the free starter. Buying one again adds more copies.
- Next (user requirement): Commander games use only decks the player owns;
  the precon picker goes away, and saved decks start games.

### FINAL FANTASY Secret Lairs in the Store

- Imported the 24 FINAL FANTASY Secret Lair printings from Scryfall
  (`scripts/import-secret-lairs.ts`, one request): the Game Over, Weapons
  and Grimoire drops with their bonus cards, plus the Elemental Incarnations
  and Gilded Lotus. The Store sells each drop (5 cards non-foil and the foil
  bonus) for 3,500 and every card on its own for 1,000; the Collection has a
  Secret Lair group.
- Built now: Day of Judgment, Star of Extinction (creatures only: the engine
  has no planeswalkers), Heroic Intervention and Feed the Swarm, with tests.
  Lightning Bolt and Colossus Hammer were already built.
- Still to build (marked Not built, collectable): Temporal Extortion, Toxic
  Deluge, Praetor's Grasp, Staff of the Storyteller, Blade of Selves,
  Umezawa's Jitte, Sword of Truth and Justice, Forge Anew, Prismatic Ending,
  Cyclonic Rift, Damn, Silence, Gilded Lotus, Solitude, Subtlety, Grief, Fury
  and Endurance.

### You choose what a library search finds; mana symbols on buttons

- Library searches (Cloud, landcycling, ramp spells, Path to Exile) let the
  searcher pick from every matching card, or find nothing; then the
  library is shuffled. The board lists the cards to choose from, only for
  the searcher. The AI takes its best matches; the test helper takes the
  first, as the engine used to.
- Choco's land choice also lists its cards, with its own prompt.
- Buttons and menus draw mana as symbols ("Add {G}" shows the green
  symbol) instead of text.

### Every Store card is built: Cloud, Traveling Chocobo, Choco

- Cloud, Midgar Mercenary; Traveling Chocobo; Choco, Seeker of Paradise,
  each with tests. All 25 Chocobo Track foils in the Store now work in
  games.
- Engine: "triggers an additional time" (`extraTriggers` statics: a
  permanent's own and its Equipment's triggers while equipped, or triggers
  caused by a matching permanent entering), playing lands and casting
  matching spells from the top of the library (`playFromLibraryTop`), the
  `DigForLands` effect, and a "number of matching permanents" amount.
- Next: the Final Fantasy Secret Lairs.

### Store cards built: Vivi, Yuna, A Realm Reborn, Stiltzkin, Snapcaster Mage

- Vivi Ornitier, Yuna, Hope of Spira, A Realm Reborn and Stiltzkin, Moogle
  Merchant are built; Snapcaster Mage gets its first definition
  (`data/store-cards.json`, for Store-only cards no set file defines), each
  with a test.
- Engine: finality counters; GainControl to a targeted player, with "if
  they do" (`if: 'controlChanged'`); "activate only during your turn";
  AddMana limited to some colors (`manaTypes`, shown as the only buttons);
  "other permanents you control have '{T}: Add ...'" (`grantsMana` on
  EachMatching statics).
- Still unbuilt in the Store: Cloud, Midgar Mercenary; Traveling Chocobo;
  Choco, Seeker of Paradise (they need "triggers an additional time" and
  casting from the top of the library). Then the Secret Lairs.

### Store: single Chocobo Track foils, a land bundle; art choices in decks

- Chocobo Track foils are Store-only now (taken out of Collector Boosters),
  sold one at a time: legendary creatures 1,200 shards, the others 800. The
  five Chocobo Track basic lands are one bundle for 500.
- Decks: any basic land printing you own one copy of can be used any number
  of times (pick it per land type, or the default art), and any card you
  own in several printings can switch art from the deck list.
- Next: build the 8 Store cards that aren't built yet (Cloud, Midgar
  Mercenary; Stiltzkin; A Realm Reborn; Traveling Chocobo; Choco; Vivi
  Ornitier; Yuna, Hope of Spira; Snapcaster Mage), then the Secret Lairs.

### S4 group 5: 18 more set cards

- Valkyrie Aerial Unit, Adventurer's Airship, Summon: Choco/Mog, Summon:
  G.F. Ifrit, Magic Damper, Loporrit Scout, Lunatic Pandora, Rook Turret,
  Lion Heart, Tifa Lockhart, Coliseum Behemoth, Locke Cole, Judge Magister
  Gabranth, Ice Flan, Loran of the Third Path, You're Not Alone, Tonberry
  and Tidus, Blitzball Star, each with a test. 81 of 320 set cards built.

### Store tab

- A new **Store** tab, divided by set: Final Fantasy sells every Chocobo
  Track foil printing (25, the Commander basic lands included); Edge of
  Eternities shows as Coming soon. Each item shows its gold shine, how
  many you own, and its price, or "Price coming soon" until the price is
  set in `economy.ts` (`storePrices`). Buying asks first; the server
  charges and adds the card together (`POST /api/store/buy`), recorded as
  `store_purchase` (new migration `20261030120000_store.sql`).
- The first sign-in tour has a Store step.

### Card finishes you can see

- The Collection marks every finish you own on each card (a chip per
  finish with its count, and the card shines in its best finish); the deck
  editor shows each pick's finish name and shine, and the deck list names
  foils. Shines: blue-white for foil, rainbow for surge foil, gold for
  Chocobo Track foil (also in the pack opening now).
- Games: the engine's setup takes each deck card's finish
  (`deckFinishes`), cards keep it (`finish`, public in redaction), and
  the board, hand and inspector show the shine. Only finishes the player
  owns come in (from saved decks, once those can start games).

### Buy 10 packs; cut-out pack images

- The Packs tab has "Buy 10 (+1 free)" for each booster: ten packs' price
  for eleven packs (the bulk bonus), charged and added to the collection in
  one server transaction (`POST /api/packs/open {kind, count: 10}`). The
  packs open one after another (Skip to summary jumps ahead), then one
  summary shows every pack with the NEW cards marked.
- The two pack photos had a white box around them. They're now cut out
  (the white background flood-filled away from the edges, so the packs' own
  white wrappers stay) and saved as transparent PNGs; the shadow follows the
  pack's outline.

### S4 group 4: 24 simple set cards

- Dark Ritual, Counterspell, Lightning Bolt, Dovin's Veto, Eject, Wall of
  Omens, Adventurer's Inn, Hecteyes, Blitzball Shot, Nature's Claim, Balamb
  T-Rexaur, Fight On!, Airship Crash, Dragoon's Wyvern, Magitek Armor,
  Ahriman, Jumbo Cactuar, Sazh's Chocobo, Sabotender, Instant Ramen, Magic
  Pot, Snow Villiers, Combat Tutorial and Auron's Inspiration, each with a
  test in fin-set-cards.test.ts. 63 of 320 set cards are built.
- Engine: the Defender keyword (can't attack, rule 702.3) and a
  `withKeywords` object filter ("creature with flying").

## 2026-10-29

### Cards that aren't built yet can't be used

- User decision: unbuilt cards keep their images everywhere but can't be
  cast or played, creatures and lands included. They're marked "Not built"
  in the Collection, the deck editor and the draft; the deckbuilder and the
  Decks view say how many cards in a deck can't be used. The AI drafter
  leaves them out of its decks.
- This lets a set open for packs and collecting before all its cards are
  built (CLAUDE.md, decisions.md).
- Answered: the draft system so far is local against AI drafters, with one
  game against an AI drafter's deck. Still to build: best-of-3 with
  sideboarding, Swiss pairings and standings (for bots too), online drafts
  run by the server (S3), and drafted cards saved to accounts.

### Transforming into Sagas; a Saga timing fix

- Dion // Bahamut, Jill // Shiva and Jecht // Braska's Final Aeon, each
  with tests. New: the `ExileAndReturn` effect, `moveCard` putting a card
  onto the battlefield transformed, and the Knight token (tfin 10).
- Fixed for every Saga: the state-based check sacrificed a Saga with its
  final lore counter before that chapter's ability was collected, so the
  chapter resolved after the Saga had already left. Now the Saga stays
  until the chapter ability leaves the stack (rule 714.4); a regression
  test is in precon-sagas.test.ts.

### Collection browser

- The Packs tab's Collection now has set tabs (Final Fantasy; Edge of
  Eternities greyed out as Coming soon), All / Owned / Unowned, and sorting
  by collector number, mana value, name, or color in WUBRG order
  (multicolor, colorless, then lands). A "Commander decks" group shows the
  precons' printings, so the free starter precon appears there. Hovering a
  card shows how many of each finish you own.

### Transforming: The Emperor of Palamecia and Exdeath

- The Emperor of Palamecia // The Lord Master of Hell and Exdeath // Neo
  Exdeath, each with tests.
- Engine: a second restricted mana pool, `noncreatureSpellMana` ("spend
  this mana only to cast a noncreature spell"), paid like the
  Equipment-only pool and shown beside it on the board; the AI's mana
  planner knows it. Also `ifSourceCountersAtLeast` on effects, the
  `PermanentCardsInYourGraveyard` count, and `ifCount` intervening-if
  conditions on triggers.
- Next after this group's commit: the collection browser (docs/packs.md).

### Transforming double-faced cards (S4 group 3)

- The engine can transform: a `backFace` on the card data, the
  `Transform` effect, returning a card transformed, and the board showing
  the back image (decisions.md has the rules details).
- First cards: Vincent Valentine // Galian Beast (may transform as he
  attacks; Galian Beast returns tapped, front face up, when it dies) and
  Garland // Chaos (returns from the graveyard transformed; Chaos goes to
  the bottom of its owner's library when it dies), each with tests.
- The card validator now checks back faces like cards.

### S4 group 2: mana spent on spells

- Shantotto (+X/+0 for the mana spent, a card at four or more), Tellah
  (a Hero each spell, two cards at four mana, sacrifice and that much
  damage at eight) and The Prima Vista (becomes a creature for a four-mana
  spell; crew 2), each with a test.
- Engine: spell-cast triggers carry the mana spent (`amount`), read with
  the `subjectManaSpent` amount; an effect can need
  `ifSubjectManaSpentAtLeast`.
- The engine has no transforming double-faced cards yet (rule 712); 27 set
  cards need them, so they're the next big group.

### S4 group 2 (noncreature spells), first seven

- Ultros, Obnoxious Octopus; Cornered by Black Mages; Blazing Bomb;
  Mysidian Elder; Prompto Argentum; Queen Brahne (prowess as a trigger);
  Black Waltz No. 3. All from existing engine features (the "if at least
  four mana was spent" condition, the Wizard token), each with a test.
- Still in this group: Shantotto, Tellah, Vivi Ornitier, The Prima Vista,
  The Emperor of Palamecia, Garland, Kuja and Lindblum (they need "mana
  spent" amounts, transforming or Vehicle animation).

### S4 group 1 done: all ten Job select Equipment

- Ninja's Blades (draw, discard, the damaged player loses life equal to the
  discarded card's mana value), Summoner's Grimoire, Dark Knight's
  Greatsword and Machinist's Arsenal finish the group; every one has a test
  in `packages/bots/test/fin-set-cards.test.ts`.
- Engine: `PutFromHand` can have a chosen enchantment card enter tapped and
  attacking (`enchantmentsEnterAttacking`); activated abilities can be
  limited to once each turn (`oncePerTurn`, tracked per object in
  `activatedTurns`, classified in redact.ts); `equipPayLife` makes an
  "Equip—Pay N life, once each turn" ability.
- Simplification: Summoner's Grimoire's enchantment attacks the player the
  equipped creature attacked (rule 506.3 lets its controller choose).

### S4 group 1: Job select Equipment (first six)

- Built Bard's Bow, Monk's Fist, Paladin's Arms (ward {1}) and Thief's
  Knife (draws when the equipped creature deals combat damage to a
  player), from the existing Job select pattern (Dragoon's Lance).
- Black Mage's Rod and Red Mage's Rapier: whenever you cast a noncreature
  spell, 1 damage to each opponent / +2/+0 until end of turn. Known
  simplification: the Rod's damage comes from the Equipment rather than
  the equipped creature, so that creature's lifelink or deathtouch doesn't
  apply to it.
- With these castable, the AI drafts differently; when a pool has fewer
  than 23 playable spells in its two colors, its deck runs more than 17
  lands (the test now allows that).

### First sign-in tour (E1c, part 2)

- After the free precon pick, a short tour points at the account bar and
  each menu tab (Play, Online, Draft, Packs), one step at a time, with
  Skip, Back and Next. It shows once per account in each browser
  (`nexus.tour.v1.<user id>` in local storage); the account bar's
  **Tour** button replays it.

### Free starter precon (E1c, part 1)

- A new account sees a window offering the four Final Fantasy Commander
  precons. The chosen one is granted once per account (`card_grants` ref
  `starter`, whichever precon): its 100 exact printings go into the
  collection and it's saved as a Commander deck. `GET /api/starter` says
  whether it's still to pick; `POST /api/starter {precon}` grants it, and
  a second claim (any precon) gets 409 and changes nothing.
- The Decks view now knows the precon printings, so the starter deck shows
  with its cards. The Packs tab's binder still lists the main set only.
- Next: the first sign-in guided tour.

### Limited decks are 40 to 60 cards

- Draft and sealed decks must have 40 to 60 cards (user rule, 2026-10-29):
  the engine's `LIMITED` format, the draft deckbuilder (which trims extra
  basic lands, then the last cards added, if time runs out over 60) and
  the saved-deck notes.

### Saved decks (E1b)

- The Packs tab has a **Decks** view: your account's saved decks (Limited
  40+, 60-card, Commander 100), each with a note on what it still needs to
  be legal. The editor builds from the cards in your collection (finish
  shown with ✦), plus any number of basic lands; Commander decks choose a
  legendary creature as commander. Saving goes to `/api/decks`, which
  checks you own the cards.
- Not yet: playing a game with a saved deck (games still use the Starter
  Kits, precons and draft decks), and drafted cards going to the account
  (that needs drafts on the server, S3).

### Packs cost shards and go to your account (E1b)

- The Packs tab's buttons say "Buy and open" with the price (100 Play,
  500 Collector). The server opens the pack, charges the shards and adds
  the cards to your collection together; the account bar updates. Without
  enough shards, nothing changes and the tab says how many you need.
- The Collection binder reads your account's collection, so it's the same
  on every computer. The old browser-only collection and its Reset button
  are gone.
- Opening packs needs the collections migration
  (`20261029120000_collections.sql`) on Supabase, which the GitHub
  integration applies when it's pushed.

### Economy step E1b (server): collections and saved decks

- New migration `supabase/migrations/20261029120000_collections.sql`: a
  `card_grants` record (each opened pack, draft or starter precon adds its
  cards once per reference) and a `decks` table. One function,
  `grant_cards`, adds cards to `owned_cards` and, when there's a price,
  pays the shards in the same transaction.
- Server API (sign-in required): `GET /api/collection`, `GET /api/decks`,
  `POST /api/decks` (new, or changed by id) and `DELETE /api/decks/<id>`.
  The server checks a deck against the player's collection before saving
  it (basic lands are free); legality (size, copies) is checked when a game
  starts, so unfinished decks can be saved. Players see only their own.
- Next: the browser side (collection view, deck list, packs and drafts
  saved to the account).

### Sign-in required; Discord names online; real pack images

- The app requires signing in with Discord: a sign-in page, no guest
  accounts. Online rooms use your Discord name from your sign-in (the server
  checks it with Supabase); the same account can't take both seats.
- The Packs tab shows the real Final Fantasy Play and Collector Booster
  packs (public/packs/ff-*.png, named by set for future sets). The shard
  balance uses the Aether Shard icon (public/icons/aether-shard.png).

### Economy step E1: accounts and Aether Shards balances

- Sign in with Discord (Supabase Auth): the menu's account bar shows your
  name and your Aether Shards. New players get the 1,000-shard welcome
  grant, once.
- The database schema is `supabase/migrations/20261029000000_accounts.sql`
  (profiles, a shard ledger, owned cards and packs). Players can read only
  their own rows; only the game server writes, through one function that
  changes a balance and records it in the ledger together, never below
  zero, and once per reference (so retries never pay twice).
- The server checks each sign-in with Supabase (`GET /api/account`); the
  browser never sends a balance. Settings live in `.env` (git ignores it;
  `.env.example` shows what goes in it). Without them, accounts are off and
  guest play works as before.
- Every economy value is in `packages/server/src/economy.ts`.
- Tests: the welcome grant once (also with retries at once), refused
  sign-ins, ignored client values, ledger references, no negative balances,
  and the bulk-bonus rule.

### Draft step S2b: the deckbuilder and Limited games

- After a draft, **Build your deck**: your 84 picks plus unlimited basic
  lands, at least 40 cards, with a 20-minute timer (5-minute warning; when
  time runs out, basics fill the deck to 40 and it's locked in). Filters by
  color and type, deck columns by mana value, a mana curve, colored-symbol
  counts, **Suggest lands**, **Auto-build**, and a warning for cards that
  can't be cast yet. **Ready**, then play against one of the AI drafters,
  whose deck is built from its own picks (two colors, 23 spells, 17 lands).
- New `LIMITED` format in the engine (40-card minimum, 20 life, 2-4
  players, no copy limit) and `cards/src/limited.ts` (deck checks, land
  suggestions, the AI's deck).
- The draft and your deck are kept in this browser, so you can return to
  them after a game.
- Fixed: the Starter Kit cards have no color identity in their definitions,
  so the draft AI and deck tools now fall back to a card's mana-cost colors
  (`cardColors`).
- Tests: deck rules, land suggestions and the AI's deck; drafted decks play
  Limited games at 2-4 players with every invariant checked.

### Draft step S2a: booster drafts against AI drafters

- New **Draft** tab: you and 1-3 AI drafters each open a Final Fantasy Play
  Booster, choose a card and press **Confirm pick** to lock it in; once all
  have locked in, the packs pass clockwise. Six packs each, 84 cards. Your
  picks are listed by color; cards the engine can't fully play yet are
  marked ("Plays as body only", "Can't be cast yet").
- Drafted packs are real Play Boosters (Wizards' contents, FIN and Through
  the Ages only). The Ragnarok meld result no longer appears in packs.
- Your drafted pool is saved in the browser for the deckbuilder (next step).

### Sealed step S1: the Final Fantasy set imported

- Every Final Fantasy main-set and Through the Ages card now has a
  definition: 320 new cards in `data/fin-set.json`
  (`node packages/cards/scripts/import-sets.ts`), 12 of them fully built on
  import, the rest `notBuilt` (creatures play as their body and keywords).
  Images and Oracle text are cached (`npm run scryfall`).
- The precon importer's card recognizer moved to `scripts/recognize.ts`,
  shared by both importers.
- New `uncastable` flag for costs the engine can't pay yet (K'rrik's
  Phyrexian mana).
- Tests: every set card is defined, K'rrik can't be cast, and random
  sealed-style decks (23 set cards, 17 basics) play 2-4 player games with
  every invariant checked.
- Roadmap and format decisions: [sealed.md](sealed.md).

## 2026-10-28

### Online play in the browser

- New **Online** tab on the menu: enter a guest name and a room code, pick
  a Starter Kit, wait for the other player, then play on the usual board.
  `npm run server` and `npm run dev` together; Vite forwards /ws to the
  server. Steps are in HOW-TO-RUN.txt (section 3).
- `OnlineSession` (client/src/game/online.ts) fills the board's session from
  server updates: the redacted state, the server's legal actions and the
  events. Your seat shows as "You" and the other player by their name.
- Moves go to the server as all-or-nothing batches (tapping lands and casting
  a spell is one change): if any action in a batch is illegal, none apply.
- Checked in the browser with two tabs: lobby, mulligans, lands, casting a
  creature with auto-pay, the opponent responding, hidden draws ("Alice drew
  a card"), and the other player leaving.

### Online play: server and redaction

- New `packages/server`: guest names and room codes, two players, Starter Kit
  decks, the server as the only authority. `npm run server` starts it on
  port 8787. The browser's Online mode comes in the next step.
- `engine/src/redact.ts` builds what each player may see from an allowlist,
  with per-player random card aliases and anonymous placeholders for hidden
  cards. See [decisions.md](decisions.md).
- Tests: joining rooms, a whole game between two scripted WebSocket clients,
  rejected messages (bad JSON or shape, not joined, room full, stale,
  duplicate, out of turn, wrong player, illegal), and hidden information:
  every message in fuzzed 2-4 player games with every Starter Kit and precon
  deck is checked for real card ids and hidden cards' definitions, plus
  targeted tests for foretell, face-down exile, surveil, hideaway, queued
  choices and Summoning Materia. Breaking the redaction on purpose makes them
  fail.

### 128-bit random number generator (before online play)

- The engine's generator is now sfc32 with 128 bits of state, replacing
  mulberry32 (32 bits), whose seed a player could brute-force from their
  opening hand. Still pure and deterministic; replays are unchanged in
  behavior and survive a JSON round trip. See [decisions.md](decisions.md).
- `seedFromBytes` turns 16 bytes from `crypto.randomBytes` into a seed for
  online games. Integer seeds still work for tests and local games, but
  deal different games than before.
- New tests: generator purity, 128-bit seeding, spread of values, and a
  128-bit-seeded game that replays identically through JSON.
- The new random sequences exposed an AI bug: it chose attackers with its
  own check and tried to attack with a creature that had Observed Stasis
  attached. It now uses the engine's `canAttack`; a regression test covers it.

## 2026-10-27

### Packs tab: Collector Boosters

- Collector Boosters open in the Packs tab: 15 cards and a foil token with
  Wizards' slot odds: 3 foil commons, 3 foil uncommons, two Booster Fun
  commons/uncommons, a foil basic, a foil rare, three Booster Fun rares
  (including the Commander set's extended-art and borderless cards, at most
  one foil), a Through the Ages card and a premium foil or surge foil rare
  with a tiny chance of a Traveling Chocobo. Scene Box cards are a foil
  outcome of the premium slot (about 3.8%). See [packs.md](packs.md).
- New binder group: Commander Booster Fun.

### Packs tab: Final Fantasy Play Boosters

- New **Packs** tab on the menu: open Final Fantasy Play Boosters, flip
  through the cards (best at the back, rares face down with a glow), see a
  summary with NEW badges, and browse a collection binder. Collecting only;
  decks are unchanged. See [packs.md](packs.md).
- `npm run scryfall:boosters` saves all 1,263 printings of FIN, FCA, FIC,
  TFIN, AFIN and AFIC (Scene Box art) to `booster-cards.json`; the game
  never calls the Scryfall API.
- Play Booster slots follow Wizards' published odds; Scene Box cards are
  added at small odds of our own. Collector Boosters come next.
- Pulls are saved in the browser's local storage.

### The last precon cards: Yuffie, Sin and Observed Stasis (320/320)

- Yuffie, Materia Hunter: ninjutsu ({1}{R}, return an unblocked attacker
  you control to hand, once blockers are declared): she enters tapped and
  attacking the same player. As she enters, gain control of target
  noncreature artifact for as long as you control her (it returns as soon
  as she leaves or changes control), then you may attach an Equipment you
  control to her.
- Sin, Unending Cataclysm: as it resolves, choose any number of artifacts,
  creatures and enchantments; all their counters are removed and Sin enters
  with twice that many +1/+1 counters. When it dies, its counters go on
  target creature you control and it's shuffled into its owner's library.
- Observed Stasis: Aura with flash for an opponent's creature. It removes
  the creature from combat and draws a card per tapped creature that
  creature's controller controls. The creature loses all abilities (a new
  layer-6 effect) and can't attack or block.
- Added 18 focused checks across 2, 3 and 4 players.
- Progress: **all 320 distinct precon cards built**; every precon deck is
  100/100.

### Copies: Espers to Magicite, Summon: Good King Mog XII, Blue Mage's Cane

- Espers to Magicite exiles each opponent's graveyard, then you may choose
  a creature card exiled this way for a token copy that's only an artifact
  (it loses the creature type, its creature subtypes and its power and
  toughness, and keeps its name, abilities and supertypes).
- Summon: Good King Mog XII (Saga IV): I makes two 1/2 Moogles with
  lifelink; II and III set up a delayed trigger for the turn ("whenever you
  cast a noncreature spell this turn, create a token that's a copy of a
  non-Saga token you control"); IV puts two +1/+1 counters on each other
  Moogle you control.
- Blue Mage's Cane: job select, +0/+2 and Wizard. When the equipped creature
  attacks, up to one instant or sorcery card from the defending player's
  graveyard is exiled and you may cast a copy of it for {3}, at any time
  that turn.
- Engine: real delayed triggered abilities (`delayedTriggers`, rule 603.7)
  that last until the end of the turn and work after their source leaves;
  cast permissions can carry a replacement cost.
- Added 15 focused checks across 2, 3 and 4 players.
- Progress: 317/320 distinct precon cards built; 3 remain.

### Casting exiled cards for free: Strago and Relm, Kefka, Esper Valigarmanda, Fight Rigging

- Strago and Relm: target opponent exiles from the top until an instant,
  sorcery or creature card; you may cast it free this turn. A creature cast
  this way gains haste and is sacrificed as the next end step begins.
- Kefka, Dancing Mad: indestructible during your turn. At your end step a
  random card from each opponent's graveyard is exiled; the spells among them
  can be cast free that turn at any time you have priority (sorceries too),
  and each one's owner loses life equal to its mana value as it's cast.
- Summon: Esper Valigarmanda (Saga IV): I exiles an instant or sorcery card
  from each graveyard (the engine takes the greatest mana value). II-IV add
  {R} per lore counter and allow one of the exiled cards to be cast, paying
  any colored symbol with mana of any type.
- Fight Rigging: hideaway 5 (a private choice; the rest go to the bottom in a
  random order). At beginning of combat on your turn, a +1/+1 counter on
  target creature you control; then with a power 7+ creature you may play the
  hidden card free.
- Engine: cast permissions can now ignore timing, mark a creature for the
  end-step sacrifice, and make the owner lose life; cast groups can allow
  mana of any type; AddMana can add a fixed type; new LoreCountersOnThis count.
- Added 15 focused checks across 2, 3 and 4 players.
- Progress: 314/320 distinct precon cards built; 6 remain.

## 2026-10-24

### Altered Ego

- Built Altered Ego: can't be countered, enters with X +1/+1 counters, and may
  enter as a copy of any creature on the battlefield (any controller). The
  choice is made as the spell resolves (rule 707.5), through a new `copyOnEntry`
  card choice; choosing none enters it as itself (0/0 plus X).
- The copy is applied as it enters, so the copied creature's entry triggers
  and the legend rule apply. Counters, damage, tapped status and other
  non-copiable state are not copied; a copied token's values don't make it a token.
- AI copies the most valuable creature. Browser and terminal show the choice.
- Added 13 focused checks across 2, 3 and 4 players.
- Progress: 310/320 distinct precon cards built; 10 remain. Counter Blitz is
  98/100.

### Gogo, Mysterious Mime and Kimahri, Valiant Guardian

- Built Gogo's optional beginning-of-combat copy, name exception and cleanup
  duration. A successful copy gives both creatures +2/+0, haste, and an
  attack-this-turn requirement. Tapped creatures and attack taxes remain
  subject to normal restrictions; neither player nor AI must pay a tax.
- Built Kimahri's targeted Ronso Rage: add a counter, tap an opponent's
  creature, then optionally copy it permanently while retaining its name,
  vigilance and Ronso Rage. An illegal target stops the entire ability; a
  departed source can still tap a valid target without changing a new object.
- Added shared copiable battlefield definitions. Copying excludes counters,
  damage, attachments, crew and other continuous effects, preserves physical
  ownership, control and commander status, and does not cause entry triggers.
  Temporary copies restore underlying permanent copies at cleanup. Existing
  token-copy spells now copy these values and name/ability exceptions too.
- Copied static, mana, activated and triggered abilities work through the
  engine and AI. Stack abilities retain their captured rules after the source
  changes form or leaves; copied death abilities use last-known definitions.
- Browser and terminal players can accept or decline copies. Battlefield
  art, inspector characteristics/rules, and status show the copied form.
- Fixed creature target filters ignoring controller/other restrictions and
  added target-object snapshots for abilities, including blink responses.
- Existing ward simplification remains: opposing triggered abilities cannot
  target ward permanents (see decisions.md). This is shared engine behavior,
  including Ronso Rage, rather than a new ward implementation.
- Added 66 focused rules, AI, multiplayer and browser checks, including
  phased-out sources and expiration while phased out.
- Validation: type-check, all 1,784 tests across 74 files in a sequential
  full-suite run, and browser production build pass. The existing large-bundle
  warning remains.
- Progress: 309/320 distinct precon cards built; 11 remain. Revival Trance
  is 96/100 and Counter Blitz is 97/100.

Rules reference: [Wizards FINAL FANTASY release notes](https://magic.wizards.com/en/news/feature/final-fantasy-release-notes), Gogo, Mysterious Mime and Kimahri, Valiant Guardian.


### Locke, Treasure Hunter

- Built Locke's blocking restriction against creatures with greater current
  power. Existing blocks remain intact if powers change afterward.
- Mug mills one card from each living player, including its controller, and
  creates exactly one untapped Treasure if any land was milled. The cached
  Treasure printing matches Locke's related-token reference.
- Each trigger grants one shared casting allowance among those exact milled
  card objects. It expires at cleanup, survives Locke leaving or changing
  control, and is spent when a spell is successfully cast, even if countered.
  Moving a card away and back does not restore permission.
- Added explicit casting choices for Mug alongside flashback, Banon, Edgar and other
  permissions. Using another permission preserves Mug. Actual flashback use
  is recorded on the stack item, so casting a card with flashback through Mug
  does not incorrectly exile it. Normal timing, mana, alternative/additional
  costs and ownership apply; X choices now include zero.
- Added 65 focused rules and browser-session checks across two, three and
  four players, covering permissions, counters, card-object identity, costs,
  Adventure casts, Treasure funding and input-state purity.
- Validation: type-check, 1,718 tests across 72 files (broad regression and
  focused follow-ups), and browser production build pass. The large fuzz and
  Commander suites ran sequentially; the final Commander suite also passed
  after the casting-choice update. Existing large-bundle warning remains.
- Progress: 307/320 distinct precon cards built; 13 remain. Revival Trance
  is 95/100.

Rules reference: [Wizards FINAL FANTASY release notes](https://magic.wizards.com/en/news/feature/final-fantasy-release-notes), Locke, Treasure Hunter.


### Eye of Nidhogg and The Warring Triad

- Built Eye of Nidhogg: the enchanted creature becomes a black Dragon with
  base power/toughness 4/2, flying, deathtouch and continuous goad. Other card
  types, their subtypes, supertypes, existing abilities and counters remain.
  Later base setters or subtype additions use their timestamps. Eye returns
  to its owner's hand after leaving the battlefield for a graveyard.
- Added normal Aura spell targets and attached entry. An Aura whose target
  becomes illegal goes directly to its graveyard without entering or firing
  a battlefield-to-graveyard trigger. Existing non-targeted Aura attachment
  during reanimation remains supported.
- Goad now requires eligible creatures to attack while maximizing defender
  requirements, accounts for multiple goaders and vows, and never forces
  payment of an attack tax. Sampled legal actions and AI attacks include
  obligatory attackers, including creatures controlled but not owned.
- Built The Warring Triad: it is a creature only at eight or more cards in
  its controller's graveyard while on the battlefield. Its targeted mana
  ability mills as a cost, uses the stack, and asks its recipient for a color
  on resolution. It cannot be used as an immediate mana ability when paying.
- Losing creature status or leaving the battlefield removes the object from
  combat permanently. An attacker remains blocked after its blocker leaves.
  Entry replacements use the intended controller, and death information is
  captured before the move changes graveyard counts.
- Battlefield P/T and inspector types reflect current creature status;
  goader labels and mana-color choices are exposed through the browser view.
- Added 85 focused rules and browser-session/rendering scenarios across
  two, three and four players. The mulligan fixture explicitly marks its
  test card unbuilt so future card completion does not invalidate that test.
- Validation: type-check, 1,653 tests across 70 files, and browser production
  build pass. The two four-player simulations that timed out concurrently
  passed serial reruns; all Commander game cases also passed again after the
  mana-recipient correction. Existing large-bundle warning remains.
- Progress: 306/320 distinct precon cards built; 14 remain. Revival Trance
  is 94/100 and Scions & Spellcraft is 97/100.

Rules reference: [Wizards FINAL FANTASY release notes](https://magic.wizards.com/en/news/feature/final-fantasy-release-notes), Eye of Nidhogg and The Warring Triad.


### Urianger Augurelt

- Built Draw Arcanum with a private top-card preview and a choice to keep it
  or exile it face down. Exile identities stay private in player views,
  movement animations and hidden-zone events.
- Built Play Arcanum: linked cards may be played until end of turn, with
  spells costing two generic mana less. Normal timing, colored costs, land
  limits, X and additional costs still apply. Links remember source object
  identity across removal, blinking and control changes; resolved permission
  survives the source leaving. New exiles need another activation.
- Life gain triggers separately when its controller plays any land or casts
  any spell from exile, including other exile permissions. Added browser and
  terminal choices, exile notes, narration and AI decisions. AI avoids
  spending the tap on known cards it cannot currently play.
- Added 46 focused scenarios across two, three and four players. All 1,568
  tests across 68 files pass after serial reruns of the two simulation suites
  that timed out during the initial run. Type-check and browser production
  build pass; the existing large-bundle warning remains.
- Progress: 304/320 distinct precon cards built; 16 remain. Scions & Spellcraft
  is 96/100.

Rules reference: [Wizards FINAL FANTASY release notes](https://magic.wizards.com/en/news/feature/final-fantasy-release-notes), Urianger Augurelt.


### Tifa, Martial Artist rules and combat audit

- Checked Tifa against Wizards' FINAL FANTASY release notes. Fixed her grouped
  combat-damage trigger to produce one trigger per damaged player, while
  grouping multiple qualifying creatures hitting the same player in that step.
  Each creature must have power at least seven individually; prevented or
  noncombat damage does not qualify. Tifa can stay home and still trigger.
- Melee now remembers distinct opponents at declaration even when attackers
  leave combat or the opponent concedes. Creatures entering attacking do not
  add to the count. Added an object-identity check so an old melee trigger
  cannot boost a Tifa that left and returned.
- Combat damage snapshots source information before applying simultaneous
  assignments, preserving trigger eligibility when creatures die or buffs
  disappear. First-strike/double-strike damage now has a priority window
  before normal damage. Power is checked anew in each step; Tifa can untap
  between the hits and create multiple extra combats during the first combat.
  Initial striker identities preserve correct eligibility if abilities change.
- Extra combats remain consecutive without an extra main phase. Later-combat
  hits still untap your creatures but add no new phases. Added an explicit
  controller-turn check for first-combat-only effects. The phase track labels
  first-strike damage and selection state resets between damage steps.
- AI spreads safe attacks for melee while preserving lethal-attack and
  defensive priorities. Added 50 Tifa scenarios and 15 separate first-strike
  priority cases across two, three and four players; adapted combat-test
  helpers to finish both steps when testing complete combat damage.
- Type-check, all 1,522 tests in 67 files (two workers, 210 seconds), and
  production build pass. Existing large-bundle warning remains. Card completion
  remains 303/320 distinct precon cards; 17 remain.

Rules reference: [Wizards' FINAL FANTASY release notes](https://magic.wizards.com/en/news/feature/final-fantasy-release-notes), Tifa, Martial Artist.



### AI opening hands and London bottoming

- Basic and random opponents now share a resource-aware opening policy. They
  prefer three or four lands with accessible early plays or a commander plan.
  Two-land hands need multiple affordable early spells or castable mana support
  that enables a follow-up. Color-locked, flooded and very low-land hands are
  redrawn; taking two mulligans no longer forces an automatic keep.
- The existing mana planner checks colors, conditional sources, restricted
  mana and actual land-search targets. Land-search possibilities use the
  known remaining deck composition, deduplicated and sorted independently of
  draw order. Opposing hidden hands and future draw positions do not affect
  the decision. This is a conservative availability heuristic after sources
  untap, rather than a complete turn-by-turn game search.
- London decisions assess the cards that would remain after bottoming. The
  same evaluator selects bottom cards, protecting the land count, cheap plays
  and ramp plan; surplus lands or expensive spells are removed first where
  appropriate. Smaller hands relax the keep requirements to limit card loss,
  and the engine's legal mulligan limit is respected.
- Added 75 scenarios across two, three and four players covering both bots,
  land count, color access, mana rocks, land ramp, conditional/restricted mana,
  available commanders, paid/free mulligans, bottoming and hidden-information
  independence. A 20-seed four-player precon smoke check finished all 80 hands
  legally: 17 kept two lands, 34 kept three and 29 kept four; none kept fewer
  than two. This sample is a regression check, not a guarantee for every seed.
- Type-check, all 1,457 tests in 65 files (two workers, 248 seconds), and
  browser production build pass. Existing large-bundle warning remains.
- Card progress remains 303/320 distinct precon cards built; 17 remain.

## 2026-10-23

### Vehicles, exact printings and table readability

- Built Setzer, Wandering Gambler and The Falcon, Airship Restored. Crew taps
  other creatures with enough total current power as a cost; summoning-sick
  crew is allowed, the Vehicle remains subject to its own summoning sickness,
  and animation ends at cleanup or a zone change. Crew uses the stack and
  countering it does not refund costs. Creature-death triggers retain the
  Vehicle's last battlefield types. Bots crew for combat and avoid repeat loops.
- Added the exact tfic/8 Blackjack token printing from Scryfall. Setzer flips
  seeded, replayable coins for your Vehicle combat damage and creates two
  tapped Treasures on wins. Falcon sacrifices before choosing a graveyard
  target, using a separate reflexive trigger. Its graveyard ability returns
  it tapped and uncrewed; old abilities cannot affect a later card object.
- Audited all 400 cards in the four source decklists: 320 names, 339 exact
  printings. The decklists were correct; name-based artwork selection caused
  33 incorrect assignments across Arcane Signet, Sol Ring, Command Tower and
  basic-land variants. Added 19 alternate artwork records and per-instance
  printing metadata, preserved through shuffle, alternate commanders, zone
  changes, inspection, piles and card-flight animations. Rules IDs are shared.
  The read-only audit can recheck the current source downloads.
- Fixed crowded four-player seats shrinking their contents toward the left:
  fitting now reflows across the full quadrant width before reducing scale.
  Moved command zones into the upper-left corner of their respective seats.
  Life totals share a center row; clicking one opens commander damage grouped
  by original owner, with each commander tracked separately. Public commander
  identities remain available when the card is in a hidden zone, without
  revealing that zone's contents or position.
- Validation: type-check; all 1,382 tests in 64 files (two workers, 246 seconds);
  browser production build; exact-token check; and source-verified printing
  audit all pass. New coverage includes 57 Vehicle scenarios, nine printing
  tests and six client artwork/life-detail tests. The existing bundle-size
  warning remains. Visual browser QA was blocked: the isolated preview could
  not connect to the local test server through either localhost address.
- Progress: 303/320 distinct cards built; 17 remain. Limit Break 99/100,
  Revival Trance 93/100, Counter Blitz 96/100, Scions & Spellcraft 95/100.



### Unfinished Business and linked graveyard returns

- Built Unfinished Business with one mandatory creature target and up to two
  distinct Aura/Equipment targets from your own graveyard. Equipment returns
  unattached if the creature cannot return; illegal Auras remain in the graveyard.
  Entering attachments do not target the returned battlefield creature, so
  shroud/hexproof do not prevent attachment. Equip costs are not paid.
- Linked return effects retain the returned creature object identity. Spells
  snapshot targeted card identities, preventing a card that left and reentered
  its zone from being mistaken for the originally targeted object. Fixed omitted
  optional targets incorrectly keeping an otherwise fully illegal spell alive.
- Added Aura enchant-restriction metadata and shared attachment legality.
  Illegal/unattached Auras go to the graveyard during state-based actions;
  illegal Equipment attachments fall off. Observed Stasis and Eye of Nidhogg
  retain their unbuilt status: this batch adds their enchant restrictions only.
- Added 51 two-, three- and four-player scenarios covering optional/illegal
  targets, vanished targets, zone identity, attachment restrictions, shroud,
  creature Equipment, zero-toughness rescue, entry triggers, bot play and Aura
  state-based actions. Type-check, all 1,310 tests in 60 files (two workers,
  273 seconds), and browser production build pass. No UI interaction changed
  and no interactive browser playtest was performed. Existing bundle-size
  warning remains.
- Progress: 301/320 distinct precon cards built, 19 remaining. Limit Break
  99/100, Revival Trance 91/100, Counter Blitz 96/100, Scions & Spellcraft 95/100.

Rules reference: [Wizards' Wilds of Eldraine release notes](https://magic.wizards.com/en/news/feature/wilds-of-eldraine-release-notes), Unfinished Business.



### Monarch cards, readable targeting and four-player table

- Built Palace Jailer and Coin of Fate with shared monarch rules, combat-damage
  transfer, end-step draw and multiplayer succession. Jailer exile lasts until
  an opponent becomes monarch; Coin pays its exile/sacrifice costs before the
  chosen opponent decides which creature goes to the library bottom.
- Added 60 card/rules scenarios across two, three and four players, including
  countering, departed sources, changed controllers, departed exiled objects,
  commander movement and opponent concession. Bots and browser choices support
  both cards. The monarch badge and sourceless rule abilities are visible.
- Targeting now shows an explicit controller/source → target callout, blue source
  and orange target highlights, and eight recent targeting records. Combat
  attacks/blocks also appear. Playback can be paused/resumed; targeted actions
  and resolutions pause for 3.2 seconds at Normal speed (pace settings scale it).
  Name snapshots remain readable after cards leave play; hand contents are unchanged.
- Type-check and production build pass. Targeting/pacing tests pass (13 cases).
  Full regression: all 1,259 tests in 59 files passed (two workers, 229 seconds). The existing
  large-bundle warning remains. Interactive browser QA could not be completed:
  the in-app browser timed out and the native Chrome window became unavailable.
- Four-player games now use equal quadrants, with You at bottom left. The game
  log is collapsed by default and opens as an overlay. Battlefields and their
  piles scale to available space instead of scrolling. Your hand expands on
  hover/focus and contracts on mouse leave; it overlays your seat rather than
  resizing opponents. Automatic layout is used for your fitted battlefield.
  Browser verification was blocked when computer use could not confidently
  determine Chrome's URL; no visual verification is claimed. All 60 client tests
  passed again after the layout work, as did type-check and production build.
- Progress: 300/320 distinct cards built, 20 remaining. Limit Break 98/100,
  Revival Trance 91/100, Counter Blitz 96/100, Scions & Spellcraft 95/100.



### Path of Ancestry: floating mana and delayed scry

- Built the missing scry rider on Path of Ancestry. It still enters tapped
  and produces only colors in the commander's color identity; no commander
  or a colorless commander grants no mana.
- Each produced mana unit retains its source identity until spent or until
  mana pools empty. A qualifying creature cast creates an independent scry 1
  trigger above the spell. Multiple units create multiple scry 1 triggers.
  The rider survives the land leaving or changing control, and spending it
  on another spell or an activated cost consumes it without a scry.
- Commander types are checked after casting, including current battlefield
  subtype additions. A commander being cast can match itself. Hidden and
  phased-out commanders provide no creature types; either of two visible
  commanders can supply the shared type. Scry is a stack ability and can be
  countered independently of the creature spell.
- Corrected browser, terminal and practice-tip wording to distinguish scry
  (bottom of library) from surveil (graveyard), using the pending choice's
  existing scry indicator. Added narration for the mana rider.
- Added 45 scenarios across two, three and four players. Type-check, all
  1,196 tests in 57 files, and the browser production build passed. Full
  tests ran with two workers (109 seconds). The existing large-bundle warning
  remains. No manual browser playtest was performed.
- The automatic payment planner uses scry-bearing mana first within a type;
  individual floating mana-unit selection remains a documented simplification.

298 of 320 distinct precon cards are built; 22 remain. Limit Break is 98/100,
Revival Trance 89/100, Counter Blitz 96/100, Scions & Spellcraft 95/100.

Rules reference: [Wizards' Commander Masters release notes](https://magic.wizards.com/en/news/feature/commander-masters-release-notes), Path of Ancestry.

### Blitzball Stadium: support X and temporary combat triggers

- Built Blitzball Stadium's entry support X. Targets are chosen when the
  trigger goes on the stack, may include opponents' creatures, must differ,
  and can all be omitted. X zero works, and the captured trigger survives
  the Stadium leaving. Partial target loss preserves remaining legal targets.
- Go for the Goal! costs {3} and a tap, targets any creature, and grants
  unblockability plus its own combat-damage-to-player draw trigger until
  cleanup. The creature's controller draws, not the Stadium's controller.
- The shared engine can grant self combat-damage-to-player triggers for a
  turn and capture their specifications independently of the printed card.
  Each grant triggers separately. Noncombat damage does not trigger it.
- Draw counts distinct counter kinds at resolution, rather than the number
  of counters. Last known counter information survives the source leaving
  and returning as a new object, including lethal combat damage before
  triggers are placed. The draw ability uses the stack and can be countered.
- Browser and terminal narration describe the granted ability and support X;
  the existing target picker and X-cost controls handle the card.
- Added 36 scenarios across two, three and four players. Type-check and all
  1,151 tests in 56 files passed, including full-game fuzz regressions. The
  full suite completed with two workers (268 seconds); the initial default
  concurrency run was interrupted while producing no results. Production
  browser build passed with its existing large-bundle warning. No manual
  browser playtest was performed for this engine-focused step.

297 of 320 distinct precon cards are built; 23 remain. Limit Break is 97/100,
Revival Trance 88/100, Counter Blitz 95/100, Scions & Spellcraft 94/100.

Support rules reference: [Wizards' Oath of the Gatewatch release notes](https://magic.wizards.com/en/news/feature/oath-gatewatch-release-notes-2016-01-13). Card text is cached in `packages/cards/data/scryfall.json`.

### Browser-only application direction

- Confirmed the graphical application stays in `packages/client`, using the
  TypeScript engine through its existing JSON view/action boundary.
- Removed the proposed Godot migration from the README, project guidance,
  design decisions, historical browser note, and session comment.
- The untracked local `client-godot/` contains generated `.godot` data only.
  Its removal was requested, but automated deletion was blocked by execution
  policy; the folder still requires manual removal. Other local caches remain.
- No game behavior or card implementation changed. The latest card checkpoint
  remains 296 of 320 distinct precon cards built, with 24 remaining.
- Validation: `git diff --check` passed and a search of the tracked project
  guidance and session comment found no remaining Godot migration references.

### Adventure batch, larger battlefield cards, and readable AI turns

- Completed Hypnotic Sprite // Mesmeric Glare, Murderous Rider // Swift End,
  and Hildibrand Manderville // Gentleman's Rise together using a shared
  Adventure system. Each half has its own cost, timing, effects, and stack
  characteristics. Outside the stack, these remain creature cards.
- A successfully resolving Adventure exiles itself and permits its controller
  to cast the creature later. Countered or entirely illegal-target Adventures
  grant no such permission. Exile casts still require normal creature timing.
- Murderous Rider retains lifelink and returns to its owner's library bottom
  on death. Hildibrand buffs creature tokens and grants an Adventure-only
  graveyard cast through its controller's next turn, with object identity and
  cleanup expiration checks. Added its exact tfic/6 Zombie token.
- Cached Oracle text now includes both Adventure halves; the Scryfall refresh
  preserves this text. Mesmeric Glare respects stack mana value, including X.
  Swift End handles indestructible and illegal targets. Planeswalkers remain
  outside the engine's supported card types; no precon contains one.
- Enlarged battlefield cards to 112px on taller desktops, 94px on shorter
  desktops, with 80–92px opponent cards in pods. Hand card sizes are unchanged.
  Enlarged lands as well. Player zones share vertical space, wrap, and scroll;
  creature rows cannot shrink over lands. Opponent piles stay in a compact column.
- AI presentation now pauses about 1.8 seconds for spells, abilities, and
  resolutions, 1.6 seconds for combat, with shorter mana/land/draw pauses.
  Automatic passes that resolve spells or deal damage also render before
  continuing. Settings offers Normal, Slow, and Fast. Rules and priority
  decisions stay in the engine; presentation timers stay in the browser.
- Added 76 Adventure scenarios across 2/3/4 players, plus 10 pacing regressions.
  The full engine/data/client suite passed 1,105 tests before the pacing change;
  final client, card-data, and Adventure checks and production build were rerun.
  Browser playtested Adventure-to-creature casts, token buffs, four-player
  crowding, and the AI speed selector with no console errors.

296 of 320 distinct precon cards are built; 24 remain. Limit Break is 97/100,
Revival Trance 88/100, Counter Blitz 94/100, and Scions & Spellcraft 94/100.

Rules references: [Adventure and Eldraine release notes](https://magic.wizards.com/en/news/feature/throne-eldraine-release-notes-2019-09-20),
[Final Fantasy release notes](https://magic.wizards.com/en/news/feature/final-fantasy-release-notes).

### Sephiroth, Fallen Hero: cell counters and temporary base stats

- Built Jenova Cells: choose its creature target as the attack trigger goes on
  the stack, then separately choose whether to put a cell counter on it during
  resolution. Declining the counter still applies the remaining effect. An
  illegal sole target prevents the entire ability from resolving.
- Modified creatures you control when the effect resolves get base 7/5 until
  end of turn. It includes a creature just given a cell counter. The affected
  group is fixed: later modifications do not add creatures, and losing a
  modification does not remove the effect. Cell counters persist through
  cleanup and have no inherent power/toughness bonus.
- Added timestamp ordering for base-setting effects (layer 7b). Sephiroth
  overwrites an older Wrecking Ball Arm setting; attaching the Arm later can
  overwrite Sephiroth. Equipping it to the same creature does not reset its
  timestamp. Equipment bonuses, other additive effects and +1/+1 counters
  apply afterwards. Effects disappear when their affected creature changes zones.
- Modified checks now distinguish Equipment from Auras. Any Equipment or kind
  of counter qualifies; an attached Aura qualifies only if the creature's
  controller controls it. This prepares the filter for future Aura cards; it
  does not mark those unbuilt cards implemented.
- Built The Reunion from the graveyard at instant speed: pay {3} and sacrifice
  a modified creature you control as costs, then return Sephiroth tapped.
  Countering the ability does not refund costs. Activated abilities capture
  their source object identity, so exiling and returning the card to the
  graveyard in response cannot make the old ability return the new object.
- Browser and terminal counter prompts name cell counters and allow choosing
  none. AI can use Reunion and evaluate its sacrifice; optional cell counters
  on opponents' creatures can be declined. Generic counter badges and token
  separation already recognize the new counter kind.
- Sixty-six scenarios cover 2, 3 and 4 players, optional counters and targeting,
  counter persistence, additive stats, base-setting timestamps, affected groups,
  zones and identity, instant timing, sacrifice costs, counters and AI choices.
- Validation passed: type-check, all 1,029 tests in 53 files, and production
  build. The existing Vite large-bundle warning remains. Twelve Commander fuzz
  games (seeds 379-390) finished with no invariant failures or action-limit
  timeouts. Follow-up card/copy/token and data-validation checks also passed.
- Browser playtest: selected a Soldier as the attack-trigger target, passed
  priority, then chose and confirmed the cell counter. It became 7/5; a second
  Soldier with a +1/+1 counter and Behemoth Sledge became 10/8. No browser
  warnings/errors. Screenshot saved in this chat's outputs; temporary QA sources
  removed before the production build.
- Rules checked against [Wizards' FINAL FANTASY release notes](https://magic.wizards.com/en/news/feature/final-fantasy-release-notes),
  Sephiroth and Red XIII: base-setting effects precede additive modifiers,
  and Equipment/counter/Aura control determine whether a creature is modified.

293 of 320 distinct precon cards are built; 27 remain. Limit Break is 97/100,
Revival Trance 88/100, Counter Blitz 94/100, Scions & Spellcraft 91/100.
Continue after the user's push/proceed checkpoint.

### Sublime Epiphany: five modes and individual ability targets

- Built all five modes: counter a spell, counter an activated/triggered ability,
  return a nonland permanent, copy your creature, and have a target player draw.
  Choose any nonempty subset once each for {4}{U}{U}. Effects run in printed
  order. Losing one target does not cancel the remaining legal modes; losing
  every target prevents resolution. Uncounterable spells remain on the stack.
- Added ability targets identified by their stack item, independently of the
  source permanent or its zone. Countering one removes only that ability:
  costs remain paid, its source remains where it is, and another ability from
  the same source still resolves. Mana abilities are unavailable as targets
  because they do not use the stack. Legal actions, AI scoring, narration and
  the browser target picker understand the new target kind.
- Stack abilities highlight as legal targets and can be selected by mouse,
  Enter or Space. Multimode spells now offer individual checkboxes and a
  confirmation button instead of listing every combination. Modes without
  available targets are disabled; confirmation requires a legal combination.
  Chosen spell modes remain visible on the scrollable stack during responses.
- Shared mana planning now caches equal costs, Equipment restrictions and
  excluded payment creatures within a single unchanged decision. Target scores
  and equivalent convoke/improvise payment choices are reused across mode/target
  combinations. Escalate-only creature scans are skipped for ordinary casts.
  Caches are recreated for each new decision.
- Forty-two scenarios cover 2, 3 and 4 players, all 31 mode combinations in
  each player count through both engine and human play enumeration, exact costs,
  target restrictions, printed order, copied creature entry triggers, partial/all invalidation, uncounterable spells,
  activated and triggered abilities, same-source ability identity, and AI.
- Full-game regression cases report each bot/player-count combination separately,
  preserving the two-minute budget per game, 30,000-action bound and invariant
  checks. The seeded four-player AI and random games finish without rule errors.
- Validation passed: type-check, all 963 tests in 52 files, and production
  build. The existing Vite large-bundle warning remains. Thirty Commander fuzz
  games (seeds 349-378) completed with no invariant failures or action-limit
  timeouts.
- Browser playtest: selected counter-spell, counter-ability and draw modes;
  targeted Ultimate Magic: Holy, Mind Stone's draw ability and yourself.
  Passing priority countered both stack objects and drew Island. Mind Stone's
  sacrifice cost stayed paid. The real board showed an empty stack and the
  drawn card. No browser warnings/errors. Mode picker and resolution screenshots
  are in this chat's outputs; temporary QA sources removed before the build.
- Rules checked against [Wizards' release notes for Sublime Epiphany](https://magic.wizards.com/en/news/feature/reality-fracture-release-notes):
  distinct modes, printed order, independent remaining targets and only
  activated/triggered abilities already on the stack (excluding mana abilities).

292 of 320 distinct precon cards are built; 28 remain. Limit Break is 96/100,
Revival Trance 88/100, Counter Blitz 94/100, Scions & Spellcraft 91/100.
Continue after the user's push/proceed checkpoint.

### Interceptor, Shadow's Hound: returning tapped and attacking

- Built Interceptor's printed menace, its menace grant to Assassins you control,
  and its graveyard trigger. Attacking with one or more legendary creatures
  produces one trigger, and returning the Hound requires paying {2}{B} on
  resolution. Other players' attacks and copies outside the graveyard do not
  trigger it. Leaving and reentering the graveyard makes it a new object that
  the original trigger cannot return.
- Added a non-target defending-player choice during resolution in multiplayer
  games. The Hound enters tapped and attacking the chosen opponent; another
  opponent may be chosen even if no original attacker attacks them. The choice
  yields no priority window. A conceded defender is removed from the options.
  Browser controls, terminal controls, legal actions and bots support it.
- Entering attacking emits its own event rather than AttackDeclared: it does
  not retrigger attack-declaration abilities or pay attack-declaration taxes.
  The chosen player can block normally, including Interceptor's menace
  requirement, and an unblocked Hound deals its four combat damage.
- Separated subtype additions (layer 4) from ability/stat evaluation so a static
  ability can safely filter by creature type. This includes granted types:
  Reaper's Scythe makes its equipped creature an Assassin before Interceptor
  checks whether that creature receives menace. Phasing, detachment and source
  removal update the bonus immediately.
- Fifty-one scenarios cover 2, 3 and 4 players, costs, optional payment, source
  zones and identity, original attacker removal, menace, damage, Propaganda,
  granted creature types, defender selection, invalid choices and concessions.
- Validation passed: type-check, all 918 tests in 51 files, and the production
  build. The existing Vite large-bundle warning remains. Thirty Commander fuzz
  games (seeds 319-348) completed with no invariant failures or action-limit
  timeouts.
- Browser playtest used the real Game UI in a prepared three-player position:
  Bugenhagen attacked Bot1; selected Attack Bot2 for Interceptor; passed priority
  through both defending players' blocker decisions. Bot1 lost one life, Bot2
  lost four, and the Hound appeared tapped with its Bot2 attack marker. No
  browser warnings/errors. Screenshots saved in this chat's outputs; temporary
  QA sources removed before the production build.
- Rules checked against [Wizards' FINAL FANTASY release notes](https://magic.wizards.com/en/news/feature/final-fantasy-release-notes),
  Interceptor: choose what it attacks as it returns; entering attacking does
  not trigger abilities that require declaring an attacker. The current engine
  supports attacking players; planeswalker/battle combat remains outside its
  supported card types, as before.

291 of 320 distinct precon cards are built; 29 remain. Limit Break is 96/100,
Revival Trance 88/100, Counter Blitz 94/100, Scions & Spellcraft 90/100.
Continue after the user's push/proceed checkpoint.

### Summoning Materia: library casting and granted mana

- Built Summoning Materia: equip {2}, +2/+2 and vigilance for the equipped
  creature, and its separate tap ability for one green mana. The granted
  ability belongs to the creature and respects summoning sickness/haste. It
  does not inherit the creature's printed mana amount, delayed counter effect,
  or other mana extras. Mana menus distinguish a granted ability by its source.
- Its controller can privately look at the top card of their library at any
  time, including while unattached or without priority. While attached to a
  creature, it also permits casting creature spells from that top position.
  Normal costs and timing remain; artifact creatures, flash and X costs work.
  Noncreatures, lands, lower library cards and hand-only abilities are excluded.
- Added library casting to spell enumeration and spell provenance, and granted
  mana choices to the engine, shared auto-tapper/AI and browser payment flow.
  The same creature cannot be counted twice through multiple Equipment or its
  own mana abilities. Control, source removal, detachment and phasing are checked.
- Views expose only the owner's current permitted top card; opponents and
  spectators receive neither that card nor a top-card identity. The browser
  labels the preview Top of library, even when it cannot be cast. It is not
  counted as part of the hand. The next top appears after the atomic action
  finishes; casting/payment does not expose an intermediate top card.
- Forty-five scenarios cover 2, 3 and 4 players, equip and vigilance, visibility,
  costs/timing, mana, source/control changes, haste, phasing, bots, and library
  creature casting. Type-check, all 867 tests in 50 files, and production build
  passed. Existing Vite large-bundle warning remains. Thirty Commander fuzz games
  (289-318) finished with no invariant failures or action-limit timeouts.
- Browser playtest: saw Bugenhagen on top, selected it, tapped the equipped 3/3
  Soldier for green to finish payment, passed priority and resolved Bugenhagen.
  The next Island appeared in the library preview; hand remained empty. No
  browser console errors. Temporary QA sources were removed and a preview saved
  with this chat's outputs.
- Rules checked against [Wizards' FINAL FANTASY release notes](https://magic.wizards.com/en/news/feature/final-fantasy-release-notes),
  Summoning Materia: private access without priority, normal costs/timing, and
  waiting until a cast or activation finishes before inspecting a changed top.

290 of 320 distinct precon cards are built; 30 remain. Limit Break is 96/100,
Revival Trance 87/100, Counter Blitz 94/100, Scions & Spellcraft 90/100.
Continue after the user's push/proceed checkpoint.

### Reported hand-size bug: discard during cleanup

- Fixed the missing maximum-hand-size rule. A player may draw above seven
  during a turn, then must choose exactly the excess cards to discard during
  their own cleanup. No automatic truncation or opponent-turn discard. Thought
  Vessel now removes its controller's maximum while it is on the battlefield;
  tapping it does not disable the ability, but phasing out or leaving does.
- Cleanup discards are a turn-based action, with no response window. Damage
  removal and end-of-turn effects then finish together, including damage on
  phased-out permanents. State-based actions/triggers can give cleanup priority;
  another cleanup begins after everyone passes with an empty stack. Tested a
  Walking Ballista dying as its temporary toughness ends, Morbid Opportunist
  drawing an eighth card, and a second cleanup requiring one more discard.
- Reused the card-selection controls for explicit player choices and AI/terminal
  discards. Opponents see the count to discard without candidate hand identities.
  The hand counter shows count/limit (or infinity), with a cleanup tooltip.
  Selected hand cards say Discard, Chosen or Bottom according to the decision.
- Narrow screens now place the player header above a horizontal hand strip.
  Selecting from eleven cards no longer scrolls the entire table sideways.
- Thirty-six focused scenarios passed across 2, 3 and 4 players. Full check:
  type-check, all 822 tests in 49 files, and production build passed. The
  existing Vite large-bundle warning remains. Thirty Commander fuzz games
  (259-288) finished with no invariant failures or action-limit timeouts.
- Browser playtest: eleven cards prompted four discards; selecting four and
  confirming left seven in hand and four in the graveyard, then advanced the
  turn. Correct Discard badges and 7/7 display verified. No console errors.
  Temporary QA sources were removed; a result preview is in this chat's outputs.
- Rules checked against [Wizards' September 25, 2026 Comprehensive Rules](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt),
  402.2 and 514.1-514.3a. Removed the obsolete cleanup/hand-size backlog entries.

This checkpoint prioritizes the reported playtest bug. Card progress remains
289/320 complete, with 31 still to build after the next push/proceed checkpoint.

### Relic of Legends: mana costs that tap another creature

- Built both Relic of Legends abilities. Its ordinary tap ability makes one
  mana of any color. The separate ability taps an untapped legendary creature
  you control, makes one mana immediately, and does not use the stack or target
  that creature. The Relic can already be tapped; summoning sickness does not
  prevent the creature from paying this cost.
- Added an explicit creature payment to mana actions and a shared candidate
  check. Legendary creatures must be untapped, controlled, on the battlefield,
  and phased in. Ownership does not matter; phased-out mana sources are also
  excluded from ordinary mana menus and the auto-tapper.
- Shared AI/browser/terminal payment planning supports Relic payments, including
  paying a filter land first. Multiple Relics or a creature's own mana ability
  cannot spend the same creature twice. Creatures reserved for convoke,
  improvise, or escalation are excluded from automatic mana payments.
- Browser controls choose the creature first, then its mana color. Spent
  creatures disappear from the choices. Choice menus use a responsive grid;
  fixed the narrow-screen flex wrapping that pushed choices out of the prompt.
  The summoning-sickness tooltip now refers to tap/untap-symbol abilities,
  rather than saying the creature cannot be tapped at all.
- Forty-eight scenarios cover 2, 3 and 4 players. Final type-check, all 786
  tests in 48 files, and production build passed. The existing Vite large-bundle
  warning remains. Sixty Commander fuzz games (199-258) passed without invariant
  failures or action-limit timeouts; the final thirty followed the convoke fix.
- Browser playtest: a tapped Relic tapped summoning-sick Tifa for blue, removed
  her from the menu, then tapped Bugenhagen for red. No console errors. At the
  actual 319px viewport all five color buttons and Cancel fit within the screen.
  The desktop viewport override did not change the host's actual narrow view,
  so this playtest does not claim desktop-width visual verification. Override
  was reset and temporary QA sources removed. A chooser preview is in this
  chat's outputs.
- Rules checked against [Wizards' Dominaria United release notes](https://magic.wizards.com/en/news/feature/dominaria-united-release-notes-2022-08-26),
  Relic of Legends rulings, including using a newly controlled creature.

289 of 320 distinct precon cards are built; 31 remain. Limit Break is 95/100,
Revival Trance 87/100, Counter Blitz 94/100, Scions & Spellcraft 90/100.
Continue after the user's push/proceed checkpoint.

### Coveted Jewel: unblocked attackers and control changes

- Built Coveted Jewel's entry draw, tap for three mana of one chosen color,
  and unblocked-attacker trigger. The trigger waits until blockers have been
  declared, uses the stack before damage, and fires once for the attacking
  player even if several creatures are unblocked. Blocked attackers do not
  qualify, including ones that can trample through later.
- Resolution draws three for the captured attacking player, gives that player
  control of the Jewel, and untaps it. Changing control does not cause another
  entry trigger. Source removal does not stop the draw; a Jewel that leaves
  and returns is a new object and is neither stolen nor untapped by the old
  trigger. The attacking player's identity survives its creature leaving.
- Fixed mana-action enumeration and the shared auto-tapper to find controlled
  permanents across all owners' battlefield lists. The new controller can use
  acquired mana rocks immediately; their former controller cannot. Mana menus
  show the actual amount, such as {U}{U}{U} for the Jewel.
- Thirty-nine focused scenarios cover 2, 3 and 4 players. Full validation:
  type-check, all 738 tests in 47 files, and thirty Commander fuzz games
  (169-198) passed with no invariant failures or action-limit timeouts.
  Production build passed; the existing Vite large-bundle warning remains.
- Browser playtest: passed priority to resolve the trigger, saw three cards
  drawn and the Jewel change sides, then tapped it for three blue mana before
  damage. No browser console errors. Temporary QA sources were removed.
- Rules reference: [Wizards' Commander 2018 release notes](https://magic.wizards.com/en/news/feature/commander-2018-edition-release-notes-2018-07-27),
  Coveted Jewel rulings; Comprehensive Rules 509.3g (September 25, 2026).
  Current games are free-for-all with one active attacker controller;
  simultaneous-trigger ordering remains in the general rules backlog.

288 of 320 distinct precon cards are built; 32 remain. Limit Break is 95/100,
Revival Trance 87/100, Counter Blitz 94/100, Scions & Spellcraft 89/100.

### User-requested combat damage and token displays

Validation: type-check, all 699 tests, and production build passed. The existing
Vite large-bundle warning remains. Thirty Commander fuzz games passed (139-168).

- Normal creatures with marked damage show their remaining damage capacity in
  red with a "left" label; a separate badge shows damage marked. This changes
  the display, not actual toughness or lethal-damage calculations. The inspector
  now shows current actual power/toughness, including counters and effects,
  and explains marked damage. Indestructible creatures keep their actual P/T
  display and still show marked damage; indestructible is not damage prevention.
- The display uses damage actually recorded by the engine, so shield prevention
  or damage converted to counters does not reduce it. The red state lasts until
  damage is removed, normally cleanup. References checked: Comprehensive Rules
  120.3e, 120.6, 514.2 and 702.12b (September 25, 2026).
- Tokens: six or more identical plain tokens share a display card with a count
  at its upper right. Five or fewer remain individual. Modified tokens, tokens
  with keywords/abilities, counters, damage, attachments, combat roles, active
  continuous effects, or different readiness/ownership stay separate.
- Every token retains its engine ID. Click or keyboard-activate a stack to
  expand its members; "Stack tokens" groups eligible members again. Stacks
  unfold automatically for targeting, payments, and combat choices. Manually
  positioned tokens are preserved individually.
- Eighteen grouping scenarios cover 2, 3 and 4 players, the exact threshold,
  modified tokens, printed keywords/abilities, ownership/readiness, and the
  preservation of all individual engine objects and creature counts.
- Browser playtest: a 4/4 with 2 damage displayed 4/2 left; an indestructible
  4/4 with 7 marked retained 4/4; shield-prevented damage left a 2/2 unchanged.
  Cleanup restored the ordinary display and removed damage badges. A stack of
  eight Soldiers expanded, regrouped, unfolded during Program's recipient
  choice, and regrouped the remaining six after two gained counters. The token
  with a counter and the token granted flying stayed separate throughout.
- Temporary QA entries were removed after testing. Saved previews are in this
  chat's outputs. Browser logs only retained the earlier temporary QA file's
  hot-reload teardown error, with no new application runtime errors.

### Modal combat trigger: SOLDIER Military Program

- Built SOLDIER Military Program: choose one mode as its beginning-of-combat
  trigger goes on the stack, or choose both when you control a commander on
  the battlefield. A commander in the command zone does not qualify; an
  opponent's commander you control does. The selected modes remain fixed if
  the source or commander leaves before resolution, and resolve in printed order.
- Its counter mode chooses zero, one or two distinct Soldiers on resolution.
  It does not target. The Soldier token made by the first mode can be chosen;
  Cloud is a Soldier too. Hardened Scales applies once per recipient.
- Added modal-trigger decisions to the engine, browser, legal-action list,
  AI and terminal client. Selected modes are public on the stack. Illegal
  modes with unavailable mandatory targets are omitted; if no mode is legal,
  the trigger is removed. Concession repairs the pending decision.
- Thirty-three scenarios cover 2, 3 and 4 players, mode validation, response
  windows, controller/zone conditions, optional recipients, shroud, Scales,
  extra combats, source removal, legal modes, bots and public views.
- Checked Comprehensive Rules 603.3c and 700.2 against Wizards' September 25,
  2026 rules: modes are announced on placement and duplicates are not allowed.
- Browser playtest used a temporary prepared Commander position and the real
  board/session/engine. Selected both modes, then selected the new Soldier and
  Cloud: the board showed 2/2 and 5/5 respectively, each with one counter.
  No browser errors were reported. The QA entry files were removed afterwards.
  A screenshot is saved with this chat's outputs. Ordinary viewport capture
  timed out; full-page capture succeeded.

287 of 320 distinct precon cards are built; 33 remain. Limit Break is 95/100;
Revival Trance 87/100, Counter Blitz 94/100, Scions & Spellcraft 88/100.
Thirty Commander fuzz games (seeds 139-168) finished with zero invariant failures
or action-limit timeouts. The Starter Kit and tutorial remain in the full checks.
Continue with the remaining cards after the user's push/proceed checkpoint.

### Priority controls and the next card checkpoint

- Full control now pauses whenever you receive priority, even with no playable
  cards or while your own spell is on the stack. Previously the empty-play-list
  condition auto-passed before the full-control setting could take effect.
- Turn-track buttons toggle persistent priority stops for this game, on any
  player's turn; diamonds mark selected stops. They never jump to a step or
  skip another player's priority. Turn-based actions happen before the pause.
- The track distinguishes the active turn from the priority owner or decision
  maker. Main-phase and stack buttons now say "Pass priority" and explain
  consecutive passes; they no longer promise to end the turn or resolve a spell
  immediately. Tutorial tips use the same wording. Non-main steps no longer
  suggest that a land can be played there.
- Reference checked: Comprehensive Rules 117.3a-d and 117.4 (September 25, 2026),
  https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt.
- Browser review: four-player Commander, upkeep/draw stops, full-control toggle,
  passing priority, settings and the priority owner at 1280x800 and 390x844.
  The narrow prompt wraps above its buttons. No browser console errors were
  reported. Four-player opponent panels remain cramped on phones and need a
  separate layout pass; this change improves the priority controls.
- Validation: type-check, all 648 tests, and production build passed. Vite still reports its existing large JavaScript bundle warning.
- Eighteen new session scenarios cover 2, 3 and 4 players: no-play pauses,
  both players' turns, stop removal, normal auto-passing, drawing before priority,
  each opponent's response window, and responding to your own spell.
- After this commit's push/proceed checkpoint, return to the remaining precon
  cards. Progress is still 286/320 built, 34 remaining. The frontend and known
  engine-rules backlog does not replace card completion.
- The user requested current purchased credits, remaining usage allowance and
  available reset credits after every commit; query them fresh rather than
  storing account balances in the repository.

### Arcane frontend foundation and commander artwork

- Added Poly Haven's CC0 Rock 01 diffuse texture locally (1K, 688,083 bytes),
  with source, download URL, and license recorded in
  `packages/client/public/textures/README.md`. No runtime texture-host dependency.
- Applied dark stone, blue crystal light, gold borders, and serif menu headings;
  rules text and numbers retain the readable interface font. Added keyboard
  focus outlines and a narrow-screen commander grid.
- Removed forced 16:9 cropping from deck and commander artwork. Images retain
  their natural ratio and cannot shrink inside flex layouts. Scoped commander
  image rules to the direct artwork child so mana symbols stay 12 by 12 pixels.
- Exposed commander selection with aria-pressed. No gameplay rules changed.
- Browser review: desktop and 390px-wide commander picker; all eight commanders'
  loaded artwork measured 182 by 133px against 626 by 457px source artwork on
  desktop (rounding only). At narrow width, Cloud/Tifa measured 163 by 119px.
  Started a Commander game with Tifa, kept a hand, played Mountain, checked
  settings and returned to the menu. No browser console errors were reported.
- Validation: type-check, all 630 tests, and production build passed. Vite still
  reports its existing large JavaScript bundle warning. The broader controls,
  animation, and MTG rules backlog remains in `frontend-roadmap.md`.

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
(`packages/client`) is in progress on the `browser-client` branch. See
[decisions.md](decisions.md).

### Done: K1 triggered abilities

Triggered abilities, target choices and "you may" decisions, plus Al Bhed
Salvagers, G'raha Tia, Shambling Cie'th and Ultimecia, Temporal Threat. On
the `k1-triggered-abilities` branch, not yet merged to `main`.
