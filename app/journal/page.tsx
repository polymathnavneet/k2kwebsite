import { JournalList } from "@/components/journal-list";
import { MessageWall } from "@/components/message-wall";
import { PageShell } from "@/components/page-shell";
import { RoadForm } from "@/components/road-form";

export const metadata = { title: "Journal + Ask Navneet" };

export default function JournalPage() {
  return <PageShell
    eyebrow="JOURNAL + ASK NAVNEET"
    title={<>The road,<br />in conversation.</>}
    intro="Read what Navneet is seeing, ask him anything, and see his public answers in one place. Every question may have one follow-up; longer conversations move to Instagram."
  >
    <section id="ask" className="journal-ask">
      <div className="shell combined-heading"><div className="section-tag">ASK NAVNEET</div><h2>Ask me anything.</h2><p>Why I am walking, what it costs, what I fear, or what the road is really like. Your question appears publicly; your contact never does.</p></div>
      <div className="form-section shell"><RoadForm kind="question" placeLabel="WHERE ARE YOU WRITING FROM?" messageLabel="YOUR QUESTION" buttonLabel="Ask Navneet" /></div>
    </section>

    <section id="questions" className="combined-section">
      <div className="shell combined-heading"><div className="section-tag">PUBLIC QUESTIONS</div><h2>Questions. Answers.<br />One follow-up.</h2><p>Navneet&apos;s reply appears below each question. The original writer can ask once more using the same private contact.</p></div>
      <MessageWall questionsOnly />
    </section>

    <section id="field-notes" className="combined-section field-notes-section">
      <div className="shell combined-heading"><div className="section-tag">FIELD NOTES</div><h2>The road in words.</h2><p>Conversations, mistakes, meals, weather, boredom, kindness and the details a map cannot hold.</p></div>
      <JournalList />
    </section>
  </PageShell>;
}
