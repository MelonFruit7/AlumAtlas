"use client";

import { useMemo, useState } from "react";

type CreateGroupState = {
  status: "idle" | "loading" | "success" | "error";
  message: string;
  shareUrl: string;
  adminUrl: string;
};

const initialState: CreateGroupState = {
  status: "idle",
  message: "",
  shareUrl: "",
  adminUrl: "",
};

export function CreateGroupForm() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmAdminPassword, setConfirmAdminPassword] = useState("");
  const [showShareFull, setShowShareFull] = useState(false);
  const [showAdminFull, setShowAdminFull] = useState(false);
  const [state, setState] = useState<CreateGroupState>(initialState);

  const isDisabled = useMemo(
    () =>
      state.status === "loading" ||
      title.trim().length < 3 ||
      adminPassword.length < 8 ||
      confirmAdminPassword.length < 8,
    [adminPassword.length, confirmAdminPassword.length, state.status, title],
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (adminPassword !== confirmAdminPassword) {
      setState({
        status: "error",
        message: "Admin password and confirmation must match.",
        shareUrl: "",
        adminUrl: "",
      });
      return;
    }

    setState({
      status: "loading",
      message: "Creating your share and admin links...",
      shareUrl: "",
      adminUrl: "",
    });
    setShowShareFull(false);
    setShowAdminFull(false);

    try {
      const response = await fetch("/api/groups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          description,
          adminPassword,
        }),
      });

      const json = (await response.json()) as {
        error?: string;
        shareUrl?: string;
        adminUrl?: string;
      };

      if (!response.ok || !json.shareUrl || !json.adminUrl) {
        throw new Error(json.error ?? "Could not create group.");
      }

      setState({
        status: "success",
        message: "Links ready. Share the public link and keep the admin link private.",
        shareUrl: json.shareUrl,
        adminUrl: json.adminUrl,
      });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Could not create group.",
        shareUrl: "",
        adminUrl: "",
      });
    }
  }

  async function copyShareUrl() {
    if (!state.shareUrl) return;
    await navigator.clipboard.writeText(state.shareUrl);
    setState((current) => ({
      ...current,
      message: "Link copied to clipboard.",
    }));
  }

  async function copyAdminUrl() {
    if (!state.adminUrl) return;
    await navigator.clipboard.writeText(state.adminUrl);
    setState((current) => ({
      ...current,
      message: "Admin link copied to clipboard.",
    }));
  }

  function compactLink(url: string): string {
    try {
      const parsed = new URL(url);
      const compact = `${parsed.host}${parsed.pathname}`;
      return compact.length > 62 ? `${compact.slice(0, 59)}...` : compact;
    } catch {
      return url.length > 62 ? `${url.slice(0, 59)}...` : url;
    }
  }

  return (
    <form className="wgeu-form" onSubmit={handleSubmit}>
      <label className="wgeu-label">
        Group Title
        <input
          className="wgeu-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="UCF Knights Alumni Network"
          maxLength={120}
          required
        />
      </label>

      <label className="wgeu-label">
        Description (Optional)
        <textarea
          className="wgeu-input wgeu-textarea"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="A quick way to visualize where everyone ended up after graduation."
          maxLength={500}
        />
      </label>

      <label className="wgeu-label">
        Admin Password
        <input
          className="wgeu-input"
          type="password"
          value={adminPassword}
          onChange={(event) => setAdminPassword(event.target.value)}
          placeholder="At least 8 characters"
          minLength={8}
          required
        />
      </label>

      <label className="wgeu-label">
        Confirm Admin Password
        <input
          className="wgeu-input"
          type="password"
          value={confirmAdminPassword}
          onChange={(event) => setConfirmAdminPassword(event.target.value)}
          placeholder="Re-enter password"
          minLength={8}
          required
        />
      </label>

      <button className="wgeu-button wgeu-button-primary" type="submit" disabled={isDisabled}>
        {state.status === "loading" ? "Creating..." : "Create Share Link"}
      </button>

      {state.message ? (
        <p className={`wgeu-message wgeu-message-${state.status}`}>{state.message}</p>
      ) : null}

      {state.shareUrl ? (
        <div className="wgeu-link-card">
          <div className="wgeu-link-card-head">
            <strong>Public Link</strong>
            <div className="wgeu-link-card-actions">
              <button
                className="wgeu-button wgeu-button-secondary"
                type="button"
                onClick={() => setShowShareFull((value) => !value)}
              >
                {showShareFull ? "Hide" : "Show"}
              </button>
              <button
                className="wgeu-button wgeu-button-secondary"
                type="button"
                onClick={copyShareUrl}
              >
                Copy
              </button>
            </div>
          </div>
          <a href={state.shareUrl} className="wgeu-share-link" target="_blank" rel="noreferrer">
            {compactLink(state.shareUrl)}
          </a>
          {showShareFull ? <p className="wgeu-link-full">{state.shareUrl}</p> : null}
        </div>
      ) : null}

      {state.adminUrl ? (
        <div className="wgeu-link-card">
          <div className="wgeu-link-card-head">
            <strong>Admin Link</strong>
            <div className="wgeu-link-card-actions">
              <button
                className="wgeu-button wgeu-button-secondary"
                type="button"
                onClick={() => setShowAdminFull((value) => !value)}
              >
                {showAdminFull ? "Hide" : "Show"}
              </button>
              <button
                className="wgeu-button wgeu-button-secondary"
                type="button"
                onClick={copyAdminUrl}
              >
                Copy
              </button>
            </div>
          </div>
          <a href={state.adminUrl} className="wgeu-share-link" target="_blank" rel="noreferrer">
            {compactLink(state.adminUrl)}
          </a>
          {showAdminFull ? <p className="wgeu-link-full">{state.adminUrl}</p> : null}
        </div>
      ) : null}
    </form>
  );
}
