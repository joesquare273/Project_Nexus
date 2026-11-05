# Aether Shards: the in-game economy (plan)

An earnable virtual currency for booster packs and events. No real money and
no paid currency. Agreed with the user on 2026-10-29. E1 (accounts) is built.

## Numbers

The user's proposal, multiplied by 5 (same ratios, more room to tune without
fractions), with a larger welcome grant and event prizes. All values will
live in one server-side configuration module.

| What | Shards | Notes |
|---|---|---|
| Play Booster | 100 | |
| Collector Booster | 500 | 5× a Play Booster, as in stores |
| Bulk bonus | +1 pack per 10 bought | Same type; pay for the packs requested, not the bonus. `bonus = floor(n / 10)` |
| Game vs. the computer | 75, +50 for the winner | Raised 2026-11-04 (user: friends need to earn many cards). Built: paid by the server for its tables (`rewards.ts`) |
| Game vs. friends | 150, +100 for the winner | Raised 2026-11-04. Two or more players at the table; only the actual winner gets the bonus, a draw the base only. Draft games pay prizes instead, but count for quests and the first win |
| Daily quests | 300 each | Built 2026-11-04: play 3 games; win a game. Once per UTC day |
| Weekly quests | 1,500 and 2,000 | Built 2026-11-04: play 15 games (1,500); win 7 games (2,000). The UTC week from Monday; every game the server ran counts |
| Starting balance | 5,000 | User, 2026-11-03: a 4,000 welcome grant plus the 1,000 welcome bonus, each once per account, for new accounts only (accounts made before started with 2,000 and keep their balance; no top-up). 50 Play Boosters, 10 Collector Boosters, or a mix. Before: 2,000 (2026-10-30) |
| Daily login reward | 100 | Built 2026-10-30 (50), raised 2026-11-04: the first sign-in of each UTC day (ledger kind `login_reward`, ref `login-YYYY-MM-DD`) |
| Complete the tutorial | 500 | Built 2026-11-04 (raised from 250): once, when the browser reports the lesson finished (`milestone_reward`, ref `tutorial`) |
| First win | 500 | Built 2026-11-04 (raised from 100): once, from a game the server ran (`milestone_reward`, ref `first-win`) |
| Draft entry | 600 | Built 2026-11-03 (user): six Play Boosters' worth, paid by every player when the host starts the draft (ledger `event_entry`, ref `draft-<event>`; nobody is charged unless everyone can pay). Every player keeps the 84 cards they draft |
| Draft prizes | 1st 1,000 · 2nd 800 · 3rd 600 · 4th 400 | Built 2026-11-03 (user): paid once when the event finishes (ledger `event_prize`); full prizes whatever the mix of players and bots, and a bot's place pays no one. Nets after the entry: +400, +200, 0, −200. The user first proposed a 300 entry; at 300 every place would gain shards plus six free packs, so 600 was chosen |

Rough earnings: one match a day ≈ 1,200 a week (about 12 Play Boosters);
five bot matches a day ≈ 2,200 a week (about 22).

## Rules

- **The server is the only authority.** Balances live in the database, never
  in the browser. Every purchase, reward and entry is checked and applied by
  the server inside one database transaction, with a ledger row for each
  change (welcome grant, match reward, quest reward, pack purchase, event
  entry, event prize, admin adjustment). Balances can't go negative.
- **Idempotent:** every purchase and entry carries a client request id; a
  retry returns the first result. A match pays each player once, keyed by
  the match id. Reconnecting never charges or pays again.
- **Eligible matches:** finished by the engine (a winner or a draw), reached
  at least turn 3, with no concession before it. Abandoned games, lobbies
  and instant concessions pay nothing. No daily cap: bot games are slow
  enough (about 15 minutes) not to need one; limits stay configurable.
- **Bot games must run on the server** to be rewarded: today they run in the
  browser, where the result can't be trusted.
- Players can always keep playing free matches with zero shards.

## Crafting (built 2026-11-04)

Players dismantle cards they own for fragments and spend fragments to craft
the cards they want (user spec, 2026-11-04), in the **Craft** tab.

| | Common | Uncommon | Rare | Mythic |
|---|---:|---:|---:|---:|
| Dismantle one copy | 1 | 1 | 1 | 1 |
| Foil (any finish but non-foil) | +1 | +1 | +1 | +1 |
| Craft one copy | 4 | 4 | 4 | 4 |

- Four fragment currencies, one per rarity; they never convert (rare
  fragments only craft rares). The values live in `ECONOMY.crafting`
  (`packages/server/src/economy.ts`), with `dismantleReward` and `craftCost`.
- **Rarity** is the printing's own (Scryfall data); `packages/cards/src/crafting.ts`
  says which printings can be dismantled (any owned printing of a game card
  with one of the four rarities: not basic lands, tokens or art cards) and
  which can be crafted (the regular printing of each FINAL FANTASY set card
  and each precon card, nonbasic lands included; always made non-foil).
- **Last copy:** with `protectLastCopy` (on), your last copy of a card, by
  name across every art and finish, can't be dismantled. Dismantling a copy a
  saved deck uses only warns.
- **Server only:** `GET /api/fragments`, `POST /api/dismantle {requestId, card, finish}`,
  `POST /api/craft {requestId, card}` (`packages/server/src/crafting.ts`). The
  database functions `dismantle_card` and `craft_card`
  (`supabase/migrations/20261104180000_crafting.sql`) lock the player, check,
  and change cards and fragments together, with a `fragment_ledger` row per
  request id: a repeat returns the first result and changes nothing.
- Later (not built): fragments from quests and seasons, other rarities,
  variant-specific rewards, discounts, conversion, event currencies, and a
  history view (the ledger already records every change).

## Steps

| Step | What |
|---|---|
| E1 | **Done (2026-10-29):** accounts (Supabase Auth, Discord login) and the database: balances, the ledger, owned cards and packs (`supabase/migrations/20261029000000_accounts.sql`); the welcome grant; the balance in the menu. All values in `packages/server/src/economy.ts`. |
| E1b | **In progress (2026-10-29):** server storage and API done; the Packs tab buys packs (100 / 500 shards) and saves them to the account. The Packs tab's Decks view saves decks to `/api/decks`. Left: playing with saved decks, and drafted cards saved to the account (with server-run drafts, S3). **Collections and decks per account** (user requirement, 2026-10-29): each account owns its own cards with their finish (non-foil, foil, surge foil; more treatments as sets need them) and counts (`owned_cards`), and its own saved decks: Commander, draft/sealed (Limited) and 60-card constructed, each a named list of owned cards. Opened packs and drafted cards go into the collection; the Packs tab and decks read it from the server instead of the browser. |
| E1c | **Done (2026-10-29):** the free precon (`/api/starter`, `StarterPick.tsx`) and the guided tour (`Tour.tsx`). **First sign-in** (user requirement, 2026-10-29): a guided tour of the app that pops up step by step on a player's first sign-in (menu tabs, account and shards, Packs, Draft, Online, deckbuilding), skippable and replayable; and a free starter: the new player picks one of the four Final Fantasy Commander precons, granted once to their collection and saved as a deck (idempotent, server-side, like the welcome grant). Needs E1b. |
| E2 | Bot games on the server, so their results can be rewarded. **Built 2026-11-04:** tables with bot seats run on the server and pay, and the menu's vs-computer games (Commander and 60-card, with your saved deck) are such tables (`client/src/game/serverGame.ts`). A random opponent or a chosen seed stays a local practice game without rewards; the Starter Kit lesson and practice games stay local too. |
| E3 | Match rewards and daily/weekly quests, with the reward breakdown after each match. **Server built 2026-11-04:** `rewards.ts` records each finished game once per player (`match_results`, migration `20261104210000_rewards.sql`) and pays the match reward, win bonus, quests and first win, each once by its ledger ref; a game counts from round 2 and not for a player who conceded. The server sends `rewards {lines, balance}` after a game; `GET /api/rewards` gives quest progress and one-time rewards. The browser shows what a game earned on the game-over screen, the quests and one-time rewards on Home (`account/Rewards.tsx`), and a notice for the lesson reward. |
| E4 | **Boosters done (2026-10-30)** in the Packs tab: 1 or 10 (+1 free), shortfall message, opened packs go to the account's collection. **Store tab built (2026-10-30), user requirement:** a separate Store tab, divided by set, where players buy exclusive printings directly: for Final Fantasy, each Chocobo Track foil on its own (Store-only: removed from Collector Boosters, user decision 2026-10-30) and the five Chocobo Track basic lands as one bundle. Prices (proposed by Claude, the user asked for them, 2026-10-30) in `packages/server/src/economy.ts` `storePrices`: legendary creatures 1,200, other cards 800, the land bundle 500 (null shows "Price coming soon"). **Precons (built 2026-10-30, user requirement):** the four FINAL FANTASY Commander precons at 2,000 each (`storePrices.precon`); buying one adds its 100 printings and saves it as a Commander deck. **Secret Lairs (built 2026-10-30):** the three Secret Lair x FINAL FANTASY drops (Game Over, Weapons, Grimoire; June 2025) at 3,500 for the five cards plus the foil bonus card, and all 24 FINAL FANTASY Secret Lair printings as singles at 1,000 (`storePrices.secretLairDrop` / `secretLairSingle`). Data: `cards/scripts/import-secret-lairs.ts` → `data/secret-lair.json`; cards with no other definition live in `data/store-cards.json`. The catalog per set is `packages/server/src/store.ts`; purchases are recorded as `store_purchase` (`supabase/migrations/20261030120000_store.sql`). Bought printings go to the collection in the chosen finish, charged in one server transaction like packs. |
| E5 | Paid event entry and prizes, with the online draft events (sealed.md, S3). |

## Hosting (free tiers, checked 2026-10-29)

- **Supabase Free:** 500 MB database, 50,000 monthly active users, 5 GB
  egress, 2 projects. Far more than 13 players need: a full collection and
  ledger is a few MB. A project pauses after a week with no activity and
  must be restored from the dashboard.
- **Render Free web service:** 750 instance hours a month (enough for one
  service around the clock). It sleeps after 15 minutes without HTTP
  requests or WebSocket messages, and waking takes up to a minute. Its disk
  doesn't persist, which is fine because the data lives in Supabase.
  Games in progress live in the server's memory and would be lost on a
  restart.

Edge of Eternities (2026-11-05): the Secret Lair Chaos Vault: Commander
Reinforcements drops, one per Commander deck (Featuring Deathburger for
Counter Intelligence: Ethersworn Canonist, Goblin Engineer, Dance of the
Manse, Arcbound Ravager, Foundry Inspector; Alien Auroras for World Shaper:
Reprocess, Aggressive Mining, Sylvan Safekeeper, Crucible of Worlds, Zuran
Orb; SLD 2102-2111), each drop and each card in galaxy foil (7,000 / 2,000
Aether Shards), and the two Edge of Eternities Commander precons (2,000
each, saved as a deck when bought, like the Final Fantasy ones; their cards
that aren't built yet show as "Not built").

All Secret Lair cards are sold foil (user, 2026-11-05): the Final Fantasy
drops (5 cards and the bonus card) and singles too, at the same prices.
