import { PageShell } from "@/components/page-shell";
import { RoadForm } from "@/components/road-form";

/**
 * Walk with me.
 *
 * The nearest thing that existed was "offer support", which lists water,
 * charging and a place to stay and mentions company for a few kilometres at
 * the end. Somebody who wants to walk beside him for a morning is not offering
 * a service, and burying it in a list of supplies is why nobody did.
 */
export default function WalkPage() {
  return <PageShell
    eyebrow="02 · WALK WITH ME"
    title={<>Walk a stretch<br />with me.</>}
    intro="A kilometre or a week. No fitness required and nothing to bring — the pace is about 25 km a day, and you can turn back whenever your legs or your day says so. Tell me where you are and roughly when, and I will tell you when I am near you.">
    <section className="form-section shell">
      <RoadForm kind="walk" placeLabel="WHICH TOWN OR STRETCH?" messageLabel="WHEN, AND HOW FAR DO YOU FANCY?" buttonLabel="Come and walk" />
    </section>
  </PageShell>;
}
