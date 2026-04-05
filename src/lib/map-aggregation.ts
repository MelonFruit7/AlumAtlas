import type {
  AggregateMapNode,
  EntryRecord,
  MapNode,
  PersonMapNode,
  SemanticZoomLevel,
} from "@/types/domain";

const STATE_PERSON_VISIBILITY_LIMIT = 35;
const MEDOID_TIE_EPSILON = 1e-9;

type AggregateMember = {
  id: string;
  lat: number;
  lng: number;
};

type AggregateAccumulator = {
  id: string;
  label: string;
  aggregateLevel: "country" | "state" | "city";
  countryCode: string;
  members: AggregateMember[];
  fixedAnchor?: { lat: number; lng: number };
};

type USStateInfo = {
  code: string;
  name: string;
  lat: number;
  lng: number;
};

const US_STATE_INFOS: USStateInfo[] = [
  { code: "AL", name: "Alabama", lat: 32.806671, lng: -86.79113 },
  { code: "AK", name: "Alaska", lat: 61.370716, lng: -152.404419 },
  { code: "AZ", name: "Arizona", lat: 33.729759, lng: -111.431221 },
  { code: "AR", name: "Arkansas", lat: 34.969704, lng: -92.373123 },
  { code: "CA", name: "California", lat: 36.116203, lng: -119.681564 },
  { code: "CO", name: "Colorado", lat: 39.059811, lng: -105.311104 },
  { code: "CT", name: "Connecticut", lat: 41.597782, lng: -72.755371 },
  { code: "DE", name: "Delaware", lat: 39.318523, lng: -75.507141 },
  { code: "FL", name: "Florida", lat: 27.766279, lng: -81.686783 },
  { code: "GA", name: "Georgia", lat: 33.040619, lng: -83.643074 },
  { code: "HI", name: "Hawaii", lat: 21.094318, lng: -157.498337 },
  { code: "ID", name: "Idaho", lat: 44.240459, lng: -114.478828 },
  { code: "IL", name: "Illinois", lat: 40.349457, lng: -88.986137 },
  { code: "IN", name: "Indiana", lat: 39.849426, lng: -86.258278 },
  { code: "IA", name: "Iowa", lat: 42.011539, lng: -93.210526 },
  { code: "KS", name: "Kansas", lat: 38.5266, lng: -96.726486 },
  { code: "KY", name: "Kentucky", lat: 37.66814, lng: -84.670067 },
  { code: "LA", name: "Louisiana", lat: 31.169546, lng: -91.867805 },
  { code: "ME", name: "Maine", lat: 44.693947, lng: -69.381927 },
  { code: "MD", name: "Maryland", lat: 39.063946, lng: -76.802101 },
  { code: "MA", name: "Massachusetts", lat: 42.230171, lng: -71.530106 },
  { code: "MI", name: "Michigan", lat: 43.326618, lng: -84.536095 },
  { code: "MN", name: "Minnesota", lat: 45.694454, lng: -93.900192 },
  { code: "MS", name: "Mississippi", lat: 32.741646, lng: -89.678696 },
  { code: "MO", name: "Missouri", lat: 38.456085, lng: -92.288368 },
  { code: "MT", name: "Montana", lat: 46.921925, lng: -110.454353 },
  { code: "NE", name: "Nebraska", lat: 41.12537, lng: -98.268082 },
  { code: "NV", name: "Nevada", lat: 38.313515, lng: -117.055374 },
  { code: "NH", name: "New Hampshire", lat: 43.452492, lng: -71.563896 },
  { code: "NJ", name: "New Jersey", lat: 40.298904, lng: -74.521011 },
  { code: "NM", name: "New Mexico", lat: 34.840515, lng: -106.248482 },
  { code: "NY", name: "New York", lat: 42.165726, lng: -74.948051 },
  { code: "NC", name: "North Carolina", lat: 35.630066, lng: -79.806419 },
  { code: "ND", name: "North Dakota", lat: 47.528912, lng: -99.784012 },
  { code: "OH", name: "Ohio", lat: 40.388783, lng: -82.764915 },
  { code: "OK", name: "Oklahoma", lat: 35.565342, lng: -96.928917 },
  { code: "OR", name: "Oregon", lat: 44.572021, lng: -122.070938 },
  { code: "PA", name: "Pennsylvania", lat: 40.590752, lng: -77.209755 },
  { code: "RI", name: "Rhode Island", lat: 41.680893, lng: -71.51178 },
  { code: "SC", name: "South Carolina", lat: 33.856892, lng: -80.945007 },
  { code: "SD", name: "South Dakota", lat: 44.299782, lng: -99.438828 },
  { code: "TN", name: "Tennessee", lat: 35.747845, lng: -86.692345 },
  { code: "TX", name: "Texas", lat: 31.054487, lng: -97.563461 },
  { code: "UT", name: "Utah", lat: 40.150032, lng: -111.862434 },
  { code: "VT", name: "Vermont", lat: 44.045876, lng: -72.710686 },
  { code: "VA", name: "Virginia", lat: 37.769337, lng: -78.169968 },
  { code: "WA", name: "Washington", lat: 47.400902, lng: -121.490494 },
  { code: "WV", name: "West Virginia", lat: 38.491226, lng: -80.954453 },
  { code: "WI", name: "Wisconsin", lat: 44.268543, lng: -89.616508 },
  { code: "WY", name: "Wyoming", lat: 42.755966, lng: -107.30249 },
  { code: "DC", name: "District of Columbia", lat: 38.897438, lng: -77.026817 },
  { code: "PR", name: "Puerto Rico", lat: 18.220833, lng: -66.590149 },
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

function normalizeStateKey(value: string): string {
  return normalizeLabel(value).replace(/\s+/g, "-");
}

function normalizeCountryCode(value: string | null | undefined): string {
  const normalized = (value ?? "").trim().toUpperCase();
  return normalized || "UN";
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

function canonicalizeUSState(rawStateRegion: string | null | undefined): USStateInfo | null {
  const raw = (rawStateRegion ?? "").trim();
  if (!raw) {
    return null;
  }

  const byCode = US_STATES_BY_CODE.get(raw.toUpperCase());
  if (byCode) {
    return byCode;
  }

  return US_STATES_BY_NAME.get(normalizeLabel(raw)) ?? null;
}

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

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineMeters(a: AggregateMember, b: AggregateMember): number {
  const earthRadius = 6_371_000;
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const latA = toRadians(a.lat);
  const latB = toRadians(b.lat);

  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const h =
    sinLat * sinLat + Math.cos(latA) * Math.cos(latB) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return earthRadius * c;
}

function selectMedoidCoordinate(members: AggregateMember[]): { lat: number; lng: number } {
  if (members.length === 0) {
    return { lat: 0, lng: 0 };
  }
  if (members.length === 1) {
    const [only] = members;
    if (!only) return { lat: 0, lng: 0 };
    return { lat: only.lat, lng: only.lng };
  }

  let bestMember = members[0] as AggregateMember;
  let bestTotalDistance = Number.POSITIVE_INFINITY;

  for (const candidate of members) {
    let totalDistance = 0;
    for (const other of members) {
      totalDistance += haversineMeters(candidate, other);
    }

    if (totalDistance < bestTotalDistance - MEDOID_TIE_EPSILON) {
      bestTotalDistance = totalDistance;
      bestMember = candidate;
      continue;
    }

    if (Math.abs(totalDistance - bestTotalDistance) <= MEDOID_TIE_EPSILON) {
      if (candidate.id.localeCompare(bestMember.id) < 0) {
        bestMember = candidate;
      }
    }
  }

  return { lat: bestMember.lat, lng: bestMember.lng };
}

function upsertAggregate(
  accumulator: Map<string, AggregateAccumulator>,
  params: {
    key: string;
    label: string;
    aggregateLevel: AggregateAccumulator["aggregateLevel"];
    countryCode: string;
    entry: EntryRecord;
    fixedAnchor?: { lat: number; lng: number };
  },
) {
  const existing = accumulator.get(params.key);
  const member: AggregateMember = {
    id: params.entry.id,
    lat: params.entry.lat,
    lng: params.entry.lng,
  };

  if (existing) {
    existing.members.push(member);
    return;
  }

  accumulator.set(params.key, {
    id: params.key,
    label: params.label,
    aggregateLevel: params.aggregateLevel,
    countryCode: params.countryCode,
    members: [member],
    fixedAnchor: params.fixedAnchor,
  });
}

function createPersonNode(entry: EntryRecord): PersonMapNode {
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

function aggregateToNode(aggregate: AggregateAccumulator): AggregateMapNode {
  const coordinate =
    aggregate.fixedAnchor ?? selectMedoidCoordinate(aggregate.members);

  return {
    kind: "aggregate",
    id: aggregate.id,
    label: aggregate.label,
    count: aggregate.members.length,
    aggregateLevel: aggregate.aggregateLevel,
    countryCode: aggregate.countryCode,
    lat: coordinate.lat,
    lng: coordinate.lng,
  };
}

function compareAggregateNodes(a: AggregateMapNode, b: AggregateMapNode): number {
  if (a.count !== b.count) {
    return b.count - a.count;
  }
  const labelComparison = a.label.localeCompare(b.label);
  if (labelComparison !== 0) {
    return labelComparison;
  }
  return a.id.localeCompare(b.id);
}

function comparePersonNodes(a: PersonMapNode, b: PersonMapNode): number {
  const displayNameComparison = a.displayName.localeCompare(b.displayName);
  if (displayNameComparison !== 0) {
    return displayNameComparison;
  }
  return a.id.localeCompare(b.id);
}

function createWorldNodes(entries: EntryRecord[]): MapNode[] {
  const aggregates = new Map<string, AggregateAccumulator>();

  for (const entry of entries) {
    const countryCode = normalizeCountryCode(entry.country_code);
    const country = countryLabel(entry);
    const usState = isEntryUS(entry) ? canonicalizeUSState(entry.state_region) : null;
    const rawState = (entry.state_region ?? "").trim();

    if (usState) {
      upsertAggregate(aggregates, {
        key: `world-state:US:${usState.code}`,
        label: `${usState.name}, United States`,
        aggregateLevel: "state",
        countryCode: "US",
        entry,
        fixedAnchor: { lat: usState.lat, lng: usState.lng },
      });
      continue;
    }

    if (rawState) {
      upsertAggregate(aggregates, {
        key: `world-state:${countryCode}:${normalizeStateKey(rawState)}`,
        label: `${rawState}, ${country}`,
        aggregateLevel: "state",
        countryCode,
        entry,
      });
      continue;
    }

    upsertAggregate(aggregates, {
      key: `world-country:${countryCode}`,
      label: country,
      aggregateLevel: "country",
      countryCode,
      entry,
    });
  }

  return Array.from(aggregates.values()).map(aggregateToNode).sort(compareAggregateNodes);
}

function createCountryNodes(entries: EntryRecord[]): MapNode[] {
  const aggregates = new Map<string, AggregateAccumulator>();

  for (const entry of entries) {
    const countryCode = normalizeCountryCode(entry.country_code);
    const country = countryLabel(entry);
    const usState = isEntryUS(entry) ? canonicalizeUSState(entry.state_region) : null;

    if (isEntryUS(entry)) {
      const label = usState?.name ?? stateLabel(entry);
      const stateKey = usState?.code ?? normalizeStateKey(label);
      upsertAggregate(aggregates, {
        key: `country-state:US:${stateKey}`,
        label,
        aggregateLevel: "state",
        countryCode: "US",
        entry,
      });
      continue;
    }

    upsertAggregate(aggregates, {
      key: `country-country:${countryCode}`,
      label: country,
      aggregateLevel: "country",
      countryCode,
      entry,
    });
  }

  return Array.from(aggregates.values()).map(aggregateToNode).sort(compareAggregateNodes);
}

function createStateNodes(entries: EntryRecord[]): MapNode[] {
  const usEntriesByState = new Map<string, EntryRecord[]>();
  const nonUSAggregates = new Map<string, AggregateAccumulator>();

  for (const entry of entries) {
    if (!isEntryUS(entry)) {
      const countryCode = normalizeCountryCode(entry.country_code);
      upsertAggregate(nonUSAggregates, {
        key: `state-country:${countryCode}`,
        label: countryLabel(entry),
        aggregateLevel: "country",
        countryCode,
        entry,
      });
      continue;
    }

    const usState = canonicalizeUSState(entry.state_region);
    const label = usState?.name ?? stateLabel(entry);
    const stateKey = usState?.code ?? normalizeStateKey(label);
    const key = `state-state:US:${stateKey}`;
    const current = usEntriesByState.get(key);
    if (current) {
      current.push(entry);
    } else {
      usEntriesByState.set(key, [entry]);
    }
  }

  const nodes: MapNode[] = [];

  for (const [key, stateEntries] of usEntriesByState.entries()) {
    if (stateEntries.length < STATE_PERSON_VISIBILITY_LIMIT) {
      for (const entry of stateEntries) {
        nodes.push(createPersonNode(entry));
      }
      continue;
    }

    const first = stateEntries[0];
    if (!first) {
      continue;
    }
    const usState = canonicalizeUSState(first.state_region);
    const label = usState?.name ?? stateLabel(first);
    const aggregate: AggregateAccumulator = {
      id: key,
      label,
      aggregateLevel: "state",
      countryCode: "US",
      members: stateEntries.map((entry) => ({
        id: entry.id,
        lat: entry.lat,
        lng: entry.lng,
      })),
    };
    nodes.push(aggregateToNode(aggregate));
  }

  nodes.push(...Array.from(nonUSAggregates.values()).map(aggregateToNode));

  const aggregates = nodes.filter(
    (node): node is AggregateMapNode => node.kind === "aggregate",
  );
  const people = nodes.filter((node): node is PersonMapNode => node.kind === "person");

  aggregates.sort(compareAggregateNodes);
  people.sort(comparePersonNodes);

  return [...aggregates, ...people];
}

function createCityNodes(entries: EntryRecord[]): MapNode[] {
  const aggregates = new Map<string, AggregateAccumulator>();
  const people: PersonMapNode[] = [];

  for (const entry of entries) {
    if (isEntryUS(entry)) {
      people.push(createPersonNode(entry));
      continue;
    }

    const countryCode = normalizeCountryCode(entry.country_code);
    upsertAggregate(aggregates, {
      key: `city-country:${countryCode}`,
      label: countryLabel(entry),
      aggregateLevel: "country",
      countryCode,
      entry,
    });
  }

  const aggregateNodes = Array.from(aggregates.values()).map(aggregateToNode);
  aggregateNodes.sort(compareAggregateNodes);
  people.sort(comparePersonNodes);
  return [...aggregateNodes, ...people];
}

export function aggregateMapNodes(
  entries: EntryRecord[],
  semanticLevel: SemanticZoomLevel,
): MapNode[] {
  if (semanticLevel === "world") {
    return createWorldNodes(entries);
  }
  if (semanticLevel === "country") {
    return createCountryNodes(entries);
  }
  if (semanticLevel === "state") {
    return createStateNodes(entries);
  }
  return createCityNodes(entries);
}
