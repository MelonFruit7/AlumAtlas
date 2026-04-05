type CoordinateNode = {
  id: string;
  lat: number;
  lng: number;
};

type Coordinate = {
  lat: number;
  lng: number;
};

type PixelPoint = {
  x: number;
  y: number;
};

type ProjectionContext = {
  project: (coordinate: Coordinate) => PixelPoint;
  unproject: (point: PixelPoint) => Coordinate;
};

type SpreadOptions = {
  collisionRadiusPx?: number;
  baseRadiusPx?: number;
  ringStepPx?: number;
  ringSize?: number;
};

const DEFAULT_COLLISION_RADIUS_PX = 176;
const DEFAULT_BASE_RADIUS_PX = 212;
const DEFAULT_RING_STEP_PX = 128;
const RING_SIZE = 6;

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

type ProjectedNode = CoordinateNode & PixelPoint;

function distanceSquared(a: PixelPoint, b: PixelPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function spreadGroup(
  nodes: ProjectedNode[],
  context: ProjectionContext,
  options: Required<SpreadOptions>,
): Array<{ id: string; coordinate: Coordinate }> {
  if (nodes.length === 1) {
    const [node] = nodes;
    if (!node) return [];
    return [{ id: node.id, coordinate: { lat: node.lat, lng: node.lng } }];
  }

  const sorted = [...nodes].sort((a, b) => {
    const hashDiff = hashString(a.id) - hashString(b.id);
    if (hashDiff !== 0) {
      return hashDiff;
    }
    return a.id.localeCompare(b.id);
  });

  const centroid = sorted.reduce(
    (acc, node) => ({
      x: acc.x + node.x / sorted.length,
      y: acc.y + node.y / sorted.length,
    }),
    { x: 0, y: 0 },
  );
  const groupSeed = sorted.map((node) => node.id).join("|");
  const groupRotationRadians = ((hashString(groupSeed) % 360) * Math.PI) / 180;
  const spread: Array<{ id: string; coordinate: Coordinate }> = [];

  for (let index = 0; index < sorted.length; index += 1) {
    const node = sorted[index];
    if (!node) {
      continue;
    }

    const ring = Math.floor(index / options.ringSize);
    const indexInRing = index % options.ringSize;
    const ringCount = Math.min(
      options.ringSize,
      sorted.length - ring * options.ringSize,
    );
    const angle =
      groupRotationRadians + (2 * Math.PI * indexInRing) / Math.max(ringCount, 1);
    const radiusPx = options.baseRadiusPx + ring * options.ringStepPx;
    const point = {
      x: centroid.x + Math.cos(angle) * radiusPx,
      y: centroid.y + Math.sin(angle) * radiusPx,
    };
    const coordinate = context.unproject(point);

    spread.push({
      id: node.id,
      coordinate,
    });
  }

  return spread;
}

function findRoot(parent: number[], index: number): number {
  let cursor = index;
  while (parent[cursor] !== cursor) {
    cursor = parent[cursor] as number;
  }
  let path = index;
  while (parent[path] !== path) {
    const next = parent[path] as number;
    parent[path] = cursor;
    path = next;
  }
  return cursor;
}

function union(parent: number[], a: number, b: number) {
  const rootA = findRoot(parent, a);
  const rootB = findRoot(parent, b);
  if (rootA !== rootB) {
    parent[rootB] = rootA;
  }
}

function resolveCollisionGroups(
  nodes: ProjectedNode[],
  collisionRadiusPx: number,
): ProjectedNode[][] {
  if (nodes.length <= 1) {
    return [nodes];
  }

  const parent = nodes.map((_, index) => index);
  const thresholdSquared = collisionRadiusPx * collisionRadiusPx;

  for (let i = 0; i < nodes.length; i += 1) {
    const current = nodes[i];
    if (!current) continue;
    for (let j = i + 1; j < nodes.length; j += 1) {
      const next = nodes[j];
      if (!next) continue;

      if (distanceSquared(current, next) <= thresholdSquared) {
        union(parent, i, j);
      }
    }
  }

  const grouped = new Map<number, ProjectedNode[]>();
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (!node) continue;
    const root = findRoot(parent, index);
    const current = grouped.get(root);
    if (current) {
      current.push(node);
    } else {
      grouped.set(root, [node]);
    }
  }

  return Array.from(grouped.values());
}

export function resolveSpreadCoordinates(
  nodes: CoordinateNode[],
  context: ProjectionContext,
  options: SpreadOptions = {},
): Map<string, Coordinate> {
  const resolvedCollisionRadiusPx =
    options.collisionRadiusPx ?? DEFAULT_COLLISION_RADIUS_PX;
  const resolvedBaseRadiusPx = options.baseRadiusPx ?? DEFAULT_BASE_RADIUS_PX;
  const resolvedRingStepPx = options.ringStepPx ?? DEFAULT_RING_STEP_PX;
  const resolvedRingSize = options.ringSize ?? RING_SIZE;
  const normalizedOptions: Required<SpreadOptions> = {
    collisionRadiusPx: Math.max(1, resolvedCollisionRadiusPx),
    baseRadiusPx: Math.max(1, resolvedBaseRadiusPx),
    ringStepPx: Math.max(1, resolvedRingStepPx),
    ringSize: Math.max(1, Math.floor(resolvedRingSize)),
  };

  if (nodes.length === 0) {
    return new Map();
  }

  const projected = nodes.map((node) => {
    const point = context.project({ lat: node.lat, lng: node.lng });
    return {
      ...node,
      x: point.x,
      y: point.y,
    };
  });

  const output = new Map<string, Coordinate>();
  const groups = resolveCollisionGroups(
    projected,
    normalizedOptions.collisionRadiusPx,
  );
  for (const group of groups) {
    for (const item of spreadGroup(group, context, normalizedOptions)) {
      output.set(item.id, item.coordinate);
    }
  }

  return output;
}
