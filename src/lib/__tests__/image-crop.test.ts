import { describe, expect, it } from "vitest";
import { resolveCoverTransform } from "@/lib/image-crop";

describe("resolveCoverTransform", () => {
  it("creates a centered cover transform for landscape images", () => {
    const transform = resolveCoverTransform(1200, 600, 240, 1, 0, 0);
    expect(transform.drawWidth).toBeCloseTo(480, 5);
    expect(transform.drawHeight).toBeCloseTo(240, 5);
    expect(transform.drawX).toBeCloseTo(-120, 5);
    expect(transform.drawY).toBeCloseTo(0, 5);
  });

  it("clamps pan values so draw area never exceeds allowed bounds", () => {
    const transform = resolveCoverTransform(1200, 600, 240, 1, 3, -3);
    expect(transform.drawX).toBeCloseTo(0, 5);
    expect(transform.drawY).toBeCloseTo(0, 5);
  });
});

