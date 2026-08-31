import { redirect } from "next/navigation";

/** The question inbox now lives with the journal and public answers. */
export default function AskPage() {
  redirect("/journal#ask");
}
