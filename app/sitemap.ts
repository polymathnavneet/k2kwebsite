import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

const BASE = SITE_URL;
const PAGES = ["", "/route", "/about", "/sponsor", "/messages", "/journal", "/gallery", "/book", "/ahead", "/ahead/road", "/ahead/walk", "/games"];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return PAGES.map(path => ({
    url: `${BASE}${path}`,
    lastModified: now,
    changeFrequency: path === "" || path === "/route" ? "daily" : "weekly",
    priority: path === "" ? 1 : path === "/route" ? 0.9 : 0.7,
  }));
}
