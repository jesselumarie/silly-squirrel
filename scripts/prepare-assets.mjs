/**
 * Build-time asset step (runs automatically before `vite build`).
 *
 * On Vercel, where GEMINI_API_KEY and BLOB_READ_WRITE_TOKEN are set:
 *   - sprites already cached in Vercel Blob are downloaded
 *   - missing sprites are generated with Gemini, processed (transparent
 *     background, downscaled), uploaded to Blob for next time, and used
 *
 * Anywhere the tokens are missing (e.g. local dev), it does nothing and
 * the game falls back to emoji art. This script NEVER fails the build.
 *
 * To force one sprite to regenerate, delete items/<id>.png from the Blob
 * store in the Vercel dashboard and redeploy.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SPRITES, generateSprite, processSprite } from './sprite-lib.mjs';

const OUT_DIR = path.resolve('public/assets/items');
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

async function main() {
  if (!GEMINI_KEY && !BLOB_TOKEN) {
    console.log('prepare-assets: no GEMINI_API_KEY or BLOB_READ_WRITE_TOKEN — using emoji art.');
    return;
  }
  await mkdir(OUT_DIR, { recursive: true });

  const cached = new Map();
  let blob = null;
  if (BLOB_TOKEN) {
    try {
      blob = await import('@vercel/blob');
      const listing = await blob.list({ prefix: 'items/' });
      for (const b of listing.blobs) cached.set(b.pathname, b.url);
      console.log(`prepare-assets: ${cached.size} sprites already cached in Blob storage.`);
    } catch (err) {
      console.log(`prepare-assets: Blob unavailable (${err.message}) — continuing without cache.`);
      blob = null;
    }
  }

  for (const [id, description] of Object.entries(SPRITES)) {
    const pathname = `items/${id}.png`;
    const outFile = path.join(OUT_DIR, `${id}.png`);
    try {
      const cachedUrl = cached.get(pathname);
      if (cachedUrl) {
        const res = await fetch(cachedUrl);
        if (!res.ok) throw new Error(`blob fetch ${res.status}`);
        await writeFile(outFile, Buffer.from(await res.arrayBuffer()));
        console.log(`  ↓ ${id} (from cache)`);
      } else if (GEMINI_KEY) {
        const raw = await generateSprite(id, description, GEMINI_KEY);
        const processed = processSprite(raw);
        await writeFile(outFile, processed);
        if (blob) {
          await blob.put(pathname, processed, {
            access: 'public',
            addRandomSuffix: false,
            allowOverwrite: true,
            contentType: 'image/png',
          });
        }
        console.log(`  ✨ ${id} (generated with Gemini)`);
      } else {
        console.log(`  - ${id}: not cached and no GEMINI_API_KEY — emoji fallback`);
      }
    } catch (err) {
      console.log(`  ! ${id}: ${err.message} — emoji fallback`);
    }
  }
}

try {
  await main();
} catch (err) {
  // Art must never break the game: log and let the build continue.
  console.log(`prepare-assets: skipped (${err.message})`);
}
