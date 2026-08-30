import Link from "next/link";
import { Countdown } from "@/components/countdown";
import { Dashboard } from "@/components/dashboard";
import proposal from "@/data/proposal.json";
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
      <Countdown />

      {/* High enough that a brand does not have to read to the bottom of the
          page to find out that sponsorship is open at all. */}
      <section className="sponsor-call">
        <div className="shell sponsor-call-inner">
          <div><b>This walk is looking for its partners.</b><span>Title partnership ₹2,00,000 · four slots at ₹50,000 · gear in kind.</span></div>
          <Link className="primary-button" href="/sponsor">Sponsor this walk →</Link>
        </div>
      </section>

      <section className="proof-strip">
        <div className="shell">
          <div className="section-tag warm">03 · HOW YOU WILL KNOW IT HAPPENED</div>
          <h2>Nothing here<br />asks to be believed.</h2>
          <p>The most reasonable objection to a solo walk is that you cannot verify it happened. Every answer to that costs Navneet, not you.</p>
          <div className="proof-list">{proposal.verification.map((item, index) => <article key={item}><b>{String(index + 1).padStart(2, "0")}</b><p>{item}</p></article>)}</div>
        </div>
      </section>

      <section className="road-actions">
        <div className="shell road-actions-inner">
          <div><div className="section-tag warm">04 · THE ROAD IS COLLABORATIVE</div><h2>Know something<br />ahead of me?</h2><p>Each kind of response now has its own simple page.</p></div>
          <div className="door-grid">
            {doors.map(([number, title, copy, href]) => <Link href={href} key={href}><b>{number}</b><strong>{title}</strong><span>{copy} →</span></Link>)}
          </div>
        </div>
      </section>
      <section className="partner-promo">
        <div className="shell partner-promo-inner">
          <div>
            <div className="section-tag warm">05 · PUT YOUR NAME ON IT</div>
            <h2>180 days.<br />Ten states.<br />One banner.</h2>
            <p>A hoarding is passed. A walker is approached — and every answer he gives names the people who backed him. Title partnership is ₹2,00,000, four supporting slots are ₹50,000, and gear partnerships are in kind.</p>
            <Link href="/sponsor">See what a partner gets →</Link>
          </div>
          <div className="partner-figures">
            <article><small>DURATION</small><strong>180</strong><span>consecutive days</span></article>
            <article><small>STATES</small><strong>10</strong><span>Tamil Nadu to Kashmir</span></article>
            <article><small>MEET-UPS</small><strong>{proposal.meetups.guaranteed}</strong><span>guaranteed, in person</span></article>
            <article><small>PER DAY</small><strong>₹1,111</strong><span>at title partnership</span></article>
          </div>
        </div>
      </section>

      <section className="book-promo">
        <div className="shell book-promo-inner">
          <div><div className="section-tag light">06 · THE BOOK FROM THE ROAD</div><h2>A Long Walk.</h2><p>Field notes, photographs, exhaustion and conversations across India—becoming a book while the journey happens.</p><Link href="/book">Meet the book and pre-register →</Link></div>
          <div className="book-cover" aria-label="Concept cover for A Long Walk"><small>NAVNEET</small><strong>A<br />LONG<br />WALK</strong><span>A BOOK FROM THE ROAD</span></div>
        </div>
      </section>
      <SiteFooter />
      <nav className="mobile-dock"><Link href="/">Dashboard</Link><Link href="/route">Route</Link><Link href="/messages">Messages</Link><Link href="/book">Book</Link></nav>
    </main>
  );
}
