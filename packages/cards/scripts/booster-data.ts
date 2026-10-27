// Saves every printing of the Final Fantasy sets that booster packs can hold
// to data/booster-cards.json: the main set (FIN), Through the Ages (FCA), the
// Commander set's printings (FIC), tokens (TFIN), art cards (AFIN) and the
// Scene Box cards (AFIC). The Packs tab opens boosters from this file, so
// the game itself never calls api.scryfall.com.
//
//   npm run scryfall:boosters
//
// Rate limits: /cards/search pages hold 175 cards; the script waits 600 ms
// between requests and gives up after a second HTTP 429.

import { writeFileSync } from 'node:fs';
import type { BoosterCard } from '../src/boosters.ts';

const SETS = ['fin', 'fca', 'fic', 'tfin', 'afin', 'afic'];
const HEADERS = { 'User-Agent': 'ProjectNexus/0.1 (personal project; card data script)', Accept: 'application/json' };
const DELAY_MS = 600;
const LOCKOUT_MS = 31_000;

interface Face {
  name: string;
  type_line?: string;
  image_uris?: { small: string; normal: string; large: string; art_crop: string };
}
interface ScryfallCard {
  id: string;
  name: string;
  set: string;
  collector_number: string;
  rarity: string;
  type_line?: string;
  layout: string;
  colors?: string[];
  color_identity?: string[];
  border_color: string;
  frame_effects?: string[];
  promo_types?: string[];
  finishes: string[];
  full_art: boolean;
  booster: boolean;
  artist?: string;
  image_uris?: { small: string; normal: string; large: string; art_crop: string };
  card_faces?: Face[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function page(url: string): Promise<{ data: ScryfallCard[]; has_more: boolean; next_page?: string }> {
  for (let attempt = 1; ; attempt++) {
    await sleep(DELAY_MS);
    const res = await fetch(url, { headers: HEADERS });
    if (res.status === 429) {
      if (attempt > 1) throw new Error('Scryfall rate limit hit twice (HTTP 429). Try again in a few minutes.');
      await sleep(LOCKOUT_MS);
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${url}`);
    return (await res.json()) as { data: ScryfallCard[]; has_more: boolean; next_page?: string };
  }
}

function toBoosterCard(c: ScryfallCard): BoosterCard {
  const faces = c.card_faces?.filter((f) => f.image_uris) ?? [];
  const images = c.image_uris ? [c.image_uris] : faces.map((f) => f.image_uris!);
  return {
    id: c.id,
    name: c.name,
    set: c.set,
    number: c.collector_number,
    rarity: c.rarity as BoosterCard['rarity'],
    typeLine: c.type_line ?? c.card_faces?.map((f) => f.type_line ?? '').join(' // ') ?? '',
    colors: c.colors ?? c.color_identity ?? [],
    border: c.border_color,
    ...(c.frame_effects?.length ? { frameEffects: c.frame_effects } : {}),
    ...(c.promo_types?.length ? { promoTypes: c.promo_types } : {}),
    finishes: c.finishes,
    ...(c.full_art ? { fullArt: true } : {}),
    ...(c.booster ? { booster: true } : {}),
    layout: c.layout,
    ...(c.artist ? { artist: c.artist } : {}),
    images: images.map((i) => ({ small: i.small, normal: i.normal, large: i.large, artCrop: i.art_crop })),
  };
}

const cards: BoosterCard[] = [];
for (const set of SETS) {
  let url: string | undefined = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`e:${set}`)}&unique=prints&order=set&include_extras=true&include_variations=true`;
  let n = 0;
  while (url) {
    const r = await page(url);
    for (const c of r.data) cards.push(toBoosterCard(c));
    n += r.data.length;
    url = r.has_more ? r.next_page : undefined;
  }
  console.log(`${set}: ${n} printings`);
}
writeFileSync(new URL('../data/booster-cards.json', import.meta.url), `[\n${cards.map((c) => '  ' + JSON.stringify(c)).join(',\n')}\n]\n`);
console.log(`Saved ${cards.length} printings to data/booster-cards.json`);
