import type { Metadata } from "next";
import { Offline } from "@/components/offline";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "A Long Walk · Navneet",
    template: "%s · A Long Walk",
  },
  description:
    "Follow Navneet’s live walk from Kanyakumari to Kashmir — 4,270 km on foot. Live map, field notes, and the book.",
  metadataBase: new URL("https://a-long-walk-navneet.navneet10436.chatgpt.site"),
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "A Long Walk",
    title: "A Long Walk · Navneet",
    description: "4,270 km on foot from Kanyakumari to Kashmir. Follow it live.",
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: "A Long Walk · Navneet",
    description: "4,270 km on foot from Kanyakumari to Kashmir. Follow it live.",
  },
  robots: { index: true, follow: true },
  // Kept deliberately: the starter ships a test asserting this exists, so
  // the hosting platform appears to read it. Harmless to visitors.
  other: { "codex-preview": "development" },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport = {
  themeColor: "#201e1d",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body><Offline />{children}</body>
    </html>
  );
}
