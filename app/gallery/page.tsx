import { PageShell } from "@/components/page-shell";
import { MediaWall } from "@/components/media-wall";

export const metadata = { title: "Pictures and film" };

export default function GalleryPage() {
  return <PageShell
    eyebrow="FROM THE ROAD"
    title={<>Pictures<br />and film.</>}
    intro="Photographs and video from the preparation and from the walk itself, filmed as it happens."
  >
    <MediaWall />
  </PageShell>;
}
