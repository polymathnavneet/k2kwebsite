import Link from "next/link";
import { ContentBlock } from "@/components/content-block";
import { Countdown } from "@/components/countdown";
import { Dashboard } from "@/components/dashboard";
import { DayByDay } from "@/components/day-by-day";
import { RightNow } from "@/components/right-now";
import proposal from "@/data/proposal.json";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ResponsePanel } from "@/components/response-panel";
import { HomeConversationPreview } from "@/components/home-conversation-preview";

const doors = [
  ["01", "Journal + Ask", "Read the road, ask Navneet, see his replies", "/journal#ask"],
  ["02", "Walk with me", "A kilometre or a week", "/ahead/walk"],
  ["03", "Road tips & help", "Places, stories, food, routes or support", "/ahead/road"],
];

export default function Home() {
  return (
    <main>
      <SiteHeader />
      <Dashboard />

      {/* The walk itself, before anything the site wants from the reader.
          Both of these used to live inside the dashboard; the dashboard now
          ends at the metric grid, so they stand on their own here. */}
      <section className="right-now-band shell"><RightNow /></section>
      <DayByDay />

      {/* Above the sponsorship call and above the proof, because the thing he
          wants most from this website is not money - it is people. Both doors
          were previously the fourth item in a list two thirds of the way down
          the page, which is a good way to be asked nothing by nobody. */}
      <section className="talk-call">
        <div className="shell talk-call-inner">
          <div className="talk-copy">
            <div className="section-tag warm">04 · THE PART THAT IS NOT A MAP</div>
            <h2>Talk to me.<br />I will answer.</h2>
            <p>Four thousand two hundred and seventy kilometres is a long time to be alone with your own opinions. Ask me something, or come and walk a piece of it with me — both go straight to my phone, and I reply to every one myself.</p>
          </div>
          <div className="talk-doors">
            <Link className="talk-door" href="/journal#ask">
              <b>ASK NAVNEET</b>
              <strong>Ask me anything.</strong>
              <span>Why I am doing this, what it costs, what I am afraid of — or what to eat in your town. Answered by me, usually within a few days.</span>
              <em>Ask a question →</em>
            </Link>
            <Link className="talk-door" href="/ahead/walk">
              <b>WALK WITH ME</b>
              <strong>Walk a stretch with me.</strong>
              <span>A kilometre or a week. No fitness required, nothing to bring. Tell me your town and I will tell you when I am near it.</span>
              <em>Come and walk →</em>
            </Link>
          </div>
        </div>
      </section>

      <HomeConversationPreview />
      <ResponsePanel />
      <ContentBlock slot="home-note" className="shell note-slot" />

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
          <div className="section-tag warm">05 · HOW YOU WILL KNOW IT HAPPENED</div>
          <h2>Nothing here<br />asks to be believed.</h2>
          <p>The most reasonable objection to a solo walk is that you cannot verify it happened. Every answer to that costs Navneet, not you.</p>
          <div className="proof-list">{proposal.verification.map((item, index) => <article key={item}><b>{String(index + 1).padStart(2, "0")}</b><p>{item}</p></article>)}</div>
        </div>
      </section>

      <section className="road-actions">
        <div className="shell road-actions-inner">
          <div><div className="section-tag warm">06 · THE ROAD IS COLLABORATIVE</div><h2>Know something<br />ahead of me?</h2><p>Every one of these has its own short page, and every one reaches me.</p></div>
          <div className="door-grid">
            {doors.map(([number, title, copy, href]) => <Link href={href} key={href}><b>{number}</b><strong>{title}</strong><span>{copy} →</span></Link>)}
          </div>
        </div>
      </section>
      <section className="partner-promo">
        <div className="shell partner-promo-inner">
          <div>
            <div className="section-tag warm">07 · PUT YOUR NAME ON IT</div>
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
          <div><div className="section-tag light">08 · THE BOOK FROM THE ROAD</div><h2>A Long Walk.</h2><p>Field notes, photographs, exhaustion and conversations across India—becoming a book while the journey happens.</p><Link href="/book">Meet the book and pre-register →</Link></div>
          <div className="book-cover" aria-label="Concept cover for A Long Walk"><small>NAVNEET</small><strong>A<br />LONG<br />WALK</strong><span>A BOOK FROM THE ROAD</span></div>
        </div>
      </section>
      <SiteFooter />
      <nav className="mobile-dock"><Link href="/">Home</Link><Link href="/route">Route</Link><Link href="/journal#ask">Ask</Link><Link href="/messages">Messages</Link><Link className="dock-sponsor" href="/sponsor">Sponsor</Link></nav>
    </main>
  );
}
