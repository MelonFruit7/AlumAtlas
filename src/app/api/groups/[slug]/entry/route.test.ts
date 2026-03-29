import { beforeEach, describe, expect, it, vi } from "vitest";

const { upsertGroupEntryMock, hasSupabaseServerEnvMock } = vi.hoisted(() => ({
  upsertGroupEntryMock: vi.fn(),
  hasSupabaseServerEnvMock: vi.fn(() => true),
}));

vi.mock("@/lib/db", () => ({
  upsertGroupEntry: upsertGroupEntryMock,
  GROUP_SUBMISSIONS_LOCKED_ERROR: "Submissions are currently locked by the board admin.",
}));

vi.mock("@/lib/env", () => ({
  hasSupabaseServerEnv: hasSupabaseServerEnvMock,
}));

function buildValidPayload() {
  return {
    displayName: "Alex Rivera",
    linkedinUrl: "https://www.linkedin.com/in/alex-rivera",
    companyName: "Acme Corp",
    companyDomain: "acme.com",
    locationText: "Austin, TX",
    deviceToken: "device-token-12345",
  };
}

describe("POST /api/groups/[slug]/entry", () => {
  beforeEach(() => {
    upsertGroupEntryMock.mockReset();
    hasSupabaseServerEnvMock.mockReset();
    hasSupabaseServerEnvMock.mockReturnValue(true);
  });

  it("returns successful response when entry upsert succeeds", async () => {
    upsertGroupEntryMock.mockResolvedValueOnce({ id: "entry-1" });
    const { POST } = await import("./route");

    const request = new Request("http://localhost/api/groups/demo/entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildValidPayload()),
    });

    const response = await POST(request, {
      params: Promise.resolve({ slug: "demo" }),
    });
    const body = (await response.json()) as { entry?: { id?: string } };

    expect(response.status).toBe(200);
    expect(body.entry?.id).toBe("entry-1");
  });

  it("passes manual companyLogoUrl through payload validation", async () => {
    upsertGroupEntryMock.mockResolvedValueOnce({ id: "entry-2" });
    const { POST } = await import("./route");

    const request = new Request("http://localhost/api/groups/demo/entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...buildValidPayload(),
        companyLogoUrl: "https://cdn.example.com/acme-logo.png",
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ slug: "demo" }),
    });

    expect(response.status).toBe(200);
    expect(upsertGroupEntryMock).toHaveBeenCalledWith(
      "demo",
      expect.objectContaining({
        companyLogoUrl: "https://cdn.example.com/acme-logo.png",
      }),
    );
  });

  it("returns 422 with explicit message for location not found errors", async () => {
    const { LocationLookupError } = await import("@/lib/location");
    upsertGroupEntryMock.mockRejectedValueOnce(
      new LocationLookupError(
        "LOCATION_NOT_FOUND",
        "Could not find this location. Try City, State or City, Country format.",
        422,
      ),
    );
    const { POST } = await import("./route");

    const request = new Request("http://localhost/api/groups/demo/entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildValidPayload()),
    });

    const response = await POST(request, {
      params: Promise.resolve({ slug: "demo" }),
    });
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(422);
    expect(body.error).toContain("Could not find this location");
  });

  it("returns 429 for rate limited location lookups", async () => {
    const { LocationLookupError } = await import("@/lib/location");
    upsertGroupEntryMock.mockRejectedValueOnce(
      new LocationLookupError(
        "LOCATION_RATE_LIMITED",
        "Location service is temporarily busy. Please try again in a moment.",
        429,
      ),
    );
    const { POST } = await import("./route");

    const request = new Request("http://localhost/api/groups/demo/entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildValidPayload()),
    });

    const response = await POST(request, {
      params: Promise.resolve({ slug: "demo" }),
    });

    expect(response.status).toBe(429);
  });

  it("returns 423 when board submissions are locked", async () => {
    const { GROUP_SUBMISSIONS_LOCKED_ERROR } = await import("@/lib/db");
    upsertGroupEntryMock.mockRejectedValueOnce(new Error(GROUP_SUBMISSIONS_LOCKED_ERROR));
    const { POST } = await import("./route");

    const request = new Request("http://localhost/api/groups/demo/entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildValidPayload()),
    });

    const response = await POST(request, {
      params: Promise.resolve({ slug: "demo" }),
    });
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(423);
    expect(body.error).toContain("locked");
  });
});
