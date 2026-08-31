"use client";

import { useEffect, useState } from "react";

const cache: { blocks: Record<string, string> | null } = { blocks: null };

/**
 * A paragraph Navneet can write from his phone.
 *
 * The text comes from a named section of his Google document, so changing what
 * a page says is typing in a document rather than asking anyone to change the
 * site. A slot with nothing written in it renders nothing at all, which is why
 * these can sit on pages indefinitely without leaving empty boxes behind.
 */
export function ContentBlock({ slot, className = "" }: { slot: string; className?: string }) {
  const [body, setBody] = useState(cache.blocks?.[slot] ?? "");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/content", { cache: "no-store" })
      .then(response => response.json())
      .then(data => {
        cache.blocks = data.blocks ?? {};
        if (!cancelled) setBody(cache.blocks?.[slot] ?? "");
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [slot]);

  if (!body.trim()) return null;
  return (
    <div className={`content-block ${className}`.trim()}>
      {body.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
    </div>
  );
}
