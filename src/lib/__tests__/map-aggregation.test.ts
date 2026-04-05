import { describe, expect, it } from "vitest";
import { aggregateMapNodes, resolveSemanticLevel } from "@/lib/map-aggregation";
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
    state_region: partial.state_region !== undefined ? partial.state_region : "Texas",
    city: partial.city !== undefined ? partial.city : "Austin",
    lat: partial.lat ?? 30.2672,
    lng: partial.lng ?? -97.7431,
    is_us: partial.is_us ?? true,
    created_at: partial.created_at ?? new Date().toISOString(),
    updated_at: partial.updated_at ?? new Date().toISOString(),
  };
}

describe("resolveSemanticLevel", () => {
  it("maps zoom bands to semantic levels", () => {
    expect(resolveSemanticLevel(2)).toBe("world");
    expect(resolveSemanticLevel(4)).toBe("country");
    expect(resolveSemanticLevel(6)).toBe("state");
    expect(resolveSemanticLevel(8)).toBe("city");
  });
});

describe("aggregateMapNodes", () => {
  const usAustin = makeEntry({ id: "1", state_region: "Texas", city: "Austin" });
  const usDallas = makeEntry({ id: "2", state_region: "Texas", city: "Dallas", lat: 32.7767 });
  const franceParis = makeEntry({
    id: "3",
    country_code: "FR",
    country_name: "France",
    state_region: null,
    city: "Paris",
    lat: 48.8566,
    lng: 2.3522,
    is_us: false,
  });

  it("groups by state/province at world level with country fallback", () => {
    const nodes = aggregateMapNodes([usAustin, usDallas, franceParis], "world");
    const labels = nodes
      .filter((node) => node.kind === "aggregate")
      .map((node) => (node.kind === "aggregate" ? node.label : ""))
      .sort();

    expect(labels).toEqual(["France", "Texas, United States"]);
  });

  it("merges US state abbreviation and full-name variants into one world aggregate", () => {
    const floridaCode = makeEntry({
      id: "fl-1",
      state_region: "FL",
      city: "Orlando",
      lat: 28.5383,
      lng: -81.3792,
    });
    const floridaName = makeEntry({
      id: "fl-2",
      state_region: "Florida",
      city: "Miami",
      lat: 25.7617,
      lng: -80.1918,
    });

    const nodes = aggregateMapNodes([floridaCode, floridaName], "world");
    const florida = nodes.find(
      (node) => node.kind === "aggregate" && node.label === "Florida, United States",
    );

    expect(florida).toBeDefined();
    if (!florida || florida.kind !== "aggregate") return;
    expect(florida.count).toBe(2);
  });

  it("anchors merged GA/Georgia world aggregate to Georgia's fixed state center", () => {
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

    const nodes = aggregateMapNodes([georgiaCode, georgiaName], "world");
    const georgia = nodes.find(
      (node) => node.kind === "aggregate" && node.label === "Georgia, United States",
    );
    expect(georgia).toBeDefined();
    if (!georgia || georgia.kind !== "aggregate") return;

    expect(georgia.count).toBe(2);
    expect(georgia.lat).toBeCloseTo(33.040619, 6);
    expect(georgia.lng).toBeCloseTo(-83.643074, 6);
  });

  it("anchors world-level US state aggregates to fixed state centers", () => {
    const denseTexas = [
      makeEntry({
        id: "tx-a",
        state_region: "Texas",
        city: "Austin",
        lat: 30.0,
        lng: -97.0,
      }),
      makeEntry({
        id: "tx-b",
        state_region: "Texas",
        city: "Waco",
        lat: 30.5,
        lng: -97.1,
      }),
      makeEntry({
        id: "tx-c",
        state_region: "Texas",
        city: "Dallas",
        lat: 40.0,
        lng: -96.9,
      }),
    ];

    const nodes = aggregateMapNodes(denseTexas, "world");
    const texas = nodes.find(
      (node) => node.kind === "aggregate" && node.label === "Texas, United States",
    );

    expect(texas).toBeDefined();
    if (!texas || texas.kind !== "aggregate") return;

    expect(texas.lat).toBeCloseTo(31.054487, 6);
    expect(texas.lng).toBeCloseTo(-97.563461, 6);
  });

  it("keeps stable world-state anchor regardless entry order", () => {
    const entriesA = [
      makeEntry({ id: "a", state_region: "Texas", city: "A", lat: 30, lng: 5 }),
      makeEntry({ id: "b", state_region: "Texas", city: "B", lat: 30, lng: 4 }),
      makeEntry({ id: "c", state_region: "Texas", city: "C", lat: 30, lng: 0 }),
      makeEntry({ id: "d", state_region: "Texas", city: "D", lat: 30, lng: 100 }),
    ];
    const entriesB = [...entriesA].reverse();

    const nodesA = aggregateMapNodes(entriesA, "world");
    const nodesB = aggregateMapNodes(entriesB, "world");
    const texasA = nodesA.find(
      (node) => node.kind === "aggregate" && node.label === "Texas, United States",
    );
    const texasB = nodesB.find(
      (node) => node.kind === "aggregate" && node.label === "Texas, United States",
    );

    expect(texasA).toBeDefined();
    expect(texasB).toBeDefined();
    if (!texasA || texasA.kind !== "aggregate") return;
    if (!texasB || texasB.kind !== "aggregate") return;

    expect(texasA.lat).toBeCloseTo(texasB.lat, 10);
    expect(texasA.lng).toBeCloseTo(texasB.lng, 10);
  });

  it("uses stable label tiebreak sorting when aggregate counts are equal", () => {
    const california = makeEntry({
      id: "ca-1",
      state_region: "CA",
      city: "San Diego",
      lat: 32.7157,
      lng: -117.1611,
    });
    const texas = makeEntry({
      id: "tx-1",
      state_region: "Texas",
      city: "Austin",
      lat: 30.2672,
      lng: -97.7431,
    });

    const nodes = aggregateMapNodes([texas, california], "world");
    const labels = nodes
      .filter((node) => node.kind === "aggregate")
      .map((node) => (node.kind === "aggregate" ? node.label : ""));

    expect(labels).toEqual(["California, United States", "Texas, United States"]);
  });

  it("does not merge different states at world level", () => {
    const usCalifornia = makeEntry({
      id: "4",
      state_region: "California",
      city: "San Francisco",
      lat: 37.7749,
      lng: -122.4194,
    });

    const nodes = aggregateMapNodes([usAustin, usCalifornia], "world");
    const labels = nodes
      .filter((node) => node.kind === "aggregate")
      .map((node) => (node.kind === "aggregate" ? node.label : ""))
      .sort();

    expect(labels).toEqual(["California, United States", "Texas, United States"]);
  });

  it("falls back to medoid for unsupported world-state center mappings", () => {
    const nonUSStateA = makeEntry({
      id: "br-a",
      country_code: "BR",
      country_name: "Brazil",
      state_region: "Sao Paulo",
      city: "Sao Paulo",
      lat: -23.55052,
      lng: -46.633308,
      is_us: false,
    });
    const nonUSStateB = makeEntry({
      id: "br-b",
      country_code: "BR",
      country_name: "Brazil",
      state_region: "Sao Paulo",
      city: "Campinas",
      lat: -22.90556,
      lng: -47.06083,
      is_us: false,
    });

    const nodes = aggregateMapNodes([nonUSStateA, nonUSStateB], "world");
    const saoPaulo = nodes.find(
      (node) => node.kind === "aggregate" && node.label === "Sao Paulo, Brazil",
    );
    expect(saoPaulo).toBeDefined();
    if (!saoPaulo || saoPaulo.kind !== "aggregate") return;

    expect(saoPaulo.lat).toBeCloseTo(nonUSStateA.lat, 5);
    expect(saoPaulo.lng).toBeCloseTo(nonUSStateA.lng, 5);
  });

  it("groups US by state at country level and keeps non-US by country", () => {
    const nodes = aggregateMapNodes([usAustin, usDallas, franceParis], "country");
    const labels = nodes
      .filter((node) => node.kind === "aggregate")
      .map((node) => (node.kind === "aggregate" ? node.label : ""))
      .sort();

    expect(labels).toEqual(["France", "Texas"]);
  });

  it("shows people only for US entries at city level", () => {
    const nodes = aggregateMapNodes([usAustin, usDallas, franceParis], "city");
    const people = nodes.filter((node) => node.kind === "person");
    const aggregates = nodes.filter((node) => node.kind === "aggregate");
    expect(people).toHaveLength(2);
    expect(aggregates).toHaveLength(1);
  });

  it("shows people at state level when a US state has fewer than 35 entries", () => {
    const nodes = aggregateMapNodes([usAustin, usDallas, franceParis], "state");
    const people = nodes.filter((node) => node.kind === "person");
    const aggregateLabels = nodes
      .filter((node) => node.kind === "aggregate")
      .map((node) => (node.kind === "aggregate" ? node.label : ""))
      .sort();

    expect(people).toHaveLength(2);
    expect(aggregateLabels).toEqual(["France"]);
  });

  it("shows state aggregate at threshold count (35) instead of individual people", () => {
    const denseTexas = Array.from({ length: 35 }, (_, index) =>
      makeEntry({
        id: `tx-${index}`,
        state_region: "Texas",
        city: `City ${index}`,
        lat: 30.2672 + index * 0.01,
        lng: -97.7431 - index * 0.01,
      }),
    );
    const nodes = aggregateMapNodes([...denseTexas, franceParis], "state");
    const people = nodes.filter((node) => node.kind === "person");
    const aggregateLabels = nodes
      .filter((node) => node.kind === "aggregate")
      .map((node) => (node.kind === "aggregate" ? node.label : ""))
      .sort();

    expect(people).toHaveLength(0);
    expect(aggregateLabels).toEqual(["France", "Texas"]);
  });

  it("anchors dense US state aggregate to deterministic member medoid", () => {
    const denseTexas = Array.from({ length: 35 }, (_, index) =>
      makeEntry({
        id: `tx-${index}`,
        state_region: "Texas",
        city: `City ${index}`,
        lat: 30.1 + index * 0.01,
        lng: -97.5 - index * 0.01,
      }),
    );

    const nodes = aggregateMapNodes(denseTexas, "state");
    const texas = nodes.find((node) => node.kind === "aggregate" && node.label === "Texas");
    expect(texas).toBeDefined();
    if (!texas || texas.kind !== "aggregate") return;

    const expectedMedoid = denseTexas[17];
    expect(texas.lat).toBeCloseTo(expectedMedoid.lat, 10);
    expect(texas.lng).toBeCloseTo(expectedMedoid.lng, 10);
  });
});
