import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div><strong>A LONG WALK · NAVNEET</strong><span>India at walking speed.</span></div>
      <nav><Link href="/route">Route</Link><Link href="/ahead">Send something</Link><Link href="/messages">Messages</Link><Link href="/book">Book</Link></nav>
      <small>© 2026 Navneet</small>
    </footer>
  );
}
