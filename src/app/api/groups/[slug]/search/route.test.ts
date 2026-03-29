import { beforeEach, describe, expect, it, vi } from "vitest";

const { getGroupBySlugMock, hasSupabaseServerEnvMock, searchLocationsMock } = vi.hoisted(() => ({
  getGroupBySlugMock: vi.fn(),
  hasSupabaseServerEnvMock: vi.fn(() => true),
  searchLocationsMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getGroupBySlug: getGroupBySlugMock,
}));

vi.mock("@/lib/env", () => ({
  hasSupabaseServerEnv: hasSupabaseServerEnvMock,
}));

vi.mock("@/lib/location", () => ({
  searchLocations: searchLocationsMock,
}));

describe("GET /api/groups/[slug]/search", () => {
  beforeEach(() => {
    getGroupBySlugMock.mockReset();
    hasSupabaseServerEnvMock.mockReset();
    searchLocationsMock.mockReset();
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

  it("returns mapped location results", async () => {
    searchLocationsMock.mockResolvedValueOnce([
      {
        label: "Austin, Texas, United States",
        lat: 30.2672,
        lng: -97.7431,
        countryCode: "US",
        countryName: "United States",
        stateRegion: "Texas",
        city: "Austin",
        semanticLevel: "city",
      },
    ]);
    const { GET } = await import("./route");
    const request = new Request("http://localhost/api/groups/demo/search?q=austin");

    const response = await GET(request, {
      params: Promise.resolve({ slug: "demo" }),
    });
    const body = (await response.json()) as {
      results?: Array<{ label?: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.results?.[0]?.label).toBe("Austin, Texas, United States");
  });

  it("returns 404 when group slug is unknown", async () => {
    getGroupBySlugMock.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const request = new Request("http://localhost/api/groups/missing/search?q=austin");

    const response = await GET(request, {
      params: Promise.resolve({ slug: "missing" }),
    });
    expect(response.status).toBe(404);
  });
});
