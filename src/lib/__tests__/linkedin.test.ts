import { describe, expect, it } from "vitest";
import { normalizeLinkedInUrl } from "@/lib/linkedin";

describe("normalizeLinkedInUrl", () => {
  it("normalizes valid LinkedIn profile URLs", () => {
    const value = normalizeLinkedInUrl("linkedin.com/in/jane-doe/?trk=something");
    expect(value).toBe("https://linkedin.com/in/jane-doe");
  });

  it("rejects non-linkedin hosts", () => {
    expect(() => normalizeLinkedInUrl("https://example.com/in/jane-doe")).toThrow(
      /valid LinkedIn/i,
    );
  });

  it("rejects non-profile linkedin paths", () => {
    expect(() => normalizeLinkedInUrl("https://linkedin.com/company/test")).toThrow(
      /personal profile/i,
    );
  });
});

