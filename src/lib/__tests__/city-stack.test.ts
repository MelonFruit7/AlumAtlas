import { describe, expect, it } from "vitest";
import {
  cityStackOffsets,
  findCityKeyForPerson,
  groupPeopleByCity,
  visiblePeopleForCity,
} from "@/lib/city-stack";
import type { PersonMapNode } from "@/types/domain";

function person(partial: Partial<PersonMapNode>): PersonMapNode {
  return {
    kind: "person",
    id: partial.id ?? crypto.randomUUID(),
    lat: partial.lat ?? 28.5383,
    lng: partial.lng ?? -81.3792,
    displayName: partial.displayName ?? "Person",
    linkedinUrl: partial.linkedinUrl ?? "https://linkedin.com/in/person",
    companyName: partial.companyName ?? "Company",
    companyLogoUrl: partial.companyLogoUrl ?? null,
    profilePhotoUrl: partial.profilePhotoUrl ?? null,
    city: partial.city ?? "Orlando",
    stateRegion: partial.stateRegion ?? "Florida",
    countryName: partial.countryName ?? "United States",
  };
}

describe("city-stack", () => {
  it("groups by city key and keeps deterministic member order", () => {
    const nodes = [
      person({ id: "b", displayName: "Bruno", city: "Orlando" }),
      person({ id: "a", displayName: "Ally", city: "Orlando" }),
      person({ id: "c", displayName: "Casey", city: "Miami" }),
    ];

    const groups = groupPeopleByCity(nodes);
    const orlando = groups.find((group) => group.label.startsWith("Orlando"));

    expect(orlando).toBeDefined();
    expect(orlando?.members.map((member) => member.id)).toEqual(["a", "b"]);
  });

  it("returns top 8 visible members and hidden count", () => {
    const members = Array.from({ length: 12 }, (_, index) =>
      person({ id: `m-${index + 1}`, displayName: `Member ${index + 1}` }),
    );
    const [group] = groupPeopleByCity(members);
    expect(group).toBeDefined();
    if (!group) return;

    const visible = visiblePeopleForCity(group, 8);
    expect(visible.visible).toHaveLength(8);
    expect(visible.hiddenCount).toBe(4);
  });

  it("city stack offsets for 8 markers do not overlap at chip size", () => {
    const offsets = cityStackOffsets(8);
    const chipDiameter = 32;

    for (let i = 0; i < offsets.length; i += 1) {
      const first = offsets[i];
      if (!first) continue;
      for (let j = i + 1; j < offsets.length; j += 1) {
        const second = offsets[j];
        if (!second) continue;
        const distance = Math.hypot(first.xPx - second.xPx, first.yPx - second.yPx);
        expect(distance).toBeGreaterThanOrEqual(chipDiameter);
      }
    }
  });

  it("finds the city for a person id", () => {
    const groups = groupPeopleByCity([
      person({ id: "orl-1", city: "Orlando", stateRegion: "Florida" }),
      person({ id: "orl-2", city: "Orlando", stateRegion: "Florida" }),
      person({ id: "atl-1", city: "Atlanta", stateRegion: "Georgia" }),
    ]);

    expect(findCityKeyForPerson(groups, "atl-1")).not.toBeNull();
    expect(findCityKeyForPerson(groups, "missing-id")).toBeNull();
  });
});
