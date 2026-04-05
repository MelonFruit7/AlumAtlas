import { describe, expect, it } from "vitest";
import { resolveSpreadCoordinates } from "@/lib/map-overlap";

const PIXEL_SCALE = 100_000;

const projectionContext = {
  project: ({ lat, lng }: { lat: number; lng: number }) => ({
    x: lng * PIXEL_SCALE,
    y: lat * PIXEL_SCALE,
  }),
  unproject: ({ x, y }: { x: number; y: number }) => ({
    lat: y / PIXEL_SCALE,
    lng: x / PIXEL_SCALE,
  }),
};

describe("resolveSpreadCoordinates", () => {
  it("keeps a single coordinate unchanged", () => {
    const nodes = [{ id: "a", lat: 30.2672, lng: -97.7431 }];
    const result = resolveSpreadCoordinates(nodes, projectionContext);
    expect(result.get("a")).toEqual({
      lat: 30.2672,
      lng: -97.7431,
    });
  });

  it("spreads overlapping nodes into different render coordinates", () => {
    const nodes = [
      { id: "a", lat: 30.2672, lng: -97.7431 },
      { id: "b", lat: 30.2672, lng: -97.7431 },
      { id: "c", lat: 30.2672, lng: -97.7431 },
    ];

    const result = resolveSpreadCoordinates(nodes, projectionContext);
    const a = result.get("a");
    const b = result.get("b");
    const c = result.get("c");

    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(c).toBeDefined();
    expect(a).not.toEqual(b);
    expect(a).not.toEqual(c);
    expect(b).not.toEqual(c);
  });

  it("separates near-but-not-identical coordinates when they visually collide", () => {
    const nodes = [
      { id: "a", lat: 37.7749, lng: -122.4194 },
      { id: "b", lat: 37.77491, lng: -122.41939 },
    ];

    const result = resolveSpreadCoordinates(nodes, projectionContext, {
      collisionRadiusPx: 18,
      baseRadiusPx: 96,
    });
    const a = result.get("a");
    const b = result.get("b");

    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a).not.toEqual(b);
  });

  it("is deterministic regardless input order", () => {
    const nodesA = [
      { id: "a", lat: 40.7128, lng: -74.006 },
      { id: "b", lat: 40.7128, lng: -74.006 },
      { id: "c", lat: 40.7128, lng: -74.006 },
    ];
    const nodesB = [...nodesA].reverse();

    const resultA = resolveSpreadCoordinates(nodesA, projectionContext);
    const resultB = resolveSpreadCoordinates(nodesB, projectionContext);

    for (const node of nodesA) {
      expect(resultA.get(node.id)).toEqual(resultB.get(node.id));
    }
  });

  it("uses enough default spread for dense same-location groups", () => {
    const nodes = Array.from({ length: 6 }, (_, index) => ({
      id: `person-${index}`,
      lat: 34.0522,
      lng: -118.2437,
    }));

    const result = resolveSpreadCoordinates(nodes, projectionContext);
    const points = nodes
      .map((node) => result.get(node.id))
      .filter((point): point is { lat: number; lng: number } => point !== undefined)
      .map((point) => projectionContext.project(point));

    let minimumDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      if (!a) continue;
      for (let j = i + 1; j < points.length; j += 1) {
        const b = points[j];
        if (!b) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distance = Math.hypot(dx, dy);
        if (distance < minimumDistance) {
          minimumDistance = distance;
        }
      }
    }

    expect(minimumDistance).toBeGreaterThan(150);
  });
});
