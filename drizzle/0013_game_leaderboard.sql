-- Persistent game records and the public leaderboard.
-- One row per browser/player per game. The API only replaces a score when the
-- player actually beats it, so refreshing the site cannot erase a personal best.
CREATE TABLE IF NOT EXISTS `game_scores` (
  `game` text NOT NULL,
  `player_id` text NOT NULL,
  `player_name` text NOT NULL,
  `score` integer NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (`game`, `player_id`)
);

CREATE INDEX IF NOT EXISTS `game_scores_sprint_rank` ON `game_scores` (`game`, `score`);
