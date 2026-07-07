/**
 * Manually (re)generate ALL game art with Google Gemini.
 *
 * Usage:
 *   GEMINI_API_KEY=your-key npm run generate-assets
 *
 * Writes processed PNGs (transparent background, downscaled) into
 * public/assets/items/<id>.png. The game automatically uses any PNG it
 * finds there and falls back to emoji for the rest.
 *
 * Note: deploys normally get art from scripts/prepare-assets.mjs, which
 * generates once on Vercel and caches in Blob storage. Use this script
 * for local experimentation, then commit the PNGs you like.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ANIMATED, SPRITES, generateSprite, generateSpriteFrame2, processSprite } from './sprite-lib.mjs';

const API_KEY = process.env.GEMINI_API_KEY;
const OUT_DIR = path.resolve('public/assets/items');

if (!API_KEY) {
  console.error('Set GEMINI_API_KEY first, e.g.:');
  console.error('  GEMINI_API_KEY=your-key npm run generate-assets');
  process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });
for (const [id, description] of Object.entries(SPRITES)) {
  process.stdout.write(`Generating ${id}... `);
  try {
    const frame1 = processSprite(await generateSprite(id, description, API_KEY));
    await writeFile(path.join(OUT_DIR, `${id}.png`), frame1);
    if (ANIMATED[id]) {
      const frame2 = processSprite(await generateSpriteFrame2(frame1, ANIMATED[id], API_KEY));
      await writeFile(path.join(OUT_DIR, `${id}_2.png`), frame2);
      process.stdout.write('(2 frames) ');
    }
    console.log('done');
  } catch (err) {
    console.log(`failed (${err.message}) — the game will keep using the emoji for this one`);
  }
}
console.log(`\nDone! Art saved to ${OUT_DIR}. Commit the PNGs and redeploy to see them in the game.`);
