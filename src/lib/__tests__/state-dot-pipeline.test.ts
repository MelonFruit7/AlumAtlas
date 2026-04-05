import { describe, expect, it } from "vitest";
import {
  buildStateDotMapNodes,
  resolveSemanticLevel,
} from "@/lib/state-dot-pipeline";
import type { EntryRecord } from "@/types/domain";

function makeEntry(partial: Partial<EntryRecord>): EntryRecord {
  return {
    id: partial.id ?? crypto.randomUUID(),
    group_id: partial.group_id ?? "group-1",
    device_id_hash: partial.device_id_hash ?? "hash",
    display_name: partial.display_name ?? "Person",
    linkedin_url: partial.linkedin_url ?? "https://linkedin.com/in/person",
    company_name: partial.company_name ?? "Company",
    company_domain: partial.company_domain ?? "company.com",
    company_logo_url:
      partial.company_logo_url ??
      "https://www.google.com/s2/favicons?domain=company.com&sz=128",
    profile_photo_url: partial.profile_photo_url ?? null,
    location_text: partial.location_text ?? "Austin, United States",
    country_code: partial.country_code ?? "US",
    country_name: partial.country_name ?? "United States",
    state_region:
      partial.state_region !== undefined ? partial.state_region : "Texas",
    city: partial.city !== undefined ? partial.city : "Austin",
    lat: partial.lat ?? 30.2672,
    lng: partial.lng ?? -97.7431,
    is_us: partial.is_us ?? true,
    created_at: partial.created_at ?? new Date().toISOString(),
    updated_at: partial.updated_at ?? new Date().toISOString(),
  };
}

describe("resolveSemanticLevel", () => {
  it("maps zoom bands to expected semantic levels", () => {
    expect(resolveSemanticLevel(2.2)).toBe("world");
    expect(resolveSemanticLevel(4.2)).toBe("country");
    expect(resolveSemanticLevel(6.2)).toBe("state");
    expect(resolveSemanticLevel(8.2)).toBe("city");
  });
});

describe("buildStateDotMapNodes", () => {
  it("merges GA/Georgia and uses fixed Georgia anchor at world level", () => {
    const georgiaCode = makeEntry({
      id: "ga-1",
      state_region: "GA",
      city: "Atlanta",
      lat: 33.7544657,
      lng: -84.3898151,
    });
    const georgiaName = makeEntry({
      id: "ga-2",
      state_region: "Georgia",
      city: "Savannah",
      lat: 32.0808989,
      lng: -81.091203,
    });

    const result = buildStateDotMapNodes([georgiaCode, georgiaName], "world");
    const georgia = result.nodes.find(
      (node) => node.kind === "aggregate" && node.label === "Georgia, United States",
    );
    expect(georgia).toBeDefined();
    if (!georgia || georgia.kind !== "aggregate") return;

    expect(georgia.count).toBe(2);
    expect(georgia.lat).toBeCloseTo(33.040619, 6);
    expect(georgia.lng).toBeCloseTo(-83.643074, 6);
  });

  it("includes zero-count state test points when debugStateDots is enabled", () => {
    const result = buildStateDotMapNodes([], "world", { debugStateDots: true });
    const texas = result.nodes.find(
      (node) => node.kind === "aggregate" && node.id === "world-state:US:TX",
    );
    expect(texas).toBeDefined();
    if (!texas || texas.kind !== "aggregate") return;

    expect(texas.count).toBe(0);
    expect(texas.lat).toBeCloseTo(31.054487, 6);
    expect(texas.lng).toBeCloseTo(-97.563461, 6);
  });

  it("keeps US state anchors fixed at country level", () => {
    const texasA = makeEntry({
      id: "tx-a",
      state_region: "Texas",
      city: "Austin",
      lat: 30,
      lng: -97,
    });
    const texasB = makeEntry({
      id: "tx-b",
      state_region: "TX",
      city: "Dallas",
      lat: 35,
      lng: -95,
    });

    const result = buildStateDotMapNodes([texasA, texasB], "country");
    const texas = result.nodes.find(
      (node) => node.kind === "aggregate" && node.label === "Texas",
    );
    expect(texas).toBeDefined();
    if (!texas || texas.kind !== "aggregate") return;

    expect(texas.lat).toBeCloseTo(31.054487, 6);
    expect(texas.lng).toBeCloseTo(-97.563461, 6);
  });

  it("shows non-US regions as state/province dots at country level", () => {
    const ontarioA = makeEntry({
      id: "ca-on-1",
      country_code: "CA",
      country_name: "Canada",
      state_region: "Ontario",
      city: "Toronto",
      lat: 43.6532,
      lng: -79.3832,
      is_us: false,
    });
    const ontarioB = makeEntry({
      id: "ca-on-2",
      country_code: "CA",
      country_name: "Canada",
      state_region: "Ontario",
      city: "Ottawa",
      lat: 45.4215,
      lng: -75.6972,
      is_us: false,
    });
    const quebec = makeEntry({
      id: "ca-qc-1",
      country_code: "CA",
      country_name: "Canada",
      state_region: "Quebec",
      city: "Montreal",
      lat: 45.5017,
      lng: -73.5673,
      is_us: false,
    });

    const result = buildStateDotMapNodes([ontarioA, ontarioB, quebec], "country");
    const labels = result.nodes
      .filter((node) => node.kind === "aggregate")
      .map((node) => (node.kind === "aggregate" ? node.label : ""))
      .sort();
    expect(labels).toEqual(["Ontario, Canada", "Quebec, Canada"]);
  });

  it("splits all countries into city aggregates at state semantic level", () => {
    const austin = makeEntry({
      id: "a1",
      state_region: "Texas",
      city: "Austin",
      lat: 30.2672,
      lng: -97.7431,
    });
    const dallas = makeEntry({
      id: "d1",
      state_region: "TX",
      city: "Dallas",
      lat: 32.7767,
      lng: -96.797,
    });
    const france = makeEntry({
      id: "fr-1",
      country_code: "FR",
      country_name: "France",
      state_region: null,
      city: "Paris",
      lat: 48.8566,
      lng: 2.3522,
      is_us: false,
    });

    const result = buildStateDotMapNodes([austin, dallas, france], "state");
    const aggregateLabels = result.nodes
      .filter((node) => node.kind === "aggregate")
      .map((node) => (node.kind === "aggregate" ? node.label : ""))
      .sort();
    const peopleCount = result.nodes.filter((node) => node.kind === "person").length;

    expect(aggregateLabels).toEqual(["Austin, Texas", "Dallas, Texas", "Paris, France"]);
    expect(peopleCount).toBe(0);
  });

  it("shows people at city level for cities with 10 or fewer members", () => {
    const tenAustin = Array.from({ length: 10 }, (_, index) =>
      makeEntry({
        id: `austin-${index}`,
        state_region: "Texas",
        city: "Austin",
        lat: 30.2672 + index * 0.001,
        lng: -97.7431,
      }),
    );

    const result = buildStateDotMapNodes(tenAustin, "city");
    const peopleCount = result.nodes.filter((node) => node.kind === "person").length;
    const aggregateCount = result.nodes.filter((node) => node.kind === "aggregate").length;

    expect(peopleCount).toBe(10);
    expect(aggregateCount).toBe(0);
  });

  it("shows people at city level even when count is over 10", () => {
    const elevenAustin = Array.from({ length: 11 }, (_, index) =>
      makeEntry({
        id: `austin-${index}`,
        state_region: "Texas",
        city: "Austin",
        lat: 30.2672 + index * 0.001,
        lng: -97.7431,
      }),
    );

    const result = buildStateDotMapNodes(elevenAustin, "city");
    const peopleCount = result.nodes.filter((node) => node.kind === "person").length;
    const aggregateCount = result.nodes.filter((node) => node.kind === "aggregate").length;
    expect(peopleCount).toBe(11);
    expect(aggregateCount).toBe(0);
  });

  it("shows people at city level for non-US entries too", () => {
    const tokyo = makeEntry({
      id: "jp-1",
      country_code: "JP",
      country_name: "Japan",
      state_region: "Tokyo",
      city: "Tokyo",
      lat: 35.6762,
      lng: 139.6503,
      is_us: false,
    });
    const london = makeEntry({
      id: "gb-1",
      country_code: "GB",
      country_name: "United Kingdom",
      state_region: "England",
      city: "London",
      lat: 51.5072,
      lng: -0.1276,
      is_us: false,
    });

    const result = buildStateDotMapNodes([tokyo, london], "city");
    const people = result.nodes.filter((node) => node.kind === "person");
    const aggregateCount = result.nodes.filter((node) => node.kind === "aggregate").length;

    expect(people).toHaveLength(2);
    expect(aggregateCount).toBe(0);
  });
});
