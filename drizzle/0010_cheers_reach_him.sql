-- Cheers that Navneet can actually see.
--
-- The button on the homepage has always worked: it posted, the server counted
-- it, and the count went into a single row that no page ever read. So every
-- cheer since the site launched landed in a number nobody looked at, and the
-- man being cheered had no idea anyone had. This is where the day's cheers go,
-- so "47 people cheered you today" is a thing the site can say.
CREATE TABLE `reaction_days` (
  `day` text NOT NULL,
  `type` text NOT NULL,
  `count` integer DEFAULT 0 NOT NULL,
  PRIMARY KEY (`day`, `type`)
);
