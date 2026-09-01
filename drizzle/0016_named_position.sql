-- Where the place name was last asked for.
--
-- OwnTracks queues every position it cannot deliver. Navneet's phone had 3,834
-- of them waiting behind a DNS failure, and the moment that clears they arrive
-- as 3,834 separate requests in a few minutes. Every one of them used to ask
-- OpenStreetMap's Nominatim what that position is called.
--
-- Nominatim's usage policy is one request a second, and it bans clients that
-- ignore it. Losing it would cost the site every place name for the rest of the
-- walk, to name a town he was standing in nine hours ago.
--
-- So the name is asked for against the position it was last asked for at,
-- rather than against the last position stored - which changes with every fix
-- and so could never accumulate. A phone standing still asks nothing; a walk
-- asks once every two hundred metres.
ALTER TABLE `journey` ADD `named_lat` real;
ALTER TABLE `journey` ADD `named_lon` real;
