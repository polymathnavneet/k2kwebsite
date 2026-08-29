-- Photos and videos, held as links rather than files. Instagram and YouTube
-- already host and stream them; storing a link costs nothing and cannot fill up.

CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text DEFAULT 'instagram' NOT NULL,
	`url` text NOT NULL,
	`caption` text DEFAULT '' NOT NULL,
	`place` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
