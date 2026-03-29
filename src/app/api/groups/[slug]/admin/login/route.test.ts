import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  hasSupabaseServerEnvMock,
  getRuntimeConfigMock,
  getGroupAdminAuthBySlugMock,
  verifyAdminPasswordMock,
  createAdminSessionTokenMock,
  setAdminSessionCookieMock,
} = vi.hoisted(() => ({
  hasSupabaseServerEnvMock: vi.fn(() => true),
  getRuntimeConfigMock: vi.fn(() => ({
    adminSessionSecret: "session-secret",
  })),
  getGroupAdminAuthBySlugMock: vi.fn(),
  verifyAdminPasswordMock: vi.fn(() => true),
  createAdminSessionTokenMock: vi.fn(() => "signed-token"),
  setAdminSessionCookieMock: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  hasSupabaseServerEnv: hasSupabaseServerEnvMock,
  getRuntimeConfig: getRuntimeConfigMock,
}));

vi.mock("@/lib/db", () => ({
  getGroupAdminAuthBySlug: getGroupAdminAuthBySlugMock,
}));

vi.mock("@/lib/admin-auth", () => ({
  verifyAdminPassword: verifyAdminPasswordMock,
  createAdminSessionToken: createAdminSessionTokenMock,
  setAdminSessionCookie: setAdminSessionCookieMock,
}));

describe("POST /api/groups/[slug]/admin/login", () => {
  beforeEach(() => {
    hasSupabaseServerEnvMock.mockReset();
    getRuntimeConfigMock.mockReset();
    getGroupAdminAuthBySlugMock.mockReset();
    verifyAdminPasswordMock.mockReset();
    createAdminSessionTokenMock.mockReset();
    setAdminSessionCookieMock.mockReset();

    hasSupabaseServerEnvMock.mockReturnValue(true);
    getRuntimeConfigMock.mockReturnValue({
      adminSessionSecret: "session-secret",
    });
    verifyAdminPasswordMock.mockReturnValue(true);
    createAdminSessionTokenMock.mockReturnValue("signed-token");
    getGroupAdminAuthBySlugMock.mockResolvedValue({
      id: "group-1",
      slug: "demo",
      title: "Demo",
      description: null,
      submissions_locked: false,
      admin_password_hash: "hash",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  });

  it("sets admin cookie on valid password", async () => {
    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/groups/demo/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password: "super-secret-password",
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ slug: "demo" }),
    });

    expect(response.status).toBe(200);
    expect(setAdminSessionCookieMock).toHaveBeenCalledTimes(1);
  });
});

