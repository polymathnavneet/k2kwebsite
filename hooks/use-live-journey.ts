"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startLivePoll } from "@/lib/live-poll";
import { defaultJourney, defaultRoute } from "@/lib/defaults";
import type { GpsTrailPlace, GpsTrailPoint, Journey, WalkRoute } from "@/lib/types";

/** One source of live state for every public page. */

export function useLiveJourney(options: { trail?: boolean } = {}) {
  const includeTrail = options.trail === true;
  const [journey, setJourney] = useState<Journey>(defaultJourney);
  const [route, setRoute] = useState<WalkRoute>(defaultRoute);
  const [trail, setTrail] = useState<GpsTrailPoint[]>([]);
  const [places, setPlaces] = useState<GpsTrailPlace[]>([]);
  const [updatedAt, setUpdatedAt] = useState<number>(0);

  const feeds = useRef<ReturnType<typeof startLivePoll>[]>([]);
  const refresh = useCallback(() => Promise.all(feeds.current.map(feed => feed.refresh())), []);

  useEffect(() => {
    const current = [
      startLivePoll<Journey>("/api/journey", data => { setJourney(data); setUpdatedAt(Date.now()); }),
      startLivePoll<WalkRoute>("/api/route", setRoute),
    ];
    if (includeTrail) current.push(startLivePoll<{ points?: GpsTrailPoint[]; places?: GpsTrailPlace[] }>("/api/gps", data => {
      setTrail(Array.isArray(data.points) ? data.points : []);
      setPlaces(Array.isArray(data.places) ? data.places : []);
    }));
    feeds.current = current;
    return () => {
      current.forEach(feed => feed.stop());
      feeds.current = [];
    };
  }, [includeTrail]);

  return { journey, route, trail, places, refresh, updatedAt };
}
