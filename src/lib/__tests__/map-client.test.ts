import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMapDataUrl, createMoveEndScheduler } from "@/lib/map-client";

describe("buildMapDataUrl", () => {
  it("builds a stable encoded URL for map-data requests", () => {
    const url = buildMapDataUrl("my slug", 4.2762, [-97.8, 30.1, -97.5, 30.4]);
    expect(url).toContain("/api/groups/my%20slug/map-data?");
    expect(url).toContain("zoom=4.276");
    expect(url).toContain("bbox=-97.8%2C30.1%2C-97.5%2C30.4");
  });

  it("includes debugStateDots flag when enabled", () => {
    const url = buildMapDataUrl(
      "my slug",
      2.2,
      [-125, 24, -66, 49],
      { debugStateDots: true },
    );
    expect(url).toContain("debugStateDots=1");
  });
});

describe("createMoveEndScheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces rapid schedule calls", async () => {
    vi.useFakeTimers();
    const loader = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const scheduler = createMoveEndScheduler(loader, 200);

    scheduler.schedule();
    scheduler.schedule();
    scheduler.schedule();
    expect(loader).toHaveBeenCalledTimes(0);

    vi.advanceTimersByTime(199);
    expect(loader).toHaveBeenCalledTimes(0);

    vi.advanceTimersByTime(1);
    await Promise.resolve();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("cancels scheduled execution", () => {
    vi.useFakeTimers();
    const loader = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const scheduler = createMoveEndScheduler(loader, 150);

    scheduler.schedule();
    scheduler.cancel();
    vi.advanceTimersByTime(200);
    expect(loader).toHaveBeenCalledTimes(0);
  });
});
