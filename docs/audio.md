# Sounds wanted

The user is choosing the game's sounds (2026-11-05); this is the list the
game needs. No game audio is built yet (the only sounds are the older
synthesized pack-opening ones in `client/src/packs/sound.ts`, off by
default). Once the files arrive, the sound system is built around them:
each sound plays as its card animates, with separate volumes for effects,
ambience and music, and sound stays off until the player turns it on.

## How to hand them over

- **Name each file by its id** from the tables below, e.g. `draw.ogg`,
  `land.mp3`. For a sound you'd like varied, add numbers: `draw-1.ogg`,
  `draw-2.ogg`, `draw-3.ogg` (the game picks one at random each time).
- **Format:** `.ogg` or `.mp3` (`.wav` is fine too; it gets converted).
- **Put them in** `packages/client/public/audio/` on your computer, then
  commit and push them, or send them in the chat.
- **Licenses:** the files will be committed to GitHub, so use sounds whose
  license allows sharing them in a project: CC0, CC BY (note the author),
  the Pixabay License, or the Sonniss GDC bundles. Add one line per file to
  `packages/client/public/audio/CREDITS.md`: file, where it came from,
  author, license.
- **Trim** silence from the start of each effect, so it lands on the
  animation.

## Effects

Short and quiet unless noted. The **Must** ones matter most; the rest can
wait (a similar sound stands in until they arrive).

| Id | When it plays | What it should sound like | Length | Priority |
| --- | --- | --- | --- | --- |
| `draw` | a card is drawn | card sliding off a deck | < 0.4 s | Must (2-3 variations) |
| `shuffle` | a library is shuffled | riffle shuffle | ~1 s | Must |
| `land` | a land is played | card placed firmly on a table | < 0.4 s | Must (2-3 variations) |
| `cast` | a spell is cast | card flick plus a faint magical shimmer | < 0.8 s | Must |
| `castBig` | a spell of 5+ mana is cast | bigger magical swell | ~1 s | Nice |
| `commander` | a commander is cast | a short signature sting, grand | 1-2 s | Nice |
| `permanent` | a creature or other permanent enters | solid card thud, a little weight | < 0.5 s | Must |
| `resolve` | an instant or sorcery resolves | short magical burst or chime | < 0.8 s | Must |
| `countered` | a spell is countered | muffled "puff", magic fizzling out | < 0.8 s | Nice |
| `tap` | a card is tapped | very soft card turn or click | < 0.2 s | Must (very quiet) |
| `untap` | your untap step | soft brush of cards | < 0.4 s | Nice |
| `attack` | attackers are declared | sword drawn, or a war horn | < 1 s | Must |
| `block` | a blocker is declared | shield bump, wood or metal | < 0.5 s | Nice |
| `damage` | combat or spell damage (1-4) | hit or punch impact | < 0.5 s | Must |
| `damageBig` | 5+ damage at once | heavy impact | < 1 s | Nice |
| `die` | a creature dies | low thump, falling | < 0.8 s | Must |
| `wipe` | 3+ permanents die at once | large crash or rumble | 1-2 s | Nice |
| `exile` | a card is exiled | airy whoosh, disappearing | < 0.8 s | Nice |
| `lifeGain` | life is gained | soft rising chime | < 0.8 s | Must |
| `lifeLoss` | life is lost (not from damage) | soft falling tone | < 0.8 s | Nice |
| `counter` | +1/+1, poison or other counters | poker chip clack | < 0.3 s | Nice |
| `token` | a token is created | light "pop" | < 0.4 s | Nice |
| `yourTurn` | your turn starts | gentle bell or chime | < 1 s | Must |
| `dice` | a die is rolled | dice rolling on a table | < 1 s | Nice |
| `coin` | a coin is flipped | coin flip and ring | < 1 s | Nice |
| `win` | you win | short fanfare | 2-4 s | Must |
| `lose` | you lose | short low sting | 2-4 s | Must |

Menu sounds (optional):

| Id | When it plays | What it should sound like | Length |
| --- | --- | --- | --- |
| `click` | buttons in menus | soft click | < 0.2 s |
| `packOpen` | opening a booster pack | foil wrapper tearing | < 1 s |
| `rare` | a rare or mythic in a pack | sparkle chime | < 1.5 s |

## Ambience (during games)

Long, quiet loops with no strong melody, so they don't distract from
playing. Put them in `packages/client/public/audio/ambience/` (any names).
One or two is enough to start, 2-10 minutes each, looping cleanly. Ideas: a
quiet tavern or library, a wizard's study (fire crackling, pages), a forest
at night, distant wind.

## Music (menus)

Calm fantasy music for the menus and the win/lose screens. Put it in
`packages/client/public/audio/music/` (any names): two to four tracks, 2-5
minutes each.

## Where to look (free)

- Kenney (kenney.nl): Casino Audio (cards, chips, dice), RPG Audio, Impact
  Sounds, Interface Sounds. CC0.
- Sonniss GDC bundles (sonniss.com): professional magic, impacts, ambience.
- Freesound (freesound.org): filter to CC0 or CC BY.
- Pixabay sound effects and music.
- Music: Kevin MacLeod (incompetech.com, CC BY), Scott Buckley (CC BY).
- Ambience: Tabletop Audio (check its terms first).

## Starting smaller

If finding all of these is a lot, these cover most of a game: `draw`,
`land`, `cast`, `permanent`, `resolve`, `attack`, `damage`, `die`,
`yourTurn`, `win`, `lose`, and one ambience loop.
