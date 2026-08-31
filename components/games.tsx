"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const route = ["Kanyakumari", "Madurai", "Bengaluru", "Hyderabad", "Nagpur", "Jabalpur", "Rewa", "Prayagraj", "Varanasi", "Lucknow", "Delhi", "Jammu", "Srinagar"];
const pairs = [["Kanyakumari", "Tamil Nadu"], ["Bengaluru", "Karnataka"], ["Hyderabad", "Telangana"], ["Nagpur", "Maharashtra"], ["Rewa", "Madhya Pradesh"], ["Srinagar", "Jammu & Kashmir"]];
const shuffle = <T,>(items: T[]) => [...items].sort(() => Math.random() - .5);

type Game = "sprint" | "route" | "memory";
type BoardRow = { name: string; score: number };
type Boards = Record<Game, BoardRow[]>;
type Bests = Partial<Record<Game, number>>;

const emptyBoards: Boards = { sprint: [], route: [], memory: [] };
const PLAYER_ID = "alw-game-player-id-v1";
const PLAYER_NAME = "alw-game-player-name-v1";
const BESTS = "alw-game-bests-v1";

const better = (game: Game, next: number, previous?: number) => previous == null || (game === "sprint" ? next > previous : next < previous);
const formatScore = (game: Game, score: number) => game === "sprint" ? `${score} steps` : game === "route" ? `${(score / 1000).toFixed(1)} sec` : `${score} moves`;

function Leaderboard({ game, rows, best }: { game: Game; rows: BoardRow[]; best?: number }) {
  return <aside className="game-leaderboard">
    <div className="game-leaderboard-head"><b>LEADERBOARD</b>{best != null && <span>Your best: {formatScore(game, best)}</span>}</div>
    {rows.length ? <ol>{rows.map((row, index) => <li key={`${row.name}-${index}`}><b>{index + 1}</b><span>{row.name}</span><strong>{formatScore(game, row.score)}</strong></li>)}</ol> : <p>No scores yet. An oddly peaceful leaderboard.</p>}
  </aside>;
}

export function Games() {
  const [playerId, setPlayerId] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [bests, setBests] = useState<Bests>({});
  const [boards, setBoards] = useState<Boards>(emptyBoards);

  const [time, setTime] = useState(10);
  const [score, setScore] = useState(0);
  const [running, setRunning] = useState(false);
  const sprintPlayed = useRef(false);
  const sprintSubmitted = useRef(false);

  const [routeRun, setRouteRun] = useState<string[]>(() => shuffle(route));
  const [expected, setExpected] = useState(0);
  const [routeStartedAt, setRouteStartedAt] = useState<number | null>(null);

  const makeCards = () => shuffle(pairs.flatMap((pair, pairIndex) => pair.map((label, side) => ({ label, pairIndex, id: `${pairIndex}-${side}-${Math.random()}` }))));
  const [cards, setCards] = useState(makeCards);
  const [open, setOpen] = useState<string[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);

  useEffect(() => {
    let id = localStorage.getItem(PLAYER_ID) || "";
    if (!id) {
      id = crypto.randomUUID().replace(/-/g, "");
      localStorage.setItem(PLAYER_ID, id);
    }
    setPlayerId(id);
    setPlayerName(localStorage.getItem(PLAYER_NAME) || "");
    try { setBests(JSON.parse(localStorage.getItem(BESTS) || "{}")); } catch { setBests({}); }
    fetch("/api/games", { cache: "no-store" })
      .then(response => response.json())
      .then(data => setBoards({
        sprint: Array.isArray(data.sprint) ? data.sprint : [],
        route: Array.isArray(data.route) ? data.route : [],
        memory: Array.isArray(data.memory) ? data.memory : [],
      }))
      .catch(() => {});
  }, []);

  const saveScore = useCallback(async (game: Game, nextScore: number) => {
    if (!playerId) return;

    setBests(current => {
      if (!better(game, nextScore, current[game])) return current;
      const next = { ...current, [game]: nextScore };
      localStorage.setItem(BESTS, JSON.stringify(next));
      return next;
    });

    try {
      const response = await fetch("/api/games", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ game, score: nextScore, playerId, playerName: playerName.trim() || "Walker" }),
      });
      const result = await response.json() as { leaderboard?: BoardRow[] };
      if (response.ok && Array.isArray(result.leaderboard)) {
        setBoards(current => ({ ...current, [game]: result.leaderboard! }));
      }
    } catch {
      // The personal best is already safe on the device. The public board can
      // catch the next score when a connection returns.
    }
  }, [playerId, playerName]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTime(value => {
      if (value <= .1) { setRunning(false); return 0; }
      return value - .1;
    }), 100);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (!sprintPlayed.current || running || time !== 0 || sprintSubmitted.current) return;
    sprintSubmitted.current = true;
    void saveScore("sprint", score);
  }, [running, time, score, saveScore]);

  const openCards = useMemo(() => cards.filter(card => open.includes(card.id)), [cards, open]);
  useEffect(() => {
    if (openCards.length !== 2) return;
    const timer = setTimeout(() => {
      const isMatch = openCards[0].pairIndex === openCards[1].pairIndex;
      const nextMatched = isMatch ? [...matched, openCards[0].pairIndex] : matched;
      if (isMatch) setMatched(nextMatched);
      setMoves(current => {
        const nextMoves = current + 1;
        if (isMatch && nextMatched.length === pairs.length) void saveScore("memory", nextMoves);
        return nextMoves;
      });
      setOpen([]);
    }, 550);
    return () => clearTimeout(timer);
  }, [openCards, matched, saveScore]);

  const resetMemory = () => { setCards(makeCards()); setOpen([]); setMatched([]); setMoves(0); };

  const tapRoute = (city: string) => {
    const now = Date.now();
    const start = routeStartedAt ?? now;
    if (routeStartedAt == null) setRouteStartedAt(start);

    if (city !== route[expected]) {
      setExpected(0);
      return;
    }
    const next = expected + 1;
    setExpected(next);
    if (next === route.length) void saveScore("route", Math.max(100, now - start));
  };

  const resetRoute = () => {
    setExpected(0);
    setRouteStartedAt(null);
    setRouteRun(shuffle(route));
  };

  return <>
    <div className="game-player">
      <label>LEADERBOARD NAME<input value={playerName} maxLength={40} placeholder="Walker" onChange={event => { const value = event.target.value; setPlayerName(value); localStorage.setItem(PLAYER_NAME, value); }} /></label>
      <span>One name. Your best scores stay on this device and the public board only changes when you beat them.</span>
    </div>

    <Tabs defaultValue="sprint" className="games"><TabsList><TabsTrigger value="sprint">Step sprint</TabsTrigger><TabsTrigger value="route">Route order</TabsTrigger><TabsTrigger value="memory">Road memory</TabsTrigger></TabsList>
      <TabsContent value="sprint" className="game-stage">
        <div><div className="section-tag">01 · SPEED</div><h2>Step Sprint</h2><p>Tap as many steps as possible in ten seconds.</p><Leaderboard game="sprint" rows={boards.sprint} best={bests.sprint} /></div>
        <div className="sprint-board"><p>TIME <strong>{time.toFixed(1)}</strong></p><p>STEPS <strong>{score}</strong></p><button className="step-button" onClick={() => running && setScore(value => value + 1)}>TAP<br />STEP</button><button className="primary-button" onClick={() => { setScore(0); setTime(10); sprintPlayed.current = true; sprintSubmitted.current = false; setRunning(true); }}>{running ? "Running…" : "Start sprint"}</button></div>
      </TabsContent>

      <TabsContent value="route" className="game-stage">
        <div><div className="section-tag">02 · KNOW THE ROAD</div><h2>Route Order</h2><p>Tap the cities from south to north. The clock begins with your first tap.</p><Leaderboard game="route" rows={boards.route} best={bests.route} /></div>
        <div><div className="route-buttons">{routeRun.map(city => <button disabled={route.indexOf(city) < expected} className={route.indexOf(city) < expected ? "correct" : ""} key={city} onClick={() => tapRoute(city)}>{city}</button>)}</div><p>{expected === route.length ? "Route complete! ✓" : `Next: ${route[expected]}`}</p><button className="primary-button" onClick={resetRoute}>Shuffle again</button></div>
      </TabsContent>

      <TabsContent value="memory" className="game-stage">
        <div><div className="section-tag">03 · MEMORY</div><h2>Road Memory</h2><p>Match each city with its state. Fewer moves wins.</p><Leaderboard game="memory" rows={boards.memory} best={bests.memory} /></div>
        <div><div className="memory-grid">{cards.map(card => <button key={card.id} className={open.includes(card.id) || matched.includes(card.pairIndex) ? "open" : ""} disabled={matched.includes(card.pairIndex)} onClick={() => setOpen(value => (value.length < 2 && !value.includes(card.id) ? [...value, card.id] : value))}><span>{card.label}</span></button>)}</div><p>Moves: {moves} · Matched: {matched.length}/{pairs.length}</p><button className="primary-button" onClick={resetMemory}>New board</button></div>
      </TabsContent>
    </Tabs>
  </>;
}
