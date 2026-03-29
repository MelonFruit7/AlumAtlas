import { beforeEach, describe, expect, it, vi } from "vitest";

const { hasSupabaseServerEnvMock, getGroupBySlugMock, getEntryForDeviceMock } = vi.hoisted(
  () => ({
    hasSupabaseServerEnvMock: vi.fn(() => true),
    getGroupBySlugMock: vi.fn(),
    getEntryForDeviceMock: vi.fn(),
  }),
);

vi.mock("@/lib/env", () => ({
  hasSupabaseServerEnv: hasSupabaseServerEnvMock,
}));

vi.mock("@/lib/db", () => ({
  getGroupBySlug: getGroupBySlugMock,
  getEntryForDevice: getEntryForDeviceMock,
}));

describe("GET /api/groups/[slug]/entry/me", () => {
  beforeEach(() => {
    hasSupabaseServerEnvMock.mockReset();
    getGroupBySlugMock.mockReset();
    getEntryForDeviceMock.mockReset();
    hasSupabaseServerEnvMock.mockReturnValue(true);
    getGroupBySlugMock.mockResolvedValue({
      id: "group-1",
      slug: "demo",
      title: "Demo",
      description: null,
      submissions_locked: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  });

  it("returns existing entry for device token", async () => {
    getEntryForDeviceMock.mockResolvedValue({
      id: "entry-1",
      display_name: "Alex",
    });

    const { GET } = await import("./route");
    const request = new Request(
      "http://localhost/api/groups/demo/entry/me?deviceToken=device-token-123",
    );

    const response = await GET(request, {
      params: Promise.resolve({ slug: "demo" }),
    });
    const body = (await response.json()) as { entry?: { id?: string } };

    expect(response.status).toBe(200);
    expect(body.entry?.id).toBe("entry-1");
  });

  it("returns 422 when device token is missing", async () => {
    const { GET } = await import("./route");
    const request = new Request("http://localhost/api/groups/demo/entry/me");

    const response = await GET(request, {
      params: Promise.resolve({ slug: "demo" }),
    });

    expect(response.status).toBe(422);
  });
});

