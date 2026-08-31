import Link from "next/link";
import { PageShell } from "@/components/page-shell";

const items = [
  ["01", "Journal + Ask Navneet", "Read his field notes, ask anything, and see his public replies.", "/journal#ask"],
  ["02", "Walk with me", "A kilometre or a week, anywhere on the route.", "/ahead/walk"],
  ["03", "Road tips & help", "Places, stories, meals, local knowledge and practical support in one place.", "/ahead/road"],
];

export default function AheadPage() {
  return <PageShell eyebrow="THE PUBLIC ROAD" title={<>Add something<br />to the road.</>} intro="Three clear doors: talk to Navneet, walk with him, or share anything useful about the road ahead. Your message goes on the public wall; your contact detail never does.">
    <section className="shell choice-list">{items.map(([number, title, copy, href]) => <Link href={href} key={href}><b>{number}</b><div><h2>{title}</h2><p>{copy}</p></div><span>Open →</span></Link>)}</section>
  </PageShell>;
}
