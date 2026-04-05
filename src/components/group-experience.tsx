"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PhotoCropper } from "@/components/photo-cropper";
import { WorldMap, type MapController } from "@/components/world-map";
import { getOrCreateDeviceToken } from "@/lib/device";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import type {
  GroupRecord,
  LocationSearchResult,
  PersonSearchResult,
  SearchResult,
  SemanticZoomLevel,
} from "@/types/domain";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type Props = {
  group: GroupRecord;
};

function semanticLevelToZoom(level: SemanticZoomLevel): number {
  if (level === "country") return 4;
  if (level === "state") return 6;
  if (level === "city") return 9;
  return 2.3;
}

function parseHttpUrl(raw: string, label: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${label} must start with http:// or https://.`);
  }

  return parsed.toString();
}

type FormState = {
  displayName: string;
  linkedinUrl: string;
  companyName: string;
  companyDomain: string;
  locationText: string;
  profilePhotoUrlInput: string;
};

const initialFormState: FormState = {
  displayName: "",
  linkedinUrl: "",
  companyName: "",
  companyDomain: "",
  locationText: "",
  profilePhotoUrlInput: "",
};

export function GroupExperience({ group }: Props) {
  const [formState, setFormState] = useState<FormState>(initialFormState);
  const [rawPhotoFile, setRawPhotoFile] = useState<File | null>(null);
  const [croppedPhotoFile, setCroppedPhotoFile] = useState<File | null>(null);
  const [croppedPreviewUrl, setCroppedPreviewUrl] = useState("");
  const [submitStatus, setSubmitStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [mapController, setMapController] = useState<MapController | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [editingExistingProfile, setEditingExistingProfile] = useState(false);
  const [existingProfileLoading, setExistingProfileLoading] = useState(true);
  const searchRequestIdRef = useRef(0);
  const searchAbortControllerRef = useRef<AbortController | null>(null);
  const skipNextSearchRef = useRef(false);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);

  const handleMapReady = useCallback((controller: MapController) => {
    setMapController(controller);
  }, []);

  const isFormValid = useMemo(() => {
    return (
      formState.displayName.trim().length > 1 &&
      formState.linkedinUrl.trim().length > 8 &&
      formState.companyName.trim().length > 1 &&
      formState.companyDomain.trim().length > 2 &&
      formState.locationText.trim().length > 1
    );
  }, [formState]);

  useEffect(() => {
    return () => {
      if (croppedPreviewUrl) {
        URL.revokeObjectURL(croppedPreviewUrl);
      }
    };
  }, [croppedPreviewUrl]);

  useEffect(() => {
    let active = true;

    const loadExistingEntry = async () => {
      setExistingProfileLoading(true);
      try {
        const deviceToken = getOrCreateDeviceToken();
        const response = await fetch(
          `/api/groups/${group.slug}/entry/me?deviceToken=${encodeURIComponent(deviceToken)}`,
          {
            cache: "no-store",
          },
        );
        const json = (await response.json()) as {
          entry?: {
            display_name: string;
            linkedin_url: string;
            company_name: string;
            company_domain: string;
            company_logo_url: string | null;
            location_text: string;
            profile_photo_url: string | null;
          } | null;
        };
        if (!active || !response.ok || !json.entry) {
          setEditingExistingProfile(false);
          return;
        }

        setEditingExistingProfile(true);
        setFormState({
          displayName: json.entry.display_name ?? "",
          linkedinUrl: json.entry.linkedin_url ?? "",
          companyName: json.entry.company_name ?? "",
          companyDomain: json.entry.company_domain ?? "",
          locationText: json.entry.location_text ?? "",
          profilePhotoUrlInput: json.entry.profile_photo_url ?? "",
        });
      } catch {
        if (active) {
          setEditingExistingProfile(false);
        }
      } finally {
        if (active) {
          setExistingProfileLoading(false);
        }
      }
    };

    void loadExistingEntry();

    return () => {
      active = false;
    };
  }, [group.slug]);

  const closeSearchResults = useCallback(() => {
    setIsSearchOpen(false);
    setSearchResults([]);
    setSearchMessage("");
    setSearchLoading(false);
    searchAbortControllerRef.current?.abort();
    searchAbortControllerRef.current = null;
    searchRequestIdRef.current += 1;
  }, []);

  useEffect(() => {
    const trimmedSearch = searchValue.trim();
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }
    if (trimmedSearch.length < 2) {
      setSearchResults([]);
      setSearchMessage("");
      setSearchLoading(false);
      setIsSearchOpen(false);
      searchAbortControllerRef.current?.abort();
      searchAbortControllerRef.current = null;
      return;
    }

    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;
    const timeout = window.setTimeout(async () => {
      searchAbortControllerRef.current?.abort();
      const controller = new AbortController();
      searchAbortControllerRef.current = controller;
      setSearchLoading(true);
      setSearchMessage("");
      try {
        const response = await fetch(
          `/api/groups/${group.slug}/search?q=${encodeURIComponent(trimmedSearch)}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );
        const json = (await response.json()) as { results?: SearchResult[]; error?: string };
        if (requestId !== searchRequestIdRef.current) {
          return;
        }
        if (!response.ok || !Array.isArray(json.results)) {
          setSearchResults([]);
          setSearchMessage(json.error ?? "Search is unavailable right now.");
          setIsSearchOpen(false);
          return;
        }
        setSearchResults(json.results);
        setIsSearchOpen(json.results.length > 0);
        if (json.results.length === 0) {
          setSearchMessage("No people or locations found.");
        }
      } catch (error) {
        if (
          !(error instanceof DOMException && error.name === "AbortError") &&
          !(error instanceof Error && error.name === "AbortError")
        ) {
          setSearchResults([]);
          setSearchMessage("Search is unavailable right now.");
          setIsSearchOpen(false);
        }
      } finally {
        if (requestId === searchRequestIdRef.current) {
          setSearchLoading(false);
        }
      }
    }, 280);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [group.slug, searchValue]);

  useEffect(() => {
    function handleOutsidePointerDown(event: PointerEvent) {
      if (!searchWrapRef.current?.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsSearchOpen(false);
      }
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    return () => {
      searchAbortControllerRef.current?.abort();
      searchAbortControllerRef.current = null;
    };
  }, []);

  async function uploadPhoto(file: File): Promise<string> {
    const signResponse = await fetch("/api/uploads/profile-photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      }),
    });
    const signJson = (await signResponse.json()) as {
      error?: string;
      path?: string;
      token?: string;
      publicUrl?: string;
      bucket?: string;
    };

    if (
      !signResponse.ok ||
      !signJson.path ||
      !signJson.token ||
      !signJson.publicUrl ||
      !signJson.bucket
    ) {
      throw new Error(signJson.error ?? "Could not upload profile photo.");
    }

    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.storage
      .from(signJson.bucket)
      .uploadToSignedUrl(signJson.path, signJson.token, file);

    if (error) {
      throw new Error("Photo upload failed. Please try a smaller image.");
    }

    return signJson.publicUrl;
  }

  function clearCroppedPreview() {
    setCroppedPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return "";
    });
    setCroppedPhotoFile(null);
    setRawPhotoFile(null);
  }

  function handlePhotoFileSelected(file: File | null) {
    if (!file) {
      clearCroppedPreview();
      setPhotoError("");
      return;
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setRawPhotoFile(null);
      setPhotoError("Use JPG, PNG, or WEBP for profile photos.");
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setRawPhotoFile(null);
      setPhotoError("Profile photos must be 5 MB or smaller.");
      return;
    }

    setCroppedPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return "";
    });
    setCroppedPhotoFile(null);
    setPhotoError("");
    setRawPhotoFile(file);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitStatus("loading");
    setMessage("Submitting your pin...");

    try {
      if (group.submissions_locked) {
        throw new Error("Submissions are currently locked by the board admin.");
      }

      if (photoError) {
        throw new Error(photoError);
      }

      const profilePhotoUrlFromInput = parseHttpUrl(
        formState.profilePhotoUrlInput,
        "Profile photo URL",
      );

      let profilePhotoUrl = profilePhotoUrlFromInput;

      if (!profilePhotoUrlFromInput && rawPhotoFile && !croppedPhotoFile) {
        throw new Error("Please click “Use This Crop” before saving your uploaded photo.");
      }

      if (!profilePhotoUrlFromInput && croppedPhotoFile) {
        profilePhotoUrl = await uploadPhoto(croppedPhotoFile);
      }

      const deviceToken = getOrCreateDeviceToken();
      const response = await fetch(`/api/groups/${group.slug}/entry`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          displayName: formState.displayName,
          linkedinUrl: formState.linkedinUrl,
          companyName: formState.companyName,
          companyDomain: formState.companyDomain,
          locationText: formState.locationText,
          profilePhotoUrl,
          deviceToken,
        }),
      });

      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(json.error ?? "Could not submit this entry.");
      }

      setSubmitStatus("success");
      setMessage("Saved. Your marker is now on the map.");
      setEditingExistingProfile(true);
      mapController?.refresh();
    } catch (error) {
      setSubmitStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not submit.");
    }
  }

  return (
    <section className="wgeu-group-grid">
      <aside className="wgeu-panel">
        <header className="wgeu-panel-header">
          <h2>Drop Your Pin</h2>
          <p>Add your location and current company. Your name links to LinkedIn.</p>
          {group.submissions_locked ? (
            <p className="wgeu-message wgeu-message-error">
              Submissions are currently locked by the board admin.
            </p>
          ) : null}
          {existingProfileLoading ? (
            <p className="wgeu-message wgeu-message-loading">Checking saved profile...</p>
          ) : null}
          {!existingProfileLoading && editingExistingProfile ? (
            <div className="wgeu-editing-alert" role="status">
              Editing your saved profile on this device.
            </div>
          ) : null}
        </header>

        <form className="wgeu-form" onSubmit={handleSubmit}>
          <label className="wgeu-label">
            Name
            <input
              className="wgeu-input"
              value={formState.displayName}
              onChange={(event) =>
                setFormState((current) => ({ ...current, displayName: event.target.value }))
              }
              placeholder="Alex Rivera"
              disabled={group.submissions_locked}
              required
            />
          </label>

          <label className="wgeu-label">
            LinkedIn URL
            <input
              className="wgeu-input"
              value={formState.linkedinUrl}
              onChange={(event) =>
                setFormState((current) => ({ ...current, linkedinUrl: event.target.value }))
              }
              placeholder="https://www.linkedin.com/in/your-profile"
              disabled={group.submissions_locked}
              required
            />
          </label>

          <label className="wgeu-label">
            Current Company
            <input
              className="wgeu-input"
              value={formState.companyName}
              onChange={(event) =>
                setFormState((current) => ({ ...current, companyName: event.target.value }))
              }
              placeholder="Stripe"
              disabled={group.submissions_locked}
              required
            />
          </label>

          <label className="wgeu-label">
            Company Domain
            <input
              className="wgeu-input"
              value={formState.companyDomain}
              onChange={(event) =>
                setFormState((current) => ({ ...current, companyDomain: event.target.value }))
              }
              placeholder="stripe.com"
              disabled={group.submissions_locked}
              required
            />
          </label>

          <label className="wgeu-label">
            Current Location (City, Country)
            <input
              className="wgeu-input"
              value={formState.locationText}
              onChange={(event) =>
                setFormState((current) => ({ ...current, locationText: event.target.value }))
              }
              placeholder="Austin, United States"
              disabled={group.submissions_locked}
              required
            />
          </label>

          <label className="wgeu-label">
            Profile Photo URL (Optional)
            <input
              className="wgeu-input"
              value={formState.profilePhotoUrlInput}
              onChange={(event) =>
                setFormState((current) => ({ ...current, profilePhotoUrlInput: event.target.value }))
              }
              placeholder="https://images.example.com/me.jpg"
              disabled={group.submissions_locked}
            />
          </label>

          <label className="wgeu-label">
            Or Upload + Crop (Optional)
            <input
              className="wgeu-input"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                handlePhotoFileSelected(file);
              }}
              disabled={group.submissions_locked}
            />
          </label>

          {rawPhotoFile ? (
            <PhotoCropper
              file={rawPhotoFile}
              onCancel={() => {
                setRawPhotoFile(null);
              }}
              onError={(nextError) => {
                setPhotoError(nextError);
              }}
              onApply={(file) => {
                const nextPreviewUrl = URL.createObjectURL(file);
                setCroppedPreviewUrl((current) => {
                  if (current) {
                    URL.revokeObjectURL(current);
                  }
                  return nextPreviewUrl;
                });
                setCroppedPhotoFile(file);
                setRawPhotoFile(null);
                setPhotoError("");
              }}
            />
          ) : null}

          {croppedPreviewUrl ? (
            <div className="wgeu-photo-preview-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={croppedPreviewUrl} alt="Cropped profile preview" className="wgeu-photo-preview" />
              <button
                className="wgeu-button wgeu-button-secondary"
                type="button"
                onClick={clearCroppedPreview}
              >
                Remove Upload
              </button>
            </div>
          ) : null}

          {photoError ? <p className="wgeu-message wgeu-message-error">{photoError}</p> : null}

          <button
            className="wgeu-button wgeu-button-primary"
            disabled={submitStatus === "loading" || !isFormValid || group.submissions_locked}
            type="submit"
          >
            {submitStatus === "loading"
              ? "Saving..."
              : editingExistingProfile
                ? "Update My Entry"
                : "Save My Entry"}
          </button>

          {message ? (
            <p className={clsx("wgeu-message", `wgeu-message-${submitStatus}`)}>{message}</p>
          ) : null}
        </form>
      </aside>

      <section className="wgeu-map-column">
        <header className="wgeu-map-header">
          <div className="wgeu-map-title-wrap">
            <span className="wgeu-map-kicker">Alum Atlas Board</span>
            <h2>{group.title}</h2>
            {group.description ? (
              <p>{group.description}</p>
            ) : (
              <p>Track where your student organization members and alumni landed.</p>
            )}
          </div>

          <div className="wgeu-search-wrap" ref={searchWrapRef}>
            <input
              className="wgeu-input"
              placeholder="Search people, city, state, or country"
              value={searchValue}
              onChange={(event) => {
                setSearchValue(event.target.value);
                setSearchMessage("");
                if (event.target.value.trim().length >= 2) {
                  setIsSearchOpen(true);
                }
              }}
              onFocus={() => {
                if (searchResults.length > 0) {
                  setIsSearchOpen(true);
                }
              }}
            />
            {searchLoading ? <span className="wgeu-search-status">Searching...</span> : null}
            {!searchLoading && searchMessage ? (
              <span className="wgeu-search-status">{searchMessage}</span>
            ) : null}
            {isSearchOpen && searchResults.length > 0 ? (
              <ul className="wgeu-search-results">
                {searchResults.some((result) => result.kind === "person") ? (
                  <li className="wgeu-search-section-label">People</li>
                ) : null}
                {searchResults
                  .filter((result): result is PersonSearchResult => result.kind === "person")
                  .map((result) => (
                    <li key={`person-${result.id}`}>
                      <button
                        className="wgeu-search-result-button wgeu-search-result-person"
                        type="button"
                        onClick={() => {
                          skipNextSearchRef.current = true;
                          setSearchValue(result.displayName);
                          closeSearchResults();
                          mapController?.focusPerson(result.id, result.lat, result.lng);
                        }}
                      >
                        <span className="wgeu-search-person-name">{result.displayName}</span>
                        <span className="wgeu-search-person-meta">
                          {result.companyName}
                          {result.city ? ` · ${result.city}` : ""}
                          {result.stateRegion ? `, ${result.stateRegion}` : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                {searchResults.some((result) => result.kind === "location") ? (
                  <li className="wgeu-search-section-label">Locations</li>
                ) : null}
                {searchResults
                  .filter((result): result is LocationSearchResult => result.kind === "location")
                  .map((result) => (
                    <li key={`location-${result.lat}-${result.lng}-${result.label}`}>
                      <button
                        className="wgeu-search-result-button wgeu-search-result-location"
                        type="button"
                        onClick={() => {
                          skipNextSearchRef.current = true;
                          setSearchValue(result.label);
                          closeSearchResults();
                          mapController?.flyTo(
                            result.lat,
                            result.lng,
                            semanticLevelToZoom(result.semanticLevel),
                          );
                        }}
                      >
                        {result.label}
                      </button>
                    </li>
                  ))}
              </ul>
            ) : null}
          </div>
        </header>

        <WorldMap
          slug={group.slug}
          onReady={handleMapReady}
        />
      </section>
    </section>
  );
}
