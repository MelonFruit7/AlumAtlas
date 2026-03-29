export const MIN_CROP_ZOOM = 1;
export const MAX_CROP_ZOOM = 3;

export type CoverTransform = {
  drawX: number;
  drawY: number;
  drawWidth: number;
  drawHeight: number;
  maxOffsetX: number;
  maxOffsetY: number;
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function resolveCoverTransform(
  imageWidth: number,
  imageHeight: number,
  outputSize: number,
  zoom: number,
  panX: number,
  panY: number,
): CoverTransform {
  if (
    !Number.isFinite(imageWidth) ||
    !Number.isFinite(imageHeight) ||
    imageWidth <= 0 ||
    imageHeight <= 0
  ) {
    throw new Error("Image dimensions are invalid.");
  }

  const safeZoom = clamp(zoom, MIN_CROP_ZOOM, MAX_CROP_ZOOM);
  const baseScale = Math.max(outputSize / imageWidth, outputSize / imageHeight);
  const scale = baseScale * safeZoom;
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  const maxOffsetX = Math.max(0, (drawWidth - outputSize) / 2);
  const maxOffsetY = Math.max(0, (drawHeight - outputSize) / 2);
  const safePanX = clamp(panX, -1, 1);
  const safePanY = clamp(panY, -1, 1);
  const offsetX = safePanX * maxOffsetX;
  const offsetY = safePanY * maxOffsetY;

  return {
    drawX: (outputSize - drawWidth) / 2 + offsetX,
    drawY: (outputSize - drawHeight) / 2 + offsetY,
    drawWidth,
    drawHeight,
    maxOffsetX,
    maxOffsetY,
  };
}

