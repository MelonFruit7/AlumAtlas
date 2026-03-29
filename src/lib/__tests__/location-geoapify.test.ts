import { beforeEach, describe, expect, it, vi } from "vitest";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

describe("geoapify geocoding helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    process.env.GEOAPIFY_API_KEY = "test-geoapify-key";
  });

  it("maps a city-like Geoapify feature into geocode output", async () => {
    const { mapGeoapifyFeatureToGeocode } = await import("@/lib/location");
    const mapped = mapGeoapifyFeatureToGeocode(
      {
        properties: {
          country: "United States",
          country_code: "us",
          state: "Texas",
          city: "Austin",
          result_type: "city",
        },
        geometry: {
          type: "Point",
          coordinates: [-97.7431, 30.2672],
        },
      },
      "austin, tx",
    );

    expect(mapped).toEqual({
      normalizedQuery: "austin, tx",
      lat: 30.2672,
      lng: -97.7431,
      countryCode: "US",
      countryName: "United States",
      stateRegion: "Texas",
      city: "Austin",
    });
  });

  it("returns LOCATION_NOT_FOUND when no geoapify features resolve", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ features: [] }))
        .mockResolvedValueOnce(jsonResponse({ features: [] })),
    );

    const { fetchGeoapifyGeocode } = await import("@/lib/location");

    await expect(fetchGeoapifyGeocode("Nowhere Place")).rejects.toMatchObject({
      name: "LocationLookupError",
      code: "LOCATION_NOT_FOUND",
      status: 422,
    });
  });

  it("maps 429 responses to LOCATION_RATE_LIMITED", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({}, 429)));

    const { fetchGeoapifyGeocode } = await import("@/lib/location");

    await expect(fetchGeoapifyGeocode("Austin, TX")).rejects.toMatchObject({
      code: "LOCATION_RATE_LIMITED",
      status: 429,
    });
  });

  it("maps Geoapify search features into SearchLocation values", async () => {
    const { mapGeoapifyFeaturesToSearchLocations } = await import("@/lib/location");
    const results = mapGeoapifyFeaturesToSearchLocations([
      {
        properties: {
          formatted: "Austin, Texas, United States",
          country: "United States",
          country_code: "us",
          state: "Texas",
          city: "Austin",
          result_type: "city",
        },
        geometry: {
          type: "Point",
          coordinates: [-97.7431, 30.2672],
        },
      },
    ]);

    expect(results).toEqual([
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
  });

  it("returns empty search results for empty upstream matches", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ features: [] }))
        .mockResolvedValueOnce(jsonResponse({ features: [] })),
    );

    const { searchLocations } = await import("@/lib/location");
    await expect(searchLocations("Atlantis")).resolves.toEqual([]);
  });

  it("returns empty search results when provider is rate limited", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({}, 429)));

    const { searchLocations } = await import("@/lib/location");
    await expect(searchLocations("Austin")).resolves.toEqual([]);
  });
});
