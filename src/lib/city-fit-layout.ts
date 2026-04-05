type PackedOffset = {
  xPx: number;
  yPx: number;
};

type FocusScaleInput = {
  zoomScale: number;
  memberCount: number;
  availableWidthPx: number;
  availableHeightPx: number;
};

type PackedOffsetsInput = {
  ids: string[];
  scale: number;
  availableWidthPx?: number;
  availableHeightPx?: number;
};

type BoundsInput = {
  anchorX: number;
  anchorY: number;
  viewportWidth: number;
  viewportHeight: number;
  marginPx: number;
};

export type MarkerTier = "standard" | "compact" | "mini" | "micro" | "ultra-micro";

const SCALE_MIN = 0.03;
const SCALE_MAX = 0.9;

const STANDARD_BOX = { width: 188, height: 56, gap: 8 };
const COMPACT_BOX = { width: 160, height: 50, gap: 7 };
const MINI_BOX = { width: 132, height: 44, gap: 6 };
const MICRO_BOX = { width: 108, height: 36, gap: 5 };
const ULTRA_MICRO_BOX = { width: 88, height: 30, gap: 4 };
const EPSILON = 0.0001;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function stableIdOrder(ids: string[]): string[] {
  return [...ids].sort((a, b) => {
    const hashDiff = hashString(a) - hashString(b);
    if (hashDiff !== 0) {
      return hashDiff;
    }
    return a.localeCompare(b);
  });
}

function resolveGridShape(
  count: number,
  maxCols: number,
  maxRows: number,
  targetAspect: number,
): { cols: number; rows: number } {
  if (count <= 1) {
    return { cols: 1, rows: 1 };
  }

  let cols = clamp(Math.round(Math.sqrt(count * targetAspect)), 1, maxCols);
  let rows = Math.ceil(count / cols);

  while (rows > maxRows && cols < maxCols) {
    cols += 1;
    rows = Math.ceil(count / cols);
  }

  if (rows > maxRows) {
    rows = maxRows;
    cols = Math.ceil(count / rows);
  }

  cols = clamp(cols, 1, maxCols);
  rows = Math.max(1, Math.ceil(count / cols));

  return { cols, rows };
}

export function markerTierForScale(scale: number): MarkerTier {
  if (scale < 0.14) {
    return "ultra-micro";
  }
  if (scale < 0.22) {
    return "micro";
  }
  if (scale < 0.38) {
    return "mini";
  }
  if (scale < 0.56) {
    return "compact";
  }
  return "standard";
}

export function markerBoxForScale(scale: number): {
  widthPx: number;
  heightPx: number;
  gapPx: number;
  tier: MarkerTier;
} {
  const clampedScale = clamp(scale, SCALE_MIN, SCALE_MAX);
  const tier = markerTierForScale(clampedScale);
  const base =
    tier === "ultra-micro"
      ? ULTRA_MICRO_BOX
      : tier === "micro"
      ? MICRO_BOX
      : tier === "mini"
        ? MINI_BOX
        : tier === "compact"
          ? COMPACT_BOX
          : STANDARD_BOX;

  return {
    widthPx: base.width * clampedScale,
    heightPx: base.height * clampedScale,
    gapPx: Math.max(1.6, base.gap * clampedScale),
    tier,
  };
}

export function centeredCityBounds(input: BoundsInput): { widthPx: number; heightPx: number } {
  const margin = Math.max(0, input.marginPx);
  const halfWidth = Math.max(
    20,
    Math.min(input.anchorX - margin, input.viewportWidth - input.anchorX - margin),
  );
  const halfHeight = Math.max(
    20,
    Math.min(input.anchorY - margin, input.viewportHeight - input.anchorY - margin),
  );

  return {
    widthPx: Math.max(80, halfWidth * 2),
    heightPx: Math.max(80, halfHeight * 2),
  };
}

function canFitCount(
  count: number,
  scale: number,
  availableWidthPx: number,
  availableHeightPx: number,
): boolean {
  const box = markerBoxForScale(scale);
  const maxCols = Math.max(1, Math.floor((availableWidthPx + box.gapPx) / (box.widthPx + box.gapPx)));
  const maxRows = Math.max(
    1,
    Math.floor((availableHeightPx + box.gapPx) / (box.heightPx + box.gapPx)),
  );
  return maxCols * maxRows >= count;
}

export function solveFocusedCityScale(input: FocusScaleInput): number {
  const upper = clamp(input.zoomScale, SCALE_MIN, SCALE_MAX);
  if (input.memberCount <= 1) {
    return upper;
  }

  const width = Math.max(80, input.availableWidthPx);
  const height = Math.max(80, input.availableHeightPx);

  let low = SCALE_MIN;
  let high = upper;
  if (!canFitCount(input.memberCount, low, width, height)) {
    return low;
  }

  for (let iteration = 0; iteration < 16; iteration += 1) {
    const mid = (low + high) / 2;
    if (canFitCount(input.memberCount, mid, width, height)) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return clamp(low, SCALE_MIN, upper);
}

export function secondaryCityScale(zoomScale: number, memberCount: number): number {
  const z = clamp(zoomScale, SCALE_MIN, SCALE_MAX);
  if (memberCount <= 4) return clamp(z * 0.94, SCALE_MIN, SCALE_MAX);
  if (memberCount <= 10) return clamp(z * 0.82, SCALE_MIN, SCALE_MAX);
  if (memberCount <= 20) return clamp(z * 0.68, SCALE_MIN, SCALE_MAX);
  if (memberCount <= 32) return clamp(z * 0.58, SCALE_MIN, SCALE_MAX);
  return clamp(z * 0.42, SCALE_MIN, SCALE_MAX);
}

export function buildDeterministicPackedOffsets(input: PackedOffsetsInput): Map<string, PackedOffset> {
  const orderedIds = stableIdOrder(input.ids);
  const count = orderedIds.length;
  if (count === 0) {
    return new Map();
  }

  const box = markerBoxForScale(input.scale);
  const spacingX = box.widthPx + box.gapPx;
  const spacingY = box.heightPx + box.gapPx;

  const maxCols = input.availableWidthPx
    ? Math.max(1, Math.floor((input.availableWidthPx + box.gapPx) / spacingX))
    : Math.max(1, Math.ceil(Math.sqrt(count * 1.6)));
  const maxRows = input.availableHeightPx
    ? Math.max(1, Math.floor((input.availableHeightPx + box.gapPx) / spacingY))
    : Math.max(1, Math.ceil(count / maxCols));

  const aspect = input.availableWidthPx && input.availableHeightPx
    ? Math.max(0.35, input.availableWidthPx / Math.max(1, input.availableHeightPx))
    : 1.6;
  const shape = resolveGridShape(count, maxCols, maxRows, aspect);
  const rows = Math.max(shape.rows, Math.ceil(count / shape.cols));
  const cols = shape.cols;

  const cells: PackedOffset[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const xPx = (col - (cols - 1) / 2) * spacingX;
      const yPx = (row - (rows - 1) / 2) * spacingY;
      cells.push({ xPx, yPx });
    }
  }

  cells.sort((a, b) => {
    const da = a.xPx * a.xPx + a.yPx * a.yPx;
    const db = b.xPx * b.xPx + b.yPx * b.yPx;
    if (da !== db) {
      return da - db;
    }
    const ay = Math.atan2(a.yPx, a.xPx);
    const by = Math.atan2(b.yPx, b.xPx);
    if (ay !== by) {
      return ay - by;
    }
    if (a.yPx !== b.yPx) {
      return a.yPx - b.yPx;
    }
    return a.xPx - b.xPx;
  });

  const offsets = new Map<string, PackedOffset>();
  for (let index = 0; index < orderedIds.length; index += 1) {
    const id = orderedIds[index];
    const cell = cells[index];
    if (!id || !cell) continue;
    offsets.set(id, cell);
  }
  return offsets;
}

export function hasPackedOverlap(
  offsets: Map<string, PackedOffset>,
  ids: string[],
  scale: number,
): boolean {
  const box = markerBoxForScale(scale);
  for (let i = 0; i < ids.length; i += 1) {
    const first = offsets.get(ids[i] as string);
    if (!first) continue;
    for (let j = i + 1; j < ids.length; j += 1) {
      const second = offsets.get(ids[j] as string);
      if (!second) continue;
      const dx = Math.abs(first.xPx - second.xPx);
      const dy = Math.abs(first.yPx - second.yPx);
      const overlapsX = dx < box.widthPx + box.gapPx - EPSILON;
      const overlapsY = dy < box.heightPx + box.gapPx - EPSILON;
      if (overlapsX && overlapsY) {
        return true;
      }
    }
  }
  return false;
}
