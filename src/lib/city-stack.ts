import type { PersonMapNode } from "@/types/domain";

export type CityStackGroup = {
  key: string;
  label: string;
  anchorLat: number;
  anchorLng: number;
  members: PersonMapNode[];
};

function normalizePart(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function cityStackKey(node: PersonMapNode): string {
  return [
    normalizePart(node.countryName),
    normalizePart(node.stateRegion),
    normalizePart(node.city),
  ].join("|");
}

export function cityStackLabel(node: PersonMapNode): string {
  const city = node.city?.trim() || "Unknown City";
  const state = node.stateRegion?.trim();
  if (state) {
    return `${city}, ${state}`;
  }
  return `${city}, ${node.countryName}`;
}

export function sortPeopleForCityStack(nodes: PersonMapNode[]): PersonMapNode[] {
  return [...nodes].sort((a, b) => {
    const byName = a.displayName.localeCompare(b.displayName);
    if (byName !== 0) {
      return byName;
    }
    return a.id.localeCompare(b.id);
  });
}

export function groupPeopleByCity(nodes: PersonMapNode[]): CityStackGroup[] {
  const grouped = new Map<string, PersonMapNode[]>();

  for (const node of nodes) {
    const key = cityStackKey(node);
    const current = grouped.get(key);
    if (current) {
      current.push(node);
    } else {
      grouped.set(key, [node]);
    }
  }

  const groups: CityStackGroup[] = [];
  for (const [key, membersRaw] of grouped) {
    const members = sortPeopleForCityStack(membersRaw);
    const sum = members.reduce(
      (acc, member) => ({ lat: acc.lat + member.lat, lng: acc.lng + member.lng }),
      { lat: 0, lng: 0 },
    );
    const anchorLat = sum.lat / members.length;
    const anchorLng = sum.lng / members.length;
    const sample = members[0];
    if (!sample) {
      continue;
    }

    groups.push({
      key,
      label: cityStackLabel(sample),
      anchorLat,
      anchorLng,
      members,
    });
  }

  groups.sort((a, b) => {
    if (a.members.length !== b.members.length) {
      return b.members.length - a.members.length;
    }
    return a.key.localeCompare(b.key);
  });

  return groups;
}

export function visiblePeopleForCity(
  group: CityStackGroup,
  limit = 8,
): {
  visible: PersonMapNode[];
  hiddenCount: number;
} {
  const safeLimit = Math.max(1, limit);
  const visible = group.members.slice(0, safeLimit);
  return {
    visible,
    hiddenCount: Math.max(0, group.members.length - visible.length),
  };
}

export function cityStackOffsets(count: number): Array<{ xPx: number; yPx: number }> {
  if (count <= 0) {
    return [];
  }
  if (count === 1) {
    return [{ xPx: 0, yPx: 0 }];
  }

  const offsets: Array<{ xPx: number; yPx: number }> = [];
  const ringOneCount = Math.min(4, count);
  const ringOneRadius = count <= 2 ? 24 : 30;

  for (let i = 0; i < ringOneCount; i += 1) {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / ringOneCount;
    offsets.push({
      xPx: Math.cos(angle) * ringOneRadius,
      yPx: Math.sin(angle) * ringOneRadius,
    });
  }

  const ringTwoCount = count - ringOneCount;
  if (ringTwoCount > 0) {
    const ringTwoRadius = 56;
    for (let i = 0; i < ringTwoCount; i += 1) {
      const angle = -Math.PI / 4 + (2 * Math.PI * i) / ringTwoCount;
      offsets.push({
        xPx: Math.cos(angle) * ringTwoRadius,
        yPx: Math.sin(angle) * ringTwoRadius,
      });
    }
  }

  return offsets;
}

export function findCityKeyForPerson(
  groups: CityStackGroup[],
  personId: string,
): string | null {
  for (const group of groups) {
    if (group.members.some((member) => member.id === personId)) {
      return group.key;
    }
  }
  return null;
}
