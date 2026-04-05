import { randomUUID } from "node:crypto";
import { hashAdminPassword } from "@/lib/admin-auth";
import { normalizeCompanyDomain, resolveCompanyLogoUrl } from "@/lib/company";
import { hashDeviceToken } from "@/lib/device";
import {
  geocodeLocation,
  inferCountryHintFromLocationText,
  LocationLookupError,
} from "@/lib/location";
import { normalizeLinkedInUrl } from "@/lib/linkedin";
import { generateGroupSlug } from "@/lib/slug";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  AdminEntryInput,
  AdminSettingsInput,
  CreateEntryInput,
  CreateGroupInput,
} from "@/lib/validation";
import type { EntryRecord, GroupRecord, PersonSearchResult } from "@/types/domain";

type BBox = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

type EntrySearchRow = {
  id: string;
  display_name: string;
  company_name: string;
  lat: number;
  lng: number;
  city: string | null;
  state_region: string | null;
  country_name: string;
};

type GroupAuthRecord = GroupRecord & {
  admin_password_hash: string;
};

const GROUP_PUBLIC_COLUMNS =
  "id, slug, title, description, submissions_locked, created_at, updated_at";

export const GROUP_SUBMISSIONS_LOCKED_ERROR =
  "Submissions are currently locked by the board admin.";

async function getGroupBySlugForAuth(
  slug: string,
): Promise<GroupAuthRecord | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("groups")
    .select(`${GROUP_PUBLIC_COLUMNS}, admin_password_hash`)
    .eq("slug", slug)
    .maybeSingle<GroupAuthRecord>();

  if (error) {
    throw new Error("Could not fetch group.");
  }

  return data;
}

export async function createGroup(input: CreateGroupInput): Promise<GroupRecord> {
  const supabase = createSupabaseServerClient();
  const slug = generateGroupSlug(input.title);
  const adminPasswordHash = hashAdminPassword(input.adminPassword);

  const { data, error } = await supabase
    .from("groups")
    .insert({
      slug,
      title: input.title.trim(),
      description: input.description.trim() || null,
      admin_password_hash: adminPasswordHash,
      submissions_locked: false,
    })
    .select(GROUP_PUBLIC_COLUMNS)
    .single<GroupRecord>();

  if (error || !data) {
    throw new Error("Could not create group.");
  }

  return data;
}

export async function getGroupBySlug(slug: string): Promise<GroupRecord | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("groups")
    .select(GROUP_PUBLIC_COLUMNS)
    .eq("slug", slug)
    .maybeSingle<GroupRecord>();

  if (error) {
    throw new Error("Could not fetch group.");
  }

  return data;
}

export async function getGroupAdminAuthBySlug(
  slug: string,
): Promise<GroupAuthRecord | null> {
  return getGroupBySlugForAuth(slug);
}

async function requireGroup(slug: string) {
  const group = await getGroupBySlug(slug);
  if (!group) {
    throw new Error("Group was not found.");
  }
  return group;
}

function normalizeSearchQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function personMatchBucket(row: EntrySearchRow, normalizedQuery: string): number | null {
  const name = row.display_name.trim().toLowerCase();
  const company = row.company_name.trim().toLowerCase();

  if (name.startsWith(normalizedQuery)) return 0;
  if (name.includes(normalizedQuery)) return 1;
  if (company.startsWith(normalizedQuery)) return 2;
  if (company.includes(normalizedQuery)) return 3;
  return null;
}

export function rankPersonSearchEntries(
  rows: EntrySearchRow[],
  query: string,
  limit = 6,
): PersonSearchResult[] {
  const normalizedQuery = normalizeSearchQuery(query);
  if (normalizedQuery.length < 2) {
    return [];
  }

  return rows
    .map((row) => {
      const bucket = personMatchBucket(row, normalizedQuery);
      return bucket === null ? null : { bucket, row };
    })
    .filter((value): value is { bucket: number; row: EntrySearchRow } => value !== null)
    .sort((left, right) => {
      if (left.bucket !== right.bucket) {
        return left.bucket - right.bucket;
      }
      const byName = left.row.display_name.localeCompare(right.row.display_name);
      if (byName !== 0) {
        return byName;
      }
      return left.row.company_name.localeCompare(right.row.company_name);
    })
    .slice(0, Math.max(0, limit))
    .map(({ row }) => ({
      kind: "person",
      id: row.id,
      displayName: row.display_name,
      companyName: row.company_name,
      lat: row.lat,
      lng: row.lng,
      city: row.city,
      stateRegion: row.state_region,
      countryName: row.country_name,
    }));
}

export async function searchEntriesForGroup(
  slug: string,
  query: string,
  limit = 6,
): Promise<PersonSearchResult[]> {
  const normalizedQuery = normalizeSearchQuery(query);
  if (normalizedQuery.length < 2) {
    return [];
  }

  const supabase = createSupabaseServerClient();
  const group = await requireGroup(slug);
  const likeQuery = `%${normalizedQuery}%`;
  const searchColumns =
    "id, display_name, company_name, lat, lng, city, state_region, country_name";

  const [nameResult, companyResult] = await Promise.all([
    supabase
      .from("entries")
      .select(searchColumns)
      .eq("group_id", group.id)
      .ilike("display_name", likeQuery)
      .limit(60)
      .returns<EntrySearchRow[]>(),
    supabase
      .from("entries")
      .select(searchColumns)
      .eq("group_id", group.id)
      .ilike("company_name", likeQuery)
      .limit(60)
      .returns<EntrySearchRow[]>(),
  ]);

  if (nameResult.error || companyResult.error) {
    throw new Error("Could not search entries.");
  }

  const dedupedRows = new Map<string, EntrySearchRow>();
  for (const row of [...(nameResult.data ?? []), ...(companyResult.data ?? [])]) {
    if (!dedupedRows.has(row.id)) {
      dedupedRows.set(row.id, row);
    }
  }

  return rankPersonSearchEntries(Array.from(dedupedRows.values()), normalizedQuery, limit);
}

async function normalizeEntryPayload(
  input: Pick<
    CreateEntryInput,
    | "displayName"
    | "linkedinUrl"
    | "companyName"
    | "companyDomain"
    | "locationText"
    | "profilePhotoUrl"
  >,
) {
  const hintedCountryCode = inferCountryHintFromLocationText(input.locationText);
  const linkedinUrl = normalizeLinkedInUrl(input.linkedinUrl);
  const companyDomain = normalizeCompanyDomain(input.companyDomain);
  const companyLogoUrl = resolveCompanyLogoUrl(companyDomain);
  const geocoded = await geocodeLocation(input.locationText);

  if (
    hintedCountryCode &&
    geocoded.countryCode.toUpperCase() !== hintedCountryCode
  ) {
    const countryLabel =
      hintedCountryCode === "CA"
        ? "Canada"
        : hintedCountryCode === "GB"
          ? "the United Kingdom"
          : "the United States";
    throw new LocationLookupError(
      "LOCATION_NOT_FOUND",
      `We couldn't verify this location in ${countryLabel}. Please include city, state/province, and country.`,
      422,
    );
  }

  return {
    display_name: input.displayName.trim(),
    linkedin_url: linkedinUrl,
    company_name: input.companyName.trim(),
    company_domain: companyDomain,
    company_logo_url: companyLogoUrl,
    profile_photo_url: input.profilePhotoUrl ?? null,
    location_text: input.locationText.trim(),
    country_code: geocoded.countryCode,
    country_name: geocoded.countryName,
    state_region: geocoded.stateRegion,
    city: geocoded.city,
    lat: geocoded.lat,
    lng: geocoded.lng,
    is_us: geocoded.countryCode.toUpperCase() === "US",
  };
}

export async function upsertGroupEntry(
  slug: string,
  input: CreateEntryInput,
): Promise<EntryRecord> {
  const supabase = createSupabaseServerClient();
  const group = await requireGroup(slug);

  if (group.submissions_locked) {
    throw new Error(GROUP_SUBMISSIONS_LOCKED_ERROR);
  }

  const deviceHash = hashDeviceToken(input.deviceToken);
  const normalized = await normalizeEntryPayload(input);

  const payload = {
    group_id: group.id,
    device_id_hash: deviceHash,
    ...normalized,
  };

  const { data, error } = await supabase
    .from("entries")
    .upsert(payload, {
      onConflict: "group_id,device_id_hash",
      ignoreDuplicates: false,
    })
    .select("*")
    .single<EntryRecord>();

  if (error || !data) {
    throw new Error("Could not save this submission.");
  }

  return data;
}

export async function getEntryForDevice(
  slug: string,
  deviceToken: string,
): Promise<EntryRecord | null> {
  const supabase = createSupabaseServerClient();
  const group = await requireGroup(slug);
  const deviceHash = hashDeviceToken(deviceToken);

  const { data, error } = await supabase
    .from("entries")
    .select("*")
    .eq("group_id", group.id)
    .eq("device_id_hash", deviceHash)
    .maybeSingle<EntryRecord>();

  if (error) {
    throw new Error("Could not fetch profile.");
  }

  return data;
}

export async function fetchEntriesForGroup(
  slug: string,
  bbox: BBox | null,
): Promise<EntryRecord[]> {
  const supabase = createSupabaseServerClient();
  const group = await requireGroup(slug);

  let query = supabase
    .from("entries")
    .select("*")
    .eq("group_id", group.id)
    .order("updated_at", { ascending: false });

  if (bbox) {
    query = query
      .gte("lng", bbox.minLng)
      .lte("lng", bbox.maxLng)
      .gte("lat", bbox.minLat)
      .lte("lat", bbox.maxLat);
  }

  const { data, error } = await query.returns<EntryRecord[]>();

  if (error || !data) {
    throw new Error("Could not fetch map data.");
  }

  return data;
}

export async function fetchEntriesForAdmin(slug: string): Promise<EntryRecord[]> {
  return fetchEntriesForGroup(slug, null);
}

export async function createAdminEntry(
  slug: string,
  input: AdminEntryInput,
): Promise<EntryRecord> {
  const supabase = createSupabaseServerClient();
  const group = await requireGroup(slug);
  const normalized = await normalizeEntryPayload(input);
  const payload = {
    group_id: group.id,
    device_id_hash: `admin-${randomUUID()}`,
    ...normalized,
  };

  const { data, error } = await supabase
    .from("entries")
    .insert(payload)
    .select("*")
    .single<EntryRecord>();

  if (error || !data) {
    throw new Error("Could not create admin entry.");
  }

  return data;
}

export async function updateAdminEntry(
  slug: string,
  entryId: string,
  input: AdminEntryInput,
): Promise<EntryRecord> {
  const supabase = createSupabaseServerClient();
  const group = await requireGroup(slug);
  const normalized = await normalizeEntryPayload(input);

  const { data, error } = await supabase
    .from("entries")
    .update(normalized)
    .eq("id", entryId)
    .eq("group_id", group.id)
    .select("*")
    .single<EntryRecord>();

  if (error || !data) {
    throw new Error("Could not update admin entry.");
  }

  return data;
}

export async function deleteAdminEntry(slug: string, entryId: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const group = await requireGroup(slug);
  const { error } = await supabase
    .from("entries")
    .delete()
    .eq("id", entryId)
    .eq("group_id", group.id);

  if (error) {
    throw new Error("Could not delete admin entry.");
  }
}

export async function updateGroupAdminSettings(
  slug: string,
  input: AdminSettingsInput,
): Promise<GroupRecord> {
  const supabase = createSupabaseServerClient();
  const group = await requireGroup(slug);
  const patch: Record<string, unknown> = {};

  if (input.title !== undefined) {
    patch.title = input.title.trim();
  }
  if (input.description !== undefined) {
    patch.description = input.description.trim() || null;
  }
  if (input.submissionsLocked !== undefined) {
    patch.submissions_locked = input.submissionsLocked;
  }

  const { data, error } = await supabase
    .from("groups")
    .update(patch)
    .eq("id", group.id)
    .select(GROUP_PUBLIC_COLUMNS)
    .single<GroupRecord>();

  if (error || !data) {
    throw new Error("Could not update board settings.");
  }

  return data;
}
