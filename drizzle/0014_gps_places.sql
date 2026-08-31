-- Named places earned by the GPS trail, independent of the planned route.
-- A town appears here because the tracker was actually there, not because it
-- was typed into a route spreadsheet before the walk.
CREATE TABLE IF NOT EXISTS `gps_places` (
  `name` text NOT NULL,
  `state` text DEFAULT '' NOT NULL,
  `lat` real NOT NULL,
  `lon` real NOT NULL,
  `first_seen` text NOT NULL,
  `last_seen` text NOT NULL,
  `sightings` integer DEFAULT 1 NOT NULL,
  `distance_km` real DEFAULT 0 NOT NULL,
  PRIMARY KEY (`name`, `state`)
);

CREATE INDEX IF NOT EXISTS `gps_places_first_seen` ON `gps_places` (`first_seen`);
