import { Games } from "@/components/games";
import { PageShell } from "@/components/page-shell";

export default function GamesPage(){
  return <PageShell eyebrow="WORKS ON PHONE AND LAPTOP" title={<>Three games.<br />Real scores.</>} intro="High-contrast road games with personal bests that survive refreshes and public leaderboards backed by the site database."><section className="shell games-wrap"><Games /></section></PageShell>;
}
