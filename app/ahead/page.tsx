import Link from "next/link";
import { PageShell } from "@/components/page-shell";

const items = [
  ["01", "Ask Navneet", "Anything at all. He reads and answers every one himself.", "/ahead/question"],
  ["02", "Walk with me", "A kilometre or a week, anywhere on the route.", "/ahead/walk"],
  ["03", "Suggest a place", "A road, meal, neighbourhood or local secret.", "/ahead/place"],
  ["04", "Share a story", "A person or quiet local story worth documenting.", "/ahead/story"],
  ["05", "Offer support", "Food, charging, a safe stay or road guidance.", "/ahead/support"],
];

export default function AheadPage() {
  return <PageShell eyebrow="THE PUBLIC ROAD" title={<>Add something<br />to the road.</>} intro="Five short doors, so nobody has to fight with one enormous form. Your message goes on the public wall; your contact detail never does. Navneet answers every one of them himself, which on a walking day can take a few days.">
    <section className="shell choice-list">{items.map(([number, title, copy, href]) => <Link href={href} key={href}><b>{number}</b><div><h2>{title}</h2><p>{copy}</p></div><span>Open →</span></Link>)}</section>
  </PageShell>;
}
