"use client";

import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const route = ["Kanyakumari", "Madurai", "Bengaluru", "Hyderabad", "Nagpur", "Jabalpur", "Rewa", "Prayagraj", "Varanasi", "Lucknow", "Delhi", "Jammu", "Srinagar"];
const pairs = [["Kanyakumari", "Tamil Nadu"], ["Bengaluru", "Karnataka"], ["Hyderabad", "Telangana"], ["Nagpur", "Maharashtra"], ["Rewa", "Madhya Pradesh"], ["Srinagar", "Jammu & Kashmir"]];
const shuffle = <T,>(items: T[]) => [...items].sort(() => Math.random() - .5);

export function Games() {
  const [time, setTime] = useState(10); const [score, setScore] = useState(0); const [running, setRunning] = useState(false); const [routeRun, setRouteRun] = useState<string[]>(() => shuffle(route)); const [expected, setExpected] = useState(0);
  const [cards, setCards] = useState(() => shuffle(pairs.flatMap((pair, pairIndex) => pair.map(label => ({ label, pairIndex, id: crypto.randomUUID() }))))); const [open, setOpen] = useState<string[]>([]); const [matched, setMatched] = useState<number[]>([]); const [moves, setMoves] = useState(0);
  useEffect(() => { if (!running) return; const id = setInterval(() => setTime(value => { if (value <= .1) { setRunning(false); return 0; } return value - .1; }), 100); return () => clearInterval(id); }, [running]);
  const openCards = useMemo(() => cards.filter(card => open.includes(card.id)), [cards, open]);
  useEffect(() => { if (openCards.length !== 2) return; const timer = setTimeout(() => { if (openCards[0].pairIndex === openCards[1].pairIndex) setMatched(value => [...value, openCards[0].pairIndex]); setMoves(value => value + 1); setOpen([]); }, 550); return () => clearTimeout(timer); }, [openCards]);
  const resetMemory = () => { setCards(shuffle(pairs.flatMap((pair, pairIndex) => pair.map(label => ({ label, pairIndex, id: crypto.randomUUID() }))))); setOpen([]); setMatched([]); setMoves(0); };
  return <Tabs defaultValue="sprint" className="games"><TabsList><TabsTrigger value="sprint">Step sprint</TabsTrigger><TabsTrigger value="route">Route order</TabsTrigger><TabsTrigger value="memory">Road memory</TabsTrigger></TabsList>
    <TabsContent value="sprint" className="game-stage"><div><div className="section-tag">01 · SPEED</div><h2>Step Sprint</h2><p>Tap as many steps as possible in ten seconds.</p></div><div className="sprint-board"><p>TIME <strong>{time.toFixed(1)}</strong></p><p>STEPS <strong>{score}</strong></p><button className="step-button" onClick={() => running && setScore(value => value + 1)}>TAP<br />STEP</button><button className="primary-button" onClick={() => { setScore(0); setTime(10); setRunning(true); }}>{running ? "Running…" : "Start sprint"}</button></div></TabsContent>
    <TabsContent value="route" className="game-stage"><div><div className="section-tag">02 · KNOW THE ROAD</div><h2>Route Order</h2><p>Tap the cities from south to north.</p></div><div><div className="route-buttons">{routeRun.map(city => <button disabled={route.indexOf(city) < expected} className={route.indexOf(city) < expected ? "correct" : ""} key={city} onClick={() => city === route[expected] ? setExpected(value => value + 1) : setExpected(0)}>{city}</button>)}</div><p>{expected === route.length ? "Route complete! ✓" : `Next: ${route[expected]}`}</p><button className="primary-button" onClick={() => { setExpected(0); setRouteRun(shuffle(route)); }}>Shuffle again</button></div></TabsContent>
    <TabsContent value="memory" className="game-stage"><div><div className="section-tag">03 · MEMORY</div><h2>Road Memory</h2><p>Match each city with its state.</p></div><div><div className="memory-grid">{cards.map(card => <button key={card.id} className={open.includes(card.id) || matched.includes(card.pairIndex) ? "open" : ""} disabled={matched.includes(card.pairIndex)} onClick={() => setOpen(value => (value.length < 2 && !value.includes(card.id) ? [...value, card.id] : value))}><span>{card.label}</span></button>)}</div><p>Moves: {moves} · Matched: {matched.length}/{pairs.length}</p><button className="primary-button" onClick={resetMemory}>New board</button></div></TabsContent>
  </Tabs>;
}
