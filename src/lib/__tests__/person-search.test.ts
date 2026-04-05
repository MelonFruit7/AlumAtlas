import { describe, expect, it } from "vitest";
import { rankPersonSearchEntries } from "@/lib/db";

describe("rankPersonSearchEntries", () => {
  const rows = [
    {
      id: "1",
      display_name: "Alex Rivera",
      company_name: "NVIDIA",
      lat: 0,
      lng: 0,
      city: "Austin",
      state_region: "Texas",
      country_name: "United States",
    },
    {
      id: "2",
      display_name: "Jordan Alexson",
      company_name: "Stripe",
      lat: 0,
      lng: 0,
      city: "San Francisco",
      state_region: "California",
      country_name: "United States",
    },
    {
      id: "3",
      display_name: "Maya Chen",
      company_name: "Alex Labs",
      lat: 0,
      lng: 0,
      city: "Seattle",
      state_region: "Washington",
      country_name: "United States",
    },
    {
      id: "4",
      display_name: "Priya Patel",
      company_name: "Vertex Analytics",
      lat: 0,
      lng: 0,
      city: "Miami",
      state_region: "Florida",
      country_name: "United States",
    },
  ];

  it("ranks starts-with name before contains name before company matches", () => {
    const results = rankPersonSearchEntries(rows, "alex", 10);
    expect(results.map((result) => result.id)).toEqual(["1", "2", "3"]);
  });

  it("honors the provided limit", () => {
    const results = rankPersonSearchEntries(rows, "a", 2);
    expect(results).toHaveLength(0);

    const twoResults = rankPersonSearchEntries(rows, "al", 2);
    expect(twoResults).toHaveLength(2);
  });
});
