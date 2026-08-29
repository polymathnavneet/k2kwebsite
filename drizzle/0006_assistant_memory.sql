-- What the assistant has learned: taps used, questions skipped, facts told to it.

CREATE TABLE `assistant_memory` (
	`key` text PRIMARY KEY NOT NULL,
	`kind` text DEFAULT 'fact' NOT NULL,
	`value` text DEFAULT '' NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
