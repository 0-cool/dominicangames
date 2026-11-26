-- Rollback of 0002_el_tapon (run with: npm run db:rollback -- 0002_el_tapon). A JSON backup is written first.
-- Removes El Tapón from the catalog with its runs, sessions and achievements, and the guest_play column.
UPDATE "announcements" SET "game_id" = NULL WHERE "game_id" = 'el-tapon';
DELETE FROM "user_achievements" WHERE "game_id" = 'el-tapon';
DELETE FROM "game_sessions" WHERE "game_id" = 'el-tapon';
DROP TABLE IF EXISTS "arcade_runs";
DELETE FROM "games" WHERE "id" = 'el-tapon';
ALTER TABLE "games" DROP COLUMN IF EXISTS "guest_play";
