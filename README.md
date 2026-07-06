# Silly Squirrel 🐿️

A kids' sorting game based on an original crayon design. A silly squirrel runs
back and forth along an electric wire carrying things. Drop the **yummy things**
(strawberries, nuts, cookies...) into the **❤️ heart side**, and the **bad
things** (bombs, dynamite, fire...) into the **🗑️ dumpster side**!

## How to play

- The squirrel runs along the wire on its own, bouncing off the edges
- **⬅️ / ➡️** (or A / D) change which way it runs
- **Tap the screen** or press **SPACE** to drop what it's carrying
- Sort correctly for points; 3 mistakes and it's game over
- Every 50 points is a new level — the squirrel gets faster!

Works on desktop and phones/tablets (tap to drop).

## Development

```bash
npm install
npm run dev       # local dev server with hot reload
npm run build     # type-check + production build to dist/
```

Built with [Vite](https://vitejs.dev/) + TypeScript and a plain HTML canvas —
no game engine, so it's easy to read and change.

## Debug menu

Tap the **⚙️ gear** in the bottom-right corner (or press `` ` ``) to open the
debug menu: live difficulty sliders for everything in `TUNING`, Easy / Normal /
Hard presets, and cheat buttons (+tools, +life, summon the troll). Changes
apply instantly and are remembered in the browser; "Reset to defaults" puts
everything back.

## Adding stuff to the game

Everything is designed to be easy to extend:

- **New items** — add one line to `ITEMS` in [`src/game/config.ts`](src/game/config.ts)
- **Difficulty** — tweak `TUNING` in the same file (speed, gravity, lives, level pacing...)
- **Sounds** — synthesized in [`src/game/audio.ts`](src/game/audio.ts), no audio files needed
- **Game logic** — [`src/game/Game.ts`](src/game/Game.ts) (menu / playing / game-over states)
- **Particles & effects** — [`src/game/effects.ts`](src/game/effects.ts)

## Custom art with Gemini

The game ships with emoji art so it always works, but you can generate custom
cartoon sprites with a Gemini API key:

```bash
GEMINI_API_KEY=your-key npm run generate-assets
```

This writes PNGs to `public/assets/items/`. The game automatically prefers a
PNG when one exists (see `src/game/sprites.ts`) and falls back to emoji
otherwise — so partial generation is fine. Commit the PNGs and redeploy.

## Deployment

Deployed on [Vercel](https://vercel.com). Vercel auto-detects the Vite setup:
build command `npm run build`, output directory `dist`. Pushing to the
production branch redeploys automatically once the repo is connected.
