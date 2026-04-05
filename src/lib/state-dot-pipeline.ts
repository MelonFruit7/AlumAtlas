import type {
  AggregateMapNode,
  EntryRecord,
  MapNode,
  PersonMapNode,
  SemanticZoomLevel,
} from "@/types/domain";

const MEDOID_TIE_EPSILON = 1e-9;

type Coordinate = {
  lat: number;
  lng: number;
};

type USStateInfo = {
  code: string;
  name: string;
  center: Coordinate;
};

type AggregateGroup = {
  id: string;
  label: string;
  aggregateLevel: "country" | "state" | "city";
  countryCode: string;
  members: EntryRecord[];
  fixedAnchor?: Coordinate;
  forcedCount?: number;
};

export type StateDotPipelineResult = {
  nodes: MapNode[];
};

type PipelineOptions = {
  debugStateDots?: boolean;
};

const US_STATE_INFOS: USStateInfo[] = [
  { code: "AL", name: "Alabama", center: { lat: 32.806671, lng: -86.79113 } },
  { code: "AK", name: "Alaska", center: { lat: 61.370716, lng: -152.404419 } },
  { code: "AZ", name: "Arizona", center: { lat: 33.729759, lng: -111.431221 } },
  { code: "AR", name: "Arkansas", center: { lat: 34.969704, lng: -92.373123 } },
  { code: "CA", name: "California", center: { lat: 36.116203, lng: -119.681564 } },
  { code: "CO", name: "Colorado", center: { lat: 39.059811, lng: -105.311104 } },
  { code: "CT", name: "Connecticut", center: { lat: 41.597782, lng: -72.755371 } },
  { code: "DE", name: "Delaware", center: { lat: 39.318523, lng: -75.507141 } },
  { code: "FL", name: "Florida", center: { lat: 27.766279, lng: -81.686783 } },
  { code: "GA", name: "Georgia", center: { lat: 33.040619, lng: -83.643074 } },
  { code: "HI", name: "Hawaii", center: { lat: 21.094318, lng: -157.498337 } },
  { code: "ID", name: "Idaho", center: { lat: 44.240459, lng: -114.478828 } },
  { code: "IL", name: "Illinois", center: { lat: 40.349457, lng: -88.986137 } },
  { code: "IN", name: "Indiana", center: { lat: 39.849426, lng: -86.258278 } },
  { code: "IA", name: "Iowa", center: { lat: 42.011539, lng: -93.210526 } },
  { code: "KS", name: "Kansas", center: { lat: 38.5266, lng: -96.726486 } },
  { code: "KY", name: "Kentucky", center: { lat: 37.66814, lng: -84.670067 } },
  { code: "LA", name: "Louisiana", center: { lat: 31.169546, lng: -91.867805 } },
  { code: "ME", name: "Maine", center: { lat: 44.693947, lng: -69.381927 } },
  { code: "MD", name: "Maryland", center: { lat: 39.063946, lng: -76.802101 } },
  { code: "MA", name: "Massachusetts", center: { lat: 42.230171, lng: -71.530106 } },
  { code: "MI", name: "Michigan", center: { lat: 43.326618, lng: -84.536095 } },
  { code: "MN", name: "Minnesota", center: { lat: 45.694454, lng: -93.900192 } },
  { code: "MS", name: "Mississippi", center: { lat: 32.741646, lng: -89.678696 } },
  { code: "MO", name: "Missouri", center: { lat: 38.456085, lng: -92.288368 } },
  { code: "MT", name: "Montana", center: { lat: 46.921925, lng: -110.454353 } },
  { code: "NE", name: "Nebraska", center: { lat: 41.12537, lng: -98.268082 } },
  { code: "NV", name: "Nevada", center: { lat: 38.313515, lng: -117.055374 } },
  { code: "NH", name: "New Hampshire", center: { lat: 43.452492, lng: -71.563896 } },
  { code: "NJ", name: "New Jersey", center: { lat: 40.298904, lng: -74.521011 } },
  { code: "NM", name: "New Mexico", center: { lat: 34.840515, lng: -106.248482 } },
  { code: "NY", name: "New York", center: { lat: 42.165726, lng: -74.948051 } },
  { code: "NC", name: "North Carolina", center: { lat: 35.630066, lng: -79.806419 } },
  { code: "ND", name: "North Dakota", center: { lat: 47.528912, lng: -99.784012 } },
  { code: "OH", name: "Ohio", center: { lat: 40.388783, lng: -82.764915 } },
  { code: "OK", name: "Oklahoma", center: { lat: 35.565342, lng: -96.928917 } },
  { code: "OR", name: "Oregon", center: { lat: 44.572021, lng: -122.070938 } },
  { code: "PA", name: "Pennsylvania", center: { lat: 40.590752, lng: -77.209755 } },
  { code: "RI", name: "Rhode Island", center: { lat: 41.680893, lng: -71.51178 } },
  { code: "SC", name: "South Carolina", center: { lat: 33.856892, lng: -80.945007 } },
  { code: "SD", name: "South Dakota", center: { lat: 44.299782, lng: -99.438828 } },
  { code: "TN", name: "Tennessee", center: { lat: 35.747845, lng: -86.692345 } },
  { code: "TX", name: "Texas", center: { lat: 31.054487, lng: -97.563461 } },
  { code: "UT", name: "Utah", center: { lat: 40.150032, lng: -111.862434 } },
  { code: "VT", name: "Vermont", center: { lat: 44.045876, lng: -72.710686 } },
  { code: "VA", name: "Virginia", center: { lat: 37.769337, lng: -78.169968 } },
  { code: "WA", name: "Washington", center: { lat: 47.400902, lng: -121.490494 } },
  { code: "WV", name: "West Virginia", center: { lat: 38.491226, lng: -80.954453 } },
  { code: "WI", name: "Wisconsin", center: { lat: 44.268543, lng: -89.616508 } },
  { code: "WY", name: "Wyoming", center: { lat: 42.755966, lng: -107.30249 } },
  { code: "DC", name: "District of Columbia", center: { lat: 38.897438, lng: -77.026817 } },
  { code: "PR", name: "Puerto Rico", center: { lat: 18.220833, lng: -66.590149 } },
];

const US_STATES_BY_CODE = new Map(US_STATE_INFOS.map((state) => [state.code, state]));
const US_STATES_BY_NAME = new Map(
  US_STATE_INFOS.map((state) => [normalizeLabel(state.name), state]),
);

function normalizeLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ");
}

function normalizeCountryCode(value: string | null | undefined): string {
  const code = (value ?? "").trim().toUpperCase();
  return code || "UN";
}

function normalizeStateKey(value: string): string {
  return normalizeLabel(value).replace(/\s+/g, "-");
}

function countryLabel(entry: EntryRecord): string {
  return (entry.country_name || entry.country_code || "Unknown Country").trim();
}

function stateLabel(entry: EntryRecord): string {
  return (entry.state_region || entry.city || "Unknown Region").trim();
}

function isEntryUS(entry: EntryRecord): boolean {
  return normalizeCountryCode(entry.country_code) === "US" || entry.is_us;
}

function canonicalUSState(stateRegion: string | null | undefined): USStateInfo | null {
  const raw = (stateRegion ?? "").trim();
  if (!raw) {
    return null;
  }
  const byCode = US_STATES_BY_CODE.get(raw.toUpperCase());
  if (byCode) {
    return byCode;
  }
  return US_STATES_BY_NAME.get(normalizeLabel(raw)) ?? null;
}

function resolveUSCityMeta(entry: EntryRecord): {
  cityId: string;
  cityLabel: string;
  stateLabelValue: string;
} {
  const state = canonicalUSState(entry.state_region);
  const stateLabelValue = state?.name ?? stateLabel(entry);
  const stateKey = state?.code ?? normalizeStateKey(stateLabelValue);
  const cityName = (entry.city ?? "").trim() || "Unknown City";
  const cityKey = normalizeStateKey(cityName);

  return {
    cityId: `us-city:${stateKey}:${cityKey}`,
    cityLabel: `${cityName}, ${stateLabelValue}`,
    stateLabelValue,
  };
}

export function resolveSemanticLevel(zoom: number): SemanticZoomLevel {
  if (zoom < 3) return "world";
  if (zoom < 5) return "country";
  if (zoom < 7) return "state";
  return "city";
}

function upsertGroup(
  groups: Map<string, AggregateGroup>,
  group: AggregateGroup,
  entry?: EntryRecord,
) {
  const existing = groups.get(group.id);
  if (existing) {
    if (entry) {
      existing.members.push(entry);
    }
    return;
  }

  groups.set(group.id, {
    ...group,
    members: entry ? [entry] : [...group.members],
  });
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineMeters(a: EntryRecord, b: EntryRecord): number {
  const earthRadius = 6_371_000;
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const latA = toRadians(a.lat);
  const latB = toRadians(b.lat);

  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const h = sinLat * sinLat + Math.cos(latA) * Math.cos(latB) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return earthRadius * c;
}

function medoidCoordinate(entries: EntryRecord[]): Coordinate {
  if (entries.length === 0) {
    return { lat: 0, lng: 0 };
  }
  if (entries.length === 1) {
    const [entry] = entries;
    if (!entry) return { lat: 0, lng: 0 };
    return { lat: entry.lat, lng: entry.lng };
  }

  let best = entries[0] as EntryRecord;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of entries) {
    let total = 0;
    for (const other of entries) {
      total += haversineMeters(candidate, other);
    }

    if (total < bestDistance - MEDOID_TIE_EPSILON) {
      bestDistance = total;
      best = candidate;
      continue;
    }

    if (Math.abs(total - bestDistance) <= MEDOID_TIE_EPSILON) {
      if (candidate.id.localeCompare(best.id) < 0) {
        best = candidate;
      }
    }
  }

  return { lat: best.lat, lng: best.lng };
}

function personNode(entry: EntryRecord): PersonMapNode {
  return {
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
    countryName: countryLabel(entry),
  };
}

function aggregateNode(group: AggregateGroup): AggregateMapNode {
  const count = group.forcedCount ?? group.members.length;
  const coordinate = group.fixedAnchor ?? medoidCoordinate(group.members);

  return {
    kind: "aggregate",
    id: group.id,
    label: group.label,
    count,
    aggregateLevel: group.aggregateLevel,
    countryCode: group.countryCode,
    lat: coordinate.lat,
    lng: coordinate.lng,
  };
}

function compareAggregates(a: AggregateMapNode, b: AggregateMapNode): number {
  if (a.count !== b.count) {
    return b.count - a.count;
  }
  const labelDiff = a.label.localeCompare(b.label);
  if (labelDiff !== 0) {
    return labelDiff;
  }
  return a.id.localeCompare(b.id);
}

function comparePeople(a: PersonMapNode, b: PersonMapNode): number {
  const byName = a.displayName.localeCompare(b.displayName);
  if (byName !== 0) {
    return byName;
  }
  return a.id.localeCompare(b.id);
}

function worldNodes(entries: EntryRecord[], options: PipelineOptions): StateDotPipelineResult {
  const groups = new Map<string, AggregateGroup>();

  for (const entry of entries) {
    const countryCode = normalizeCountryCode(entry.country_code);
    if (isEntryUS(entry)) {
      const state = canonicalUSState(entry.state_region);
      if (!state) {
        upsertGroup(
          groups,
          {
            id: "world-country:US",
            label: "United States",
            aggregateLevel: "country",
            countryCode: "US",
            members: [],
          },
          entry,
        );
        continue;
      }

      upsertGroup(
        groups,
        {
          id: `world-state:US:${state.code}`,
          label: `${state.name}, United States`,
          aggregateLevel: "state",
          countryCode: "US",
          fixedAnchor: state.center,
          members: [],
        },
        entry,
      );
      continue;
    }

    upsertGroup(
      groups,
      {
        id: `world-country:${countryCode}`,
        label: countryLabel(entry),
        aggregateLevel: "country",
        countryCode,
        members: [],
      },
      entry,
    );
  }

  if (options.debugStateDots) {
    for (const state of US_STATE_INFOS) {
      if (groups.has(`world-state:US:${state.code}`)) {
        continue;
      }
      upsertGroup(groups, {
        id: `world-state:US:${state.code}`,
        label: `${state.name}, United States`,
        aggregateLevel: "state",
        countryCode: "US",
        members: [],
        fixedAnchor: state.center,
        forcedCount: 0,
      });
    }
  }

  return {
    nodes: Array.from(groups.values()).map(aggregateNode).sort(compareAggregates),
  };
}

function countryNodes(entries: EntryRecord[]): StateDotPipelineResult {
  const groups = new Map<string, AggregateGroup>();

  for (const entry of entries) {
    if (isEntryUS(entry)) {
      const state = canonicalUSState(entry.state_region);
      const label = state?.name ?? stateLabel(entry);
      const stateKey = state?.code ?? normalizeStateKey(label);
      upsertGroup(
        groups,
        {
          id: `country-state:US:${stateKey}`,
          label,
          aggregateLevel: "state",
          countryCode: "US",
          fixedAnchor: state?.center,
          members: [],
        },
        entry,
      );
      continue;
    }

    const countryCode = normalizeCountryCode(entry.country_code);
    upsertGroup(
      groups,
      {
        id: `country-country:${countryCode}`,
        label: countryLabel(entry),
        aggregateLevel: "country",
        countryCode,
        members: [],
      },
      entry,
    );
  }

  return {
    nodes: Array.from(groups.values()).map(aggregateNode).sort(compareAggregates),
  };
}

function stateNodes(entries: EntryRecord[]): StateDotPipelineResult {
  const usCityGroups = new Map<string, AggregateGroup>();
  const nonUSGroups = new Map<string, AggregateGroup>();

  for (const entry of entries) {
    if (!isEntryUS(entry)) {
      const countryCode = normalizeCountryCode(entry.country_code);
      upsertGroup(
        nonUSGroups,
        {
          id: `state-country:${countryCode}`,
          label: countryLabel(entry),
          aggregateLevel: "country",
          countryCode,
          members: [],
        },
        entry,
      );
      continue;
    }

    const city = resolveUSCityMeta(entry);
    upsertGroup(
      usCityGroups,
      {
        id: city.cityId,
        label: city.cityLabel,
        aggregateLevel: "city",
        countryCode: "US",
        members: [],
      },
      entry,
    );
  }

  const usCityNodes = Array.from(usCityGroups.values()).map(aggregateNode);
  const nonUSNodes = Array.from(nonUSGroups.values()).map(aggregateNode);
  const nodes = [...usCityNodes, ...nonUSNodes].sort(compareAggregates);

  return {
    nodes,
  };
}

function cityNodes(entries: EntryRecord[]): StateDotPipelineResult {
  const usCityGroups = new Map<string, AggregateGroup>();
  const nonUSGroups = new Map<string, AggregateGroup>();
  const people: PersonMapNode[] = [];

  for (const entry of entries) {
    if (!isEntryUS(entry)) {
      const countryCode = normalizeCountryCode(entry.country_code);
      upsertGroup(
        nonUSGroups,
        {
          id: `city-country:${countryCode}`,
          label: countryLabel(entry),
          aggregateLevel: "country",
          countryCode,
          members: [],
        },
        entry,
      );
      continue;
    }

    const city = resolveUSCityMeta(entry);
    upsertGroup(
      usCityGroups,
      {
        id: city.cityId,
        label: city.cityLabel,
        aggregateLevel: "city",
        countryCode: "US",
        members: [],
      },
      entry,
    );
  }

  const aggregates: AggregateMapNode[] = Array.from(nonUSGroups.values()).map(aggregateNode);

  for (const group of usCityGroups.values()) {
    const memberNodes = group.members.map(personNode).sort(comparePeople);
    people.push(...memberNodes);
  }

  aggregates.sort(compareAggregates);
  people.sort(comparePeople);

  return {
    nodes: [...aggregates, ...people],
  };
}

export function buildStateDotMapNodes(
  entries: EntryRecord[],
  semanticLevel: SemanticZoomLevel,
  options: PipelineOptions = {},
): StateDotPipelineResult {
  if (semanticLevel === "world") {
    return worldNodes(entries, options);
  }
  if (semanticLevel === "country") {
    return countryNodes(entries);
  }
  if (semanticLevel === "state") {
    return stateNodes(entries);
  }
  return cityNodes(entries);
}
