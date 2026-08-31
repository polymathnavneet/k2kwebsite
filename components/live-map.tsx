"use client";

import { useEffect, useRef, useState } from "react";
import { RouteMap } from "./route-map";
import type { GpsTrailPoint, Journey, RouteStop } from "@/lib/types";

/**
 * A real, movable map whose public line is the GPS evidence trail.
 *
 * Planned roads are intentionally not drawn. Navneet can take whichever lane,
 * detour or city he actually walks through; the map follows the recording and
 * nothing else gets to compete with it.
 */

type LeafletMap = {
  setView: (centre: [number, number], zoom: number) => LeafletMap;
  fitBounds: (bounds: unknown, options?: unknown) => void;
  setMaxBounds: (bounds: unknown) => void;
  setMinZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  dragging: { enable: () => void; disable: () => void };
  scrollWheelZoom: { enable: () => void; disable: () => void };
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
    setTimeout(() => resolve((window as unknown as { L?: Leaflet }).L ?? null), 8000);
  });
  return loading;
}

const escapeHtml = (value: string) =>
  String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function LiveMap({ stops, journey, trail = [], compact = false, active = false }: { stops: RouteStop[]; journey: Journey; trail?: GpsTrailPoint[]; compact?: boolean; active?: boolean }) {
  const holder = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<{ addTo: (map: unknown) => void; clearLayers: () => void } | null>(null);
  const leafletRef = useRef<Leaflet | null>(null);
  const frameRef = useRef<(() => void) | null>(null);
  const touchedRef = useRef(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const [hinted, setHinted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then(L => {
      if (cancelled) return;
      if (!L || !holder.current) { setFailed(true); return; }

      leafletRef.current = L;
      const map = L.map(holder.current, { dragging: false, scrollWheelZoom: false, zoomControl: false });
      map.setView([journey.lat, journey.lon], active ? 8 : 6);

      // CARTO's international basemap uses Latin/English labels far more
      // consistently than the default local-language raster tiles. The data is
      // still OpenStreetMap; only the label styling changes.
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
      }).addTo(map);

      layerRef.current = L.layerGroup();
      layerRef.current.addTo(map);
      // Keep the useful context around India without allowing a stray gesture
      // to turn the page into a map of half of Asia.
      map.setMaxBounds(L.latLngBounds(INDIA).pad(0.15));
      mapRef.current = map;
      setReady(true);
    });

    const holderNow = holder.current;
    const touched = () => { touchedRef.current = true; setHinted(true); };
    holderNow?.addEventListener("pointerdown", touched, { passive: true });
    holderNow?.addEventListener("wheel", touched, { passive: true });
    holderNow?.addEventListener("touchstart", touched, { passive: true });

    const observer = holderNow && typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => { if (!touchedRef.current) frameRef.current?.(); })
      : null;
    if (observer && holderNow) observer.observe(holderNow);

    const giveUp = setTimeout(() => setHinted(true), 9000);

    return () => {
      cancelled = true;
      clearTimeout(giveUp);
      observer?.disconnect();
      holderNow?.removeEventListener("pointerdown", touched);
      holderNow?.removeEventListener("wheel", touched);
      holderNow?.removeEventListener("touchstart", touched);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [compact]);

  // Redraw only from the evidence trail. Route stops remain available to the
  // rest of the site for forecasts, but they never draw a second "should have
  // walked" line on top of what actually happened.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!ready || !L || !map || !layer) return;

    layer.clearLayers();

    const actual = active
      ? trail
          .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lon))
          .map(point => [point.lat, point.lon] as [number, number])
      : [];

    if (actual.length > 1) {
      L.polyline(actual, { color: "#e54a2a", weight: 5, opacity: .95 }).addTo(layer);
    }

    if (actual.length) {
      L.circleMarker(actual[0], {
        radius: 5,
        color: "#151716",
        weight: 2,
        fillColor: "#e54a2a",
        fillOpacity: 1,
      }).addTo(layer).bindPopup("<strong>First recorded step</strong>");
    }

    const here = L.marker([journey.lat, journey.lon], {
      icon: L.divIcon({ className: "here-marker", html: "<span></span>", iconSize: [22, 22], iconAnchor: [11, 11] }),
    });
    here.addTo(layer);
    here.bindPopup(`<strong>${escapeHtml(journey.currentPlace || "Here")}</strong><br>${active ? "Latest GPS position" : "Preparation position"}`);

    const frame = () => {
      map.setMinZoom(2);
      map.invalidateSize();
      if (actual.length > 1) {
        map.fitBounds(L.latLngBounds(actual).pad(0.06));
        map.setMinZoom(map.getZoom());
      } else {
        map.setView([journey.lat, journey.lon], active ? 9 : 6);
      }
    };
    frameRef.current = frame;
    if (!touchedRef.current) frame();
    const settle = setTimeout(() => { if (!touchedRef.current) frame(); }, 200);
    return () => clearTimeout(settle);
  }, [ready, trail, journey, active]);

  if (failed) return <RouteMap stops={stops} journey={journey} trail={trail} compact={compact} active={active} />;

  const hold = () => { touchedRef.current = true; setHinted(true); };

  function engage() {
    hold();
    setEngaged(true);
    mapRef.current?.dragging.enable();
    mapRef.current?.scrollWheelZoom.enable();
  }

  return (
    <div className={compact ? "live-map compact" : "live-map"}>
      <div ref={holder} className="live-map-canvas" />
      {!ready && <div className="live-map-loading">Loading the map…</div>}
      {ready && !engaged && !compact && (
        <button className="map-engage" type="button" onClick={engage}>
          <span>Tap to move the map</span>
        </button>
      )}
      <div className="map-controls">
        <button type="button" aria-label="Zoom in" onClick={() => { hold(); mapRef.current?.zoomIn(); }}>+</button>
        <button type="button" aria-label="Zoom out" onClick={() => { hold(); mapRef.current?.zoomOut(); }}>−</button>
        <button
          className="locate-button"
          type="button"
          aria-label="Centre on Navneet"
          onClick={() => { hold(); mapRef.current?.setView([journey.lat, journey.lon], 11); }}
        >⌖</button>
        {!hinted && (
          <p className="map-hint" aria-hidden="true">
            <span className="on-touch">Pinch to zoom</span>
            <span className="on-pointer">Use + and −</span>
          </p>
        )}
      </div>
    </div>
  );
}
