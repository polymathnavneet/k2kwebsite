-- One question a day, one answer, published straight to the journal.

CREATE TABLE `journal_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`question` text DEFAULT '' NOT NULL,
	`body` text NOT NULL,
	`place` text DEFAULT '' NOT NULL,
	`phase` text DEFAULT 'preparation' NOT NULL,
	`published` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
