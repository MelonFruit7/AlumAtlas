type Coordinate = {
  lat: number;
  lng: number;
};

type Offset = {
  id: string;
  xMeters: number;
  yMeters: number;
};

type LayoutOptions = {
  minimumDistanceMeters?: number;
  boxWidthMeters?: number;
  boxHeightMeters?: number;
  paddingMeters?: number;
};

const COLLISION_MAX_ITERATIONS = 640;
const BOX_CANDIDATE_MULTIPLIER = 24;

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pairAngle(idA: string, idB: string): number {
  const hash = (hashString(idA) ^ hashString(idB)) % 360;
  return (hash * Math.PI) / 180;
}

export function offsetMetersToCoordinate(
  anchor: Coordinate,
  offsetXMeters: number,
  offsetYMeters: number,
): Coordinate {
  const latRadians = (anchor.lat * Math.PI) / 180;
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLng = Math.max(8_000, metersPerDegreeLat * Math.cos(latRadians));

  return {
    lat: anchor.lat + offsetYMeters / metersPerDegreeLat,
    lng: anchor.lng + offsetXMeters / metersPerDegreeLng,
  };
}

export function resolveFrozenCityOffsets(
  ids: string[],
  minimumDistanceMeters: number,
): Map<string, { xMeters: number; yMeters: number }> {
  if (ids.length === 0) {
    return new Map();
  }

  const ordered = [...ids].sort((a, b) => {
    const hashDiff = hashString(a) - hashString(b);
    if (hashDiff !== 0) {
      return hashDiff;
    }
    return a.localeCompare(b);
  });
  const groupSeed = ordered.join("|");
  const baseAngle = ((hashString(groupSeed) % 360) * Math.PI) / 180;
  const offsets = new Map<string, { xMeters: number; yMeters: number }>();
  const minDistance = Math.max(30, minimumDistanceMeters);
  const ringStep = Math.max(24, minDistance * 0.95);
  const firstRingRadius = minDistance;

  let cursor = 0;
  let ring = 0;
  while (cursor < ordered.length) {
    const radius = ring === 0 ? 0 : firstRingRadius + (ring - 1) * ringStep;
    const remaining = ordered.length - cursor;
    const capacity =
      ring === 0 ? 1 : Math.max(6, Math.floor((2 * Math.PI * radius) / minDistance));
    const ringCount = Math.min(remaining, capacity);

    for (let index = 0; index < ringCount; index += 1) {
      const id = ordered[cursor + index];
      if (!id) continue;
      const angle = baseAngle + (ring === 0 ? 0 : (2 * Math.PI * index) / Math.max(1, ringCount));
      offsets.set(id, {
        xMeters: Math.cos(angle) * radius,
        yMeters: Math.sin(angle) * radius,
      });
    }

    cursor += ringCount;
    ring += 1;
  }

  return offsets;
}

function settleCollisionOffsets(
  offsets: Map<string, { xMeters: number; yMeters: number }>,
  minimumDistanceMeters: number,
  options: LayoutOptions = {},
): Map<string, { xMeters: number; yMeters: number }> {
  const minDistance = Math.max(1, minimumDistanceMeters);
  const boxWidth = options.boxWidthMeters ? Math.max(1, options.boxWidthMeters) : null;
  const boxHeight = options.boxHeightMeters ? Math.max(1, options.boxHeightMeters) : null;
  const padding = options.paddingMeters ? Math.max(0, options.paddingMeters) : 0;
  const nodes: Offset[] = Array.from(offsets.entries())
    .map(([id, point]) => ({
      id,
      xMeters: point.xMeters,
      yMeters: point.yMeters,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  if (nodes.length <= 1) {
    return offsets;
  }

  if (boxWidth !== null && boxHeight !== null) {
    const spacingX = boxWidth + padding;
    const spacingY = boxHeight + padding;
    const placed: Offset[] = [];
    const next: Offset[] = [];
    const candidates: Array<{ gx: number; gy: number }> = [{ gx: 0, gy: 0 }];
    const targetCandidateCount = Math.max(120, nodes.length * BOX_CANDIDATE_MULTIPLIER);

    for (let ring = 1; candidates.length < targetCandidateCount; ring += 1) {
      for (let x = -ring + 1; x <= ring; x += 1) {
        candidates.push({ gx: x, gy: -ring });
      }
      for (let y = -ring + 1; y <= ring; y += 1) {
        candidates.push({ gx: ring, gy: y });
      }
      for (let x = ring - 1; x >= -ring; x -= 1) {
        candidates.push({ gx: x, gy: ring });
      }
      for (let y = ring - 1; y >= -ring; y -= 1) {
        candidates.push({ gx: -ring, gy: y });
      }
    }

    for (const node of nodes) {
      let chosen: { xMeters: number; yMeters: number } | null = null;
      for (const candidate of candidates) {
        const xMeters = candidate.gx * spacingX;
        const yMeters = candidate.gy * spacingY;

        let collides = false;
        for (const placedNode of placed) {
          const dx = Math.abs(placedNode.xMeters - xMeters);
          const dy = Math.abs(placedNode.yMeters - yMeters);
          if (dx < spacingX - 0.0001 && dy < spacingY - 0.0001) {
            collides = true;
            break;
          }
        }
        if (!collides) {
          chosen = { xMeters, yMeters };
          break;
        }
      }

      if (!chosen) {
        const fallbackIndex = placed.length + 1;
        const fallbackRadius = Math.ceil(Math.sqrt(fallbackIndex));
        const fallbackAngle = pairAngle(node.id, String(fallbackIndex));
        chosen = {
          xMeters: Math.cos(fallbackAngle) * fallbackRadius * spacingX,
          yMeters: Math.sin(fallbackAngle) * fallbackRadius * spacingY,
        };
      }

      const outputNode: Offset = {
        id: node.id,
        xMeters: chosen.xMeters,
        yMeters: chosen.yMeters,
      };
      placed.push(outputNode);
      next.push(outputNode);
    }

    return new Map(next.map((node) => [node.id, { xMeters: node.xMeters, yMeters: node.yMeters }]));
  }

  for (let iteration = 0; iteration < COLLISION_MAX_ITERATIONS; iteration += 1) {
    let moved = false;

    for (let i = 0; i < nodes.length; i += 1) {
      const nodeA = nodes[i];
      if (!nodeA) continue;

      for (let j = i + 1; j < nodes.length; j += 1) {
        const nodeB = nodes[j];
        if (!nodeB) continue;

        const dx = nodeB.xMeters - nodeA.xMeters;
        const dy = nodeB.yMeters - nodeA.yMeters;
        let distance = Math.hypot(dx, dy);
        let nx: number;
        let ny: number;

        if (distance < 0.0001) {
          const angle = pairAngle(nodeA.id, nodeB.id);
          nx = Math.cos(angle);
          ny = Math.sin(angle);
          distance = 0.0001;
        } else {
          nx = dx / distance;
          ny = dy / distance;
        }

        if (distance >= minDistance) {
          continue;
        }
        const overlap = minDistance - distance;
        const push = overlap * 0.5;
        nodeA.xMeters -= nx * push;
        nodeA.yMeters -= ny * push;
        nodeB.xMeters += nx * push;
        nodeB.yMeters += ny * push;
        moved = true;
      }
    }

    if (!moved) {
      break;
    }
  }

  return new Map(nodes.map((node) => [node.id, { xMeters: node.xMeters, yMeters: node.yMeters }]));
}

export function resolveFrozenCityCoordinates(
  anchor: Coordinate,
  ids: string[],
  minimumDistanceMeters: number,
  options: LayoutOptions = {},
): Map<string, Coordinate> {
  const offsets = settleCollisionOffsets(
    resolveFrozenCityOffsets(ids, minimumDistanceMeters),
    minimumDistanceMeters,
    options,
  );
  const coordinates = new Map<string, Coordinate>();
  for (const [id, offset] of offsets) {
    coordinates.set(id, offsetMetersToCoordinate(anchor, offset.xMeters, offset.yMeters));
  }
  return coordinates;
}
