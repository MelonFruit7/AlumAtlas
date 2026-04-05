import { describe, expect, it } from "vitest";
import { personScaleForZoom } from "@/lib/person-marker-scale";

describe("person-marker-scale", () => {
  it("clamps at min/max bounds", () => {
    expect(personScaleForZoom(2)).toBeCloseTo(0.2, 6);
    expect(personScaleForZoom(7)).toBeCloseTo(0.2, 6);
    expect(personScaleForZoom(11.8)).toBeCloseTo(0.9, 6);
    expect(personScaleForZoom(14)).toBeCloseTo(0.9, 6);
  });

  it("is monotonic across zoom range", () => {
    const z7 = personScaleForZoom(7);
    const z8 = personScaleForZoom(8);
    const z9 = personScaleForZoom(9);
    const z10 = personScaleForZoom(10);
    const z11 = personScaleForZoom(11);
    expect(z8).toBeGreaterThanOrEqual(z7);
    expect(z9).toBeGreaterThanOrEqual(z8);
    expect(z10).toBeGreaterThanOrEqual(z9);
    expect(z11).toBeGreaterThanOrEqual(z10);
  });

  it("scales smoothly right after city zoom threshold", () => {
    const justAboveCity = personScaleForZoom(7.1);
    expect(justAboveCity).toBeGreaterThan(0.2);
    expect(justAboveCity).toBeLessThan(0.3);
  });
});
