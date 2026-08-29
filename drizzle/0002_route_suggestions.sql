-- Where the site records a place it has spotted and wants confirmed before it
-- touches the route, plus the journey's position along the route (which is a
-- different measure from the distance actually walked).

CREATE TABLE `route_suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text DEFAULT 'add_stop' NOT NULL,
	`name` text NOT NULL,
	`state` text DEFAULT '' NOT NULL,
	`lat` real NOT NULL,
	`lon` real NOT NULL,
	`km` integer NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`decided_at` text
);
--> statement-breakpoint
ALTER TABLE `journey` ADD `route_progress_km` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `journey` ADD `off_route_km` real DEFAULT 0 NOT NULL;
