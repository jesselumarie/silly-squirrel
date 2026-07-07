/**
 * Shared sprite-generation helpers used by both the manual script
 * (generate-assets.mjs) and the Vercel build step (prepare-assets.mjs).
 */

import { PNG } from 'pngjs';

export const STYLE =
  'Cute cartoon game sprite for a kids game, thick outlines, bright cheerful colors, ' +
  'simple shapes, centered, on a plain solid white background with nothing else, ' +
  'no text, no shadow.';

/** id → what to draw. Add entries here when you add items in src/game/config.ts. */
export const SPRITES = {
  squirrel: 'A happy silly squirrel with a big fluffy tail, running',
  heart: 'A big shiny red love heart',
  toolbox: 'A red metal toolbox with a handle, slightly open with tools peeking out',
  dumpster: 'A green metal dumpster with an open lid',
  troll: 'A grumpy but funny green troll with messy hair, kid-friendly and not scary',
  strawberry: 'A juicy red strawberry',
  acorn: 'A shiny brown acorn',
  peanut: 'A peanut in its shell',
  apple: 'A bright red apple',
  cookie: 'A chocolate chip cookie',
  cherries: 'Two red cherries on a stem',
  wrench: 'A silver wrench',
  hammer: 'A hammer with a wooden handle',
  saw: 'A hand saw with a wooden handle',
  screwdriver: 'A screwdriver with a red handle',
  bomb: 'A round black cartoon bomb with a lit sparkling fuse',
  dynamite: 'A stick of red dynamite with a lit fuse',
  fire: 'A cartoon flame',
  meteor: 'A flaming meteor rock',
};

/** Ask Gemini for a sprite image; returns a raw PNG buffer. */
export async function generateSprite(id, description, apiKey) {
  const model = process.env.GEMINI_IMAGE_MODEL ?? 'gemini-2.5-flash-image';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${description}. ${STYLE}` }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  });
  if (!res.ok) {
    throw new Error(`Gemini API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error(`No image returned for "${id}"`);
  return Buffer.from(part.inlineData.data, 'base64');
}

/**
 * Make a generated image game-ready: knock out the flat background so the
 * sprite has transparency, and downscale so the page stays lightweight.
 */
export function processSprite(buffer, maxDim = 256) {
  let png = PNG.sync.read(buffer);
  png = keyOutBackground(png);
  png = downscale(png, maxDim);
  return PNG.sync.write(png);
}

/** If the image is fully opaque with a flat background, make it transparent. */
function keyOutBackground(png) {
  const { width: w, height: h, data } = png;

  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) return png; // already has transparency — leave it alone
  }

  // Sample the four corners; if they agree, that's the background color.
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + w - 1) * 4].map((i) => [
    data[i],
    data[i + 1],
    data[i + 2],
  ]);
  const bg = [0, 1, 2].map((c) => corners.reduce((sum, k) => sum + k[c], 0) / 4);
  const spread = Math.max(
    ...[0, 1, 2].map((c) => Math.max(...corners.map((k) => Math.abs(k[c] - bg[c])))),
  );
  if (spread > 40) return png; // corners disagree — probably not a flat background

  for (let i = 0; i < data.length; i += 4) {
    const dist =
      Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]);
    if (dist < 70) data[i + 3] = 0;
    else if (dist < 140) data[i + 3] = Math.round(((dist - 70) / 70) * 255);
  }
  return png;
}

/** Box-filter downscale (alpha-weighted so edges don't get halos). */
function downscale(png, maxDim) {
  const { width: w, height: h, data } = png;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  if (scale === 1) return png;
  const w2 = Math.max(1, Math.round(w * scale));
  const h2 = Math.max(1, Math.round(h * scale));
  const out = new PNG({ width: w2, height: h2 });

  for (let y = 0; y < h2; y++) {
    const y0 = Math.floor(y / scale);
    const y1 = Math.min(h, Math.max(y0 + 1, Math.ceil((y + 1) / scale)));
    for (let x = 0; x < w2; x++) {
      const x0 = Math.floor(x / scale);
      const x1 = Math.min(w, Math.max(x0 + 1, Math.ceil((x + 1) / scale)));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * w + xx) * 4;
          const pa = data[i + 3];
          r += data[i] * pa;
          g += data[i + 1] * pa;
          b += data[i + 2] * pa;
          a += pa;
          n++;
        }
      }
      const o = (y * w2 + x) * 4;
      out.data[o] = a ? Math.round(r / a) : 0;
      out.data[o + 1] = a ? Math.round(g / a) : 0;
      out.data[o + 2] = a ? Math.round(b / a) : 0;
      out.data[o + 3] = Math.round(a / n);
    }
  }
  return out;
}
