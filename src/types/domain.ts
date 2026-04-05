export type SemanticZoomLevel = "world" | "country" | "state" | "city";

export type GroupRecord = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  submissions_locked: boolean;
  created_at: string;
  updated_at: string;
};

export type EntryRecord = {
  id: string;
  group_id: string;
  device_id_hash: string;
  display_name: string;
  linkedin_url: string;
  company_name: string;
  company_domain: string;
  company_logo_url: string | null;
  profile_photo_url: string | null;
  location_text: string;
  country_code: string;
  country_name: string;
  state_region: string | null;
  city: string | null;
  lat: number;
  lng: number;
  is_us: boolean;
  created_at: string;
  updated_at: string;
};

export type PersonMapNode = {
  kind: "person";
  id: string;
  lat: number;
  lng: number;
  displayName: string;
  linkedinUrl: string;
  companyName: string;
  companyLogoUrl: string | null;
  profilePhotoUrl: string | null;
  city: string | null;
  stateRegion: string | null;
  countryName: string;
};

export type AggregateMapNode = {
  kind: "aggregate";
  id: string;
  lat: number;
  lng: number;
  label: string;
  count: number;
  aggregateLevel: Exclude<SemanticZoomLevel, "city"> | "city";
  countryCode: string;
};

export type MapNode = PersonMapNode | AggregateMapNode;

export type SearchLocation = {
  label: string;
  lat: number;
  lng: number;
  countryCode: string;
  countryName: string;
  stateRegion: string | null;
  city: string | null;
  semanticLevel: SemanticZoomLevel;
};

export type PersonSearchResult = {
  kind: "person";
  id: string;
  displayName: string;
  companyName: string;
  lat: number;
  lng: number;
  city: string | null;
  stateRegion: string | null;
  countryName: string;
};

export type LocationSearchResult = SearchLocation & {
  kind: "location";
};

export type SearchResult = PersonSearchResult | LocationSearchResult;
