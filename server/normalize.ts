import sharp from 'sharp';

export interface RawImage {
  data: Buffer;
  width: number;
  height: number;
}

async function toRaw(buf: Buffer): Promise<RawImage> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

async function cropTopLeft(buf: Buffer, width: number, height: number): Promise<Buffer> {
  return sharp(buf).extract({ left: 0, top: 0, width, height }).png().toBuffer();
}

async function extendWhite(buf: Buffer, width: number, targetHeight: number): Promise<Buffer> {
  const meta = await sharp(buf).metadata();
  const currentHeight = meta.height ?? 0;
  if (currentHeight >= targetHeight) return buf;
  return sharp(buf)
    .extend({
      top: 0,
      bottom: targetHeight - currentHeight,
      left: 0,
      right: 0,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();
}

/**
 * Normalizes a reference/target PNG pair captured at the same viewport
 * width (url<->url case): widths already match, so both are cropped to the
 * shared minimum height (top-aligned) to produce identical-dimension raw
 * RGBA buffers.
 */
export async function normalizeUrlPair(refPng: Buffer, targetPng: Buffer): Promise<{ ref: RawImage; target: RawImage }> {
  const [refMeta, targetMeta] = await Promise.all([sharp(refPng).metadata(), sharp(targetPng).metadata()]);
  const width = Math.min(refMeta.width ?? 0, targetMeta.width ?? 0);
  const height = Math.min(refMeta.height ?? 0, targetMeta.height ?? 0);

  const [refCropped, targetCropped] = await Promise.all([
    cropTopLeft(refPng, width, height),
    cropTopLeft(targetPng, width, height),
  ]);

  const [ref, target] = await Promise.all([toRaw(refCropped), toRaw(targetCropped)]);
  return { ref, target };
}

/**
 * Normalizes an uploaded reference image against a target screenshot: the
 * reference is resized to the target's width (preserving aspect ratio),
 * then its height is cropped or extended (white) to match the target.
 */
export async function normalizeImageAgainstTarget(
  refImagePng: Buffer,
  targetPng: Buffer,
): Promise<{ ref: RawImage; target: RawImage }> {
  const targetMeta = await sharp(targetPng).metadata();
  const targetWidth = targetMeta.width ?? 0;
  const targetHeight = targetMeta.height ?? 0;

  let resizedRef = await sharp(refImagePng).resize({ width: targetWidth }).png().toBuffer();
  const resizedMeta = await sharp(resizedRef).metadata();
  const resizedHeight = resizedMeta.height ?? 0;

  if (resizedHeight > targetHeight) {
    resizedRef = await cropTopLeft(resizedRef, targetWidth, targetHeight);
  } else if (resizedHeight < targetHeight) {
    resizedRef = await extendWhite(resizedRef, targetWidth, targetHeight);
  }

  const [ref, target] = await Promise.all([toRaw(resizedRef), toRaw(targetPng)]);
  return { ref, target };
}
