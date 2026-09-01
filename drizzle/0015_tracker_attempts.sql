-- Every knock on the tracking door, accepted or refused.
--
-- A phone posting with the wrong key got a 401 and left no trace, so "the app
-- has never been set up" and "the app has been trying two hundred times a day
-- and being turned away" looked identical from the admin panel: an empty GPS
-- table either way. That ambiguity is the whole reason the position sat
-- seventeen hours stale with nobody able to say why.
--
-- No secrets are kept. The key that was offered is never written down - only
-- whether it was the right length, which separates "empty" from "wrong" from
-- "right" without storing the value itself.
CREATE TABLE `tracker_attempts` (
  `id` text PRIMARY KEY NOT NULL,
  `at` text NOT NULL,
  `route` text NOT NULL,
  `method` text NOT NULL,
  `outcome` text NOT NULL,
  `detail` text DEFAULT '' NOT NULL,
  `agent` text DEFAULT '' NOT NULL
);
CREATE INDEX `tracker_attempt_at` ON `tracker_attempts` (`at`);
