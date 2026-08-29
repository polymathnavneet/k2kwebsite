/**
 * The site's own public address.
 *
 * This used to be a ChatGPT hosting URL written into three files by hand, which
 * quietly made ChatGPT the site's identity: the canonical link Google indexes,
 * the address in the sitemap, and the base for every share preview. If that
 * hosting ever went away, search results and shared links would point at a dead
 * address.
 *
 * It is now read from VITE_SITE_URL when the site is built, so the address
 * follows wherever the site is actually published. The old value stays as the
 * fallback, so a build with nothing set behaves exactly as before.
 */
const configured = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_SITE_URL?.trim() ?? "";

const FALLBACK = "https://a-long-walk-navneet.navneet10436.chatgpt.site";

export const SITE_URL = (configured || FALLBACK).replace(/\/+$/, "");
