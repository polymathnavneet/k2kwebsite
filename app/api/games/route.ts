import { env } from "cloudflare:workers";
import { clean } from "@/lib/server";

const games = ["sprint", "route", "memory"] as const;
type Game = typeof games[number];

type ScoreRow = { name: string; score: number };
type Stored = { score: number };

const lowerWins = (game: Game) => game !== "sprint";
const validScore = (game: Game, score: number) => {
  if (!Number.isInteger(score)) return false;
  if (game === "sprint") return score >= 0 && score <= 1000;
  if (game === "route") return score >= 100 && score <= 3600000; // milliseconds
  return score >= 1 && score <= 999; // memory moves
};

async function board(db: D1Database, game: Game) {
  const order = lowerWins(game) ? "ASC" : "DESC";
  const result = await db.prepare(`
    SELECT player_name AS name, score
    FROM game_scores
    WHERE game = ?
    ORDER BY score ${order}, updated_at ASC
    LIMIT 10
  `).bind(game).all<ScoreRow>();
  return result.results ?? [];
}

export async function GET() {
  const db = (env as unknown as { DB: D1Database }).DB;
  const [sprint, route, memory] = await Promise.all([
    board(db, "sprint"), board(db, "route"), board(db, "memory"),
  ]);
  return Response.json({ sprint, route, memory }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const game = String(body.game) as Game;
  const playerId = clean(body.playerId, 80);
  const playerName = clean(body.playerName, 40) || "Walker";
  const score = Number(body.score);

  if (!games.includes(game) || !/^[a-zA-Z0-9_-]{8,80}$/.test(playerId) || !validScore(game, score)) {
    return Response.json({ error: "Invalid score" }, { status: 400 });
  }

  const db = (env as unknown as { DB: D1Database }).DB;
  const current = await db.prepare("SELECT score FROM game_scores WHERE game = ? AND player_id = ? LIMIT 1")
    .bind(game, playerId).first<Stored>();
  const improved = !current || (lowerWins(game) ? score < current.score : score > current.score);

  if (improved) {
    await db.prepare(`
      INSERT INTO game_scores (game, player_id, player_name, score, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(game, player_id) DO UPDATE SET
        player_name = excluded.player_name,
        score = excluded.score,
        updated_at = CURRENT_TIMESTAMP
    `).bind(game, playerId, playerName, score).run();
  } else if (current) {
    // A renamed player should not have to beat their record just to update the
    // name beside it.
    await db.prepare("UPDATE game_scores SET player_name = ? WHERE game = ? AND player_id = ?")
      .bind(playerName, game, playerId).run();
  }

  return Response.json({
    ok: true,
    improved,
    best: improved ? score : current?.score ?? score,
    leaderboard: await board(db, game),
  });
}
