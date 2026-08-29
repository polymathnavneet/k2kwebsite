import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** Let search engines in, but keep the private control room out. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
