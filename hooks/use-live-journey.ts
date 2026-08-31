"use client";

import { useCallback, useEffect, useState } from "react";
import { defaultJourney, defaultRoute } from "@/lib/defaults";
import type { GpsTrailPoint, Journey, WalkRoute } from "@/lib/types";

/** One source of live state for every public page. */
const REFRESH_MS = 45000;

export function useLiveJourney(options: { trail?: boolean } = {}) {
  const includeTrail = options.trail === true;
  const [journey, setJourney] = useState<Journey>(defaultJourney);
  const [route, setRoute] = useState<WalkRoute>(defaultRoute);
  const [trail, setTrail] = useState<GpsTrailPoint[]>([]);
  const [updatedAt, setUpdatedAt] = useState<number>(0);

  const refresh = useCallback(async () => {
    try {
      const requests = [
        fetch("/api/journey", { cache: "no-store" }),
        fetch("/api/route", { cache: "no-store" }),
      ];
      if (includeTrail) requests.push(fetch("/api/gps", { cache: "no-store" }));

      const [journeyResponse, routeResponse, trailResponse] = await Promise.all(requests);
      if (journeyResponse.ok) setJourney(await journeyResponse.json());
      if (routeResponse.ok) setRoute(await routeResponse.json());
      if (includeTrail && trailResponse?.ok) {
        const data = await trailResponse.json() as { points?: GpsTrailPoint[] };
        setTrail(Array.isArray(data.points) ? data.points : []);
      }
      setUpdatedAt(Date.now());
    } catch {
      // Offline: keep showing the last good state rather than blanking the page.
    }
  }, [includeTrail]);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, REFRESH_MS);
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

  return { journey, route, trail, refresh, updatedAt };
}
