"use client";

import { useCallback, useEffect, useState } from "react";
import { defaultJourney, defaultRoute } from "@/lib/defaults";
import type { Journey, WalkRoute } from "@/lib/types";

/**
 * One source of live state for every public page.
 *
 * A GPS sync changes where the walk is, which stop is next, how far it has got
 * and every arrival date after it. Before this, each page fetched once on load
 * and then went stale: a reader watching the map saw nothing move until they
 * reloaded. Now every page that shows any of it refreshes on the same beat, and
 * again whenever the tab is brought back to the front.
 */

const REFRESH_MS = 45000;

export function useLiveJourney() {
  const [journey, setJourney] = useState<Journey>(defaultJourney);
  const [route, setRoute] = useState<WalkRoute>(defaultRoute);
  const [updatedAt, setUpdatedAt] = useState<number>(0);

  const refresh = useCallback(async () => {
    try {
      const [journeyResponse, routeResponse] = await Promise.all([
        fetch("/api/journey", { cache: "no-store" }),
        fetch("/api/route", { cache: "no-store" }),
      ]);
      if (journeyResponse.ok) setJourney(await journeyResponse.json());
      if (routeResponse.ok) setRoute(await routeResponse.json());
      setUpdatedAt(Date.now());
    } catch {
      // Offline: keep showing the last good state rather than blanking the page.
    }
  }, []);

  useEffect(() => {
    // The first fetch is the first tick of the subscription rather than a call
    // in the effect body, which would set state during the same render pass.
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, REFRESH_MS);
    // Coming back to the tab should show the current position, not a stale one.
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    addEventListener("online", refresh);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      removeEventListener("online", refresh);
    };
  }, [refresh]);

  return { journey, route, refresh, updatedAt };
}
