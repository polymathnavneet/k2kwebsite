import Link from "next/link";
import { Dashboard } from "@/components/dashboard";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

const doors = [
  ["01", "Suggest a place", "A road, meal or local secret", "/ahead/place"],
  ["02", "Share a story", "A person worth meeting", "/ahead/story"],
  ["03", "Offer support", "Water, power, food or stay", "/ahead/support"],
  ["04", "Ask the road", "A question to carry north", "/ahead/question"],
];

export default function Home() {
  return (
    <main>
      <SiteHeader />
      <Dashboard />
      <section className="road-actions">
        <div className="shell road-actions-inner">
          <div><div className="section-tag warm">04 · THE ROAD IS COLLABORATIVE</div><h2>Know something<br />ahead of me?</h2><p>Each kind of response now has its own simple page.</p></div>
          <div className="door-grid">
            {doors.map(([number, title, copy, href]) => <Link href={href} key={href}><b>{number}</b><strong>{title}</strong><span>{copy} →</span></Link>)}
          </div>
        </div>
      </section>
      <section className="book-promo">
        <div className="shell book-promo-inner">
          <div><div className="section-tag light">05 · THE BOOK FROM THE ROAD</div><h2>A Long Walk.</h2><p>Field notes, photographs, exhaustion and conversations across India—becoming a book while the journey happens.</p><Link href="/book">Meet the book and pre-register →</Link></div>
          <div className="book-cover" aria-label="Concept cover for A Long Walk"><small>NAVNEET</small><strong>A<br />LONG<br />WALK</strong><span>A BOOK FROM THE ROAD</span></div>
        </div>
      </section>
      <SiteFooter />
      <nav className="mobile-dock"><Link href="/">Dashboard</Link><Link href="/route">Route</Link><Link href="/messages">Messages</Link><Link href="/book">Book</Link></nav>
    </main>
  );
}
