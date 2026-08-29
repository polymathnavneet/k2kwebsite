-- The real GPS trail, not just the latest point and a running total.
--
-- The unique index is the important part: re-uploading the same recorded track
-- conflicts instead of inserting, so the same kilometres cannot be counted twice.

CREATE TABLE `gps_points` (
	`id` text PRIMARY KEY NOT NULL,
	`recorded_at` text NOT NULL,
	`lat` real NOT NULL,
	`lon` real NOT NULL,
	`accuracy` real,
	`source` text DEFAULT 'manual' NOT NULL,
	`counted_km` real DEFAULT 0 NOT NULL,
	`speed_kmh` real,
	`counted` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gps_point_unique` ON `gps_points` (`recorded_at`,`lat`,`lon`);
