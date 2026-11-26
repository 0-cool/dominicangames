-- ════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK of 0001_dominicangames_platform → schema of 0000_init.
-- Run with:  npm run db:rollback -- 0001_dominicangames_platform
-- (the script writes a JSON backup first and runs everything below in ONE transaction).
--
-- Data notes:
--  * Santo Domingo Open World saves, settings and mission progress are kept.
--  * Rows that belong to OTHER games cannot exist in the old one-save-per-user schema and are removed
--    (they are in the JSON backup written just before the rollback).
--  * The catalog, play sessions, achievements and announcements tables are dropped (also in the backup).
-- ════════════════════════════════════════════════════════════════════════════════════════════
DELETE FROM "player_saves" WHERE "game_id" <> 'santo-domingo-open-world';
DELETE FROM "game_settings" WHERE "game_id" <> 'santo-domingo-open-world';
DELETE FROM "mission_progress" WHERE "game_id" <> 'santo-domingo-open-world';

DROP INDEX IF EXISTS "player_saves_user_game_uq";
DROP INDEX IF EXISTS "game_settings_user_game_uq";
DROP INDEX IF EXISTS "mission_progress_user_game_mission_uq";

ALTER TABLE "player_saves" DROP CONSTRAINT IF EXISTS "player_saves_game_id_games_id_fk";
ALTER TABLE "game_settings" DROP CONSTRAINT IF EXISTS "game_settings_game_id_games_id_fk";
ALTER TABLE "mission_progress" DROP CONSTRAINT IF EXISTS "mission_progress_game_id_games_id_fk";

ALTER TABLE "player_saves" DROP COLUMN "game_id";
ALTER TABLE "game_settings" DROP COLUMN "game_id";
ALTER TABLE "mission_progress" DROP COLUMN "game_id";

ALTER TABLE "player_saves" ADD CONSTRAINT "player_saves_user_id_unique" UNIQUE ("user_id");
ALTER TABLE "game_settings" ADD CONSTRAINT "game_settings_user_id_unique" UNIQUE ("user_id");
CREATE UNIQUE INDEX "mission_progress_user_mission_uq" ON "mission_progress" USING btree ("user_id", "mission_id");

DROP TABLE IF EXISTS "user_achievements";
DROP TABLE IF EXISTS "announcements";
DROP TABLE IF EXISTS "game_sessions";
DROP TABLE IF EXISTS "games";
DROP TYPE IF EXISTS "public"."game_status";

ALTER TABLE "users" DROP COLUMN IF EXISTS "avatar";
ALTER TABLE "users" DROP COLUMN IF EXISTS "show_in_rankings";
ALTER TABLE "users" DROP COLUMN IF EXISTS "locale";
