import { beforeEach, describe, expect, it, vi } from "vitest";

const { createGroupMock, hasSupabaseServerEnvMock, getRuntimeConfigMock } = vi.hoisted(() => ({
  createGroupMock: vi.fn(),
  hasSupabaseServerEnvMock: vi.fn(() => true),
  getRuntimeConfigMock: vi.fn(() => ({
    appBaseUrl: "http://localhost:3000",
  })),
}));

vi.mock("@/lib/db", () => ({
  createGroup: createGroupMock,
}));

vi.mock("@/lib/env", () => ({
  hasSupabaseServerEnv: hasSupabaseServerEnvMock,
  getRuntimeConfig: getRuntimeConfigMock,
}));

describe("POST /api/groups", () => {
  beforeEach(() => {
    createGroupMock.mockReset();
    hasSupabaseServerEnvMock.mockReset();
    getRuntimeConfigMock.mockReset();
    hasSupabaseServerEnvMock.mockReturnValue(true);
    getRuntimeConfigMock.mockReturnValue({
      appBaseUrl: "http://localhost:3000",
    });
  });

  it("returns both shareUrl and adminUrl", async () => {
    createGroupMock.mockResolvedValueOnce({
      id: "group-1",
      slug: "demo-group",
      title: "Demo Group",
      description: null,
      submissions_locked: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Demo Group",
        description: "",
        adminPassword: "super-secure-password",
      }),
    });

    const response = await POST(request);
    const body = (await response.json()) as {
      shareUrl?: string;
      adminUrl?: string;
    };

    expect(response.status).toBe(200);
    expect(body.shareUrl).toBe("http://localhost:3000/g/demo-group");
    expect(body.adminUrl).toBe("http://localhost:3000/g/demo-group/admin");
  });
});

