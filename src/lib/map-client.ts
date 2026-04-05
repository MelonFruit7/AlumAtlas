type BBox = [number, number, number, number];

type BuildMapDataUrlOptions = {
  debugStateDots?: boolean;
};

export function buildMapDataUrl(
  slug: string,
  zoom: number,
  bbox: BBox,
  options: BuildMapDataUrlOptions = {},
): string {
  const params = new URLSearchParams();
  params.set("zoom", zoom.toFixed(3));
  params.set("bbox", bbox.join(","));
  if (options.debugStateDots) {
    params.set("debugStateDots", "1");
  }
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
