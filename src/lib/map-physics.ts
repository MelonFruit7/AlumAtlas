export type CapsuleTier = "standard" | "compact" | "mini";

export type FloatingNodeState = {
  id: string;
  groupId: string;
  tier: CapsuleTier;
  offsetX: number;
  offsetY: number;
  vx: number;
  vy: number;
  anchorX: number;
  anchorY: number;
  boundaryRadiusPx: number;
  collisionRadiusPx: number;
};

const SPRING_STIFFNESS = 1.28;
const NOISE_ACCELERATION = 9.8;
const MAX_SPEED = 180;
const COLLISION_PASSES = 5;

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function resolveCapsuleTier(count: number): CapsuleTier {
  if (count >= 25) {
    return "mini";
  }
  if (count >= 10) {
    return "compact";
  }
  return "standard";
}

export function baseCapsuleScaleForTier(tier: CapsuleTier): number {
  if (tier === "mini") {
    return 0.66;
  }
  if (tier === "compact") {
    return 0.82;
  }
  return 1;
}

export function cityBoundaryRadiusMeters(count: number): number {
  const radius = 2600 + 320 * Math.sqrt(Math.max(1, count));
  return clamp(radius, 2600, 12000);
}

export function collisionRadiusForTier(tier: CapsuleTier, scale = 1): number {
  const base = tier === "mini" ? 76 : tier === "compact" ? 92 : 106;
  return base * scale;
}

export function minimumBoundaryRadiusPx(count: number, collisionRadiusPx: number): number {
  const safeCount = Math.max(1, count);
  const packedRadius = collisionRadiusPx * Math.sqrt(safeCount) * 1.08 + 28;
  return clamp(packedRadius, collisionRadiusPx + 14, 320);
}

export function resolveCapsuleScale(
  count: number,
  tier: CapsuleTier,
  boundaryRadiusPx: number,
): number {
  const tierScale = baseCapsuleScaleForTier(tier);
  const baseCollisionRadius = collisionRadiusForTier(tier, tierScale);
  const estimatedArea = Math.max(1, count) * Math.PI * baseCollisionRadius * baseCollisionRadius * 1.28;
  const boundaryArea = Math.PI * Math.max(1, boundaryRadiusPx - 8) * Math.max(1, boundaryRadiusPx - 8);
  if (estimatedArea <= boundaryArea) {
    return tierScale;
  }

  const fitScale = tierScale * Math.sqrt(boundaryArea / estimatedArea);
  return clamp(fitScale, 0.56, tierScale);
}

export function resolveInitialOffset(
  id: string,
  index: number,
  count: number,
  tier: CapsuleTier,
  scale = 1,
): { x: number; y: number } {
  if (count <= 1) {
    return { x: 0, y: 0 };
  }

  const ringSize = tier === "mini" ? 12 : tier === "compact" ? 10 : 8;
  const ring = Math.floor(index / ringSize);
  const indexInRing = index % ringSize;
  const ringCount = Math.min(ringSize, count - ring * ringSize);
  const baseRadius = (tier === "mini" ? 14 : tier === "compact" ? 18 : 24) * scale;
  const ringStep = (tier === "mini" ? 12 : tier === "compact" ? 16 : 18) * scale;
  const seed = hashString(id) % 360;
  const baseAngle = (seed * Math.PI) / 180;
  const angle = baseAngle + (2 * Math.PI * indexInRing) / Math.max(ringCount, 1);
  const radius = baseRadius + ring * ringStep;

  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

function pairSeparationAngle(idA: string, idB: string): number {
  const hash = (hashString(idA) ^ hashString(idB)) % 360;
  return (hash * Math.PI) / 180;
}

function boundedSpeed(vx: number, vy: number): { vx: number; vy: number } {
  const speed = Math.hypot(vx, vy);
  if (speed <= MAX_SPEED || speed === 0) {
    return { vx, vy };
  }
  const ratio = MAX_SPEED / speed;
  return { vx: vx * ratio, vy: vy * ratio };
}

function keepInsideCityBoundary(node: FloatingNodeState): FloatingNodeState {
  const safeBoundary = Math.max(node.collisionRadiusPx + 8, node.boundaryRadiusPx - 2);
  const distance = Math.hypot(node.offsetX, node.offsetY);
  if (distance <= safeBoundary || distance < 0.0001) {
    return node;
  }

  const nx = node.offsetX / distance;
  const ny = node.offsetY / distance;
  const correctedOffset = safeBoundary;

  return {
    ...node,
    offsetX: nx * correctedOffset,
    offsetY: ny * correctedOffset,
    vx: node.vx - nx * Math.abs(node.vx) * 0.52,
    vy: node.vy - ny * Math.abs(node.vy) * 0.52,
  };
}

export function stepFloatingLayout(
  nodes: FloatingNodeState[],
  nowMs: number,
  deltaMs: number,
): FloatingNodeState[] {
  if (nodes.length === 0) {
    return [];
  }

  const dt = clamp(deltaMs / 1000, 0.016, 0.05);
  const time = nowMs / 1000;
  const damping = Math.pow(0.84, dt * 60);
  const next = nodes.map((node) => ({ ...node }));
  const indicesByGroup = new Map<string, number[]>();

  for (let i = 0; i < next.length; i += 1) {
    const node = next[i];
    if (!node) continue;

    const seed = hashString(node.id) % 360;
    const angle = (seed * Math.PI) / 180;
    const noiseX = Math.sin(time * 1.25 + angle) * NOISE_ACCELERATION;
    const noiseY = Math.cos(time * 1.08 + angle) * NOISE_ACCELERATION;
    const springX = -node.offsetX * SPRING_STIFFNESS;
    const springY = -node.offsetY * SPRING_STIFFNESS;

    node.vx += (springX + noiseX) * dt;
    node.vy += (springY + noiseY) * dt;
    node.vx *= damping;
    node.vy *= damping;
    const bounded = boundedSpeed(node.vx, node.vy);
    node.vx = bounded.vx;
    node.vy = bounded.vy;
    node.offsetX += node.vx * dt;
    node.offsetY += node.vy * dt;

    const existing = indicesByGroup.get(node.groupId);
    if (existing) {
      existing.push(i);
    } else {
      indicesByGroup.set(node.groupId, [i]);
    }
  }

  for (const indices of indicesByGroup.values()) {
    for (let pass = 0; pass < COLLISION_PASSES; pass += 1) {
      for (let i = 0; i < indices.length; i += 1) {
        const nodeA = next[indices[i] as number];
        if (!nodeA) continue;

        for (let j = i + 1; j < indices.length; j += 1) {
          const nodeB = next[indices[j] as number];
          if (!nodeB) continue;

          const dx = nodeB.offsetX - nodeA.offsetX;
          const dy = nodeB.offsetY - nodeA.offsetY;
          const minimumDistance = nodeA.collisionRadiusPx + nodeB.collisionRadiusPx + 20;
          let distance = Math.hypot(dx, dy);

          let nx: number;
          let ny: number;
          if (distance < 0.0001) {
            const angle = pairSeparationAngle(nodeA.id, nodeB.id);
            nx = Math.cos(angle);
            ny = Math.sin(angle);
            distance = 0.0001;
          } else {
            nx = dx / distance;
            ny = dy / distance;
          }

          if (distance < minimumDistance) {
            const overlap = minimumDistance - distance;
            const push = overlap * 0.76;
            nodeA.offsetX -= nx * push;
            nodeA.offsetY -= ny * push;
            nodeB.offsetX += nx * push;
            nodeB.offsetY += ny * push;

            const impulse = overlap * 28;
            nodeA.vx -= nx * impulse * dt;
            nodeA.vy -= ny * impulse * dt;
            nodeB.vx += nx * impulse * dt;
            nodeB.vy += ny * impulse * dt;
          }
        }
      }
    }

    for (const index of indices) {
      const node = next[index];
      if (!node) continue;
      let adjusted = keepInsideCityBoundary(node);
      const bounded = boundedSpeed(adjusted.vx, adjusted.vy);
      adjusted = {
        ...adjusted,
        vx: bounded.vx,
        vy: bounded.vy,
      };
      next[index] = adjusted;
    }
  }

  return next;
}
