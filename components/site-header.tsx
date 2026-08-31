"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { LivePin } from "@/components/live-pin";
import { useEffect, useState } from "react";

const links = [
  // First, because being asked things is the thing he wants most from this
  // site and it used to be reachable only by scrolling two thirds down the
  // homepage and reading a list.
  ["Ask Navneet", "/ahead/question"],
  ["Walk with me", "/ahead/walk"],
  ["Route", "/route"],
  ["About", "/about"],
  ["Partner", "/sponsor"],
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

  // The chip claimed PREPARATION even once the walk was live. It shows which
  // phase the walk is in and nothing more: what he is doing at this moment was
  // something he had to keep telling the site, and it was wrong more often than
  // it was right.
  useEffect(() => {
    fetch("/api/journey")
      .then(response => response.json())
      .then(data => setStatus(data.mode === "live" ? "LIVE WALK" : "PREPARATION"))
      .catch(() => setStatus("PREPARATION"));
  }, []);
  return (
    <>
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
    <LivePin />
    </>
  );
}
