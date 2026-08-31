-- How many separate times a place has been seen off the drawn line.
--
-- One sighting is a guess; a bad fix in a tunnel can produce one. A place seen
-- repeatedly, over time, is somewhere he is actually walking - and the route
-- should follow the walk rather than wait to be asked.
ALTER TABLE `route_suggestions` ADD `sightings` integer DEFAULT 1 NOT NULL;
