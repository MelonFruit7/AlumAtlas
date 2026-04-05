import { describe, expect, it } from "vitest";
import {
  companyLogoFromDomain,
  normalizeCompanyDomain,
  resolveCompanyLogoUrl,
} from "@/lib/company";

describe("company helpers", () => {
  it("normalizes company domain from common URL formats", () => {
    expect(normalizeCompanyDomain("https://www.Stripe.com/about")).toBe("stripe.com");
  });

  it("builds favicon-based logo URL from domain", () => {
    expect(companyLogoFromDomain("openai.com")).toBe(
      "https://www.google.com/s2/favicons?domain=openai.com&sz=128",
    );
  });

  it("resolves logo URLs from company domains", () => {
    expect(resolveCompanyLogoUrl("openai.com")).toBe(
      "https://www.google.com/s2/favicons?domain=openai.com&sz=128",
    );
  });
});
