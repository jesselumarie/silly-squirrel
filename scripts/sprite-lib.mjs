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

/**
 * Characters that get a second animation frame (<id>_2.png). The game
 * flips between the two frames like classic 2-frame cartoon animation.
 * The value describes how frame 2's pose differs from frame 1.
 */
export const ANIMATED = {
  squirrel: 'its legs in the opposite running position, tail swished the other way',
  troll: 'both arms raised up high mid-stomp with an angrier face',
};

async function callGemini(parts, apiKey) {
  const model = process.env.GEMINI_IMAGE_MODEL ?? 'gemini-2.5-flash-image';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  });
  if (!res.ok) {
    throw new Error(`Gemini API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error('No image returned');
  return Buffer.from(part.inlineData.data, 'base64');
}

/** Ask Gemini for a sprite image; returns a raw PNG buffer. */
export async function generateSprite(id, description, apiKey) {
  return callGemini([{ text: `${description}. ${STYLE}` }], apiKey);
}

/**
 * Generate animation frame 2 from frame 1. Passing frame 1 back as an
 * image keeps the character consistent between frames.
 */
export async function generateSpriteFrame2(frame1Png, poseChange, apiKey) {
  return callGemini(
    [
      { inlineData: { mimeType: 'image/png', data: frame1Png.toString('base64') } },
      {
        text:
          'This is frame 1 of a 2-frame game animation. Draw frame 2: the exact same ' +
          `character in the same style, size, and colors, but with ${poseChange}. ` +
          'Plain solid pure-white background. Do not add any extra objects, motion lines, ' +
          'dust clouds, shadows, text, or background details — only the character on white.',
      },
    ],
    apiKey,
  );
}

/**
 * Make a generated image game-ready: knock out the flat background so the
 * sprite has transparency, and downscale so the page stays lightweight.
 */
export function processSprite(buffer, maxDim = 256) {
  let png = PNG.sync.read(buffer);
  png = keyOutBackground(png);
  png = trimTransparentEdges(png);
  png = downscale(png, maxDim);
  return PNG.sync.write(png);
}

/**
 * Make the background transparent. Uses a flood fill from the image border
 * so only pixels CONNECTED to the outside are removed — white fur inside a
 * white-background sprite stays white instead of becoming a hole. The
 * background color is the dominant color along the border, which tolerates
 * slight gradients and stray artifact pixels far better than corner
 * sampling.
 */
function keyOutBackground(png) {
  const { width: w, height: h, data } = png;

  // If the image already has real transparency, trust it.
  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) transparent++;
  }
  if (transparent > w * h * 0.02) return png;

  // Dominant border color = the background.
  const counts = new Map();
  const borderPixel = (p) => {
    const key = `${data[p * 4] >> 4},${(data[p * 4 + 1] >> 4)},${data[p * 4 + 2] >> 4}`;
    const entry = counts.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    entry.n++;
    entry.r += data[p * 4];
    entry.g += data[p * 4 + 1];
    entry.b += data[p * 4 + 2];
    counts.set(key, entry);
  };
  for (let x = 0; x < w; x++) {
    borderPixel(x);
    borderPixel((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    borderPixel(y * w);
    borderPixel(y * w + w - 1);
  }
  const dominant = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  const bg = [dominant.r / dominant.n, dominant.g / dominant.n, dominant.b / dominant.n];

  const distTo = (p) =>
    Math.abs(data[p * 4] - bg[0]) +
    Math.abs(data[p * 4 + 1] - bg[1]) +
    Math.abs(data[p * 4 + 2] - bg[2]);

  const visited = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);

  while (stack.length > 0) {
    const p = stack.pop();
    if (visited[p]) continue;
    visited[p] = 1;
    const dist = distTo(p);
    if (dist >= 140) continue; // hit the sprite outline — stop here
    data[p * 4 + 3] = dist < 70 ? 0 : Math.round(((dist - 70) / 70) * 255);
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }
  return png;
}

/**
 * Pad two processed animation frames onto identical-size canvases
 * (bottom-center aligned) so the character doesn't jump in scale or
 * position when the game flips between them.
 */
export function normalizeFramePair(buf1, buf2) {
  const a = PNG.sync.read(buf1);
  const b = PNG.sync.read(buf2);
  const w = Math.max(a.width, b.width);
  const h = Math.max(a.height, b.height);
  const pad = (src) => {
    if (src.width === w && src.height === h) return src;
    const out = new PNG({ width: w, height: h }); // starts fully transparent
    const offX = Math.floor((w - src.width) / 2);
    const offY = h - src.height; // bottom aligned — feet stay planted
    for (let y = 0; y < src.height; y++) {
      const from = y * src.width * 4;
      src.data.copy(out.data, ((y + offY) * w + offX) * 4, from, from + src.width * 4);
    }
    return out;
  };
  return [PNG.sync.write(pad(a)), PNG.sync.write(pad(b))];
}

/** Crop away fully transparent padding so the sprite fills its box. */
function trimTransparentEdges(png, margin = 2) {
  const { width: w, height: h, data } = png;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return png; // fully transparent — leave as is
  minX = Math.max(0, minX - margin);
  minY = Math.max(0, minY - margin);
  maxX = Math.min(w - 1, maxX + margin);
  maxY = Math.min(h - 1, maxY + margin);
  const w2 = maxX - minX + 1;
  const h2 = maxY - minY + 1;
  if (w2 === w && h2 === h) return png;
  const out = new PNG({ width: w2, height: h2 });
  for (let y = 0; y < h2; y++) {
    const src = ((y + minY) * w + minX) * 4;
    data.copy(out.data, y * w2 * 4, src, src + w2 * 4);
  }
  return out;
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
