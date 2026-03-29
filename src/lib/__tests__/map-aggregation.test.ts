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
});
