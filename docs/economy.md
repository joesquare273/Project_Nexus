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
| Commander or draft vs. bots | 25, +10 for the winner | |
| Commander or draft vs. friends | 50, +25 for the winner | Only the actual winner gets the bonus; a draw gets the base only |
| Daily quest: finish 1 eligible match | 100 | Once per daily reset |
| Weekly quest: finish 5 eligible matches | 250 | Bot and friend matches both count |
| Welcome grant | 1,000 | Once per account: enough for a first event (600) plus four packs |
| Event entry (draft or sealed) | 600 | Six Play Boosters; the player keeps every card. Six owned Play Boosters can be used instead |
| Event prizes (4 players) | 1st: 2 Play Boosters, 2nd: 1 | Gives the Swiss rounds stakes; scaled for 2-3 players |

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

## Steps

| Step | What |
|---|---|
| E1 | **Done (2026-10-29):** accounts (Supabase Auth, Discord login) and the database: balances, the ledger, owned cards and packs (`supabase/migrations/20261029000000_accounts.sql`); the welcome grant; the balance in the menu. All values in `packages/server/src/economy.ts`. |
| E1b | **In progress (2026-10-29):** server storage and API done; the Packs tab buys packs (100 / 500 shards) and saves them to the account. The Packs tab's Decks view saves decks to `/api/decks`. Left: playing with saved decks, and drafted cards saved to the account (with server-run drafts, S3). **Collections and decks per account** (user requirement, 2026-10-29): each account owns its own cards with their finish (non-foil, foil, surge foil; more treatments as sets need them) and counts (`owned_cards`), and its own saved decks: Commander, draft/sealed (Limited) and 60-card constructed, each a named list of owned cards. Opened packs and drafted cards go into the collection; the Packs tab and decks read it from the server instead of the browser. |
| E1c | **First sign-in** (user requirement, 2026-10-29): a guided tour of the app that pops up step by step on a player's first sign-in (menu tabs, account and shards, Packs, Draft, Online, deckbuilding), skippable and replayable; and a free starter: the new player picks one of the four Final Fantasy Commander precons, granted once to their collection and saved as a deck (idempotent, server-side, like the welcome grant). Needs E1b. |
| E2 | Bot games on the server, so their results can be rewarded. |
| E3 | Match rewards and daily/weekly quests, with the reward breakdown after each match. |
| E4 | The booster store: Play and Collector Boosters, bulk bonus, confirmation, shortfall message; opened packs go to the account's collection. |
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
