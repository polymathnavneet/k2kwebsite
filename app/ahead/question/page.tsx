import { PageShell } from "@/components/page-shell";
import { RoadForm } from "@/components/road-form";

/**
 * Ask Navneet.
 *
 * This page used to be "Ask the road": you gave Navneet a question and he
 * carried it north to put to strangers. A good idea, and the wrong way round
 * for a man who wants to meet people. Nobody arrives at a website wanting to
 * be given an errand; they arrive wanting to talk to the person walking.
 *
 * So it is his inbox now, and it is answered by him.
 */
export default function AskPage() {
  return <PageShell
    eyebrow="01 · ASK NAVNEET"
    title={<>Ask me<br />anything.</>}
    intro="Why I am walking, what it costs, what I am afraid of, what the road is actually like, what to see in a town you love — or something you would only ask someone with 4,270 km to think about it. Every question is answered by me.">
    <section className="form-section shell">
      <RoadForm kind="question" placeLabel="WHERE ARE YOU WRITING FROM?" messageLabel="YOUR QUESTION" buttonLabel="Ask Navneet" />
    </section>
  </PageShell>;
}
