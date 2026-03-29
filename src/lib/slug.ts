export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function generateGroupSlug(title: string): string {
  const prefix = slugifyTitle(title) || "group";
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return `${prefix}-${random}`;
}
