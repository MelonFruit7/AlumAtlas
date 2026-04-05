import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  fetchEntriesForGroupMock,
  hasSupabaseServerEnvMock,
  buildStateDotMapNodesMock,
  resolveSemanticLevelMock,
} = vi.hoisted(() => ({
  fetchEntriesForGroupMock: vi.fn(),
  hasSupabaseServerEnvMock: vi.fn(() => true),
  buildStateDotMapNodesMock: vi.fn(() => ({ nodes: [] })),
  resolveSemanticLevelMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  fetchEntriesForGroup: fetchEntriesForGroupMock,
}));

vi.mock("@/lib/env", () => ({
  hasSupabaseServerEnv: hasSupabaseServerEnvMock,
}));

vi.mock("@/lib/state-dot-pipeline", () => ({
  buildStateDotMapNodes: buildStateDotMapNodesMock,
  resolveSemanticLevel: resolveSemanticLevelMock,
}));

describe("GET /api/groups/[slug]/map-data", () => {
  beforeEach(() => {
    fetchEntriesForGroupMock.mockReset();
    hasSupabaseServerEnvMock.mockReset();
    buildStateDotMapNodesMock.mockReset();
    resolveSemanticLevelMock.mockReset();
    hasSupabaseServerEnvMock.mockReturnValue(true);
    fetchEntriesForGroupMock.mockResolvedValue([]);
    buildStateDotMapNodesMock.mockReturnValue({ nodes: [] });
  });

  it("ignores bbox filtering at world semantic level", async () => {
    resolveSemanticLevelMock.mockReturnValueOnce("world");
    const { GET } = await import("./route");
    const request = new Request(
      "http://localhost/api/groups/demo/map-data?zoom=2.2&bbox=-122,37,-121,38",
    );

    const response = await GET(request, {
      params: Promise.resolve({ slug: "demo" }),
    });

    expect(response.status).toBe(200);
    expect(fetchEntriesForGroupMock).toHaveBeenCalledWith("demo", null);
  });

  it("ignores bbox filtering at country semantic level for stable aggregate dots", async () => {
    resolveSemanticLevelMock.mockReturnValueOnce("country");
    const { GET } = await import("./route");
    const request = new Request(
      "http://localhost/api/groups/demo/map-data?zoom=4.2&bbox=-122,37,-121,38",
    );

    const response = await GET(request, {
      params: Promise.resolve({ slug: "demo" }),
    });

    expect(response.status).toBe(200);
    expect(fetchEntriesForGroupMock).toHaveBeenCalledWith("demo", null);
  });

  it("ignores bbox filtering at state semantic level for stable aggregate dots", async () => {
    resolveSemanticLevelMock.mockReturnValueOnce("state");
    const { GET } = await import("./route");
    const request = new Request(
      "http://localhost/api/groups/demo/map-data?zoom=6.2&bbox=-122,37,-121,38",
    );

    const response = await GET(request, {
      params: Promise.resolve({ slug: "demo" }),
    });

    expect(response.status).toBe(200);
    expect(fetchEntriesForGroupMock).toHaveBeenCalledWith("demo", null);
  });

  it("ignores bbox filtering at city semantic level for stable capsule placement", async () => {
    resolveSemanticLevelMock.mockReturnValueOnce("city");
    const { GET } = await import("./route");
    const request = new Request(
      "http://localhost/api/groups/demo/map-data?zoom=8.2&bbox=-122,37,-121,38",
    );

    const response = await GET(request, {
      params: Promise.resolve({ slug: "demo" }),
    });

    expect(response.status).toBe(200);
    expect(fetchEntriesForGroupMock).toHaveBeenCalledWith("demo", null);
  });

  it("passes debugStateDots through when requested", async () => {
    resolveSemanticLevelMock.mockReturnValueOnce("world");
    const { GET } = await import("./route");
    const request = new Request(
      "http://localhost/api/groups/demo/map-data?zoom=2.2&debugStateDots=1",
    );

    const response = await GET(request, {
      params: Promise.resolve({ slug: "demo" }),
    });

    expect(response.status).toBe(200);
    expect(buildStateDotMapNodesMock).toHaveBeenCalledWith([], "world", {
      debugStateDots: true,
    });
  });

});
