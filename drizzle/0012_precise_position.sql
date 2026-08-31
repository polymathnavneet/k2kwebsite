-- Where he actually is, rather than which city contains him.
--
-- "Lucknow" is three hundred and fifty square kilometres. It is a true answer
-- and a useless one to anybody who wanted to know where the man is, and it was
-- fairly called out as such. These carry the corner of the town the phone is
-- standing in, and how precise that phone claims to be, so the site can state
-- the position to the metre and say honestly how much to trust it.
ALTER TABLE `journey` ADD `precise_place` text DEFAULT '' NOT NULL;
ALTER TABLE `journey` ADD `accuracy_m` real;
