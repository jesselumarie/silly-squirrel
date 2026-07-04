/**
 * Sprite drawing with a two-tier art system:
 *   1. If a custom image exists at /assets/items/<id>.png (e.g. generated
 *      with the Gemini script in scripts/generate-assets.mjs), we use it.
 *   2. Otherwise we fall back to crisp emoji rendering.
 *
 * This means the game always works, and custom art plugs in with zero
 * code changes — just drop PNGs into public/assets/items/.
 */

const images = new Map<string, HTMLImageElement>();

/** Kick off a background load for a custom sprite; harmless if it 404s. */
export function preloadSprite(id: string): void {
  if (images.has(id)) return;
  const img = new Image();
  img.src = `/assets/items/${id}.png`;
  img.onload = () => images.set(id, img);
  img.onerror = () => {
    /* no custom art — emoji fallback will be used */
  };
}

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  id: string,
  emoji: string,
  x: number,
  y: number,
  size: number,
  rotation = 0,
  flipX = false,
): void {
  ctx.save();
  // Whole-pixel positions keep color-emoji glyphs rasterizing stably from
  // frame to frame; fractional positions make them shimmer on some devices.
  ctx.translate(Math.round(x), Math.round(y));
  if (rotation !== 0) ctx.rotate(rotation);
  if (flipX) ctx.scale(-1, 1);

  const img = images.get(id);
  if (img) {
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
  } else {
    ctx.font = `${size}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 0, size * 0.06);
  }
  ctx.restore();
}
