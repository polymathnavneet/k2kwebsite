import Link from "next/link";
import type { Metadata } from "next";
import { ContentBlock } from "@/components/content-block";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import proposal from "@/data/proposal.json";

export const metadata: Metadata = {
  title: "Who is doing this",
  description:
    "Navneet Kumar, 20, from West Champaran. Three books published, two half marathons run, and 4,000 km of India to walk — with the record claim stated precisely, caveats included.",
};

export default function AboutPage() {
  const { person, record } = proposal;

  return <main>
    <SiteHeader />

    <section className="page-hero shell">
      <div className="section-tag">THE PERSON</div>
      <h1>Who is<br />doing this.</h1>
      <p>{person.age} years old, from {person.from}, currently living in {person.living}. {person.studying}. A writer first — {person.books} books written and published, and the fourth will be about this walk.</p>
      <p>{person.halfMarathons}. He has not walked 4,000 km before — nobody his age has, which is the point. Between now and the start he is training publicly and posting the log, so that anyone considering funding this can watch the preparation rather than take his word for it.</p>
    </section>

    <ContentBlock slot="about-extra" className="shell note-slot" />

    <section className="record-block shell">
      <div className="section-tag warm">THE RECORD</div>
      <h2>Stated precisely.</h2>
      <p>{record.claim}. He will be {record.ageAtStart} old at the start and approximately {record.ageAtFinish} at the finish.</p>
      {/* Straight from the proposal, and kept whole: a claim without its caveats
          is the thing a search engine would embarrass him with later. */}
      <p><b>In the interest of accuracy:</b></p>
      <ul className="plain-list">{record.caveats.map(line => <li key={line}>{line}</li>)}</ul>
      <p className="note-line">Better to learn this here than from a search engine. The walk stands on its own merits.</p>
    </section>

    <section className="closing-block shell">
      <div className="section-tag light">WHAT HAPPENS NEXT</div>
      <h2>Watch it, or put your name on it.</h2>
      <p>The route recalculates as he walks it, the journal fills up daily, and the wall is open to anyone who knows something about the road ahead.</p>
      <div className="closing-links">
        <Link className="primary-button" href="/route">Follow the route →</Link>
        <Link className="primary-button" href="/sponsor">Partner the walk →</Link>
      </div>
    </section>

    <SiteFooter />
  </main>;
}
