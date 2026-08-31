import { PageShell } from "@/components/page-shell";
import { RoadForm } from "@/components/road-form";

export default function RoadPage() {
  return <PageShell
    eyebrow="03 · ROAD TIPS & HELP"
    title={<>Know the road<br />ahead?</>}
    intro="Share a place, a person or story worth finding, a meal, a safer road, local knowledge, water, charging, a stay, or practical help. One short form covers all of it."
  >
    <section className="form-section shell">
      <RoadForm kind="road" placeLabel="CITY / STRETCH" messageLabel="WHAT SHOULD NAVNEET KNOW?" buttonLabel="Send it to the road" />
    </section>
  </PageShell>;
}
