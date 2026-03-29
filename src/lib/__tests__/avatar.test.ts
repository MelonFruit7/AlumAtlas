import { describe, expect, it } from "vitest";
import { getInitials } from "@/lib/avatar";

describe("getInitials", () => {
  it("returns two initials when possible", () => {
    expect(getInitials("Taylor Swift")).toBe("TS");
  });

  it("handles single words", () => {
    expect(getInitials("Madonna")).toBe("M");
  });

  it("returns question mark when empty", () => {
    expect(getInitials("   ")).toBe("?");
  });
});

