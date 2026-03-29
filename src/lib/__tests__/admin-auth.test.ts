import { describe, expect, it } from "vitest";
import {
  createAdminSessionToken,
  hashAdminPassword,
  verifyAdminPassword,
  verifyAdminSessionToken,
} from "@/lib/admin-auth";

describe("admin auth helpers", () => {
  it("hashes and verifies admin password", () => {
    const hash = hashAdminPassword("super-secret-password");
    expect(verifyAdminPassword("super-secret-password", hash)).toBe(true);
    expect(verifyAdminPassword("wrong-password", hash)).toBe(false);
  });

  it("creates verifiable admin session token", () => {
    const token = createAdminSessionToken("demo-group", "session-secret", 3600);
    expect(verifyAdminSessionToken(token, "demo-group", "session-secret")).toBe(true);
    expect(verifyAdminSessionToken(token, "other-group", "session-secret")).toBe(false);
  });
});

