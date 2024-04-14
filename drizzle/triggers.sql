-- Can't update a locked match
CREATE TRIGGER `matches_update`
BEFORE UPDATE OF `turn_number` ON `matches` FOR EACH ROW
WHEN EXISTS(SELECT 1 FROM `match_locks` WHERE `match_id` = OLD.`match_id`)
BEGIN
    SELECT RAISE(ABORT, 'Match is locked');
END;

-- Inserting a lock should update it if the timestamp is older than 1 minute.
CREATE TRIGGER `match_locks_insert`
BEFORE INSERT ON `match_locks` FOR EACH ROW
BEGIN
    DELETE FROM `match_locks` WHERE strftime('%s', 'now') - strftime('%s', `timestamp`) > 60 * 1;
END;