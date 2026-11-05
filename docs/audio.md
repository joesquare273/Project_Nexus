# Sound effects and music

Research (2026-11-05) and how the game's sound is built: what to play when,
where to get it for free, and how it fits together.

## Built (2026-11-05)

- **Turn it on** in the in-game settings (⚙) or the account menu: Sound on,
  then Effects, Ambience and Music volumes (saved on this device). Off by
  default.
- **`npm run audio`** (on your own computer) unpacks Kenney's CC0 packs
  (casino, RPG, impact, interface) from your Downloads folder (Kenney's site
  downloads through a donation prompt, so they're downloaded in the browser:
  Download, then "Continue without donating"; the casino pack falls back to
  its OpenGameArt copy) and downloads a few Kevin MacLeod tracks (CC BY 4.0)
  into `packages/client/public/audio/`, and writes `manifest.json` and
  `CREDITS.md` there. The files aren't committed; run it once per computer
  (the cloud sessions can't reach those sites). Your own music and ambience
  loops go in `public/audio/music/` and `public/audio/ambience/`; run it
  again so the manifest lists them.
- **Every effect works without files:** a sound with no downloaded file is
  synthesized in the browser (`audio/mixer.ts`), so the game has sound before
  `npm run audio` is run.
- `audio/cues.ts`: the sound map below as a pure function (`soundsFor`), at
  most four sounds per batch of events; `GameSession.sounds` records them and
  `audio/GameSounds.tsx` plays them as the board draws each batch, as the
  card flights start. Other players' sounds are quieter.
- Menus play music; a game switches to ambience (or quiet music when there's
  no ambience). Both fade rather than cut.
- Not yet: land sounds per color, the Credits page in the app (credits are in
  `public/audio/CREDITS.md`), and running `npm run audio` in the Render
  build.

User direction (2026-11-05): use **free resources**, unless something better
is worth it (see "Upgrades" at the end).

## What good card-game audio does

- **Every action makes one short, physical sound.** A card leaving the hand,
  landing on the table, tapping, going to the graveyard. Real tabletop foley
  (card slides, flicks, chips, dice) suits a tabletop game better than
  synthetic UI beeps.
- **Timing follows the animation.** Hearthstone's sound team designs around
  fixed moments, such as dragging a card out of the hand and dropping it into
  play. Here, that means firing sounds from the same moves `Flights.tsx`
  animates: lift on take-off, thud on landing.
- **Don't overdo it.** PC Gamer's early look at MTG Arena found its
  ever-present effects "overdone". Keep most sounds quiet and short, save big
  sounds for big moments (a board wipe, a commander entering, lethal), and
  let players turn each group down separately.
- **Ambience over songs during play.** TTRPG tables use long, quiet ambient
  loops (a tavern, a forest, a storm) rather than tracks with strong melodies,
  so music doesn't compete with thinking. Save melodic music for menus and the
  win/lose screen.

## Sound map (game events to sounds)

The engine already emits events for all of these (`GameEvent` in
`engine/src/types.ts`), and online players get the same events, redacted.

| Moment | Sound | Notes |
| --- | --- | --- |
| Draw | soft card slide | one per card, quieter for opponents |
| Shuffle | riffle | |
| Play a land | card placed on felt | optional: a light color tint (birds for Forest, wind for Plains, water for Island, crickets for Swamp, embers for Mountain) |
| Cast a spell (to the stack) | card flick + faint magical swell | swell louder for higher mana value |
| Spell resolves | permanents: card thud; instants/sorceries: a short burst | |
| Countered / fizzles | muffled "puff" | |
| Tap / untap | short click / soft brush | untap step plays one, not one per card |
| Attack declared | weapon draw / war horn for big attacks | |
| Combat damage | impact, scaled by damage | |
| Creature dies / goes to graveyard | low thump | board wipe: one big sound, not twenty |
| Exile | airy whoosh | |
| Life gain / loss | rising / falling tone | |
| Counters (+1/+1, poison) | small chip clack | Kenney's casino chips fit this well |
| Tokens created | pop | |
| Your priority / your turn | gentle chime | important when the computer is fast |
| Commander cast | signature sting | |
| Win / lose | short fanfare / low sting | |

## Free sources

Licenses checked on 2026-11-05. Recheck before adding files, and record each
file's source and license in a `CREDITS` file next to the audio.

### Sound effects

- **Kenney: Casino Audio and RPG Audio** (kenney.nl), **CC0**: no credit
  needed. Casino Audio is card, chip and dice handling foley (about 50 files);
  RPG Audio is footsteps, weapons and more. **Best starting point**: real card
  sounds, free, and safe to commit to the repo.
- **OpenGameArt: "54 casino sound effects (cards, dice, chips)"**: Kenney's
  casino set mirrored there, plus a "boardgame pack". Check each file's
  license on its page.
- **Sonniss GameAudioGDC bundles** (sonniss.com): large professional
  libraries (tens of GB a year) released free each year for GDC. Royalty-free,
  commercial use allowed, no credit required, lifetime licence. One catch:
  they can't be used to train AI. The best free source for magic, impacts,
  whooshes and ambience. Read the licence at sonniss.com/gdc-bundle-license
  before using.
- **Freesound** (freesound.org): huge, but the license varies per file (CC0,
  CC BY, CC BY-NC). Filter to CC0 or CC BY and keep the credits.
- **Pixabay sound effects and music**: the Pixabay License allows use
  without credit, commercial use included. Selling the files on their own
  isn't allowed (shipping them in a game is fine).

### Music and ambience

- **Scott Buckley** (scottbuckley.com.au): orchestral and ambient fantasy,
  **CC BY 4.0**: free in any project with a credit line. Calm pieces such as
  "In Dreams", "Sanctum", "A Dragon's Lullabye" suit menus and quiet play.
- **Alexander Nakarada** (CC BY 4.0, on free-stock-music.com and itch.io):
  fantasy and medieval tracks ("Traversing the White Peaks", "Forest Walk").
  Credit required.
- **Kevin MacLeod / Incompetech**: a large CC BY catalog; credit required.
- **Tabletop Audio** (tabletopaudio.com): ambience made for TTRPG tables,
  exactly the right style. Free, ad-free and supported by patrons; reported
  as free for **non-commercial** use, and SoundPad sounds are excluded from
  its Creative Commons license. This is a personal, non-commercial project,
  so it likely fits, but its terms page couldn't be opened from this
  session. Read it before using any track.

### Recommendation

1. **Effects:** Kenney Casino Audio for all card, chip and dice foley (CC0, commit
   the files), plus a handful of magic and impact sounds from the Sonniss GDC
   bundle.
2. **Music:** two or three Scott Buckley tracks for the menus, and quiet
   ambient loops during games (Tabletop Audio if its terms allow, otherwise
   Sonniss ambience or Pixabay). Credits go on a small Credits page.
3. Keep the files small: OGG or MP3, effects under ~50 KB each, music
   streamed rather than preloaded.

## Upgrades (if free isn't good enough)

Worth it only if the free sets sound thin once built. Prices change, so check
each site:

- **Paid Sonniss / A Sound Effect libraries**: professional magic and
  fantasy packs, bought once and royalty-free.
- **Humble Bundle audio bundles**: big game-audio libraries for a few
  dollars when one is on; watch for one with a fantasy theme.
- **Tabletop Audio Patreon**: supporting it also covers wider use, and
  patrons get ambience-only versions of the tracks.
- **Syrinscape**: the TTRPG standard for live soundscapes, but it is
  built to play through its own app. Unless its license says otherwise, plan
  on it being for listening at the table, not for putting in the game.

## How it was planned

- `client/src/audio/`: one small mixer on the Web Audio API with three
  groups: **Effects**, **Ambience**, **Music**. Each has its own volume, kept
  in `localStorage` (per-device preference). Sound stays off until the player
  turns it on, as the pack sounds already do; browsers block audio before the
  first click anyway.
- A table from event type to sound id (the sound map above), played from the
  same place as card flights, so the sounds match the animations; opponents'
  sounds a little quieter.
- Audio files in `client/public/audio/` (CC0 and CC BY files may be
  committed; keep a `CREDITS.md` there), loaded on first use.
- Respect the system mute and `prefers-reduced-motion` (no sounds for skipped
  animations); never more than a few sounds at once.
