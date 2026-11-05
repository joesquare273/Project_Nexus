// Downloads the free sound packs (docs/audio.md) into packages/client/public/audio/
// and writes the manifest the game reads. Run it on your own computer (the
// cloud sessions can't reach these sites):
//
//   npm run audio
//
// Effects: Kenney's CC0 packs (casino, RPG, impact, interface sounds; no
// credit required). Kenney's site downloads through its donation prompt, so
// download each pack in the browser (Download, then "Continue without
// donating"); this picks the zips up from your Downloads folder (or an
// audio-packs/ folder in the repository). Music: a few Kevin MacLeod tracks from incompetech.com
// (CC BY 4.0, credited in public/audio/CREDITS.md). Your own files work too:
// put music in public/audio/music/ and ambience loops (Tabletop Audio, Scott
// Buckley, Sonniss...) in public/audio/ambience/, then run this again so the
// manifest lists them. Each sound with no file is synthesized by the game.

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOUND_IDS, type SoundId } from '../src/audio/cues.ts';

const OUT = fileURLToPath(new URL('../public/audio/', import.meta.url));
const HEADERS = { 'User-Agent': 'ProjectNexus/0.1 (personal project; audio script)' };

/** Kenney's CC0 audio packs (kenney.nl/assets/<slug>). */
const KENNEY_PACKS = ['casino-audio', 'rpg-audio', 'impact-sounds', 'interface-sounds'];

/**
 * Which pack files each sound uses, by file name. Up to four matches each
 * (the game picks one at random each time). Sounds left out, or with no
 * match, are synthesized by the game.
 */
const MATCH: Partial<Record<SoundId, RegExp>> = {
  draw: /card[-_ ]?(slide|take)/i,
  shuffle: /shuffle/i,
  land: /card[-_ ]?place/i,
  cast: /card[-_ ]?(shove|fan)/i,
  permanent: /impact[-_ ]?(soft|wood).*(medium|light)/i,
  resolve: /^drop[-_ ]?0/i,
  countered: /^error/i,
  tap: /card[-_ ]?flip|metal[-_ ]?click/i,
  untap: /cloth/i,
  attack: /draw[-_ ]?(knife|sword)/i,
  block: /impact[-_ ]?(plate|metal).*(medium|light)/i,
  damage: /impact[-_ ]?punch.*(medium|light)/i,
  damageBig: /impact[-_ ]?punch.*heavy/i,
  die: /impact[-_ ]?soft.*heavy/i,
  wipe: /impact[-_ ]?bell.*heavy/i,
  exile: /swoosh|whoosh|maximize/i,
  lifeGain: /^confirmation/i,
  lifeLoss: /^minimize/i,
  counter: /chips?[-_ ]?(lay|stack|collide)/i,
  token: /chips?[-_ ]?handle/i,
  yourTurn: /^bong/i,
  dice: /dice?[-_ ]?(throw|shake)/i,
  coin: /coin/i,
};

/** Kevin MacLeod, incompetech.com, CC BY 4.0: calm fantasy pieces for the menus and games. */
const MUSIC = ['Achaidh Cheide', 'Lost Frontier', 'Crossing the Chasm', 'Moonlight Hall', 'Enchanted Valley', 'Ether Vox'];

async function download(url: string, to: string): Promise<boolean> {
  try {
    const res = await fetch(url, { headers: HEADERS, redirect: 'follow' });
    if (!res.ok) return false;
    writeFileSync(to, Buffer.from(await res.arrayBuffer()));
    return true;
  } catch {
    return false;
  }
}

/** OpenGameArt copies of Kenney packs, tried when kenney.nl's page gives no link. */
const FALLBACK_PAGES: Record<string, string> = {
  'casino-audio': 'https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips',
};

/**
 * The zip file linked from a download page, wherever it appears (quoted or
 * not, with or without a query string). When there is none, prints the
 * page's lines about downloads, to show how the link is written.
 */
async function findZip(page: string): Promise<string | null> {
  const html = await fetch(page, { headers: HEADERS }).then((r) => (r.ok ? r.text() : ''), () => '');
  if (!html) {
    console.log(`  ${page}: the page could not be opened`);
    return null;
  }
  // A real link has a path (https://…/files/pack.zip or /files/pack.zip), not just a file name in the page text.
  const found = [...html.matchAll(/(?:https?:)?[^"'()\s<>=]*\.zip(?:\?[^"'()\s<>]*)?/gi)].map((m) => m[0]).filter((u) => u.includes('/'));
  if (found.length) return new URL(found[0]!.replace(/&amp;/g, '&'), page).href;
  const hints = html
    .split(/\n|(?=<a )/)
    .filter((line) => /download|\.zip/i.test(line))
    .slice(0, 6)
    .map((line) => `    ${line.trim().slice(0, 220)}`);
  console.log(`  ${page}: no .zip link. Lines about downloads:\n${hints.join('\n') || '    (none)'}`);
  return null;
}

/** Where downloaded packs are looked for: your Downloads folder, and an audio-packs folder in the repository. */
const PACK_DIRS = [join(homedir(), 'Downloads'), fileURLToPath(new URL('../../../audio-packs/', import.meta.url))];

/** A Kenney pack zip downloaded in the browser (kenney_casino-audio.zip, kenney_casino-audio (1).zip...). */
function localZip(slug: string): string | null {
  for (const dir of PACK_DIRS) {
    if (!existsSync(dir)) continue;
    const hit = readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith('.zip') && f.toLowerCase().replace(/[^a-z]/g, '').includes(slug.replace(/[^a-z]/g, '')))
      .sort()[0];
    if (hit) return join(dir, hit);
  }
  return null;
}

function unzip(zip: string, dir: string): void {
  try {
    // bsdtar (macOS, Windows 10+) reads zip files.
    execFileSync('tar', ['-xf', zip, '-C', dir], { stdio: 'ignore' });
  } catch {
    execFileSync('unzip', ['-q', '-o', zip, '-d', dir], { stdio: 'ignore' });
  }
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const audioIn = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((f) => ['.ogg', '.mp3', '.m4a', '.wav'].includes(extname(f).toLowerCase())).sort() : []);

mkdirSync(join(OUT, 'effects'), { recursive: true });
mkdirSync(join(OUT, 'music'), { recursive: true });
mkdirSync(join(OUT, 'ambience'), { recursive: true });
const work = mkdtempSync(join(tmpdir(), 'nexus-audio-'));
const credits: string[] = [];
const effects: Partial<Record<SoundId, string[]>> = {};
const missing: string[] = [];

try {
  for (const slug of KENNEY_PACKS) {
    const page = `https://kenney.nl/assets/${slug}`;
    // Kenney's Download button runs a script (after its donation prompt), so
    // the packs are downloaded in the browser and picked up from here.
    let zip = localZip(slug);
    if (zip) console.log(`${slug}: using ${zip}`);
    else {
      const url = FALLBACK_PAGES[slug] ? await findZip(FALLBACK_PAGES[slug]!) : null;
      const to = join(work, `${slug}.zip`);
      if (url && (await download(url, to))) {
        console.log(`${slug}: downloaded from ${url}`);
        zip = to;
      }
    }
    if (!zip) {
      missing.push(`${slug}: open ${page}, press Download, then "Continue without donating"`);
      continue;
    }
    const dir = join(work, slug);
    mkdirSync(dir);
    try {
      unzip(zip, dir);
    } catch {
      console.log(`${slug}: could not unpack ${zip} (skipped)`);
      continue;
    }
    const files = walk(dir).filter((f) => extname(f).toLowerCase() === '.ogg');
    console.log(`${slug}: ${files.length} sounds`);
    credits.push(`- Kenney, "${slug}" (${page}), CC0 1.0.`);
    for (const [id, re] of Object.entries(MATCH) as [SoundId, RegExp][]) {
      if ((effects[id]?.length ?? 0) >= 4) continue;
      for (const f of files.filter((f) => re.test(basename(f, '.ogg'))).slice(0, 4 - (effects[id]?.length ?? 0))) {
        const name = `effects/${slug}-${basename(f)}`;
        copyFileSync(f, join(OUT, name));
        (effects[id] ??= []).push(name);
      }
    }
  }

  for (const title of MUSIC) {
    const name = `music/${title.replace(/[^A-Za-z0-9]+/g, '-')}.mp3`;
    if (existsSync(join(OUT, name)) || (await download(`https://incompetech.com/music/royalty-free/mp3-royaltyfree/${encodeURIComponent(title)}.mp3`, join(OUT, name)))) {
      credits.push(`- "${title}" Kevin MacLeod (incompetech.com), licensed under Creative Commons: By Attribution 4.0 License (https://creativecommons.org/licenses/by/4.0/).`);
      console.log(`music: ${title}`);
    } else console.log(`music: ${title} could not be downloaded (skipped)`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

const music = audioIn(join(OUT, 'music')).map((f) => `music/${f}`);
const ambience = audioIn(join(OUT, 'ambience')).map((f) => `ambience/${f}`);
writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify({ effects, music, ambience }, null, 2)}\n`);
writeFileSync(
  join(OUT, 'CREDITS.md'),
  `# Audio credits\n\nWritten by \`npm run audio\`. Add a line here for any file you put in music/ or ambience/ yourself.\n\n${credits.join('\n')}\n`,
);

const synthesized = SOUND_IDS.filter((id) => !effects[id]?.length);
console.log(`\nEffects from files: ${SOUND_IDS.length - synthesized.length} of ${SOUND_IDS.length}. Synthesized: ${synthesized.join(', ') || 'none'}.`);
if (missing.length) console.log(`\nTo add the missing packs, download each one in your browser, then run npm run audio again:\n${missing.map((m) => `  ${m}`).join('\n')}`);
console.log(`Music: ${music.length} file(s). Ambience: ${ambience.length} file(s)${ambience.length ? '' : ' (put loops in public/audio/ambience/ and run this again)'}.`);
