import type { MetadataRoute } from "next";

/** Let search engines in, but keep the private control room out. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin"] }],
    sitemap: "https://a-long-walk-navneet.navneet10436.chatgpt.site/sitemap.xml",
  };
}
