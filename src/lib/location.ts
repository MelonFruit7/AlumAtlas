import { getRuntimeConfig } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SearchLocation, SemanticZoomLevel } from "@/types/domain";

type GeoapifyFeature = {
  properties?: {
    country?: string;
    country_code?: string;
    state?: string;
    city?: string;
    county?: string;
    suburb?: string;
    district?: string;
    formatted?: string;
    lat?: number;
    lon?: number;
    result_type?: string;
  };
  geometry?: {
    type?: string;
    coordinates?: [number, number];
  };
};

type GeoapifyResponse = {
  features?: GeoapifyFeature[];
};

type GeoapifyFetchOptions = {
  countryCode?: string;
  limit?: number;
  autocomplete?: boolean;
  usBias?: boolean;
};

export type GeocodeValue = {
  normalizedQuery: string;
  lat: number;
  lng: number;
  countryCode: string;
  countryName: string;
  stateRegion: string | null;
  city: string | null;
};

export type LocationLookupErrorCode =
  | "LOCATION_NOT_FOUND"
  | "LOCATION_RATE_LIMITED"
  | "LOCATION_UNAVAILABLE"
  | "LOCATION_INVALID";

export class LocationLookupError extends Error {
  code: LocationLookupErrorCode;
  status: number;

  constructor(code: LocationLookupErrorCode, message: string, status: number) {
    super(message);
    this.name = "LocationLookupError";
    this.code = code;
    this.status = status;
  }
}

function normalizeLocationQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

function getGeoapifyPriority(feature: GeoapifyFeature): number {
  const resultType = feature.properties?.result_type ?? "";
  if (resultType === "city") return 0;
  if (resultType === "postcode") return 1;
  if (resultType === "suburb") return 2;
  if (resultType === "district") return 3;
  if (resultType === "state") return 4;
  if (resultType === "country") return 5;
  return 6;
}

function getSearchPriority(feature: GeoapifyFeature): number {
  const resultType = feature.properties?.result_type ?? "";
  if (resultType === "city") return 0;
  if (resultType === "suburb") return 1;
  if (resultType === "district") return 2;
  if (resultType === "state") return 3;
  if (resultType === "country") return 4;
  return 5;
}

function getCountryCode(feature: GeoapifyFeature): string {
  return (feature.properties?.country_code ?? "un").trim().toUpperCase();
}

function extractLatLng(feature: GeoapifyFeature): { lat: number; lng: number } | null {
  const latFromGeometry = feature.geometry?.coordinates?.[1];
  const lngFromGeometry = feature.geometry?.coordinates?.[0];
  const lat = latFromGeometry ?? feature.properties?.lat;
  const lng = lngFromGeometry ?? feature.properties?.lon;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return {
    lat: Number(lat),
    lng: Number(lng),
  };
}

function getSemanticLevel(feature: GeoapifyFeature): SemanticZoomLevel {
  const resultType = feature.properties?.result_type ?? "";
  if (
    resultType === "city" ||
    resultType === "suburb" ||
    resultType === "district" ||
    resultType === "postcode"
  ) {
    return "city";
  }
  if (resultType === "state") {
    return "state";
  }
  if (resultType === "country") {
    return "country";
  }

  if (feature.properties?.city || feature.properties?.suburb) {
    return "city";
  }
  if (feature.properties?.state) {
    return "state";
  }
  return "country";
}

export function pickBestGeoapifyFeature(
  features: GeoapifyFeature[],
): GeoapifyFeature | null {
  if (features.length === 0) {
    return null;
  }

  return [...features].sort((a, b) => {
    return getGeoapifyPriority(a) - getGeoapifyPriority(b);
  })[0]!;
}

export function mapGeoapifyFeatureToGeocode(
  feature: GeoapifyFeature,
  normalizedQuery: string,
): GeocodeValue | null {
  const coordinates = extractLatLng(feature);
  if (!coordinates) {
    return null;
  }

  const countryCode = (feature.properties?.country_code ?? "un")
    .trim()
    .toUpperCase();
  const countryName = feature.properties?.country ?? "Unknown Country";
  const stateRegion = feature.properties?.state ?? null;
  const city =
    feature.properties?.city ??
    feature.properties?.suburb ??
    feature.properties?.district ??
    feature.properties?.county ??
    null;

  return {
    normalizedQuery,
    lat: coordinates.lat,
    lng: coordinates.lng,
    countryCode: countryCode || "UN",
    countryName,
    stateRegion,
    city,
  };
}

export function mapGeoapifyFeatureToSearchLocation(
  feature: GeoapifyFeature,
): SearchLocation | null {
  const coordinates = extractLatLng(feature);
  if (!coordinates) {
    return null;
  }

  const countryCode = getCountryCode(feature);
  const countryName = feature.properties?.country ?? "Unknown Country";
  const stateRegion = feature.properties?.state ?? null;
  const city =
    feature.properties?.city ??
    feature.properties?.suburb ??
    feature.properties?.district ??
    feature.properties?.county ??
    null;
  const label =
    feature.properties?.formatted ??
    [city, stateRegion, countryName].filter(Boolean).join(", ");

  return {
    label: label || "Unknown Location",
    lat: coordinates.lat,
    lng: coordinates.lng,
    countryCode: countryCode || "UN",
    countryName,
    stateRegion,
    city,
    semanticLevel: getSemanticLevel(feature),
  };
}

export function mapGeoapifyFeaturesToSearchLocations(
  features: GeoapifyFeature[],
  limit = 10,
): SearchLocation[] {
  const seen = new Set<string>();

  return [...features]
    .sort((left, right) => {
      const leftCountry = getCountryCode(left);
      const rightCountry = getCountryCode(right);
      if (leftCountry === "US" && rightCountry !== "US") {
        return -1;
      }
      if (leftCountry !== "US" && rightCountry === "US") {
        return 1;
      }
      return getSearchPriority(left) - getSearchPriority(right);
    })
    .map((feature) => mapGeoapifyFeatureToSearchLocation(feature))
    .filter((value): value is SearchLocation => value !== null)
    .filter((value) => {
      const key = `${value.label.toLowerCase()}|${value.lat.toFixed(4)}|${value.lng.toFixed(4)}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

async function fetchGeoapifyFeatures(
  query: string,
  apiKey: string,
  options: GeoapifyFetchOptions = {},
): Promise<GeoapifyFeature[]> {
  const url = new URL("https://api.geoapify.com/v1/geocode/search");
  url.searchParams.set("text", query);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("limit", String(options.limit ?? 8));
  url.searchParams.set("lang", "en");
  url.searchParams.set("autocomplete", options.autocomplete ? "true" : "false");
  if (options.countryCode) {
    url.searchParams.set("filter", `countrycode:${options.countryCode.toLowerCase()}`);
  }
  if (options.usBias) {
    url.searchParams.set("bias", "countrycode:us");
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (response.status === 429) {
    throw new LocationLookupError(
      "LOCATION_RATE_LIMITED",
      "Location service is temporarily busy. Please try again in a moment.",
      429,
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new LocationLookupError(
      "LOCATION_UNAVAILABLE",
      "Location service authentication failed. Check GEOAPIFY_API_KEY.",
      503,
    );
  }

  if (!response.ok) {
    throw new LocationLookupError(
      "LOCATION_UNAVAILABLE",
      "Location service is currently unavailable.",
      503,
    );
  }

  const data = (await response.json()) as GeoapifyResponse;
  return data.features ?? [];
}

export async function fetchGeoapifyGeocode(query: string): Promise<GeocodeValue> {
  const normalizedQuery = normalizeLocationQuery(query);
  if (!normalizedQuery) {
    throw new LocationLookupError(
      "LOCATION_INVALID",
      "Please provide a location in City, State or City, Country format.",
      422,
    );
  }

  const { geoapifyApiKey } = getRuntimeConfig();
  if (!geoapifyApiKey) {
    throw new LocationLookupError(
      "LOCATION_UNAVAILABLE",
      "Missing GEOAPIFY_API_KEY for location lookup.",
      503,
    );
  }

  const usFeatures = await fetchGeoapifyFeatures(query, geoapifyApiKey, {
    countryCode: "us",
    limit: 8,
    autocomplete: false,
  });
  const globalFeatures =
    usFeatures.length > 0
      ? usFeatures
      : await fetchGeoapifyFeatures(query, geoapifyApiKey, {
          limit: 8,
          autocomplete: false,
          usBias: true,
        });

  const bestFeature = pickBestGeoapifyFeature(globalFeatures);
  if (!bestFeature) {
    throw new LocationLookupError(
      "LOCATION_NOT_FOUND",
      "Could not find this location. Try City, State or City, Country format.",
      422,
    );
  }

  const mapped = mapGeoapifyFeatureToGeocode(bestFeature, normalizedQuery);
  if (!mapped) {
    throw new LocationLookupError(
      "LOCATION_INVALID",
      "Location response was invalid. Please try a more specific location.",
      422,
    );
  }

  return mapped;
}

export async function geocodeLocation(locationText: string): Promise<GeocodeValue> {
  const normalizedQuery = normalizeLocationQuery(locationText);
  const supabase = createSupabaseServerClient();

  const { data: cached } = await supabase
    .from("geocode_cache")
    .select(
      "normalized_query, lat, lng, country_code, country_name, state_region, city",
    )
    .eq("normalized_query", normalizedQuery)
    .maybeSingle();

  if (cached) {
    return {
      normalizedQuery: cached.normalized_query,
      lat: cached.lat,
      lng: cached.lng,
      countryCode: cached.country_code,
      countryName: cached.country_name,
      stateRegion: cached.state_region,
      city: cached.city,
    };
  }

  const geocoded = await fetchGeoapifyGeocode(locationText);

  await supabase.from("geocode_cache").upsert(
    {
      normalized_query: geocoded.normalizedQuery,
      lat: geocoded.lat,
      lng: geocoded.lng,
      country_code: geocoded.countryCode,
      country_name: geocoded.countryName,
      state_region: geocoded.stateRegion,
      city: geocoded.city,
    },
    {
      onConflict: "normalized_query",
      ignoreDuplicates: false,
    },
  );

  return geocoded;
}

export async function searchLocations(query: string): Promise<SearchLocation[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }

  const { geoapifyApiKey } = getRuntimeConfig();
  if (!geoapifyApiKey) {
    return [];
  }

  try {
    const usMatches = await fetchGeoapifyFeatures(trimmed, geoapifyApiKey, {
      countryCode: "us",
      limit: 6,
      autocomplete: true,
    });
    const globalMatches = await fetchGeoapifyFeatures(trimmed, geoapifyApiKey, {
      limit: 12,
      autocomplete: true,
      usBias: true,
    });
    return mapGeoapifyFeaturesToSearchLocations([...usMatches, ...globalMatches], 10);
  } catch (error) {
    if (error instanceof LocationLookupError) {
      return [];
    }
    throw error;
  }
}
