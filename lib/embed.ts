/**
 * Working out what a pasted link is, and how to show it.
 *
 * Instagram and YouTube both serve a plain `/embed` page that works inside an
 * iframe with no API key, no app review and no access token. That is what makes
 * "paste a link" a complete feature rather than the start of a Meta developer
 * account.
 */

export type MediaKind = "instagram" | "youtube" | "image";

const INSTAGRAM = /instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i;
const YOUTUBE_LONG = /youtube\.com\/(?:watch\?v=|shorts\/|embed\/)([A-Za-z0-9_-]{6,})/i;
const YOUTUBE_SHORT = /youtu\.be\/([A-Za-z0-9_-]{6,})/i;
const IMAGE = /\.(?:jpe?g|png|gif|webp|avif)(?:\?|$)/i;

export function detectKind(url: string): MediaKind | null {
  const value = String(url || "").trim();
  if (INSTAGRAM.test(value)) return "instagram";
  if (YOUTUBE_LONG.test(value) || YOUTUBE_SHORT.test(value)) return "youtube";
  if (IMAGE.test(value)) return "image";
  return null;
}

/** The URL to put in an iframe, or null when the item is a plain image. */
export function embedUrl(kind: string, url: string): string | null {
  if (kind === "instagram") {
    const match = url.match(INSTAGRAM);
    return match ? `https://www.instagram.com/p/${match[1]}/embed` : null;
  }
  if (kind === "youtube") {
    const match = url.match(YOUTUBE_LONG) || url.match(YOUTUBE_SHORT);
    return match ? `https://www.youtube-nocookie.com/embed/${match[1]}` : null;
  }
  return null;
}

/** A link to the Instagram account the walk is documented on. */
export const INSTAGRAM_HANDLE = "polymath_navneet";
export const INSTAGRAM_URL = `https://www.instagram.com/${INSTAGRAM_HANDLE}/`;
