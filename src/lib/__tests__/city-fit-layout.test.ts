import { describe, expect, it } from "vitest";
import {
  buildDeterministicPackedOffsets,
  centeredCityBounds,
  hasPackedOverlap,
  markerBoxForScale,
  markerTierForScale,
  secondaryCityScale,
  solveFocusedCityScale,
} from "@/lib/city-fit-layout";

describe("city-fit-layout", () => {
  it("focused fit scale decreases as member count increases", () => {
    const sparse = solveFocusedCityScale({
      zoomScale: 0.8,
      memberCount: 8,
      availableWidthPx: 740,
      availableHeightPx: 420,
    });
    const dense = solveFocusedCityScale({
      zoomScale: 0.8,
      memberCount: 36,
      availableWidthPx: 740,
      availableHeightPx: 420,
    });
    expect(dense).toBeLessThan(sparse);
  });

  it("focused fit scale increases as viewport area increases", () => {
    const small = solveFocusedCityScale({
      zoomScale: 0.75,
      memberCount: 24,
      availableWidthPx: 360,
      availableHeightPx: 230,
    });
    const large = solveFocusedCityScale({
      zoomScale: 0.75,
      memberCount: 24,
      availableWidthPx: 920,
      availableHeightPx: 620,
    });
    expect(large).toBeGreaterThan(small);
  });

  it("packed layout is deterministic regardless of input order", () => {
    const idsA = ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"];
    const idsB = ["a6", "a1", "a8", "a4", "a2", "a7", "a3", "a5"];
    const opts = {
      scale: 0.58,
      availableWidthPx: 520,
      availableHeightPx: 280,
    };

    const first = buildDeterministicPackedOffsets({ ids: idsA, ...opts });
    const second = buildDeterministicPackedOffsets({ ids: idsB, ...opts });

    for (const id of idsA) {
      const a = first.get(id);
      const b = second.get(id);
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      if (!a || !b) continue;
      expect(a.xPx).toBeCloseTo(b.xPx, 8);
      expect(a.yPx).toBeCloseTo(b.yPx, 8);
    }
  });

  it("focused packed offsets are overlap-free at solved scale", () => {
    const ids = Array.from({ length: 30 }, (_, index) => `member-${index + 1}`);
    const scale = solveFocusedCityScale({
      zoomScale: 0.84,
      memberCount: ids.length,
      availableWidthPx: 880,
      availableHeightPx: 460,
    });

    const offsets = buildDeterministicPackedOffsets({
      ids,
      scale,
      availableWidthPx: 880,
      availableHeightPx: 460,
    });

    expect(hasPackedOverlap(offsets, ids, scale)).toBe(false);
  });

  it("tier resolver maps scale thresholds correctly", () => {
    expect(markerTierForScale(0.78)).toBe("standard");
    expect(markerTierForScale(0.5)).toBe("compact");
    expect(markerTierForScale(0.3)).toBe("mini");
    expect(markerTierForScale(0.2)).toBe("micro");
    expect(markerTierForScale(0.1)).toBe("ultra-micro");
  });

  it("secondary city scaling keeps dense cities smaller than sparse cities", () => {
    const sparse = secondaryCityScale(0.8, 5);
    const dense = secondaryCityScale(0.8, 40);
    expect(dense).toBeLessThan(sparse);
  });

  it("centered city bounds shrink when anchor approaches viewport edge", () => {
    const centered = centeredCityBounds({
      anchorX: 640,
      anchorY: 360,
      viewportWidth: 1280,
      viewportHeight: 720,
      marginPx: 24,
    });
    const nearEdge = centeredCityBounds({
      anchorX: 180,
      anchorY: 120,
      viewportWidth: 1280,
      viewportHeight: 720,
      marginPx: 24,
    });
    expect(nearEdge.widthPx).toBeLessThan(centered.widthPx);
    expect(nearEdge.heightPx).toBeLessThan(centered.heightPx);
  });

  it("marker box dimensions stay positive at tiny scale", () => {
    const box = markerBoxForScale(0.03);
    expect(box.widthPx).toBeGreaterThan(0);
    expect(box.heightPx).toBeGreaterThan(0);
    expect(box.gapPx).toBeGreaterThan(0);
  });

  it("dense pack remains overlap-free at micro scale", () => {
    const ids = Array.from({ length: 120 }, (_, index) => `dense-${index + 1}`);
    const scale = solveFocusedCityScale({
      zoomScale: 0.9,
      memberCount: ids.length,
      availableWidthPx: 1120,
      availableHeightPx: 640,
    });
    const offsets = buildDeterministicPackedOffsets({
      ids,
      scale,
      availableWidthPx: 1120,
      availableHeightPx: 640,
    });
    expect(hasPackedOverlap(offsets, ids, scale)).toBe(false);
  });
});
