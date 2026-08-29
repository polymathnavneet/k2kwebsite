import type { Metadata } from "next";
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
