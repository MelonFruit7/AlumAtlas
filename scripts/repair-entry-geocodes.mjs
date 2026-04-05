#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_THROTTLE_MS = 80;
const LARGE_MOVE_THRESHOLD_KM = 300;

class RepairLookupError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RepairLookupError";
    this.code = code;
  }
}

function normalizeLocationQuery(query) {
  return String(query ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function parseArgs(args = []) {
  const parsed = {
    apply: false,
    batchSize: DEFAULT_BATCH_SIZE,
    throttleMs: DEFAULT_THROTTLE_MS,
    groupSlug: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--apply") {
      parsed.apply = true;
      continue;
    }
    if (arg === "--dry-run") {
      parsed.apply = false;
      continue;
    }
    if (arg.startsWith("--batch-size=")) {
      const raw = Number.parseInt(arg.split("=")[1] ?? "", 10);
      if (Number.isFinite(raw) && raw > 0) {
        parsed.batchSize = raw;
      }
      continue;
    }
    if (arg.startsWith("--throttle-ms=")) {
      const raw = Number.parseInt(arg.split("=")[1] ?? "", 10);
      if (Number.isFinite(raw) && raw >= 0) {
        parsed.throttleMs = raw;
      }
      continue;
    }
    if (arg.startsWith("--group-slug=")) {
      const slug = arg.split("=")[1]?.trim();
      parsed.groupSlug = slug ? slug : null;
      continue;
    }
    if (arg === "--group-slug") {
      const slug = args[index + 1]?.trim();
      if (slug) {
        parsed.groupSlug = slug;
        index += 1;
      }
      continue;
    }
  }

  return parsed;
}

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }
  const separatorIndex = trimmed.indexOf("=");
  if (separatorIndex <= 0) {
    return null;
  }
  const key = trimmed.slice(0, separatorIndex).trim();
  let value = trimmed.slice(separatorIndex + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return [key, value];
}

function loadDotEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const pair = parseEnvLine(line);
    if (!pair) continue;
    const [key, value] = pair;
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function loadLocalEnv(cwd) {
  loadDotEnvFile(path.join(cwd, ".env.local"));
  loadDotEnvFile(path.join(cwd, ".env"));
}

function runtimeConfig() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const geoapifyApiKey = process.env.GEOAPIFY_API_KEY ?? "";

  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL).");
  }
  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  }
  if (!geoapifyApiKey) {
    throw new Error("Missing GEOAPIFY_API_KEY.");
  }

  return {
    supabaseUrl,
    serviceRoleKey,
    geoapifyApiKey,
  };
}

function getResultPriority(resultType) {
  if (resultType === "city") return 0;
  if (resultType === "postcode") return 1;
  if (resultType === "suburb") return 2;
  if (resultType === "district") return 3;
  if (resultType === "state") return 4;
  if (resultType === "country") return 5;
  return 6;
}

function getCountryCode(feature) {
  return String(feature?.properties?.country_code ?? "")
    .trim()
    .toUpperCase();
}

function extractLatLng(feature) {
  const latFromGeometry = feature?.geometry?.coordinates?.[1];
  const lngFromGeometry = feature?.geometry?.coordinates?.[0];
  const lat = latFromGeometry ?? feature?.properties?.lat;
  const lng = lngFromGeometry ?? feature?.properties?.lon;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return {
    lat: Number(lat),
    lng: Number(lng),
  };
}

export function pickBestGeoapifyFeature(features = []) {
  if (!Array.isArray(features) || features.length === 0) {
    return null;
  }

  return [...features].sort((left, right) => {
    const leftCountry = getCountryCode(left);
    const rightCountry = getCountryCode(right);

    if (leftCountry === "US" && rightCountry !== "US") return -1;
    if (leftCountry !== "US" && rightCountry === "US") return 1;

    const leftPriority = getResultPriority(left?.properties?.result_type ?? "");
    const rightPriority = getResultPriority(right?.properties?.result_type ?? "");
    return leftPriority - rightPriority;
  })[0];
}

export function mapFeatureToGeocode(feature, normalizedQuery) {
  const coordinates = extractLatLng(feature);
  if (!coordinates) {
    return null;
  }
  const countryCode = getCountryCode(feature) || "UN";
  const countryName = feature?.properties?.country ?? "Unknown Country";
  const stateRegion = feature?.properties?.state ?? null;
  const city =
    feature?.properties?.city ??
    feature?.properties?.suburb ??
    feature?.properties?.district ??
    feature?.properties?.county ??
    null;

  return {
    normalizedQuery,
    lat: coordinates.lat,
    lng: coordinates.lng,
    countryCode,
    countryName,
    stateRegion,
    city,
  };
}

async function fetchGeoapifyFeatures(query, apiKey, options = {}) {
  const url = new URL("https://api.geoapify.com/v1/geocode/search");
  url.searchParams.set("text", query);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("lang", "en");
  url.searchParams.set("autocomplete", "false");
  url.searchParams.set("limit", String(options.limit ?? 8));
  if (options.countryCode) {
    url.searchParams.set("filter", `countrycode:${String(options.countryCode).toLowerCase()}`);
  }
  if (options.usBias) {
    url.searchParams.set("bias", "countrycode:us");
  }

  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (response.status === 429) {
    throw new RepairLookupError(
      "LOCATION_RATE_LIMITED",
      "Geoapify rate-limited this request.",
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new RepairLookupError(
      "LOCATION_UNAVAILABLE",
      "Geoapify authentication failed.",
    );
  }
  if (!response.ok) {
    throw new RepairLookupError(
      "LOCATION_UNAVAILABLE",
      `Geoapify request failed with status ${response.status}.`,
    );
  }

  const json = await response.json();
  return Array.isArray(json?.features) ? json.features : [];
}

async function geocodeLocationText(locationText, apiKey) {
  const normalizedQuery = normalizeLocationQuery(locationText);
  if (!normalizedQuery) {
    throw new RepairLookupError(
      "LOCATION_INVALID",
      "Location text is empty.",
    );
  }

  const usFeatures = await fetchGeoapifyFeatures(locationText, apiKey, {
    countryCode: "us",
    limit: 8,
  });
  const globalFeatures = await fetchGeoapifyFeatures(locationText, apiKey, {
    usBias: true,
    limit: 8,
  });
  const best = pickBestGeoapifyFeature([...usFeatures, ...globalFeatures]);

  if (!best) {
    throw new RepairLookupError(
      "LOCATION_NOT_FOUND",
      `Location not found for "${locationText}".`,
    );
  }

  const mapped = mapFeatureToGeocode(best, normalizedQuery);
  if (!mapped) {
    throw new RepairLookupError(
      "LOCATION_NOT_FOUND",
      `No usable coordinates found for "${locationText}".`,
    );
  }

  return mapped;
}

export function haversineKm(aLat, aLng, bLat, bLng) {
  const toRadians = Math.PI / 180;
  const earthRadiusKm = 6371;
  const dLat = (bLat - aLat) * toRadians;
  const dLng = (bLng - aLng) * toRadians;
  const lat1 = aLat * toRadians;
  const lat2 = bLat * toRadians;
  const sinHalfLat = Math.sin(dLat / 2);
  const sinHalfLng = Math.sin(dLng / 2);
  const h =
    sinHalfLat * sinHalfLat +
    Math.cos(lat1) * Math.cos(lat2) * sinHalfLng * sinHalfLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return earthRadiusKm * c;
}

export function buildChangeSummary(entry, geocoded) {
  const next = {
    lat: geocoded.lat,
    lng: geocoded.lng,
    country_code: geocoded.countryCode,
    country_name: geocoded.countryName,
    state_region: geocoded.stateRegion,
    city: geocoded.city,
    is_us: geocoded.countryCode.toUpperCase() === "US",
  };

  const distanceKm = haversineKm(entry.lat, entry.lng, next.lat, next.lng);
  const changed =
    Math.abs(entry.lat - next.lat) > 1e-7 ||
    Math.abs(entry.lng - next.lng) > 1e-7 ||
    String(entry.country_code ?? "") !== String(next.country_code ?? "") ||
    String(entry.country_name ?? "") !== String(next.country_name ?? "") ||
    String(entry.state_region ?? "") !== String(next.state_region ?? "") ||
    String(entry.city ?? "") !== String(next.city ?? "") ||
    Boolean(entry.is_us) !== Boolean(next.is_us);

  return {
    changed,
    distanceKm,
    largeMove: distanceKm >= LARGE_MOVE_THRESHOLD_KM,
    countryChanged:
      String(entry.country_code ?? "").toUpperCase() !==
      String(next.country_code ?? "").toUpperCase(),
    next,
  };
}

function formatKm(value) {
  return `${value.toFixed(2)} km`;
}

function sleep(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveGroupId(supabase, groupSlug) {
  if (!groupSlug) {
    return null;
  }

  const { data, error } = await supabase
    .from("groups")
    .select("id")
    .eq("slug", groupSlug)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load group "${groupSlug}".`);
  }
  if (!data?.id) {
    throw new Error(`Group "${groupSlug}" was not found.`);
  }
  return data.id;
}

async function fetchEntriesBatch(supabase, batchSize, offset, groupId) {
  let query = supabase
    .from("entries")
    .select(
      "id, group_id, location_text, lat, lng, country_code, country_name, state_region, city, is_us",
    )
    .order("created_at", { ascending: true })
    .range(offset, offset + batchSize - 1);

  if (groupId) {
    query = query.eq("group_id", groupId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error("Could not fetch entries for repair.");
  }
  return data ?? [];
}

export async function runRepair(rawArgs = process.argv.slice(2)) {
  const args = parseArgs(rawArgs);
  const cwd = process.cwd();
  loadLocalEnv(cwd);
  const { supabaseUrl, serviceRoleKey, geoapifyApiKey } = runtimeConfig();

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const groupId = await resolveGroupId(supabase, args.groupSlug);
  const failures = [];
  let total = 0;
  let changed = 0;
  let unchanged = 0;
  let updated = 0;
  let largeMove = 0;
  let countryChanged = 0;
  let offset = 0;

  console.log(
    `[repair-entry-geocodes] mode=${args.apply ? "apply" : "dry-run"} batch=${args.batchSize} throttleMs=${args.throttleMs}${args.groupSlug ? ` group=${args.groupSlug}` : ""}`,
  );

  while (true) {
    const batch = await fetchEntriesBatch(supabase, args.batchSize, offset, groupId);
    if (batch.length === 0) {
      break;
    }

    for (const entry of batch) {
      total += 1;
      try {
        const geocoded = await geocodeLocationText(entry.location_text, geoapifyApiKey);
        const summary = buildChangeSummary(entry, geocoded);

        if (!summary.changed) {
          unchanged += 1;
        } else {
          changed += 1;
          if (summary.largeMove) {
            largeMove += 1;
          }
          if (summary.countryChanged) {
            countryChanged += 1;
          }

          if (args.apply) {
            const { error } = await supabase
              .from("entries")
              .update(summary.next)
              .eq("id", entry.id);

            if (error) {
              failures.push({
                id: entry.id,
                locationText: entry.location_text,
                reason: "DB_UPDATE_FAILED",
                message: error.message,
              });
            } else {
              updated += 1;
            }
          }
        }
      } catch (error) {
        failures.push({
          id: entry.id,
          locationText: entry.location_text,
          reason:
            error instanceof RepairLookupError ? error.code : "UNEXPECTED_ERROR",
          message: error instanceof Error ? error.message : String(error),
        });
      }

      await sleep(args.throttleMs);
    }

    offset += batch.length;
    console.log(
      `[repair-entry-geocodes] processed=${total} changed=${changed} unchanged=${unchanged} updated=${updated} failures=${failures.length}`,
    );
  }

  console.log("\n[repair-entry-geocodes] Summary");
  console.log(`- Total entries scanned: ${total}`);
  console.log(`- Changed entries: ${changed}`);
  console.log(`- Unchanged entries: ${unchanged}`);
  console.log(`- Updated in DB: ${updated}`);
  console.log(`- Large moves (>= ${formatKm(LARGE_MOVE_THRESHOLD_KM)}): ${largeMove}`);
  console.log(`- Country changes: ${countryChanged}`);
  console.log(`- Failures: ${failures.length}`);

  if (failures.length > 0) {
    console.log("\n[repair-entry-geocodes] Failure sample (first 25)");
    for (const failure of failures.slice(0, 25)) {
      console.log(
        `- ${failure.id} | ${failure.reason} | ${failure.locationText} | ${failure.message}`,
      );
    }
  }
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  runRepair().catch((error) => {
    console.error(
      `[repair-entry-geocodes] fatal: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}

