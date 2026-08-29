import { PageShell } from "@/components/page-shell";
import { RoadForm } from "@/components/road-form";
export default function PlacePage(){return <PageShell eyebrow="01 · A PLACE AHEAD" title={<>Show me what<br />maps miss.</>} intro="Recommend a road, meal, library, neighbourhood, viewpoint or local secret somewhere ahead of the walk."><section className="form-section shell"><RoadForm kind="place" placeLabel="PLACE / CITY" messageLabel="WHY SHOULD I GO?" buttonLabel="Put this place on the road" /></section></PageShell>}
