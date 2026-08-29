import type { Metadata } from "next";
import { Offline } from "@/components/offline";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "A Long Walk · Navneet",
    template: "%s · A Long Walk",
  },
  description:
    "Follow Navneet’s live walk from Kanyakumari to Kashmir, share what lies ahead, and pre-register for the book.",
  other: {
    "codex-preview": "development",
  },
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
