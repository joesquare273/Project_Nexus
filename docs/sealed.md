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
| S4 | **Build the set's cards** in shared-mechanic groups, like the precons, until all of them work. | 166 of 320 imported cards built. Group 17 (Chocobo Birds, 5: Gysahl Greens, Call the Mountain Chocobo, Choco-Comet, Chocobo Racetrack, Summon: Fat Chocobo; the green 2/2 Bird token tfin 17 with its landfall +1/+0, `chocobo-bird-token`) done; Chocobo Kick (a land as its kicker) and Sidequest: Raise a Chocobo (transforms with four Birds) come later. Group 16 (Tiered spells, 6: Ice Magic, Fire Magic, Thunder Magic, Restoration Magic, Tifa's Limit Break, Vincent's Limit Break; new engine pieces: `multiplyPT` on ModifyPT for doubling and tripling, the `ShuffleIntoLibrary` effect, and the `returnToBattlefieldTappedIfDies` flag) done. Group 15 (costs less for each, 5: Travel the Overworld, Diamond Weapon, Bartz and Boko, Qiqirn Merchant, Ancient Copper Dragon) done. Group 14 (the Crystals, 4: The Fire, Water, Earth and Darkness Crystals; The Wind Crystal came with group 9) done. Group 13 (attacking alone and more, 5: Seifer Almasy, Squall, Kenrith, Mangara, Akroma's Will) done. Group 12 (impulse draw and more, 6: Haste Magic, Opera Love Song, Light Up the Stage, Rydia's Return, Cactuar, Demon Wall) done. Group 11 (lands and mana, 7: Capital City, Starting Town, Command Beacon, Chromatic Lantern, Azusa, The Gold Saucer, Eden) done. Group 10 (look at the top cards and more, 6: Commune with Beavers, Ashe, Gilgamesh, Light of Judgment, Fatal Push, Edgar) done. Group 9 (whenever you gain life and more, 8: Aerith Gainsborough, Minwu, Excalibur II, Hope Estheim, The Wind Crystal, Poison the Waters, Gaius van Baelsar, World Map) done. Group 8 (flashback spells and triggers, 7: Resentful Revelation, Sorceress's Schemes, Nibelheim Aflame, From Father to Son, Sandworm, Malboro, Dark Confidant) done. Group 7 (sacrifice as a cost and token modes, 8: Deadly Dispute, Diabolic Intent, Vayne's Treachery, Louisoix's Sacrifice, Namazu Trader, Moogle's Valor, Battle Menu, Aerith Rescue Mission) done; Fang and Vanille with meld (2026-11-02) (plus Snapcaster Mage, a Store-only card, in store-cards.json). Group 6 ("as long as you control N or more" and simple triggers, 9: Gaelicat, Gigantoad, Scorpion Sentinel, Magitek Infantry, Gran Pulse Ochu, Sram, Primeval Titan, Captain Lannery Storm, Ring of the Lucii) done. Group 4 (simple spells and enters-the-battlefield cards, 24) and group 5 (18 more: enters, attacks, chapters) done. Group 3 (transforming double-faced cards) started: Vincent Valentine, Garland, The Emperor of Palamecia, Exdeath, Dion, Jill, Jecht. Group 1 (Job select Equipment, 10 cards) done; group 2 (noncreature spells) in progress: Ultros, Cornered by Black Mages, Blazing Bomb, Mysidian Elder, Prompto Argentum, Queen Brahne, Black Waltz No. 3, Shantotto, Tellah, The Prima Vista; left: Vivi Ornitier (X mana in two colors) and the double-faced Emperor of Palamecia, Garland, Kuja and Lindblum, which wait for transforming double-faced cards (27 set cards need them); tests in `packages/bots/test/fin-set-cards.test.ts`. |

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
