"use client";

import clsx from "clsx";
import maplibregl, { LngLatBoundsLike } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import { getInitials } from "@/lib/avatar";
import { buildMapDataUrl, createMoveEndScheduler } from "@/lib/map-client";
import { resolveSpreadCoordinates } from "@/lib/map-overlap";
import type { AggregateMapNode, MapNode, PersonMapNode } from "@/types/domain";

export type MapController = {
  flyTo: (lat: number, lng: number, zoom: number) => void;
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

const defaultStyleUrl =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL ??
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

function getAggregateSize(node: AggregateMapNode): number {
  const base = node.aggregateLevel === "country" ? 10 : 12;
  return Math.min(24, base + Math.log2(node.count + 1) * 2.2);
}

function createAggregateElement(node: AggregateMapNode) {
  const root = document.createElement("button");
  root.type = "button";
  root.className = "wgeu-aggregate-marker";
  const size = getAggregateSize(node);
  root.style.width = `${size}px`;
  root.style.height = `${size}px`;
  root.title = `${node.label} (${node.count})`;

  const count = document.createElement("span");
  count.className = "wgeu-aggregate-count";
  count.textContent = node.count > 99 ? "99+" : String(node.count);
  root.appendChild(count);

  const label = document.createElement("span");
  label.className = "wgeu-aggregate-label";
  label.textContent = node.label;
  root.appendChild(label);

  return root;
}

function createPersonElement(node: PersonMapNode) {
  const card = document.createElement("article");
  card.className = "wgeu-person-marker";
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

export function WorldMap({ slug, onReady }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const loadNodesRef = useRef<() => Promise<void>>(async () => {});
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const onReadyRef = useRef(onReady);
  const [semanticLevel, setSemanticLevel] = useState<
    "world" | "country" | "state" | "city"
  >("world");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  const clearMarkers = useCallback(() => {
    for (const marker of markersRef.current) {
      marker.remove();
    }
    markersRef.current = [];
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: defaultStyleUrl,
      center: [-98.5795, 39.8283],
      zoom: 2.2,
      minZoom: 1.5,
      maxZoom: 12.5,
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
        const response = await fetch(buildMapDataUrl(slug, zoom, bbox), {
          cache: "no-store",
          signal: controller.signal,
        });
        const json = (await response.json()) as MapDataResponse & { error?: string };
        if (!response.ok || !Array.isArray(json.nodes)) {
          return;
        }
        if (requestId !== requestIdRef.current) {
          return;
        }

        setSemanticLevel(json.semanticLevel);
        clearMarkers();
        const personNodes = json.nodes.filter(
          (node): node is PersonMapNode => node.kind === "person",
        );
        const spreadCoordinates =
          json.semanticLevel === "city" && personNodes.length > 1
            ? resolveSpreadCoordinates(personNodes, {
                project: ({ lat, lng }) => {
                  const point = activeMap.project([lng, lat]);
                  return { x: point.x, y: point.y };
                },
                unproject: ({ x, y }) => {
                  const coordinate = activeMap.unproject([x, y]);
                  return { lat: coordinate.lat, lng: coordinate.lng };
                },
              })
            : new Map<string, { lat: number; lng: number }>();

        for (const node of json.nodes) {
          const element =
            node.kind === "person"
              ? createPersonElement(node as PersonMapNode)
              : createAggregateElement(node as AggregateMapNode);
          const coordinate =
            node.kind === "person"
              ? spreadCoordinates.get(node.id) ?? { lat: node.lat, lng: node.lng }
              : { lat: node.lat, lng: node.lng };

          const marker = new maplibregl.Marker({
            element,
            anchor: "center",
          })
            .setLngLat([coordinate.lng, coordinate.lat])
            .addTo(activeMap);

          markersRef.current.push(marker);
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
        refresh: () => {
          void loadNodesRef.current();
        },
      });
    };

    const handleMoveEnd = () => {
      scheduler.schedule();
    };

    map.on("load", handleLoad);
    map.on("moveend", handleMoveEnd);

    return () => {
      scheduler.cancel();
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      clearMarkers();
      map.off("load", handleLoad);
      map.off("moveend", handleMoveEnd);
      map.remove();
      mapRef.current = null;
    };
  }, [clearMarkers, slug]);

  return (
    <section className="wgeu-map-shell">
      <div className="wgeu-map-meta">
        <span className="wgeu-map-level">
          Level: <strong>{semanticLevel.toUpperCase()}</strong>
        </span>
        <span className={clsx("wgeu-map-status", isLoading && "wgeu-map-status-loading")}>
          {isLoading ? "Refreshing map…" : "Live"}
        </span>
      </div>
      <div ref={containerRef} className="wgeu-map-canvas" />
    </section>
  );
}
