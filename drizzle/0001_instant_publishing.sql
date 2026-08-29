-- Messages now publish the moment they arrive. Two changes:
--   1. New messages default to 'public' instead of 'held'.
--   2. Everything already sitting in the holding queue is released.
-- Anything explicitly hidden stays hidden.
--
-- SQLite cannot ALTER a column default, so the table is rebuilt.

CREATE TABLE `messages_new` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`place` text DEFAULT '' NOT NULL,
	`message` text NOT NULL,
	`contact` text NOT NULL,
	`status` text DEFAULT 'public' NOT NULL,
	`reply` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`replied_at` text
);
--> statement-breakpoint
INSERT INTO `messages_new` (`id`, `type`, `name`, `place`, `message`, `contact`, `status`, `reply`, `created_at`, `replied_at`)
SELECT `id`, `type`, `name`, `place`, `message`, `contact`,
	CASE WHEN `status` = 'hidden' THEN 'hidden' ELSE 'public' END,
	`reply`, `created_at`, `replied_at`
FROM `messages`;
--> statement-breakpoint
DROP TABLE `messages`;
--> statement-breakpoint
ALTER TABLE `messages_new` RENAME TO `messages`;
