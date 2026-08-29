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
  setMaxBounds: (bounds: unknown) => void;
  setMinZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
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

/**
 * The country, corner to corner. Used to stop the map wandering: without it a
 * stray pinch leaves the walk behind and fills the screen with Asia.
 */
const INDIA: [number, number][] = [[6.4, 67.8], [35.9, 97.6]];

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
  const frameRef = useRef<(() => void) | null>(null);
  // Set the moment the map is touched, and never unset: after that the map
  // belongs to the reader, and nothing re-frames it behind their back.
  const touchedRef = useRef(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then(L => {
      if (cancelled) return;
      if (!L || !holder.current) { setFailed(true); return; }

      leafletRef.current = L;
      const map = L.map(holder.current, { scrollWheelZoom: !compact, zoomControl: false });
      map.setView([22.5, 79], 5);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: "&copy; OpenStreetMap",
      }).addTo(map);
      layerRef.current = L.layerGroup();
      layerRef.current.addTo(map);
      // Loose enough not to fight an ordinary drag, tight enough that a stray
      // pinch cannot leave the walk behind and fill the screen with Asia.
      map.setMaxBounds(L.latLngBounds(INDIA).pad(0.6));
      mapRef.current = map;
      setReady(true);
    });

    // The hero panel is sized in viewport units, so it changes on rotation and
    // on the address bar sliding away. Each of those needs the framing redone -
    // but only while the reader has not taken hold of the map themselves, since
    // on a phone the address bar slides on every scroll, and re-framing then
    // would snatch back a zoom made a second earlier.
    const holderNow = holder.current;
    const touched = () => { touchedRef.current = true; };
    holderNow?.addEventListener("pointerdown", touched, { passive: true });
    holderNow?.addEventListener("wheel", touched, { passive: true });

    const observer = holderNow && typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => { if (!touchedRef.current) frameRef.current?.(); })
      : null;
    if (observer && holderNow) observer.observe(holderNow);

    return () => {
      cancelled = true;
      observer?.disconnect();
      holderNow?.removeEventListener("pointerdown", touched);
      holderNow?.removeEventListener("wheel", touched);
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

    // A twelve per cent margin around a line already the length of the country
    // pushed the whole of India into the middle of the frame with the
    // neighbours around it. Three per cent is enough to keep Kanyakumari and
    // Srinagar off the very edge.
    const bounds = L.latLngBounds(line).pad(0.03);
    const frame = () => {
      // Measure first. Fitting a container the map has not measured yet picks a
      // zoom for the wrong size - always too far out - and calling
      // invalidateSize afterwards resizes without re-fitting, so the map is
      // left sitting at that wrong zoom. That is the whole bug.
      map.setMinZoom(2);
      map.invalidateSize();
      map.fitBounds(bounds);
      // Once framed, that is as far out as this map ever needs to go.
      map.setMinZoom(map.getZoom());
    };
    frameRef.current = frame;
    if (!touchedRef.current) frame();
    // The hero's height settles a frame or two later on a phone.
    const settle = setTimeout(() => { if (!touchedRef.current) frame(); }, 200);
    return () => clearTimeout(settle);
  }, [ready, stops, journey]);

  if (failed) return <RouteMap stops={stops} journey={journey} compact={compact} />;

  // Any of these means the reader is working the map on purpose, so it must
  // stop re-framing itself from under them.
  const hold = () => { touchedRef.current = true; };

  return (
    <div className={compact ? "live-map compact" : "live-map"}>
      <div ref={holder} className="live-map-canvas" />
      {!ready && <div className="live-map-loading">Loading the map…</div>}
      <div className="map-controls">
        <button type="button" aria-label="Zoom in" onClick={() => { hold(); mapRef.current?.zoomIn(); }}>+</button>
        <button type="button" aria-label="Zoom out" onClick={() => { hold(); mapRef.current?.zoomOut(); }}>−</button>
        <button
          className="locate-button"
          type="button"
          aria-label="Centre on Navneet"
          onClick={() => { hold(); mapRef.current?.setView([journey.lat, journey.lon], 11); }}
        >⌖</button>
      </div>
    </div>
  );
}
