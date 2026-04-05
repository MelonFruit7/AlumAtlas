export function normalizeCompanyDomain(input: string): string {
  const value = input.trim().toLowerCase();
  const withoutProtocol = value.replace(/^https?:\/\//, "");
  const withoutPath = withoutProtocol.split("/")[0] ?? "";
  const withoutWww = withoutPath.replace(/^www\./, "");

  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(withoutWww)) {
    throw new Error("Please provide a valid company domain (e.g. example.com).");
  }

  return withoutWww;
}

export function companyLogoFromDomain(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

export function resolveCompanyLogoUrl(domain: string): string {
  return companyLogoFromDomain(domain);
}
