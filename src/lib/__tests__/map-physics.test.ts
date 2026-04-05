import { describe, expect, it } from "vitest";
import {
  cityBoundaryRadiusMeters,
  collisionRadiusForTier,
  resolveCapsuleScale,
  resolveCapsuleTier,
  stepFloatingLayout,
  type FloatingNodeState,
} from "@/lib/map-physics";

function createNode(partial: Partial<FloatingNodeState>): FloatingNodeState {
  return {
    id: partial.id ?? "node-a",
    groupId: partial.groupId ?? "orlando",
    tier: partial.tier ?? "compact",
    offsetX: partial.offsetX ?? 0,
    offsetY: partial.offsetY ?? 0,
    vx: partial.vx ?? 0,
    vy: partial.vy ?? 0,
    anchorX: partial.anchorX ?? 400,
    anchorY: partial.anchorY ?? 300,
    boundaryRadiusPx: partial.boundaryRadiusPx ?? 120,
    collisionRadiusPx: partial.collisionRadiusPx ?? collisionRadiusForTier("compact", 0.82),
  };
}

describe("map-physics tiers + scaling", () => {
  it("uses tier thresholds 1-9, 10-24, 25+", () => {
    expect(resolveCapsuleTier(1)).toBe("standard");
    expect(resolveCapsuleTier(9)).toBe("standard");
    expect(resolveCapsuleTier(10)).toBe("compact");
    expect(resolveCapsuleTier(24)).toBe("compact");
    expect(resolveCapsuleTier(25)).toBe("mini");
  });

  it("uses city radius formula with clamp bounds", () => {
    expect(cityBoundaryRadiusMeters(1)).toBeGreaterThanOrEqual(2600);
    expect(cityBoundaryRadiusMeters(1)).toBeLessThanOrEqual(12000);
    expect(cityBoundaryRadiusMeters(1200)).toBe(12000);
  });

  it("applies fit guard and floor to capsule scaling", () => {
    const scaleSmall = resolveCapsuleScale(8, "standard", 360);
    const scaleDense = resolveCapsuleScale(80, "mini", 72);

    expect(scaleSmall).toBeCloseTo(1, 5);
    expect(scaleDense).toBeGreaterThanOrEqual(0.56);
    expect(scaleDense).toBeLessThanOrEqual(0.66);
  });
});

describe("stepFloatingLayout", () => {
  it("separates overlapping nodes with stronger collision passes", () => {
    let nodes: FloatingNodeState[] = [
      createNode({ id: "a", offsetX: 0, offsetY: 0 }),
      createNode({ id: "b", offsetX: 0, offsetY: 0 }),
      createNode({ id: "c", offsetX: 0, offsetY: 0 }),
    ];

    for (let step = 0; step < 36; step += 1) {
      nodes = stepFloatingLayout(nodes, 1000 + step * 34, 34);
    }

    const a = nodes.find((node) => node.id === "a");
    const b = nodes.find((node) => node.id === "b");
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    if (!a || !b) return;

    const distance = Math.hypot(a.offsetX - b.offsetX, a.offsetY - b.offsetY);
    const minimumDistance = a.collisionRadiusPx + b.collisionRadiusPx;
    expect(distance).toBeGreaterThan(minimumDistance - 2);
  });

  it("keeps nodes inside city boundary", () => {
    const radius = collisionRadiusForTier("mini", 0.66);
    const [node] = stepFloatingLayout(
      [
        createNode({
          id: "edge",
          tier: "mini",
          collisionRadiusPx: radius,
          boundaryRadiusPx: 64,
          offsetX: 140,
          offsetY: 0,
          vx: 30,
        }),
      ],
      1200,
      34,
    );

    expect(node).toBeDefined();
    if (!node) return;
    const distance = Math.hypot(node.offsetX, node.offsetY);
    expect(distance).toBeLessThanOrEqual(node.boundaryRadiusPx + 1);
  });

  it("is anchor-translation invariant for offsets", () => {
    const base = [createNode({ id: "a", offsetX: 10, offsetY: 14 })];
    const translated = [createNode({ id: "a", offsetX: 10, offsetY: 14, anchorX: 900, anchorY: 740 })];

    const [a] = stepFloatingLayout(base, 1400, 34);
    const [b] = stepFloatingLayout(translated, 1400, 34);

    expect(a).toBeDefined();
    expect(b).toBeDefined();
    if (!a || !b) return;
    expect(a.offsetX).toBeCloseTo(b.offsetX, 6);
    expect(a.offsetY).toBeCloseTo(b.offsetY, 6);
  });
});
