const LINKEDIN_HOSTS = new Set(["linkedin.com", "www.linkedin.com"]);

export function normalizeLinkedInUrl(input: string): string {
  const value = input.trim();
  const withProtocol = value.startsWith("http") ? value : `https://${value}`;
  const url = new URL(withProtocol);

  if (!LINKEDIN_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error("Please provide a valid LinkedIn profile URL.");
  }

  const path = url.pathname.replace(/\/$/, "");
  if (!path.startsWith("/in/")) {
    throw new Error("LinkedIn URL must be a personal profile under /in/.");
  }

  url.protocol = "https:";
  url.search = "";
  url.hash = "";
  url.pathname = path;

  return url.toString();
}
