import { describe, expect, it } from "vitest";
import {
  buildChangeSummary,
  mapFeatureToGeocode,
  parseArgs,
  pickBestGeoapifyFeature,
} from "../../../scripts/repair-entry-geocodes.mjs";

describe("repair-entry-geocodes script helpers", () => {
  it("parses defaults as dry-run", () => {
    const parsed = parseArgs([]);
    expect(parsed.apply).toBe(false);
    expect(parsed.batchSize).toBe(100);
    expect(parsed.throttleMs).toBe(80);
    expect(parsed.groupSlug).toBeNull();
  });

  it("parses apply mode and options", () => {
    const parsed = parseArgs([
      "--apply",
      "--batch-size=25",
      "--throttle-ms=12",
      "--group-slug",
      "demo-group",
    ]);
    expect(parsed.apply).toBe(true);
    expect(parsed.batchSize).toBe(25);
    expect(parsed.throttleMs).toBe(12);
    expect(parsed.groupSlug).toBe("demo-group");
  });

  it("prefers US city feature over non-US country feature", () => {
    const best = pickBestGeoapifyFeature([
      {
        properties: {
          country_code: "fr",
          result_type: "country",
        },
      },
      {
        properties: {
          country_code: "us",
          result_type: "city",
          city: "Orlando",
        },
      },
    ]);

    expect(best?.properties?.country_code).toBe("us");
    expect(best?.properties?.result_type).toBe("city");
  });

  it("maps a geoapify feature into geocode fields", () => {
    const mapped = mapFeatureToGeocode(
      {
        properties: {
          country: "United States",
          country_code: "us",
          state: "Florida",
          city: "Orlando",
        },
        geometry: {
          coordinates: [-81.3792, 28.5383],
        },
      },
      "orlando, florida",
    );

    expect(mapped).toEqual({
      normalizedQuery: "orlando, florida",
      lat: 28.5383,
      lng: -81.3792,
      countryCode: "US",
      countryName: "United States",
      stateRegion: "Florida",
      city: "Orlando",
    });
  });

  it("builds a summary that detects large moves and country changes", () => {
    const summary = buildChangeSummary(
      {
        id: "entry-1",
        lat: 52.52,
        lng: 13.405,
        country_code: "DE",
        country_name: "Germany",
        state_region: null,
        city: "Berlin",
        is_us: false,
      },
      {
        normalizedQuery: "orlando, florida",
        lat: 28.5383,
        lng: -81.3792,
        countryCode: "US",
        countryName: "United States",
        stateRegion: "Florida",
        city: "Orlando",
      },
    );

    expect(summary.changed).toBe(true);
    expect(summary.countryChanged).toBe(true);
    expect(summary.largeMove).toBe(true);
    expect(summary.next.country_code).toBe("US");
    expect(summary.next.city).toBe("Orlando");
  });
});

