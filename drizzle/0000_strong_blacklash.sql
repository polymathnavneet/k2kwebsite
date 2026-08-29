CREATE TABLE `book_registrations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`contact` text NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`format` text DEFAULT 'either' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `book_contact_unique` ON `book_registrations` (`contact`);--> statement-breakpoint
CREATE TABLE `journey` (
	`id` integer PRIMARY KEY NOT NULL,
	`mode` text DEFAULT 'preparation' NOT NULL,
	`status` text DEFAULT 'Preparing' NOT NULL,
	`day` integer DEFAULT 0 NOT NULL,
	`distance_today` real DEFAULT 0 NOT NULL,
	`distance_total` real DEFAULT 0 NOT NULL,
	`steps_today` integer DEFAULT 0 NOT NULL,
	`walking_minutes` integer DEFAULT 0 NOT NULL,
	`current_place` text DEFAULT 'Lucknow, Uttar Pradesh' NOT NULL,
	`lat` real DEFAULT 26.8467 NOT NULL,
	`lon` real DEFAULT 80.9462 NOT NULL,
	`temperature` real,
	`altitude` real,
	`battery` integer,
	`connectivity` text DEFAULT 'Preparation mode' NOT NULL,
	`last_sleep` text DEFAULT 'Lucknow' NOT NULL,
	`latest_title` text DEFAULT 'The walk before the walk' NOT NULL,
	`latest_text` text DEFAULT 'Training, saving and preparing to cross India at walking speed.' NOT NULL,
	`latest_url` text DEFAULT '/journal' NOT NULL,
	`sponsor_name` text DEFAULT 'Partnership open' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`place` text DEFAULT '' NOT NULL,
	`message` text NOT NULL,
	`contact` text NOT NULL,
	`status` text DEFAULT 'held' NOT NULL,
	`reply` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`replied_at` text
);
--> statement-breakpoint
CREATE TABLE `reactions` (
	`type` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `route_config` (
	`id` integer PRIMARY KEY NOT NULL,
	`title` text DEFAULT 'A Long Walk' NOT NULL,
	`start_date` text NOT NULL,
	`pace_km_per_day` real DEFAULT 25 NOT NULL,
	`total_distance` integer NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `route_stops` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sort_order` integer NOT NULL,
	`name` text NOT NULL,
	`state` text DEFAULT '' NOT NULL,
	`lat` real NOT NULL,
	`lon` real NOT NULL,
	`km` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL
);
