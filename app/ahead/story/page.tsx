import { PageShell } from "@/components/page-shell";
import { RoadForm } from "@/components/road-form";
export default function StoryPage(){return <PageShell eyebrow="02 · A HUMAN STORY" title={<>Who should<br />I meet?</>} intro="Tell me about a person, family, worker, artist, athlete, teacher or quiet local story worth documenting."><section className="form-section shell"><RoadForm kind="story" placeLabel="WHERE IS THE STORY?" messageLabel="TELL ME ABOUT THEM" buttonLabel="Share this story" /></section></PageShell>}
