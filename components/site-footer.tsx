import Link from "next/link";
import { INSTAGRAM_HANDLE, INSTAGRAM_URL } from "@/lib/embed";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div><strong>A LONG WALK · NAVNEET</strong><span>India at walking speed.</span></div>
      <nav><Link href="/route">Route</Link><Link href="/ahead">Send something</Link><Link href="/messages">Messages</Link><Link href="/gallery">Pictures</Link><Link href="/book">Book</Link><a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">@{INSTAGRAM_HANDLE}</a></nav>
      <small>© 2026 Navneet</small>
    </footer>
  );
}
