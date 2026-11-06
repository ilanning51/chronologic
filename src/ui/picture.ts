import { PALETTE } from '../model/palette';
import { DAY_PAPER } from '../plane/daylight';

/**
 * A goal's picture is painted the way the map is: a few big flat blocks in the inks the plane
 * already uses. A photo is shrunk to a small grid, every block takes the average of what it
 * covered, and that average is snapped to the nearest ink. The browser then scales the grid up
 * with hard edges, so the picture is pixel art in the map's own colours rather than a photograph
 * on the paper.
 */

/** Blocks across and down a goal's picture. */
export const PICTURE_PX = 16;

/** The ink and the muted ink, as tokens.css sets them. */
const INK = '#111111';
const MUTED = '#636466';

/** The inks a picture may be painted in: paper, ink, muted, and the eight track colours. */
export const INKS: readonly string[] = [DAY_PAPER, INK, MUTED, ...PALETTE.map((c) => c.color)];

type Rgb = [number, number, number];

function parse(hex: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

const INK_RGB: readonly Rgb[] = INKS.map(parse);

/**
 * How far apart two colours look, roughly: squared distance in RGB weighted by the mean red, a
 * cheap stand-in for the eye's uneven sensitivity. Only the order matters.
 */
function apart(a: Rgb, b: Rgb): number {
  const r = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return (2 + r / 256) * dr * dr + 4 * dg * dg + (2 + (255 - r) / 256) * db * db;
}

/** The ink nearest a colour, as its hex. */
export function nearestInk(r: number, g: number, b: number): string {
  let best = 0;
  let least = Infinity;
  for (let i = 0; i < INK_RGB.length; i++) {
    const d = apart([r, g, b], INK_RGB[i]);
    if (d < least) {
      least = d;
      best = i;
    }
  }
  return INKS[best];
}

/** Snaps every pixel of an RGBA buffer to the nearest ink, fully opaque. A new buffer; the given one is left alone. */
export function paint(pixels: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b] = parse(nearestInk(pixels[i], pixels[i + 1], pixels[i + 2]));
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = 255;
  }
  return out;
}

/**
 * Turns a chosen image into a goal's picture: the centre square of it, shrunk to PICTURE_PX
 * blocks with each block the average of what it covered, painted in the inks, and kept as a
 * tiny PNG data URL. The bitmap is read the way the camera held it, so a phone photo comes out
 * upright. Rejects when the file is not an image the browser can read.
 */
export async function pixelate(file: Blob, blocks = PICTURE_PX): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = blocks;
    canvas.height = blocks;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No canvas to paint the picture on');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, blocks, blocks);
    const image = ctx.getImageData(0, 0, blocks, blocks);
    image.data.set(paint(image.data));
    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png');
  } finally {
    bitmap.close();
  }
}
