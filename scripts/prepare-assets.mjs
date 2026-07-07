/**
 * Build-time asset step (runs automatically before `vite build`).
 *
 * On Vercel, where GEMINI_API_KEY and BLOB_READ_WRITE_TOKEN are set:
 *   - sprites already cached in Vercel Blob are downloaded
 *   - missing sprites are generated with Gemini, processed (transparent
 *     background via edge flood-fill, trimmed, downscaled), uploaded to
 *     Blob for next time, and used
 *   - characters listed in ANIMATED also get a second animation frame
 *     (<id>_2.png), generated from frame 1 for consistency
 *
 * Anywhere the tokens are missing (e.g. local dev), it does nothing and
 * the game falls back to emoji art. This script NEVER fails the build.
 *
 * PREFIX doubles as a cache version: bump it after changing the image
 * processing or prompts to regenerate everything on the next deploy. To
 * regenerate a single sprite, delete <PREFIX><id>.png from the Blob
 * store in the Vercel dashboard and redeploy.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ANIMATED, SPRITES, generateSprite, generateSpriteFrame2, processSprite } from './sprite-lib.mjs';

const PREFIX = 'items-v2/';
const OUT_DIR = path.resolve('public/assets/items');
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

let blob = null;
const cached = new Map();

/** Returns the processed sprite buffer from cache or Gemini, or null. */
async function obtainSprite(name, generate) {
  const pathname = `${PREFIX}${name}.png`;
  const cachedUrl = cached.get(pathname);
  if (cachedUrl) {
    const res = await fetch(cachedUrl);
    if (!res.ok) throw new Error(`blob fetch ${res.status}`);
    console.log(`  ↓ ${name} (from cache)`);
    return Buffer.from(await res.arrayBuffer());
  }
  if (!GEMINI_KEY) {
    console.log(`  - ${name}: not cached and no GEMINI_API_KEY — emoji fallback`);
    return null;
  }
  const processed = processSprite(await generate());
  if (blob) {
    await blob.put(pathname, processed, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'image/png',
    });
  }
  console.log(`  ✨ ${name} (generated with Gemini)`);
  return processed;
}

async function main() {
  if (!GEMINI_KEY && !BLOB_TOKEN) {
    console.log('prepare-assets: no GEMINI_API_KEY or BLOB_READ_WRITE_TOKEN — using emoji art.');
    return;
  }
  await mkdir(OUT_DIR, { recursive: true });

  if (BLOB_TOKEN) {
    try {
      blob = await import('@vercel/blob');
      const listing = await blob.list({ prefix: PREFIX });
      for (const b of listing.blobs) cached.set(b.pathname, b.url);
      console.log(`prepare-assets: ${cached.size} sprites already cached in Blob storage.`);
    } catch (err) {
      console.log(`prepare-assets: Blob unavailable (${err.message}) — continuing without cache.`);
      blob = null;
    }
  }

  for (const [id, description] of Object.entries(SPRITES)) {
    let frame1 = null;
    try {
      frame1 = await obtainSprite(id, () => generateSprite(id, description, GEMINI_KEY));
      if (frame1) await writeFile(path.join(OUT_DIR, `${id}.png`), frame1);
    } catch (err) {
      console.log(`  ! ${id}: ${err.message} — emoji fallback`);
    }

    const poseChange = ANIMATED[id];
    if (!poseChange || !frame1) continue;
    try {
      const frame2 = await obtainSprite(`${id}_2`, () =>
        generateSpriteFrame2(frame1, poseChange, GEMINI_KEY),
      );
      if (frame2) await writeFile(path.join(OUT_DIR, `${id}_2.png`), frame2);
    } catch (err) {
      console.log(`  ! ${id}_2: ${err.message} — will animate frame 1 only`);
    }
  }
}

try {
  await main();
} catch (err) {
  // Art must never break the game: log and let the build continue.
  console.log(`prepare-assets: skipped (${err.message})`);
}
