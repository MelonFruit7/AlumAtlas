"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { EntryRecord, GroupRecord } from "@/types/domain";

type Props = {
  group: GroupRecord;
};

type AuthState = "checking" | "anonymous" | "authenticated";

type EntryFormState = {
  displayName: string;
  linkedinUrl: string;
  companyName: string;
  companyDomain: string;
  companyLogoUrl: string;
  locationText: string;
  profilePhotoUrl: string;
};

const initialEntryFormState: EntryFormState = {
  displayName: "",
  linkedinUrl: "",
  companyName: "",
  companyDomain: "",
  companyLogoUrl: "",
  locationText: "",
  profilePhotoUrl: "",
};

function entryToForm(entry: EntryRecord): EntryFormState {
  return {
    displayName: entry.display_name,
    linkedinUrl: entry.linkedin_url,
    companyName: entry.company_name,
    companyDomain: entry.company_domain,
    companyLogoUrl: entry.company_logo_url ?? "",
    locationText: entry.location_text,
    profilePhotoUrl: entry.profile_photo_url ?? "",
  };
}

export function AdminExperience({ group: initialGroup }: Props) {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [group, setGroup] = useState<GroupRecord>(initialGroup);
  const [entries, setEntries] = useState<EntryRecord[]>([]);
  const [boardMessage, setBoardMessage] = useState("");
  const [boardStatus, setBoardStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle",
  );
  const [loginPassword, setLoginPassword] = useState("");
  const [settingsTitle, setSettingsTitle] = useState(initialGroup.title);
  const [settingsDescription, setSettingsDescription] = useState(initialGroup.description ?? "");
  const [settingsLocked, setSettingsLocked] = useState(initialGroup.submissions_locked);
  const [entryFormState, setEntryFormState] = useState<EntryFormState>(initialEntryFormState);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  const isEntryFormValid = useMemo(() => {
    return (
      entryFormState.displayName.trim().length >= 2 &&
      entryFormState.linkedinUrl.trim().length >= 8 &&
      entryFormState.companyName.trim().length >= 2 &&
      entryFormState.companyDomain.trim().length >= 3 &&
      entryFormState.locationText.trim().length >= 2
    );
  }, [entryFormState]);

  useEffect(() => {
    setSettingsTitle(group.title);
    setSettingsDescription(group.description ?? "");
    setSettingsLocked(group.submissions_locked);
  }, [group]);

  const loadBoard = useCallback(async () => {
    setBoardStatus("loading");
    setBoardMessage("Loading admin board...");
    try {
      const response = await fetch(`/api/groups/${initialGroup.slug}/admin/entries`, {
        cache: "no-store",
      });
      if (response.status === 401) {
        setAuthState("anonymous");
        setBoardStatus("idle");
        setBoardMessage("");
        return;
      }

      const json = (await response.json()) as {
        error?: string;
        group?: GroupRecord;
        entries?: EntryRecord[];
      };
      if (!response.ok || !json.group || !Array.isArray(json.entries)) {
        throw new Error(json.error ?? "Could not load admin board.");
      }

      setAuthState("authenticated");
      setGroup(json.group);
      setEntries(json.entries);
      setBoardStatus("success");
      setBoardMessage("Admin board loaded.");
    } catch (error) {
      setBoardStatus("error");
      setBoardMessage(error instanceof Error ? error.message : "Could not load admin board.");
    }
  }, [initialGroup.slug]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBoardStatus("loading");
    setBoardMessage("Verifying admin password...");

    try {
      const response = await fetch(`/api/groups/${initialGroup.slug}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: loginPassword,
        }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(json.error ?? "Could not login.");
      }

      setLoginPassword("");
      await loadBoard();
    } catch (error) {
      setBoardStatus("error");
      setBoardMessage(error instanceof Error ? error.message : "Could not login.");
    }
  }

  async function handleLogout() {
    setBoardStatus("loading");
    setBoardMessage("Logging out...");
    await fetch(`/api/groups/${initialGroup.slug}/admin/logout`, {
      method: "POST",
    });
    setAuthState("anonymous");
    setBoardStatus("idle");
    setBoardMessage("");
  }

  async function handleSaveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBoardStatus("loading");
    setBoardMessage("Saving board settings...");

    try {
      const response = await fetch(`/api/groups/${initialGroup.slug}/admin/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: settingsTitle,
          description: settingsDescription,
          submissionsLocked: settingsLocked,
        }),
      });
      const json = (await response.json()) as { group?: GroupRecord; error?: string };
      if (!response.ok || !json.group) {
        throw new Error(json.error ?? "Could not update settings.");
      }

      setGroup(json.group);
      setBoardStatus("success");
      setBoardMessage("Board settings saved.");
    } catch (error) {
      setBoardStatus("error");
      setBoardMessage(error instanceof Error ? error.message : "Could not update settings.");
    }
  }

  async function handleSaveEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBoardStatus("loading");
    setBoardMessage(editingEntryId ? "Updating entry..." : "Creating entry...");

    try {
      const payload = {
        displayName: entryFormState.displayName,
        linkedinUrl: entryFormState.linkedinUrl,
        companyName: entryFormState.companyName,
        companyDomain: entryFormState.companyDomain,
        companyLogoUrl: entryFormState.companyLogoUrl.trim() || undefined,
        locationText: entryFormState.locationText,
        profilePhotoUrl: entryFormState.profilePhotoUrl.trim() || undefined,
      };

      const endpoint = editingEntryId
        ? `/api/groups/${initialGroup.slug}/admin/entries/${editingEntryId}`
        : `/api/groups/${initialGroup.slug}/admin/entries`;
      const method = editingEntryId ? "PATCH" : "POST";
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(json.error ?? "Could not save entry.");
      }

      setEntryFormState(initialEntryFormState);
      setEditingEntryId(null);
      await loadBoard();
      setBoardMessage(editingEntryId ? "Entry updated." : "Entry added.");
    } catch (error) {
      setBoardStatus("error");
      setBoardMessage(error instanceof Error ? error.message : "Could not save entry.");
    }
  }

  async function handleDeleteEntry(entryId: string) {
    setBoardStatus("loading");
    setBoardMessage("Deleting entry...");
    try {
      const response = await fetch(`/api/groups/${initialGroup.slug}/admin/entries/${entryId}`, {
        method: "DELETE",
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(json.error ?? "Could not delete entry.");
      }

      if (editingEntryId === entryId) {
        setEditingEntryId(null);
        setEntryFormState(initialEntryFormState);
      }
      await loadBoard();
      setBoardMessage("Entry deleted.");
    } catch (error) {
      setBoardStatus("error");
      setBoardMessage(error instanceof Error ? error.message : "Could not delete entry.");
    }
  }

  return (
    <section className="wgeu-admin-grid">
      <aside className="wgeu-panel">
        <header className="wgeu-panel-header">
          <h2>Board Admin</h2>
          <p>
            Use this private page to manage entries, update board metadata, and lock submissions.
          </p>
        </header>

        {authState !== "authenticated" ? (
          <form className="wgeu-form" onSubmit={handleLogin}>
            <label className="wgeu-label">
              Admin Password
              <input
                className="wgeu-input"
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                required
              />
            </label>
            <button className="wgeu-button wgeu-button-primary" type="submit">
              Unlock Admin Board
            </button>
            {boardMessage ? (
              <p className={clsx("wgeu-message", `wgeu-message-${boardStatus}`)}>{boardMessage}</p>
            ) : null}
          </form>
        ) : (
          <div className="wgeu-admin-stack">
            <form className="wgeu-form" onSubmit={handleSaveSettings}>
              <h3>Board Settings</h3>
              <label className="wgeu-label">
                Title
                <input
                  className="wgeu-input"
                  value={settingsTitle}
                  onChange={(event) => setSettingsTitle(event.target.value)}
                  required
                />
              </label>
              <label className="wgeu-label">
                Description
                <textarea
                  className="wgeu-input wgeu-textarea"
                  value={settingsDescription}
                  onChange={(event) => setSettingsDescription(event.target.value)}
                />
              </label>
              <label className="wgeu-checkbox">
                <input
                  type="checkbox"
                  checked={settingsLocked}
                  onChange={(event) => setSettingsLocked(event.target.checked)}
                />
                Lock public submissions
              </label>
              <button className="wgeu-button wgeu-button-primary" type="submit">
                Save Settings
              </button>
            </form>

            <form className="wgeu-form" onSubmit={handleSaveEntry}>
              <h3>{editingEntryId ? "Edit Entry" : "Add Entry"}</h3>
              <label className="wgeu-label">
                Name
                <input
                  className="wgeu-input"
                  value={entryFormState.displayName}
                  onChange={(event) =>
                    setEntryFormState((current) => ({
                      ...current,
                      displayName: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label className="wgeu-label">
                LinkedIn URL
                <input
                  className="wgeu-input"
                  value={entryFormState.linkedinUrl}
                  onChange={(event) =>
                    setEntryFormState((current) => ({
                      ...current,
                      linkedinUrl: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label className="wgeu-label">
                Company Name
                <input
                  className="wgeu-input"
                  value={entryFormState.companyName}
                  onChange={(event) =>
                    setEntryFormState((current) => ({
                      ...current,
                      companyName: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label className="wgeu-label">
                Company Domain
                <input
                  className="wgeu-input"
                  value={entryFormState.companyDomain}
                  onChange={(event) =>
                    setEntryFormState((current) => ({
                      ...current,
                      companyDomain: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label className="wgeu-label">
                Company Logo URL (Optional)
                <input
                  className="wgeu-input"
                  value={entryFormState.companyLogoUrl}
                  onChange={(event) =>
                    setEntryFormState((current) => ({
                      ...current,
                      companyLogoUrl: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="wgeu-label">
                Location
                <input
                  className="wgeu-input"
                  value={entryFormState.locationText}
                  onChange={(event) =>
                    setEntryFormState((current) => ({
                      ...current,
                      locationText: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label className="wgeu-label">
                Profile Photo URL (Optional)
                <input
                  className="wgeu-input"
                  value={entryFormState.profilePhotoUrl}
                  onChange={(event) =>
                    setEntryFormState((current) => ({
                      ...current,
                      profilePhotoUrl: event.target.value,
                    }))
                  }
                />
              </label>

              <div className="wgeu-admin-actions">
                <button
                  className="wgeu-button wgeu-button-primary"
                  type="submit"
                  disabled={!isEntryFormValid}
                >
                  {editingEntryId ? "Update Entry" : "Add Entry"}
                </button>
                {editingEntryId ? (
                  <button
                    className="wgeu-button wgeu-button-secondary"
                    type="button"
                    onClick={() => {
                      setEditingEntryId(null);
                      setEntryFormState(initialEntryFormState);
                    }}
                  >
                    Cancel Edit
                  </button>
                ) : null}
                <button
                  className="wgeu-button wgeu-button-secondary"
                  type="button"
                  onClick={() => void handleLogout()}
                >
                  Logout
                </button>
              </div>
            </form>

            {boardMessage ? (
              <p className={clsx("wgeu-message", `wgeu-message-${boardStatus}`)}>{boardMessage}</p>
            ) : null}
          </div>
        )}
      </aside>

      <section className="wgeu-admin-list">
        <header className="wgeu-map-header">
          <div>
            <h2>{group.title}</h2>
            <p>
              {entries.length} {entries.length === 1 ? "entry" : "entries"} on board.
            </p>
          </div>
        </header>
        <div className="wgeu-admin-table-wrap">
          <table className="wgeu-admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Company</th>
                <th>Location</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.display_name}</td>
                  <td>{entry.company_name}</td>
                  <td>{entry.location_text}</td>
                  <td>
                    <div className="wgeu-admin-row-actions">
                      <button
                        className="wgeu-button wgeu-button-secondary"
                        type="button"
                        onClick={() => {
                          setEditingEntryId(entry.id);
                          setEntryFormState(entryToForm(entry));
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="wgeu-button wgeu-button-secondary"
                        type="button"
                        onClick={() => void handleDeleteEntry(entry.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={4}>No entries yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

