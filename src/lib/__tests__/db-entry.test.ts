import { beforeEach, describe, expect, it, vi } from "vitest";

const createSupabaseServerClientMock = vi.fn();
const geocodeLocationMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}));

vi.mock("@/lib/location", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/location")>();
  return {
    ...original,
    geocodeLocation: geocodeLocationMock,
  };
});

describe("upsertGroupEntry", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.DEVICE_HASH_SALT = "test-salt";
  });

  it("persists an entry when geocode data is valid", async () => {
    const group = {
      id: "group-1",
      slug: "demo-group",
      title: "Demo",
      description: null,
      submissions_locked: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const savedEntry = {
      id: "entry-1",
      group_id: group.id,
      device_id_hash: "hash",
      display_name: "Alex Rivera",
      linkedin_url: "https://www.linkedin.com/in/alex-rivera",
      company_name: "Acme Corp",
      company_domain: "acme.com",
      company_logo_url: "https://www.google.com/s2/favicons?domain=acme.com&sz=128",
      profile_photo_url: null,
      location_text: "Austin, TX",
      country_code: "US",
      country_name: "United States",
      state_region: "Texas",
      city: "Austin",
      lat: 30.2672,
      lng: -97.7431,
      is_us: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const groupsMaybeSingle = vi.fn().mockResolvedValue({ data: group, error: null });
    const groupsEq = vi.fn(() => ({ maybeSingle: groupsMaybeSingle }));
    const groupsSelect = vi.fn(() => ({ eq: groupsEq }));

    const entriesSingle = vi.fn().mockResolvedValue({ data: savedEntry, error: null });
    const entriesSelect = vi.fn(() => ({ single: entriesSingle }));
    const entriesUpsert = vi.fn(() => ({ select: entriesSelect }));

    createSupabaseServerClientMock.mockReturnValue({
      from: (table: string) =>
        table === "groups"
          ? {
              select: groupsSelect,
            }
          : {
              upsert: entriesUpsert,
            },
    });

    geocodeLocationMock.mockResolvedValue({
      normalizedQuery: "austin, tx",
      lat: 30.2672,
      lng: -97.7431,
      countryCode: "US",
      countryName: "United States",
      stateRegion: "Texas",
      city: "Austin",
    });

    const { upsertGroupEntry } = await import("@/lib/db");
    const result = await upsertGroupEntry("demo-group", {
      displayName: "Alex Rivera",
      linkedinUrl: "www.linkedin.com/in/alex-rivera/",
      companyName: "Acme Corp",
      companyDomain: "https://acme.com/about",
      locationText: "Austin, TX",
      profilePhotoUrl: undefined,
      deviceToken: "device-token-xyz",
    });

    expect(entriesUpsert).toHaveBeenCalledTimes(1);
    expect(entriesUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        group_id: group.id,
        display_name: "Alex Rivera",
        linkedin_url: "https://www.linkedin.com/in/alex-rivera",
        company_domain: "acme.com",
        company_logo_url: "https://www.google.com/s2/favicons?domain=acme.com&sz=128",
        country_code: "US",
        state_region: "Texas",
        city: "Austin",
      }),
      expect.objectContaining({ onConflict: "group_id,device_id_hash" }),
    );
    expect(result.id).toBe("entry-1");
  });

  it("rejects normal submission when group submissions are locked", async () => {
    const lockedGroup = {
      id: "group-3",
      slug: "locked-group",
      title: "Locked",
      description: null,
      submissions_locked: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const groupsMaybeSingle = vi.fn().mockResolvedValue({ data: lockedGroup, error: null });
    const groupsEq = vi.fn(() => ({ maybeSingle: groupsMaybeSingle }));
    const groupsSelect = vi.fn(() => ({ eq: groupsEq }));
    const entriesUpsert = vi.fn();

    createSupabaseServerClientMock.mockReturnValue({
      from: (table: string) =>
        table === "groups"
          ? {
              select: groupsSelect,
            }
          : {
              upsert: entriesUpsert,
            },
    });

    const { upsertGroupEntry } = await import("@/lib/db");
    await expect(
      upsertGroupEntry("locked-group", {
        displayName: "Taylor",
        linkedinUrl: "https://www.linkedin.com/in/taylor",
        companyName: "Acme Corp",
        companyDomain: "acme.com",
        locationText: "Austin, TX",
        profilePhotoUrl: undefined,
        deviceToken: "device-token-xyz",
      }),
    ).rejects.toThrow("Submissions are currently locked by the board admin.");

    expect(entriesUpsert).not.toHaveBeenCalled();
  });
});
