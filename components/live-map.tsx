"use client";

import { useEffect, useRef, useState } from "react";
import { RouteMap } from "./route-map";
import type { Journey, RouteStop } from "@/lib/types";

/**
 * A real, movable map.
 *
 * The drawn SVG it replaces was a fixed picture: the same shape at every zoom,
 * with no ground underneath it. This loads actual map tiles, so the route can
 * be pinched, dragged and followed down to street level, and every stop is a
 * marker you can tap.
 *
 * Leaflet is loaded from a CDN rather than bundled, so the site's own build
 * stays untouched. If it cannot load - no signal, blocked network - the drawn
 * map is shown instead, which is the whole point of keeping it.
 */

type LeafletMap = {
  setView: (centre: [number, number], zoom: number) => LeafletMap;
  fitBounds: (bounds: unknown, options?: unknown) => void;
  remove: () => void;
  invalidateSize: () => void;
  getZoom: () => number;
};

type Leaflet = {
  map: (element: HTMLElement, options?: unknown) => LeafletMap;
  tileLayer: (url: string, options?: unknown) => { addTo: (map: unknown) => void };
  polyline: (points: [number, number][], options?: unknown) => { addTo: (layer: unknown) => void };
  circleMarker: (point: [number, number], options?: unknown) => { addTo: (layer: unknown) => void; bindPopup: (html: string) => unknown };
  marker: (point: [number, number], options?: unknown) => { addTo: (layer: unknown) => void; bindPopup: (html: string) => unknown };
  divIcon: (options: unknown) => unknown;
  layerGroup: () => { addTo: (map: unknown) => void; clearLayers: () => void };
  latLngBounds: (points: [number, number][]) => { pad: (amount: number) => unknown };
};

const CDN = "https://unpkg.com/leaflet@1.9.4/dist";

let loading: Promise<Leaflet | null> | null = null;

function loadLeaflet(): Promise<Leaflet | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const existing = (window as unknown as { L?: Leaflet }).L;
  if (existing) return Promise.resolve(existing);
  if (loading) return loading;

  loading = new Promise<Leaflet | null>(resolve => {
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = `${CDN}/leaflet.css`;
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = `${CDN}/leaflet.js`;
    script.async = true;
    script.onload = () => resolve((window as unknown as { L?: Leaflet }).L ?? null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
    // Do not leave the map blank forever on a bad connection.
    setTimeout(() => resolve((window as unknown as { L?: Leaflet }).L ?? null), 8000);
  });
  return loading;
}

const escapeHtml = (value: string) =>
  String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function LiveMap({ stops, journey, compact = false }: { stops: RouteStop[]; journey: Journey; compact?: boolean }) {
  const holder = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<{ addTo: (map: unknown) => void; clearLayers: () => void } | null>(null);
  const leafletRef = useRef<Leaflet | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then(L => {
      if (cancelled) return;
      if (!L || !holder.current) { setFailed(true); return; }

      leafletRef.current = L;
      const map = L.map(holder.current, { scrollWheelZoom: !compact, zoomControl: !compact });
      map.setView([22.5, 79], 5);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: "&copy; OpenStreetMap",
      }).addTo(map);
      layerRef.current = L.layerGroup();
      layerRef.current.addTo(map);
      mapRef.current = map;
      setReady(true);
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [compact]);

  // Redraw whenever the route or the position moves.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!ready || !L || !map || !layer) return;

    layer.clearLayers();
    const usable = stops.filter(stop => Number.isFinite(stop.lat) && Number.isFinite(stop.lon) && (stop.lat !== 0 || stop.lon !== 0));
    if (!usable.length) return;

    const along = journey.routeProgressKm ?? journey.distanceTotal ?? 0;
    const live = journey.mode === "live";
    const line = usable.map(stop => [stop.lat, stop.lon] as [number, number]);

    // The whole planned route, dashed.
    L.polyline(line, { color: "#151716", weight: 3, dashArray: "6 8", opacity: .75 }).addTo(layer);

    // The part already walked, solid.
    if (live && along > 0) {
      const walked = usable.filter(stop => stop.km <= along).map(stop => [stop.lat, stop.lon] as [number, number]);
      if (live) walked.push([journey.lat, journey.lon]);
      if (walked.length > 1) L.polyline(walked, { color: "#e54a2a", weight: 5 }).addTo(layer);
    }

    usable.forEach(stop => {
      const reached = live && stop.km <= along;
      const marker = L.circleMarker([stop.lat, stop.lon], {
        radius: 5,
        color: "#151716",
        weight: 2,
        fillColor: reached ? "#e54a2a" : "#f2efe7",
        fillOpacity: 1,
      });
      marker.addTo(layer);
      marker.bindPopup(
        `<strong>${escapeHtml(stop.name)}</strong><br>${escapeHtml(stop.state)} · ${stop.km.toLocaleString("en-IN")} km` +
        (reached ? "<br>Reached" : "") +
        `<br><a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${stop.name}, ${stop.state}`)}">Open in Google Maps ↗</a>`
      );
    });

    // Where Navneet is now.
    const here = L.marker([journey.lat, journey.lon], {
      icon: L.divIcon({ className: "here-marker", html: "<span></span>", iconSize: [22, 22], iconAnchor: [11, 11] }),
    });
    here.addTo(layer);
    here.bindPopup(`<strong>${escapeHtml(journey.currentPlace || "Here")}</strong><br>${live ? "Live position" : "Preparation base"}`);

    map.fitBounds(L.latLngBounds(line).pad(0.12));
    setTimeout(() => map.invalidateSize(), 120);
  }, [ready, stops, journey]);

  if (failed) return <RouteMap stops={stops} journey={journey} compact={compact} />;

  return (
    <div className={compact ? "live-map compact" : "live-map"}>
      <div ref={holder} className="live-map-canvas" />
      {!ready && <div className="live-map-loading">Loading the map…</div>}
      <button
        className="locate-button"
        type="button"
        aria-label="Centre on Navneet"
        onClick={() => mapRef.current?.setView([journey.lat, journey.lon], 11)}
      >⌖</button>
    </div>
  );
}
