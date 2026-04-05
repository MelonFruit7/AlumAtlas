import { describe, expect, it } from "vitest";
import {
  offsetMetersToCoordinate,
  resolveFrozenCityCoordinates,
} from "@/lib/frozen-city-layout";

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const earthRadius = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const latA = toRadians(a.lat);
  const latB = toRadians(b.lat);

  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const h = sinLat * sinLat + Math.cos(latA) * Math.cos(latB) * sinLng * sinLng;
  return earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function coordinateToOffsetMeters(
  anchor: { lat: number; lng: number },
  point: { lat: number; lng: number },
) {
  const latRadians = (anchor.lat * Math.PI) / 180;
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLng = Math.max(8_000, metersPerDegreeLat * Math.cos(latRadians));
  return {
    xMeters: (point.lng - anchor.lng) * metersPerDegreeLng,
    yMeters: (point.lat - anchor.lat) * metersPerDegreeLat,
  };
}

describe("frozen-city-layout", () => {
  it("returns deterministic coordinates across call order", () => {
    const anchor = { lat: 28.5383, lng: -81.3792 };
    const idsA = ["p1", "p2", "p3", "p4", "p5", "p6"];
    const idsB = ["p3", "p5", "p2", "p6", "p1", "p4"];
    const minimumDistance = 280;

    const resultA = resolveFrozenCityCoordinates(anchor, idsA, minimumDistance);
    const resultB = resolveFrozenCityCoordinates(anchor, idsB, minimumDistance);

    for (const id of idsA) {
      const a = resultA.get(id);
      const b = resultB.get(id);
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      if (!a || !b) continue;
      expect(a.lat).toBeCloseTo(b.lat, 10);
      expect(a.lng).toBeCloseTo(b.lng, 10);
    }
  });

  it("keeps minimum separation approximately stable in geo space", () => {
    const anchor = { lat: 30.2672, lng: -97.7431 };
    const ids = Array.from({ length: 12 }, (_, index) => `id-${index + 1}`);
    const minimumDistance = 300;
    const points = resolveFrozenCityCoordinates(anchor, ids, minimumDistance);

    let minPairDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < ids.length; i += 1) {
      const pointA = points.get(ids[i] as string);
      if (!pointA) continue;
      for (let j = i + 1; j < ids.length; j += 1) {
        const pointB = points.get(ids[j] as string);
        if (!pointB) continue;
        minPairDistance = Math.min(minPairDistance, haversineMeters(pointA, pointB));
      }
    }

    expect(Number.isFinite(minPairDistance)).toBe(true);
    expect(minPairDistance).toBeGreaterThanOrEqual(250);
  });

  it("converts meter offsets into coordinate offsets without zoom dependency", () => {
    const anchor = { lat: 33.749, lng: -84.388 };
    const shifted = offsetMetersToCoordinate(anchor, 420, -260);
    expect(shifted.lat).not.toBe(anchor.lat);
    expect(shifted.lng).not.toBe(anchor.lng);
  });

  it("uses tiered minimum meter spacing", () => {
    const anchor = { lat: 35.2, lng: -80.8 };
    const ids = Array.from({ length: 24 }, (_, index) => `member-${index + 1}`);
    const minimumDistance = 380;
    const points = resolveFrozenCityCoordinates(anchor, ids, minimumDistance);

    let minPairDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < ids.length; i += 1) {
      const pointA = points.get(ids[i] as string);
      if (!pointA) continue;
      for (let j = i + 1; j < ids.length; j += 1) {
        const pointB = points.get(ids[j] as string);
        if (!pointB) continue;
        minPairDistance = Math.min(minPairDistance, haversineMeters(pointA, pointB));
      }
    }

    expect(Number.isFinite(minPairDistance)).toBe(true);
    expect(minPairDistance).toBeGreaterThanOrEqual(340);
  });

  it("resolves box collisions for capsule-shaped markers", () => {
    const anchor = { lat: 28.5383, lng: -81.3792 };
    const ids = Array.from({ length: 14 }, (_, index) => `capsule-${index + 1}`);
    const boxWidthMeters = 78;
    const boxHeightMeters = 24;
    const paddingMeters = 5;
    const points = resolveFrozenCityCoordinates(anchor, ids, 14, {
      boxWidthMeters,
      boxHeightMeters,
      paddingMeters,
    });

    for (let i = 0; i < ids.length; i += 1) {
      const first = points.get(ids[i] as string);
      if (!first) continue;
      const firstOffset = coordinateToOffsetMeters(anchor, first);
      for (let j = i + 1; j < ids.length; j += 1) {
        const second = points.get(ids[j] as string);
        if (!second) continue;
        const secondOffset = coordinateToOffsetMeters(anchor, second);
        const dx = Math.abs(firstOffset.xMeters - secondOffset.xMeters);
        const dy = Math.abs(firstOffset.yMeters - secondOffset.yMeters);
        const separatedX = dx >= boxWidthMeters + paddingMeters - 0.001;
        const separatedY = dy >= boxHeightMeters + paddingMeters - 0.001;
        expect(separatedX || separatedY).toBe(true);
      }
    }
  });

  it("keeps box-layout spread on both axes (not collapsed to a line)", () => {
    const anchor = { lat: 28.5383, lng: -81.3792 };
    const ids = Array.from({ length: 18 }, (_, index) => `spread-${index + 1}`);
    const points = resolveFrozenCityCoordinates(anchor, ids, 12, {
      boxWidthMeters: 74,
      boxHeightMeters: 22,
      paddingMeters: 4,
    });

    const offsets = ids
      .map((id) => points.get(id))
      .filter((point): point is { lat: number; lng: number } => Boolean(point))
      .map((point) => coordinateToOffsetMeters(anchor, point));

    const xs = offsets.map((offset) => offset.xMeters);
    const ys = offsets.map((offset) => offset.yMeters);
    const xSpread = Math.max(...xs) - Math.min(...xs);
    const ySpread = Math.max(...ys) - Math.min(...ys);

    expect(xSpread).toBeGreaterThan(40);
    expect(ySpread).toBeGreaterThan(40);
  });
});
