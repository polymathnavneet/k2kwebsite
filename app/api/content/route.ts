import { getDb } from "@/db";
import { contentBlocks } from "@/db/schema";

/** The prose the Google document puts on the pages. Public: it is page text. */
export async function GET() {
  const rows = await getDb().select().from(contentBlocks);
  const blocks: Record<string, string> = {};
  for (const row of rows) blocks[row.slot] = row.body;
  return Response.json({ blocks });
}
