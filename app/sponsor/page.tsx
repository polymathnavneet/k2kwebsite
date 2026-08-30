import type { Metadata } from "next";
import { SponsorForm } from "@/components/sponsor-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import proposal from "@/data/proposal.json";

export const metadata: Metadata = {
  title: "Partner the walk",
  description:
    "180 consecutive days of brand presence across ten Indian states, on foot. Tiers, deliverables, budget — and an honest account of where this loses to an ad budget.",
};

export default function SponsorPage() {
  const { tiers, deliverables, placement, verification, standing, audience, budget, risk, terms, meetups, againstAdBudget, recommendation } = proposal;

  return <main>
    <SiteHeader />

    <section className="page-hero shell">
      <div className="section-tag">SPONSORSHIP · DECEMBER 2026 – MAY 2027</div>
      <h1>4,000 kilometres.<br />One pair of legs.<br />Your logo on all of it.</h1>
      <p>A billboard is passed. A walker is approached. For 180 consecutive days, through ten states, your name travels the length of India on a man who people stop to talk to — and every one of those conversations names you.</p>
      <p className="hero-ask">Title partner ₹2,00,000 · four supporting slots at ₹50,000 · gear partnerships in kind · minimum participation ₹10,000.</p>
      <a className="primary-button" href="#talk">Start a conversation ↓</a>
    </section>

    <section className="compare-grid shell">
      <div className="section-tag warm">01 · THE SHORT VERSION</div>
      <h2>What ₹2,00,000 buys here.</h2>
      <div className="compare-table">
        <article><small>DURATION</small><p><b>Elsewhere:</b> one prime hoarding, one city, roughly one month.</p><p><b>Here:</b> 180 consecutive days.</p></article>
        <article><small>GEOGRAPHY</small><p><b>Elsewhere:</b> one fixed location, or whoever the algorithm picks.</p><p><b>Here:</b> roughly ten states, Tamil Nadu to Jammu &amp; Kashmir.</p></article>
        <article><small>ATTENTION</small><p><b>Elsewhere:</b> a billboard gets one to two seconds of divided attention.</p><p><b>Here:</b> people stop a man walking across India. Those are conversations, not impressions.</p></article>
        <article><small>AFTERLIFE</small><p><b>Elsewhere:</b> the campaign ends, the creative is archived.</p><p><b>Here:</b> a book about the walk, carrying your name, on shelves indefinitely.</p></article>
      </div>
      <p className="note-line">₹2,00,000 over 180 days is ₹1,111 a day for continuous, moving, human brand presence across the length of the country.</p>
    </section>

    <section className="tier-grid shell">
      <div className="section-tag">02 · WAYS TO PARTICIPATE</div>
      <h2>Tiers.</h2>
      <div className="tier-cards">
        {tiers.map(tier => <article key={tier.name}>
          <div><strong>{tier.name}</strong><b>{tier.amount}</b></div>
          <small>{tier.slots}</small>
          <p>{tier.includes}</p>
        </article>)}
      </div>
      <ul className="plain-list">{terms.map(term => <li key={term}>{term}</li>)}</ul>
    </section>

    <section className="deliverable-strip shell">
      <div className="section-tag">03 · WHAT YOU ARE CONTRACTUALLY OWED</div>
      <h2>Floors, not projections.</h2>
      <p className="note-line">Deliberately set below what is expected, so they survive bad weeks, bad weather and bad connectivity.</p>
      <div className="deliverable-list">{deliverables.map(row => <article key={row.what}><h3>{row.what}</h3><p>{row.floor}</p></article>)}</div>
    </section>

    <section className="placement-grid shell">
      <div className="section-tag">04 · WHAT IT PHYSICALLY LOOKS LIKE</div>
      <h2>Every surface.</h2>
      <div className="placement-list">{placement.map(row => <article key={row.surface}><h3>{row.surface}</h3><p>{row.detail}</p></article>)}</div>
    </section>

    <section className="meetup-block shell">
      <div className="section-tag warm">05 · MEET-UPS</div>
      <h2>{meetups.planned} cities planned. {meetups.guaranteed} guaranteed.</h2>
      <p>{meetups.how}</p>
      <p><b>You are welcome to be there.</b> {meetups.forPartners}</p>
      <p className="note-line">{meetups.honest}</p>
    </section>

    <section className="verify-block shell">
      <div className="section-tag">06 · VERIFICATION</div>
      <h2>How you will know he actually walked it.</h2>
      <p>The most reasonable objection to funding a solo expedition is that you cannot verify it happened. The cost of answering that falls on him, not you.</p>
      <ul className="plain-list">{verification.map(item => <li key={item}>{item}</li>)}</ul>
    </section>

    <section className="standing-block shell">
      <div className="section-tag">07 · STANDING ALREADY</div>
      <h2>What is committed, and what is not.</h2>
      <div className="standing-list">{standing.map(row => <article key={row.item}>
        <div><h3>{row.item}</h3><span>{row.status}</span></div><p>{row.detail}</p>
      </article>)}</div>
      <p className="note-line">The weak commitments are listed as weak deliberately. A proposal that overstates what it has is not worth reading.</p>
    </section>

    <section className="audience-block shell">
      <div className="section-tag">08 · THE AUDIENCE</div>
      <h2>The numbers, without decoration.</h2>
      <div className="audience-figures">
        <article><small>INSTAGRAM</small><strong>{audience.instagramFollowers}</strong><span>@polymath_navneet</span></article>
        <article><small>TYPICAL REEL</small><strong>{audience.averageReelViews}</strong><span>views</span></article>
        <article><small>YOUTUBE</small><strong>{audience.youtubeSubscribers}</strong><span>{audience.youtubeNote}</span></article>
      </div>
      <p><b>Two breakout posts:</b></p>
      <ul className="plain-list">{audience.breakouts.map(line => <li key={line}>{line}</li>)}</ul>
      <p>Combined: {audience.combined}.</p>
      <p className="note-line"><b>The honest caveat, and it cuts both ways.</b> {audience.honestCaveat}</p>
      <a className="ig-card" href="https://www.instagram.com/polymath_navneet/" target="_blank" rel="noopener noreferrer">
        <span className="ig-mark" aria-hidden="true">◎</span>
        <span className="ig-body"><b>@polymath_navneet</b><small>The account, the training log, and the two posts above. Open it and judge for yourself.</small></span>
        <span className="ig-go" aria-hidden="true">→</span>
      </a>
    </section>

    {/* The section that makes the rest believable. It stays on the page. */}
    <section className="against-block shell">
      <div className="section-tag warm">09 · THE OTHER SIDE</div>
      <h2>Where this loses to your ad budget.</h2>
      <p>Any proposal that only lists advantages is a proposal that hopes you will not think carefully.</p>
      <div className="against-list">{againstAdBudget.map(row => <article key={row.wins}><h3>Meta wins on {row.wins.toLowerCase()}</h3><p>{row.why}</p></article>)}</div>
      <p className="note-line">{recommendation}</p>
    </section>

    <section className="budget-block shell">
      <div className="section-tag">10 · BUDGET</div>
      <h2>Where the money goes.</h2>
      <div className="budget-list">{budget.lines.map(row => <article key={row.line}><div><h3>{row.line}</h3><b>{row.amount}</b></div><p>{row.note}</p></article>)}</div>
      <p className="note-line">Total {budget.total}; ask {budget.ask}. {budget.inKind}. Food is the biggest line, and that surprises people — all the gear together comes to ₹45,000.</p>
    </section>

    <section className="risk-block shell">
      <div className="section-tag">11 · RISK</div>
      <h2>What happens if he does not finish.</h2>
      <p><b>What counts as walking it.</b> {risk.walkingIt}</p>
      <p><b>Pauses are not failures.</b> {risk.pauses}</p>
      <p><b>If it ends permanently.</b> {risk.ifItEnds}</p>
      <p><b>What you keep:</b></p>
      <ul className="plain-list">{risk.whatYouKeep.map(item => <li key={item}>{item}</li>)}</ul>
    </section>

    <section id="talk" className="closing-block shell">
      <div className="section-tag light">12 · NEXT</div>
      <h2>The walk is happening.<br />The only question is whose name is on it.</h2>
      <p>Take a twenty-minute call. Ask the hard questions — most of them are already asked and answered in here, and where the answer is weak it says so rather than hiding it.</p>
      <SponsorForm />
    </section>

    <SiteFooter />
  </main>;
}
