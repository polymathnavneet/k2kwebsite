import { PageShell } from "@/components/page-shell";
import { JournalList } from "@/components/journal-list";

export const metadata = { title: "Field notes" };

export default function JournalPage() {
  return <PageShell
    eyebrow="FIELD NOTES"
    title={<>The road<br />in words.</>}
    intro="Conversations, mistakes, roadside meals, weather, boredom, kindness and the tiny details a map cannot hold. Written a day at a time."
  >
    <JournalList />
  </PageShell>;
}
