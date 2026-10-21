// Saves Scryfall image links and Oracle text for every real card to
// data/scryfall.json, and the official lists of card types, supertypes and
// subtypes to data/types.json. Images themselves are never downloaded: the client
// loads them from Scryfall's image servers (*.scryfall.io), which have no
// rate limits.
//
//   npm run scryfall               # fetch only cards not saved yet
//   npm run scryfall -- --refresh  # fetch everything again
//
// The API (api.scryfall.com) does have hard rate limits: /cards/collection
// allows 2 requests a second, and a 429 response locks you out for 30
// seconds. So this script:
//   - asks for up to 75 cards per request with /cards/collection,
//   - waits 600 ms between requests,
//   - skips cards already in data/scryfall.json,
//   - on a 429, waits out the lockout once, then gives up rather than retrying.
// For hundreds of cards (Commander precons), switch to Scryfall's daily bulk
// data files instead; see docs/development-update.md.
//
// Cards with a `printing` use that exact printing. Basic lands use their
// Final Fantasy (FIN) printing. Other cards use Scryfall's default printing
// of their name.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import type { ScryfallInfo } from '../src/index.ts';

const COLLECTION_URL = 'https://api.scryfall.com/cards/collection';
const HEADERS = {
  'User-Agent': 'ProjectNexus/0.1 (personal project; card data script)',
  Accept: 'application/json',
  'Content-Type': 'application/json',
};
const BATCH_SIZE = 75;
const DELAY_MS = 600;
const LOCKOUT_MS = 31_000;
const BASIC_LAND_SET = 'fin';

type Identifier = { set: string; collector_number: string } | { name: string; set?: string };

interface ScryfallCard {
  id: string;
  name: string;
  all_parts?: { id: string; component: string; name: string }[];
  oracle_text?: string;
  type_line: string;
  set: string;
  collector_number: string;
  artist?: string;
  image_uris?: { small: string; normal: string; large: string; art_crop: string };
  scryfall_uri: string;
}

interface CollectionResponse {
  data: ScryfallCard[];
  not_found: Identifier[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchCollection(identifiers: Identifier[]): Promise<CollectionResponse> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(COLLECTION_URL, { method: 'POST', headers: HEADERS, body: JSON.stringify({ identifiers }) });
    if (res.status === 429) {
      if (attempt > 1) throw new Error('Scryfall rate limit hit twice (HTTP 429). Stopping; try again in a few minutes.');
      console.warn('Scryfall rate limit hit (HTTP 429). Waiting out the 30-second lockout once...');
      await sleep(LOCKOUT_MS);
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${COLLECTION_URL}`);
    return (await res.json()) as CollectionResponse;
  }
}

function toInfo(card: ScryfallCard): ScryfallInfo {
  if (!card.image_uris) throw new Error(`${card.name} has no single-faced image.`);
  return {
    name: card.name,
    typeLine: card.type_line,
    oracleText: card.oracle_text ?? '',
    set: card.set,
    number: card.collector_number,
    ...(card.artist ? { artist: card.artist } : {}),
    image: {
      small: card.image_uris.small,
      normal: card.image_uris.normal,
      large: card.image_uris.large,
      artCrop: card.image_uris.art_crop,
    },
    scryfallUri: card.scryfall_uri,
    scryfallId: card.id,
    relatedTokens: (card.all_parts ?? [])
      .filter((p) => p.component === 'token')
      .map((p) => ({ name: p.name, scryfallId: p.id })),
  };
}

const { values } = parseArgs({ options: { refresh: { type: 'boolean', default: false } } });

// Type catalogs first: the card list below is validated against them.
const CATALOGS = {
  cardTypes: 'card-types',
  supertypes: 'supertypes',
  creature: 'creature-types',
  artifact: 'artifact-types',
  enchantment: 'enchantment-types',
  land: 'land-types',
  spell: 'spell-types',
  planeswalker: 'planeswalker-types',
  battle: 'battle-types',
};
const typesFile = new URL('../data/types.json', import.meta.url);
if (!existsSync(typesFile) || values.refresh) {
  const lists: Record<string, string[]> = {};
  for (const [key, path] of Object.entries(CATALOGS)) {
    await sleep(150);
    const res = await fetch(`https://api.scryfall.com/catalog/${path}`, { headers: HEADERS });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for catalog ${path}`);
    lists[key] = ((await res.json()) as { data: string[] }).data;
  }
  writeFileSync(typesFile, `${JSON.stringify({ $comment: 'Official type lists from Scryfall catalogs. Refresh with npm run scryfall -- --refresh.', ...lists }, null, 2)}
`);
  console.log(`Saved type lists (${Object.keys(CATALOGS).length} API requests).`);
}
const { CARDS } = await import('../src/index.ts');
const file = new URL('../data/scryfall.json', import.meta.url);
const saved: Record<string, ScryfallInfo> =
  existsSync(file) && !values.refresh ? JSON.parse(readFileSync(file, 'utf8')) : {};

// Which cards to ask for, and how to match each answer back to a card id.
const wanted: { id: string; identifier: Identifier; matches: (c: ScryfallCard) => boolean }[] = [];
for (const def of CARDS) {
  if (saved[def.id]) continue;
  if (def.printing) {
    const { set, number } = def.printing;
    wanted.push({
      id: def.id,
      identifier: { set, collector_number: number },
      matches: (c) => c.set === set && c.collector_number === number,
    });
  } else if (def.supertypes?.includes('Basic')) {
    wanted.push({
      id: def.id,
      identifier: { name: def.name, set: BASIC_LAND_SET },
      matches: (c) => c.name === def.name && c.set === BASIC_LAND_SET,
    });
  } else {
    // Real cards from other sets: Scryfall's default printing of that name.
    wanted.push({ id: def.id, identifier: { name: def.name }, matches: (c) => c.name === def.name });
  }
}

/**
 * Every token a card makes (Scryfall's related parts) should be defined in
 * tokens.json with that exact printing. Many tokens share a name, so this
 * compares Scryfall ids, not names.
 */
function checkTokens(): void {
  const defined = new Map<string, string>();
  for (const def of CARDS) {
    const id = saved[def.id]?.scryfallId;
    if (def.token && id) defined.set(id, def.id);
  }
  const problems: string[] = [];
  for (const def of CARDS) {
    // A token's own list names other cards' tokens, so only real cards count.
    if (def.token) continue;
    for (const t of saved[def.id]?.relatedTokens ?? []) {
      // The "Copy" helper card just marks a token copy of something else.
      if (t.name === 'Copy') continue;
      if (!defined.has(t.scryfallId)) problems.push(`${def.name} makes a ${t.name} token (Scryfall id ${t.scryfallId}) that tokens.json doesn't define.`);
    }
  }
  if (problems.length > 0) {
    console.error(`\nMissing tokens:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log('Every token the cards make is defined in tokens.json.');
}

if (wanted.length === 0) {
  console.log('Every real card is already saved. Use --refresh to fetch them all again.');
  checkTokens();
  process.exit(0);
}

const missing: string[] = [];
for (let i = 0; i < wanted.length; i += BATCH_SIZE) {
  if (i > 0) await sleep(DELAY_MS);
  const batch = wanted.slice(i, i + BATCH_SIZE);
  const res = await fetchCollection(batch.map((w) => w.identifier));
  for (const w of batch) {
    const card = res.data.find(w.matches);
    if (!card) {
      missing.push(w.id);
      continue;
    }
    saved[w.id] = toInfo(card);
    console.log(`${w.id}: ${card.name} (${card.set} #${card.collector_number})`);
  }
}

const sorted = Object.fromEntries(Object.entries(saved).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`);
const requests = Math.ceil(wanted.length / BATCH_SIZE);
console.log(`\nSaved ${wanted.length - missing.length} new card(s) using ${requests} API request(s).`);
if (missing.length > 0) {
  console.error(`Not found on Scryfall: ${missing.join(', ')}`);
  process.exit(1);
}
checkTokens();
