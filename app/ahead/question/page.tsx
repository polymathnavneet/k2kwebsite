import { PageShell } from "@/components/page-shell";
import { RoadForm } from "@/components/road-form";
export default function QuestionPage(){return <PageShell eyebrow="04 · A QUESTION FOR INDIA" title={<>Give me a<br />question.</>} intro="Ask something I should carry north and put to people in different parts of India."><section className="form-section shell"><RoadForm kind="question" placeLabel="PLACE, IF RELEVANT" messageLabel="YOUR QUESTION" buttonLabel="Send the question north" /></section></PageShell>}
