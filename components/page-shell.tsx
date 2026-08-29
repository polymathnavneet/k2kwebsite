import type { ReactNode } from "react";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

export function PageShell({ eyebrow, title, intro, children }: { eyebrow: string; title: ReactNode; intro: string; children: ReactNode }) {
  return <main><SiteHeader /><section className="page-hero shell"><div className="section-tag">{eyebrow}</div><h1>{title}</h1><p>{intro}</p></section>{children}<SiteFooter /></main>;
}
