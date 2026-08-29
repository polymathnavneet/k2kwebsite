import Link from "next/link";
import { PageShell } from "@/components/page-shell";

const items = [
  ["01", "Suggest a place", "A road, meal, neighbourhood or local secret.", "/ahead/place"],
  ["02", "Share a story", "A person or quiet local story worth documenting.", "/ahead/story"],
  ["03", "Offer support", "Food, charging, a safe stay or road guidance.", "/ahead/support"],
  ["04", "Ask the road", "A question for people in different parts of India.", "/ahead/question"],
];

export default function AheadPage() {
  return <PageShell eyebrow="THE PUBLIC ROAD" title={<>Add something<br />to the road.</>} intro="Four different doors, so nobody has to fight with one enormous form. Public messages appear only when the sender chooses that option; contact details remain private.">
    <section className="shell choice-list">{items.map(([number, title, copy, href]) => <Link href={href} key={href}><b>{number}</b><div><h2>{title}</h2><p>{copy}</p></div><span>Open →</span></Link>)}</section>
  </PageShell>;
}
