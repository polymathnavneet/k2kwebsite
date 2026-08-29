import { PageShell } from "@/components/page-shell";
import { RoadForm } from "@/components/road-form";
export default function SupportPage(){return <PageShell eyebrow="03 · PRACTICAL ROAD HELP" title={<>Help for one<br />small stretch.</>} intro="Offer water, food, charging, a safe stay, local guidance, repair help or company for a few kilometres."><section className="form-section shell"><RoadForm kind="support" placeLabel="CITY / STRETCH" messageLabel="WHAT CAN YOU OFFER?" buttonLabel="Offer road support" /></section></PageShell>}
