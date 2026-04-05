"use client";

import clsx from "clsx";
import maplibregl, { LngLatBoundsLike } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getInitials } from "@/lib/avatar";
import {
  findCityKeyForPerson,
  groupPeopleByCity,
  type CityStackGroup,
} from "@/lib/city-stack";
import { markerTierForScale } from "@/lib/city-fit-layout";
import { buildMapDataUrl, createMoveEndScheduler } from "@/lib/map-client";
import { resolveSpreadCoordinates } from "@/lib/map-overlap";
import { personScaleForZoom } from "@/lib/person-marker-scale";
import type { AggregateMapNode, MapNode, PersonMapNode } from "@/types/domain";

export type MapController = {
  flyTo: (lat: number, lng: number, zoom: number) => void;
  focusPerson: (id: string, lat: number, lng: number) => void;
  refresh: () => void;
};

type Props = {
  slug: string;
  onReady?: (controller: MapController) => void;
};

type MapDataResponse = {
  semanticLevel: "world" | "country" | "state" | "city";
  nodes: MapNode[];
};

type AggregateHit = {
  node: AggregateMapNode;
  x: number;
  y: number;
  radius: number;
};

const defaultStyleUrl =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL ??
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

const FOCUS_PERSON_ZOOM = 10.9;

type CityBoxElementResult = {
  root: HTMLElement;
  memberElements: Map<string, HTMLElement>;
};

function getAggregateDiameter(node: AggregateMapNode): number {
  const base = node.aggregateLevel === "country" ? 10 : 12;
  return Math.min(24, base + Math.log2(node.count + 1) * 2.2);
}

function semanticZoomToNextLevel(
  level: MapDataResponse["semanticLevel"],
  node?: AggregateMapNode,
): number {
  if (level === "world") {
    if (node?.aggregateLevel === "state" && node.countryCode === "US") {
      return 6.4;
    }
    return 4.2;
  }
  if (level === "country") return 6.4;
  if (level === "state") return 10.8;
  return 10.8;
}

function createPersonElement(
  node: PersonMapNode,
  scale: number,
  onSelect: () => void,
): HTMLElement {
  const card = document.createElement("article");
  card.className = "wgeu-person-marker wgeu-person-marker-tier-standard";
  card.style.setProperty("--wgeu-capsule-scale", scale.toFixed(3));
  card.addEventListener("click", (event) => {
    event.stopPropagation();
    onSelect();
  });

  const avatarWrap = document.createElement("span");
  avatarWrap.className = "wgeu-avatar-wrap";

  const avatarFallback = document.createElement("span");
  avatarFallback.className = "wgeu-avatar wgeu-avatar-fallback";
  avatarFallback.textContent = getInitials(node.displayName);
  avatarWrap.appendChild(avatarFallback);

  if (node.profilePhotoUrl) {
    const avatarImage = document.createElement("img");
    avatarImage.addEventListener("load", () => {
      avatarFallback.style.display = "none";
    });
    avatarImage.addEventListener("error", () => {
      avatarImage.remove();
      avatarFallback.style.display = "grid";
    });
    avatarImage.alt = `${node.displayName} profile`;
    avatarImage.loading = "lazy";
    avatarImage.referrerPolicy = "no-referrer";
    avatarImage.className = "wgeu-avatar";
    avatarImage.src = node.profilePhotoUrl;
    avatarWrap.appendChild(avatarImage);
  }
  card.appendChild(avatarWrap);

  const content = document.createElement("div");
  content.className = "wgeu-person-content";

  const nameLink = document.createElement("a");
  nameLink.href = node.linkedinUrl;
  nameLink.target = "_blank";
  nameLink.rel = "noreferrer";
  nameLink.className = "wgeu-person-name";
  nameLink.textContent = node.displayName;
  nameLink.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  content.appendChild(nameLink);

  const companyRow = document.createElement("div");
  companyRow.className = "wgeu-company-row";

  const logoWrap = document.createElement("span");
  logoWrap.className = "wgeu-company-logo-wrap";

  const logoFallback = document.createElement("span");
  logoFallback.className = "wgeu-company-logo-fallback";
  logoFallback.textContent = getInitials(node.companyName);

  if (node.companyLogoUrl) {
    const logo = document.createElement("img");
    logo.addEventListener("error", () => {
      logo.remove();
      logoFallback.style.display = "grid";
    });
    logo.className = "wgeu-company-logo";
    logo.loading = "lazy";
    logo.referrerPolicy = "no-referrer";
    logo.alt = `${node.companyName} logo`;
    logoFallback.style.display = "none";
    logo.src = node.companyLogoUrl;

    logoWrap.appendChild(logo);
  }

  logoWrap.appendChild(logoFallback);
  companyRow.appendChild(logoWrap);

  const company = document.createElement("span");
  company.className = "wgeu-person-company";
  company.textContent = node.companyName;
  companyRow.appendChild(company);

  content.appendChild(companyRow);
  card.appendChild(content);

  return card;
}

function createCityBoxElement(
  group: CityStackGroup,
  onSelectPerson: (personId: string) => void,
): CityBoxElementResult {
  const root = document.createElement("article");
  root.className = "wgeu-city-stack-box";
  const setScrollFocused = (next: boolean) => {
    root.classList.toggle("is-scroll-focused", next);
  };

  root.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  root.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    setScrollFocused(true);
  });
  root.addEventListener(
    "wheel",
    (event) => {
      if (!root.classList.contains("is-scroll-focused")) {
        return;
      }
      event.stopPropagation();
    },
    { capture: true },
  );

  const header = document.createElement("header");
  header.className = "wgeu-city-stack-head";

  const title = document.createElement("h4");
  title.className = "wgeu-city-stack-title";
  title.textContent = group.label;
  header.appendChild(title);

  const count = document.createElement("span");
  count.className = "wgeu-city-stack-count";
  count.textContent = `${group.members.length}`;
  header.appendChild(count);
  root.appendChild(header);

  const list = document.createElement("div");
  list.className = "wgeu-city-stack-list";
  list.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    setScrollFocused(true);
  });
  list.addEventListener("wheel", (event) => {
    if (!root.classList.contains("is-scroll-focused")) {
      return;
    }
    event.stopPropagation();
  });

  const memberElements = new Map<string, HTMLElement>();

  for (const member of group.members) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "wgeu-city-stack-item";
    row.title = `${member.displayName} · ${member.companyName}`;
    row.addEventListener("click", (event) => {
      event.stopPropagation();
      onSelectPerson(member.id);
    });

    const avatarWrap = document.createElement("span");
    avatarWrap.className = "wgeu-city-stack-avatar-wrap";

    const avatarFallback = document.createElement("span");
    avatarFallback.className = "wgeu-city-stack-avatar wgeu-city-stack-avatar-fallback";
    avatarFallback.textContent = getInitials(member.displayName);
    avatarWrap.appendChild(avatarFallback);

    if (member.profilePhotoUrl) {
      const avatar = document.createElement("img");
      avatar.className = "wgeu-city-stack-avatar";
      avatar.alt = `${member.displayName} profile`;
      avatar.loading = "lazy";
      avatar.referrerPolicy = "no-referrer";
      avatar.src = member.profilePhotoUrl;
      avatar.addEventListener("load", () => {
        avatarFallback.style.display = "none";
      });
      avatar.addEventListener("error", () => {
        avatar.remove();
        avatarFallback.style.display = "grid";
      });
      avatarWrap.appendChild(avatar);
    }

    const companyBadge = document.createElement("span");
    companyBadge.className = "wgeu-city-stack-company-badge";
    const companyFallback = document.createElement("span");
    companyFallback.className =
      "wgeu-city-stack-company-badge-logo wgeu-city-stack-company-badge-fallback";
    companyFallback.textContent = getInitials(member.companyName);

    if (member.companyLogoUrl) {
      const logo = document.createElement("img");
      logo.className = "wgeu-city-stack-company-badge-logo";
      logo.alt = `${member.companyName} logo`;
      logo.loading = "lazy";
      logo.referrerPolicy = "no-referrer";
      logo.src = member.companyLogoUrl;
      logo.addEventListener("load", () => {
        companyFallback.style.display = "none";
      });
      logo.addEventListener("error", () => {
        logo.remove();
        companyFallback.style.display = "grid";
      });
      companyBadge.appendChild(logo);
    }

    companyBadge.appendChild(companyFallback);
    avatarWrap.appendChild(companyBadge);
    row.appendChild(avatarWrap);

    const text = document.createElement("span");
    text.className = "wgeu-city-stack-item-text";
    const name = document.createElement("strong");
    name.textContent = member.displayName;
    const company = document.createElement("span");
    company.textContent = member.companyName;
    text.appendChild(name);
    text.appendChild(company);
    row.appendChild(text);

    list.appendChild(row);
    memberElements.set(member.id, row);
  }

  root.appendChild(list);
  return { root, memberElements };
}

function applyTierClass(element: HTMLElement, scale: number) {
  const tier = markerTierForScale(scale);
  element.classList.toggle("wgeu-person-marker-tier-ultra-micro", tier === "ultra-micro");
  element.classList.toggle("wgeu-person-marker-tier-micro", tier === "micro");
  element.classList.toggle("wgeu-person-marker-tier-compact", tier === "compact");
  element.classList.toggle(
    "wgeu-person-marker-tier-mini",
    tier === "mini" || tier === "micro" || tier === "ultra-micro",
  );
}

export function WorldMap({ slug, onReady }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const aggregateCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const aggregateTooltipRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const cityStackBoxesRef = useRef<Set<HTMLElement>>(new Set());
  const personMarkerElementsRef = useRef<Map<string, HTMLElement>>(new Map());
  const aggregateNodesRef = useRef<AggregateMapNode[]>([]);
  const aggregateHitsRef = useRef<AggregateHit[]>([]);
  const semanticLevelRef = useRef<MapDataResponse["semanticLevel"]>("world");
  const debugStateDotsRef = useRef(false);
  const focusedPersonIdRef = useRef<string | null>(null);
  const dialogPersonIdRef = useRef<string | null>(null);
  const pendingFocusRequestRef = useRef<
    { id: string; openDialog: boolean; arrived: boolean } | null
  >(null);
  const focusRefreshTimeoutRef = useRef<number | null>(null);
  const loadNodesRef = useRef<() => Promise<void>>(async () => {});
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const onReadyRef = useRef(onReady);
  const personCityKeyByIdRef = useRef<Map<string, string>>(new Map());

  const [semanticLevel, setSemanticLevel] = useState<"world" | "country" | "state" | "city">(
    "world",
  );
  const [isLoading, setIsLoading] = useState(true);
  const [cityGroups, setCityGroups] = useState<CityStackGroup[]>([]);
  const [focusedPersonId, setFocusedPersonId] = useState<string | null>(null);
  const [dialogPersonId, setDialogPersonId] = useState<string | null>(null);
  const [isFocusNavigating, setIsFocusNavigating] = useState(false);
  const [modalCompanyLogoFailed, setModalCompanyLogoFailed] = useState(false);
  const cityGroupsByKey = useMemo(() => new Map(cityGroups.map((group) => [group.key, group])), [cityGroups]);

  const personCityKeyById = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of cityGroups) {
      for (const member of group.members) {
        map.set(member.id, group.key);
      }
    }
    return map;
  }, [cityGroups]);

  const modalCity = useMemo(() => {
    if (!dialogPersonId) {
      return null;
    }
    const cityKey = personCityKeyById.get(dialogPersonId);
    if (!cityKey) {
      return null;
    }
    return cityGroupsByKey.get(cityKey) ?? null;
  }, [dialogPersonId, cityGroupsByKey, personCityKeyById]);

  const modalPersonIndex = useMemo(() => {
    if (!modalCity || !dialogPersonId) {
      return -1;
    }
    return modalCity.members.findIndex((member) => member.id === dialogPersonId);
  }, [dialogPersonId, modalCity]);

  const modalPerson =
    modalPersonIndex >= 0 && modalCity
      ? (modalCity.members[modalPersonIndex] as PersonMapNode)
      : null;

  const applyFocusedSelectionToElements = useCallback(() => {
    const focusedId = focusedPersonIdRef.current;
    for (const [id, element] of personMarkerElementsRef.current) {
      const isSelected = id === focusedId;
      element.classList.toggle("is-selected", isSelected);
    }
  }, []);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    focusedPersonIdRef.current = focusedPersonId;
    applyFocusedSelectionToElements();
  }, [applyFocusedSelectionToElements, focusedPersonId]);

  useEffect(() => {
    dialogPersonIdRef.current = dialogPersonId;
  }, [dialogPersonId]);

  useEffect(() => {
    setModalCompanyLogoFailed(false);
  }, [dialogPersonId, modalPerson?.companyLogoUrl]);

  useEffect(() => {
    personCityKeyByIdRef.current = personCityKeyById;
  }, [personCityKeyById]);

  useEffect(() => {
    if (focusedPersonId && !personCityKeyById.has(focusedPersonId)) {
      setFocusedPersonId(null);
    }
    if (dialogPersonId && !personCityKeyById.has(dialogPersonId)) {
      setDialogPersonId(null);
    }
  }, [dialogPersonId, focusedPersonId, personCityKeyById]);

  const clearMarkers = useCallback(() => {
    for (const marker of markersRef.current) {
      marker.remove();
    }
    markersRef.current = [];
    cityStackBoxesRef.current.clear();
    personMarkerElementsRef.current.clear();
  }, []);

  const clearCityBoxScrollFocus = useCallback(() => {
    for (const box of cityStackBoxesRef.current) {
      box.classList.remove("is-scroll-focused");
    }
  }, []);

  const hideAggregateTooltip = useCallback(() => {
    const tooltip = aggregateTooltipRef.current;
    if (!tooltip) {
      return;
    }
    tooltip.dataset.visible = "false";
    tooltip.textContent = "";
    tooltip.style.left = "-9999px";
    tooltip.style.top = "-9999px";
  }, []);

  const drawAggregateCanvas = useCallback(() => {
    const map = mapRef.current;
    const canvas = aggregateCanvasRef.current;
    if (!map || !canvas) {
      return;
    }

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width <= 0 || height <= 0) {
      aggregateHitsRef.current = [];
      hideAggregateTooltip();
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const expectedWidth = Math.round(width * dpr);
    const expectedHeight = Math.round(height * dpr);
    if (canvas.width !== expectedWidth || canvas.height !== expectedHeight) {
      canvas.width = expectedWidth;
      canvas.height = expectedHeight;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      aggregateHitsRef.current = [];
      hideAggregateTooltip();
      return;
    }

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "800 10px var(--font-body, system-ui)";

    const hits: AggregateHit[] = [];

    for (const node of aggregateNodesRef.current) {
      const point = map.project([node.lng, node.lat]);
      const diameter = getAggregateDiameter(node);
      const radius = diameter / 2;
      const x = point.x;
      const y = point.y;

      if (x < -radius || x > width + radius || y < -radius || y > height + radius) {
        continue;
      }

      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fillStyle = "rgba(245, 230, 199, 0.88)";
      context.fill();
      context.strokeStyle = "rgba(36, 83, 90, 0.58)";
      context.lineWidth = 1;
      context.stroke();

      context.fillStyle = "#173f45";
      context.fillText(node.count > 99 ? "99+" : String(node.count), x, y);

      hits.push({ node, x, y, radius });
    }

    aggregateHitsRef.current = hits;
    if (hits.length === 0) {
      hideAggregateTooltip();
    }
  }, [hideAggregateTooltip]);

  const findAggregateHit = useCallback((x: number, y: number): AggregateHit | null => {
    for (let index = aggregateHitsRef.current.length - 1; index >= 0; index -= 1) {
      const hit = aggregateHitsRef.current[index];
      if (!hit) continue;
      const dx = x - hit.x;
      const dy = y - hit.y;
      if (dx * dx + dy * dy <= hit.radius * hit.radius) {
        return hit;
      }
    }
    return null;
  }, []);

  const applyScaleToCapsules = useCallback((scale: number) => {
    for (const element of personMarkerElementsRef.current.values()) {
      if (!element.classList.contains("wgeu-person-marker")) {
        continue;
      }
      element.style.setProperty("--wgeu-capsule-scale", scale.toFixed(3));
      applyTierClass(element, scale);
    }
  }, []);

  const focusPersonById = useCallback(
    (personId: string, options?: { openDialog?: boolean }) => {
      const cityKey = personCityKeyByIdRef.current.get(personId);
      if (!cityKey) {
        return false;
      }
      setFocusedPersonId(personId);
      if (options?.openDialog) {
        setDialogPersonId(personId);
      }
      return true;
    },
    [],
  );

  const moveModalCursor = useCallback(
    (direction: 1 | -1) => {
      if (!modalCity || modalPersonIndex < 0) {
        return;
      }
      const nextIndex =
        (modalPersonIndex + direction + modalCity.members.length) % modalCity.members.length;
      const nextPerson = modalCity.members[nextIndex];
      if (!nextPerson) {
        return;
      }
      setFocusedPersonId(nextPerson.id);
      setDialogPersonId(nextPerson.id);
    },
    [modalCity, modalPersonIndex],
  );

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDialogPersonId(null);
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    function handleDocumentPointerDown(event: PointerEvent) {
      const targetNode = event.target as Node | null;
      if (!targetNode) {
        return;
      }
      const targetElement = targetNode instanceof Element ? targetNode : targetNode.parentElement;
      if (targetElement?.closest(".wgeu-person-modal-backdrop")) {
        return;
      }
      for (const box of cityStackBoxesRef.current) {
        if (box.contains(targetNode)) {
          return;
        }
      }
      clearCityBoxScrollFocus();
    }

    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
    };
  }, [clearCityBoxScrollFocus]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    debugStateDotsRef.current =
      new URLSearchParams(window.location.search).get("debugStateDots") === "1";

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: defaultStyleUrl,
      center: [-98.5795, 39.8283],
      zoom: 2.2,
      minZoom: 1.5,
      maxZoom: 12.5,
      renderWorldCopies: false,
      bounds: [
        [-179.9, -85],
        [179.9, 85],
      ] satisfies LngLatBoundsLike,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "bottom-right");
    mapRef.current = map;

    loadNodesRef.current = async () => {
      const activeMap = mapRef.current;
      if (!activeMap) {
        return;
      }

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const requestId = ++requestIdRef.current;

      setIsLoading(true);
      const bounds = activeMap.getBounds();
      const zoom = activeMap.getZoom();
      const bbox: [number, number, number, number] = [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ];

      try {
        const response = await fetch(
          buildMapDataUrl(slug, zoom, bbox, {
            debugStateDots: debugStateDotsRef.current,
          }),
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );
        const json = (await response.json()) as MapDataResponse & { error?: string };
        if (!response.ok || !Array.isArray(json.nodes)) {
          return;
        }
        if (requestId !== requestIdRef.current) {
          return;
        }

        semanticLevelRef.current = json.semanticLevel;
        setSemanticLevel(json.semanticLevel);

        aggregateNodesRef.current = json.nodes.filter(
          (node): node is AggregateMapNode => node.kind === "aggregate",
        );
        drawAggregateCanvas();
        clearMarkers();

        const personNodes = json.nodes.filter(
          (node): node is PersonMapNode => node.kind === "person",
        );

        if (json.semanticLevel === "city") {
          const groups = groupPeopleByCity(personNodes);
          setCityGroups(groups);
          const cityIndex = new Map<string, string>();
          for (const group of groups) {
            for (const member of group.members) {
              cityIndex.set(member.id, group.key);
            }
          }
          personCityKeyByIdRef.current = cityIndex;

          for (const group of groups) {
            const { root, memberElements } = createCityBoxElement(group, (personId) => {
              setFocusedPersonId(personId);
              setDialogPersonId(personId);
            });

            const marker = new maplibregl.Marker({ element: root, anchor: "center" })
              .setLngLat([group.anchorLng, group.anchorLat])
              .addTo(activeMap);

            markersRef.current.push(marker);
            cityStackBoxesRef.current.add(root);
            for (const [personId, element] of memberElements) {
              personMarkerElementsRef.current.set(personId, element);
            }
          }

          if (pendingFocusRequestRef.current) {
            const pendingFocusRequest = pendingFocusRequestRef.current;
            const focusCityKey = findCityKeyForPerson(groups, pendingFocusRequest.id);
            if (focusCityKey) {
              setFocusedPersonId(pendingFocusRequest.id);
              if (pendingFocusRequest.openDialog && pendingFocusRequest.arrived) {
                setDialogPersonId(pendingFocusRequest.id);
                pendingFocusRequestRef.current = null;
                setIsFocusNavigating(false);
              }
            }
          }

          if (focusedPersonIdRef.current) {
            focusPersonById(focusedPersonIdRef.current, { openDialog: false });
          }
          applyFocusedSelectionToElements();
        } else {
          setCityGroups([]);
          setFocusedPersonId(null);
          setDialogPersonId(null);

          const scale = personScaleForZoom(activeMap.getZoom());
          const spreadCoordinates =
            json.semanticLevel === "state" && personNodes.length > 1
              ? resolveSpreadCoordinates(
                  personNodes,
                  {
                    project: ({ lat, lng }) => {
                      const point = activeMap.project([lng, lat]);
                      return { x: point.x, y: point.y };
                    },
                    unproject: ({ x, y }) => {
                      const coordinate = activeMap.unproject([x, y]);
                      return { lat: coordinate.lat, lng: coordinate.lng };
                    },
                  },
                  {
                    collisionRadiusPx: 44,
                    baseRadiusPx: 30,
                    ringStepPx: 20,
                    ringSize: 8,
                  },
                )
              : new Map<string, { lat: number; lng: number }>();

          for (const node of personNodes) {
            const element = createPersonElement(node, scale, () => {
              setFocusedPersonId(node.id);
              setDialogPersonId(node.id);
              const mapInstance = mapRef.current;
              if (mapInstance) {
                mapInstance.flyTo({
                  center: [node.lng, node.lat],
                  zoom: Math.max(mapInstance.getZoom(), FOCUS_PERSON_ZOOM),
                  speed: 0.78,
                  curve: 1.1,
                });
              }
            });
            applyTierClass(element, scale);
            personMarkerElementsRef.current.set(node.id, element);

            const coordinate = spreadCoordinates.get(node.id) ?? {
              lat: node.lat,
              lng: node.lng,
            };

            const marker = new maplibregl.Marker({ element, anchor: "center" })
              .setLngLat([coordinate.lng, coordinate.lat])
              .addTo(activeMap);

            markersRef.current.push(marker);
          }
          applyFocusedSelectionToElements();
        }
      } catch (error) {
        if (
          !(error instanceof DOMException && error.name === "AbortError") &&
          !(error instanceof Error && error.name === "AbortError")
        ) {
          console.error("Map data refresh failed", error);
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    };

    const scheduler = createMoveEndScheduler(() => loadNodesRef.current(), 220);

    const handleRender = () => {
      drawAggregateCanvas();
    };

    const handleZoom = () => {
      if (semanticLevelRef.current !== "city") {
        applyScaleToCapsules(personScaleForZoom(map.getZoom()));
      }
      if (semanticLevelRef.current === "city" && map.getZoom() < 7) {
        clearMarkers();
        clearCityBoxScrollFocus();
        setCityGroups([]);
        setFocusedPersonId(null);
        setDialogPersonId(null);
        semanticLevelRef.current = "state";
        setSemanticLevel("state");
      }
    };

    const handleMouseMove = (event: maplibregl.MapMouseEvent) => {
      const hit = findAggregateHit(event.point.x, event.point.y);
      const tooltip = aggregateTooltipRef.current;
      if (!tooltip || !hit) {
        hideAggregateTooltip();
        return;
      }

      tooltip.textContent = `${hit.node.label} (${hit.node.count})`;
      tooltip.style.left = `${hit.x}px`;
      tooltip.style.top = `${hit.y + hit.radius + 9}px`;
      tooltip.dataset.visible = "true";
    };

    const handleMouseLeave = () => {
      hideAggregateTooltip();
    };

    const handleMapClick = (event: maplibregl.MapMouseEvent) => {
      if (dialogPersonIdRef.current) {
        setDialogPersonId(null);
        return;
      }

      const hit = findAggregateHit(event.point.x, event.point.y);
      if (!hit) {
        clearCityBoxScrollFocus();
        setDialogPersonId(null);
        return;
      }

      clearCityBoxScrollFocus();
      setDialogPersonId(null);

      if (hit.node.aggregateLevel === "city" && hit.node.countryCode === "US") {
        map.flyTo({
          center: [hit.node.lng, hit.node.lat],
          zoom: 10.8,
          speed: 0.8,
          curve: 1.12,
        });
        return;
      }

      map.flyTo({
        center: [hit.node.lng, hit.node.lat],
        zoom: semanticZoomToNextLevel(semanticLevelRef.current, hit.node),
        speed: 0.8,
        curve: 1.12,
      });
    };

    const handleLoad = () => {
      void loadNodesRef.current();
      onReadyRef.current?.({
        flyTo: (lat, lng, zoom) => {
          map.flyTo({
            center: [lng, lat],
            zoom,
            speed: 0.75,
            curve: 1.1,
          });
        },
        focusPerson: (id, lat, lng) => {
          setDialogPersonId(null);
          setIsFocusNavigating(true);
          pendingFocusRequestRef.current = { id, openDialog: true, arrived: false };

          const foundNow = focusPersonById(id, { openDialog: false });
          if (!foundNow) {
            setFocusedPersonId(id);
          }

          map.once("moveend", () => {
            const pending = pendingFocusRequestRef.current;
            if (!pending || pending.id !== id) {
              setIsFocusNavigating(false);
              return;
            }
            pending.arrived = true;
            setIsFocusNavigating(false);
            void loadNodesRef.current();
          });

          map.flyTo({
            center: [lng, lat],
            zoom: Math.max(map.getZoom(), FOCUS_PERSON_ZOOM),
            speed: 0.8,
            curve: 1.1,
          });

          if (focusRefreshTimeoutRef.current !== null) {
            window.clearTimeout(focusRefreshTimeoutRef.current);
          }
          focusRefreshTimeoutRef.current = window.setTimeout(() => {
            const pending = pendingFocusRequestRef.current;
            if (pending && pending.id === id && !pending.arrived) {
              pending.arrived = true;
              setIsFocusNavigating(false);
            }
            void loadNodesRef.current();
            focusRefreshTimeoutRef.current = null;
          }, 2400);
        },
        refresh: () => {
          void loadNodesRef.current();
        },
      });
    };

    const handleMoveEnd = () => {
      scheduler.schedule();
    };

    map.on("load", handleLoad);
    map.on("render", handleRender);
    map.on("resize", handleRender);
    map.on("zoom", handleZoom);
    map.on("moveend", handleMoveEnd);
    map.on("mousemove", handleMouseMove);
    map.on("mouseleave", handleMouseLeave);
    map.on("click", handleMapClick);

    return () => {
      scheduler.cancel();
      if (focusRefreshTimeoutRef.current !== null) {
        window.clearTimeout(focusRefreshTimeoutRef.current);
      }
      focusRefreshTimeoutRef.current = null;
      setIsFocusNavigating(false);
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      aggregateNodesRef.current = [];
      aggregateHitsRef.current = [];
      hideAggregateTooltip();
      clearMarkers();
      map.off("load", handleLoad);
      map.off("render", handleRender);
      map.off("resize", handleRender);
      map.off("zoom", handleZoom);
      map.off("moveend", handleMoveEnd);
      map.off("mousemove", handleMouseMove);
      map.off("mouseleave", handleMouseLeave);
      map.off("click", handleMapClick);
      map.remove();
      mapRef.current = null;
    };
  }, [
    applyScaleToCapsules,
    applyFocusedSelectionToElements,
    clearCityBoxScrollFocus,
    clearMarkers,
    drawAggregateCanvas,
    findAggregateHit,
    focusPersonById,
    hideAggregateTooltip,
    slug,
  ]);

  return (
    <section className="wgeu-map-shell">
      <div className="wgeu-map-meta">
        <span className="wgeu-map-level">
          Level: <strong>{semanticLevel.toUpperCase()}</strong>
        </span>
        <span className={clsx("wgeu-map-status", isLoading && "wgeu-map-status-loading")}>
          {isFocusNavigating ? "Navigating to person…" : isLoading ? "Refreshing map…" : "Live"}
        </span>
      </div>
      <div className="wgeu-map-stage">
        <div ref={containerRef} className="wgeu-map-canvas" />
        <canvas ref={aggregateCanvasRef} className="wgeu-aggregate-overlay" />
        <div ref={aggregateTooltipRef} className="wgeu-aggregate-tooltip" />

        {modalPerson && modalCity ? (
          <div
            className="wgeu-person-modal-backdrop"
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
              setDialogPersonId(null);
            }}
          >
            <article
              className="wgeu-person-modal"
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <header className="wgeu-person-modal-head">
                <p>{modalCity.label}</p>
                <button
                  type="button"
                  className="wgeu-icon-close"
                  onClick={() => {
                    setDialogPersonId(null);
                  }}
                >
                  Close
                </button>
              </header>

              <div className="wgeu-person-modal-body">
                <span className="wgeu-person-modal-avatar-wrap">
                  {modalPerson.profilePhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={modalPerson.profilePhotoUrl}
                      alt={`${modalPerson.displayName} profile`}
                      className="wgeu-person-modal-avatar"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="wgeu-person-modal-avatar wgeu-person-modal-avatar-fallback">
                      {getInitials(modalPerson.displayName)}
                    </span>
                  )}
                </span>

                <div className="wgeu-person-modal-copy">
                  <h3>{modalPerson.displayName}</h3>
                  <div className="wgeu-person-modal-company-row">
                    <span className="wgeu-person-modal-company-logo-wrap">
                      {modalPerson.companyLogoUrl && !modalCompanyLogoFailed ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={modalPerson.companyLogoUrl}
                          alt={`${modalPerson.companyName} logo`}
                          className="wgeu-person-modal-company-logo"
                          referrerPolicy="no-referrer"
                          onError={() => {
                            setModalCompanyLogoFailed(true);
                          }}
                        />
                      ) : (
                        <span className="wgeu-person-modal-company-logo-fallback">
                          {getInitials(modalPerson.companyName)}
                        </span>
                      )}
                    </span>
                    <span>{modalPerson.companyName}</span>
                  </div>
                  <p>
                    {modalPerson.city || "Unknown City"}
                    {modalPerson.stateRegion ? `, ${modalPerson.stateRegion}` : ""}
                    {modalPerson.countryName ? ` · ${modalPerson.countryName}` : ""}
                  </p>
                  <a href={modalPerson.linkedinUrl} target="_blank" rel="noreferrer">
                    Open LinkedIn
                  </a>
                </div>
              </div>

              <footer className="wgeu-person-modal-foot">
                <button
                  type="button"
                  className="wgeu-button wgeu-button-secondary"
                  onClick={() => {
                    moveModalCursor(-1);
                  }}
                >
                  Previous
                </button>
                <span>
                  {modalPersonIndex + 1} / {modalCity.members.length}
                </span>
                <button
                  type="button"
                  className="wgeu-button wgeu-button-secondary"
                  onClick={() => {
                    moveModalCursor(1);
                  }}
                >
                  Next
                </button>
              </footer>
            </article>
          </div>
        ) : null}
      </div>
    </section>
  );
}
