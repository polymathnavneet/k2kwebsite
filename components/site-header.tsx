"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";

const links = [
  ["Route", "/route"],
  ["Messages", "/messages"],
  ["Journal", "/journal"],
  ["Pictures", "/gallery"],
  ["Book", "/book"],
  ["Games", "/games"],
  ["Admin", "/admin"],
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");

  // The chip claimed PREPARATION even once the walk was live.
  useEffect(() => {
    fetch("/api/journey")
      .then(response => response.json())
      .then(data => setStatus(data.mode === "live" ? (data.status || "WALKING") : "PREPARATION"))
      .catch(() => setStatus("PREPARATION"));
  }, []);
  return (
    <header className="site-header">
      <Link className="brand" href="/" onClick={() => setOpen(false)}>
        <strong>ALW</strong>
        <span>A LONG WALK<br />LIVE EXPEDITION</span>
      </Link>
      <div className="live-chip" aria-live="polite">{status ? <><i />{status.toUpperCase()}</> : null}</div>
      <button className="menu-button" type="button" aria-label="Toggle menu" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        {open ? <X size={22} /> : <Menu size={22} />}
      </button>
      <nav className={open ? "open" : ""} aria-label="Main navigation">
        {links.map(([label, href]) => <Link key={href} href={href} onClick={() => setOpen(false)}>{label}</Link>)}
      </nav>
    </header>
  );
}
