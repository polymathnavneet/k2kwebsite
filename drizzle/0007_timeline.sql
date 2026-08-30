-- The run-up to the first step, moved out of the repository and into the
-- database so it can be edited from the admin panel rather than by a deploy.
--
-- The last step is the walk's start date. Keeping it here rather than only in
-- route_config means changing "the first step" moves every arrival date on the
-- route with it, which is the point: one date, one edit, everything follows.

CREATE TABLE `timeline_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`title` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_final` integer DEFAULT 0 NOT NULL
);
