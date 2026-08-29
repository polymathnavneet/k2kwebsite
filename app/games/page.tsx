import { Games } from "@/components/games";
import { PageShell } from "@/components/page-shell";
export default function GamesPage(){return <PageShell eyebrow="WORKS ON YOUR PHONE" title={<>Three games.<br />Zero excuses.</>} intro="Small fully functional games for the long road. Scores and boards react immediately."><section className="shell games-wrap"><Games /></section></PageShell>}
