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

  it("prefers manual logo URL when provided", () => {
    expect(
      resolveCompanyLogoUrl("openai.com", " https://cdn.example.com/openai-logo.png "),
    ).toBe("https://cdn.example.com/openai-logo.png");
  });

  it("falls back to favicon URL when manual logo URL is missing", () => {
    expect(resolveCompanyLogoUrl("openai.com")).toBe(
      "https://www.google.com/s2/favicons?domain=openai.com&sz=128",
    );
  });
});

