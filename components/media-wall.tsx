"use client";

import { useEffect, useState } from "react";
import { INSTAGRAM_HANDLE, INSTAGRAM_URL, embedUrl } from "@/lib/embed";
import type { MediaItem } from "@/lib/types";

/**
 * The gallery. Instagram and YouTube are shown through their own embed pages,
 * which need no API key and no access token, so a pasted link is the whole
 * feature. Nothing is uploaded to this site.
 */
export function MediaWall({ limit }: { limit?: number }) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/media")
      .then(response => response.json())
      .then(data => { setItems(data.rows || []); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  const shown = limit ? items.slice(0, limit) : items;

  return <section className="media-wall shell">
    <div className="media-head">
      <div>
        <div className="section-tag">FROM THE ROAD</div>
        <h2>Pictures and film.</h2>
      </div>
      <a className="ig-link" href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">@{INSTAGRAM_HANDLE} ↗</a>
    </div>

    {!loaded ? <p className="empty-state">Loading…</p> : shown.length ? (
      <div className="media-grid">
        {shown.map(item => {
          const src = embedUrl(item.kind, item.url);
          return <figure key={item.id} className={`media-item ${item.kind}`}>
            {src ? (
              <iframe
                src={src}
                title={item.caption || "Post from the walk"}
                loading="lazy"
                allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture; web-share"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.url} alt={item.caption || "Photograph from the walk"} loading="lazy" />
            )}
            {(item.caption || item.place) && <figcaption>
              {item.caption}{item.place && <span>{item.place}</span>}
            </figcaption>}
          </figure>;
        })}
      </div>
    ) : (
      <div className="empty-state">
        <h2>Nothing here yet.</h2>
        <p>The preparation is being filmed on Instagram.</p>
        <a className="primary-button" href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">Watch on @{INSTAGRAM_HANDLE} ↗</a>
      </div>
    )}
  </section>;
}
