import { PageShell } from "@/components/page-shell";
import { RouteView } from "@/components/route-view";

export default function RoutePage(){
  return <PageShell
    eyebrow="THE GPS IS THE ROUTE"
    title={<>The road<br />recalculates.</>}
    intro="No second line shows where Navneet was supposed to walk. This page is rebuilt from the GPS trail he actually records. Future cities and dates are forecasts only until his feet and tracker make them part of the route."
  ><RouteView /></PageShell>;
}
