# Game audio

Download Kenney's four packs in the browser first (casino-audio, rpg-audio,
impact-sounds, interface-sounds on kenney.nl: Download, then "Continue
without donating"). `npm run audio` (from the repository root) unpacks them
from your Downloads folder, downloads the music, puts it all in this folder and writes `manifest.json` and `CREDITS.md`. The files are
not committed; run it once on each computer. See `docs/audio.md`.

- `effects/`: Kenney's CC0 packs (cards, chips, dice, impacts, interface).
- `music/`: menu music (Kevin MacLeod, CC BY 4.0), or your own files.
- `ambience/`: in-game background loops; add your own (Tabletop Audio,
  Scott Buckley, Sonniss ambience), credit them in `CREDITS.md`, and run
  `npm run audio` again so the manifest lists them.

Any sound without a file is synthesized by the game.
