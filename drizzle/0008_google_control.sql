-- Running the site from Google.
--
-- site_settings remembers which sheet and which document to read, and what
-- happened last time they were read. content_blocks holds the prose those
-- documents put on the pages, one row per named slot.

CREATE TABLE `site_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE `content_blocks` (
	`slot` text PRIMARY KEY NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
