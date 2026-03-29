type BBox = [number, number, number, number];

export function buildMapDataUrl(slug: string, zoom: number, bbox: BBox): string {
  const params = new URLSearchParams({
    zoom: zoom.toFixed(3),
    bbox: bbox.join(","),
  });
  return `/api/groups/${encodeURIComponent(slug)}/map-data?${params.toString()}`;
}

export function createMoveEndScheduler(
  loader: () => Promise<void>,
  delayMs = 220,
): {
  schedule: () => void;
  cancel: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    schedule() {
      if (timer !== null) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        void loader();
      }, delayMs);
    },
    cancel() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

