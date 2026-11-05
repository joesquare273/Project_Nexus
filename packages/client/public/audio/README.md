# Game audio

`npm run audio` (from the repository root) downloads the free sound packs
into this folder and writes `manifest.json` and `CREDITS.md`. The files are
not committed; run it once on each computer. See `docs/audio.md`.

- `effects/`: Kenney's CC0 packs (cards, chips, dice, impacts, interface).
- `music/`: menu music (Kevin MacLeod, CC BY 4.0), or your own files.
- `ambience/`: in-game background loops; add your own (Tabletop Audio,
  Scott Buckley, Sonniss ambience), credit them in `CREDITS.md`, and run
  `npm run audio` again so the manifest lists them.

Any sound without a file is synthesized by the game.
