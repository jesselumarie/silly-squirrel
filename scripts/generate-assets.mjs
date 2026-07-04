/**
 * Generate custom game art with Google Gemini image generation.
 *
 * Usage:
 *   GEMINI_API_KEY=your-key npm run generate-assets
 *
 * Writes PNGs into public/assets/items/<id>.png. The game automatically
 * uses any PNG it finds there and falls back to emoji for the rest, so
 * you can generate art for as many or as few items as you like.
 *
 * After generating, commit the PNGs and redeploy.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_IMAGE_MODEL ?? 'gemini-2.5-flash-image';
const OUT_DIR = path.resolve('public/assets/items');

const STYLE =
  'Cute cartoon game sprite for a kids game, thick outlines, bright cheerful colors, ' +
  'simple shapes, centered on a fully transparent background, no text, no shadow.';

/** id → what to draw. Add entries here when you add items in src/game/config.ts. */
const SPRITES = {
  squirrel: 'A happy silly squirrel with a big fluffy tail, running',
  heart: 'A big shiny red love heart',
  dumpster: 'A green metal dumpster with an open lid',
  strawberry: 'A juicy red strawberry',
  acorn: 'A shiny brown acorn',
  peanut: 'A peanut in its shell',
  apple: 'A bright red apple',
  cookie: 'A chocolate chip cookie',
  cherries: 'Two red cherries on a stem',
  bomb: 'A round black cartoon bomb with a lit sparkling fuse',
  dynamite: 'A stick of red dynamite with a lit fuse',
  fire: 'A cartoon flame',
  meteor: 'A flaming meteor rock',
};

async function generate(id, description) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${description}. ${STYLE}` }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  });
  if (!res.ok) {
    throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error(`No image returned for "${id}"`);
  await writeFile(path.join(OUT_DIR, `${id}.png`), Buffer.from(part.inlineData.data, 'base64'));
}

if (!API_KEY) {
  console.error('Set GEMINI_API_KEY first, e.g.:');
  console.error('  GEMINI_API_KEY=your-key npm run generate-assets');
  process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });
for (const [id, description] of Object.entries(SPRITES)) {
  process.stdout.write(`Generating ${id}... `);
  try {
    await generate(id, description);
    console.log('done');
  } catch (err) {
    console.log(`failed (${err.message}) — the game will keep using the emoji for this one`);
  }
}
console.log(`\nDone! Art saved to ${OUT_DIR}. Commit the PNGs and redeploy to see them in the game.`);
