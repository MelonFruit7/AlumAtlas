import type {
  AggregateMapNode,
  EntryRecord,
  MapNode,
  SemanticZoomLevel,
} from "@/types/domain";

type AggregateAccumulator = {
  id: string;
  label: string;
  aggregateLevel: "country" | "state" | "city";
  countryCode: string;
  sumLat: number;
  sumLng: number;
  count: number;
};

export function resolveSemanticLevel(zoom: number): SemanticZoomLevel {
  if (zoom < 3) {
    return "world";
  }
  if (zoom < 5) {
    return "country";
  }
  if (zoom < 7) {
    return "state";
  }
  return "city";
}

function isEntryUS(entry: EntryRecord): boolean {
  return (entry.country_code ?? "").toUpperCase() === "US" || entry.is_us;
}

function aggregateBy(
  accumulator: Map<string, AggregateAccumulator>,
  key: string,
  label: string,
  aggregateLevel: AggregateAccumulator["aggregateLevel"],
  countryCode: string,
  lat: number,
  lng: number,
) {
  const existing = accumulator.get(key);
  if (existing) {
    existing.count += 1;
    existing.sumLat += lat;
    existing.sumLng += lng;
    return;
  }

  accumulator.set(key, {
    id: key,
    label,
    aggregateLevel,
    countryCode,
    sumLat: lat,
    sumLng: lng,
    count: 1,
  });
}

function countryLabel(entry: EntryRecord): string {
  return entry.country_name || entry.country_code || "Unknown Country";
}

function stateLabel(entry: EntryRecord): string {
  return entry.state_region || entry.city || "Unknown Region";
}

function cityLabel(entry: EntryRecord): string {
  return entry.city || entry.state_region || "Unknown City";
}

function worldRegion(entry: EntryRecord): {
  key: string;
  label: string;
  level: "state" | "country";
} {
  const countryCode = (entry.country_code || "UN").toUpperCase();
  const country = countryLabel(entry);
  const stateRegion = (entry.state_region ?? "").trim();

  if (stateRegion) {
    return {
      key: `world-state:${countryCode}:${stateRegion.toLowerCase()}`,
      label: `${stateRegion}, ${country}`,
      level: "state",
    };
  }

  return {
    key: `world-country:${countryCode}`,
    label: country,
    level: "country",
  };
}

export function aggregateMapNodes(
  entries: EntryRecord[],
  semanticLevel: SemanticZoomLevel,
): MapNode[] {
  const aggregates = new Map<string, AggregateAccumulator>();
  const people: MapNode[] = [];

  for (const entry of entries) {
    const usEntry = isEntryUS(entry);
    const countryCode = (entry.country_code || "UN").toUpperCase();
    const country = countryLabel(entry);
    const state = stateLabel(entry);
    const city = cityLabel(entry);

    if (semanticLevel === "city" && usEntry) {
      people.push({
        kind: "person",
        id: entry.id,
        lat: entry.lat,
        lng: entry.lng,
        displayName: entry.display_name,
        linkedinUrl: entry.linkedin_url,
        companyName: entry.company_name,
        companyLogoUrl: entry.company_logo_url,
        profilePhotoUrl: entry.profile_photo_url,
        city: entry.city,
        stateRegion: entry.state_region,
        countryName: country,
      });
      continue;
    }

    if (semanticLevel === "world") {
      const world = worldRegion(entry);
      aggregateBy(
        aggregates,
        world.key,
        world.label,
        world.level,
        countryCode,
        entry.lat,
        entry.lng,
      );
      continue;
    }

    if (semanticLevel === "country") {
      if (usEntry) {
        aggregateBy(
          aggregates,
          `state:${state}`,
          state,
          "state",
          countryCode,
          entry.lat,
          entry.lng,
        );
      } else {
        aggregateBy(
          aggregates,
          `country:${countryCode}`,
          country,
          "country",
          countryCode,
          entry.lat,
          entry.lng,
        );
      }
      continue;
    }

    if (semanticLevel === "state") {
      if (usEntry) {
        aggregateBy(
          aggregates,
          `city:${city}`,
          city,
          "city",
          countryCode,
          entry.lat,
          entry.lng,
        );
      } else {
        aggregateBy(
          aggregates,
          `country:${countryCode}`,
          country,
          "country",
          countryCode,
          entry.lat,
          entry.lng,
        );
      }
      continue;
    }

    aggregateBy(
      aggregates,
      `country:${countryCode}`,
      country,
      "country",
      countryCode,
      entry.lat,
      entry.lng,
    );
  }

  const aggregateNodes: AggregateMapNode[] = Array.from(aggregates.values()).map(
    (aggregate) => ({
      kind: "aggregate",
      id: aggregate.id,
      label: aggregate.label,
      count: aggregate.count,
      aggregateLevel: aggregate.aggregateLevel,
      countryCode: aggregate.countryCode,
      lat: aggregate.sumLat / aggregate.count,
      lng: aggregate.sumLng / aggregate.count,
    }),
  );

  aggregateNodes.sort((a, b) => b.count - a.count);
  people.sort((a, b) => {
    if (a.kind !== "person" || b.kind !== "person") {
      return 0;
    }
    return a.displayName.localeCompare(b.displayName);
  });

  return [...aggregateNodes, ...people];
}
