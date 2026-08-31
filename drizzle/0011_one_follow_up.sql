-- One follow-up, not an endless thread.
--
-- The original question and Navneet's answer stay exactly as they are. These
-- four additive columns let the same person ask once more and let Navneet
-- answer once more. No existing messages or replies are changed.
ALTER TABLE `messages` ADD `follow_up` text DEFAULT '' NOT NULL;
ALTER TABLE `messages` ADD `follow_up_reply` text DEFAULT '' NOT NULL;
ALTER TABLE `messages` ADD `follow_up_at` text;
ALTER TABLE `messages` ADD `follow_up_replied_at` text;
