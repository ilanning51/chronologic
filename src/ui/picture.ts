/** The long side of a goal's picture as stored, in pixels: twice the mural, for a sharp screen. */
export const PICTURE_PX = 256;
/** JPEG quality of the stored picture. */
const QUALITY = 0.82;

/**
 * Shrinks a chosen image to a small JPEG data URL fit for the world, which lives in local
 * storage. The bitmap is read the way the camera held it, so a phone photo comes out upright.
 * Rejects when the file is not an image the browser can read.
 */
export async function shrink(file: Blob, max = PICTURE_PX): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const k = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * k));
    const h = Math.max(1, Math.round(bitmap.height * k));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No canvas to draw the picture on');
    ctx.drawImage(bitmap, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', QUALITY);
  } finally {
    bitmap.close();
  }
}
