import type { NextConfig } from "next";

/**
 * Security headers.
 *
 * The site had none, which left it open to being framed inside someone else's
 * page and to browsers guessing content types. The CSP allows exactly what the
 * site actually uses: OpenStreetMap tiles and Leaflet for the map, Instagram
 * and YouTube frames for the gallery, and Nominatim for place names.
 */
const headers = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), interest-cohort=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js hydration needs inline and eval; Leaflet comes from unpkg.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com",
      "style-src 'self' 'unsafe-inline' https://unpkg.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://nominatim.openstreetmap.org https://*.tile.openstreetmap.org https://raw.githubusercontent.com https://api.github.com",
      "frame-src https://www.instagram.com https://www.youtube-nocookie.com https://www.youtube.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
