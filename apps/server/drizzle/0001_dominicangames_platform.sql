-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 0001 — DominicanGames platform (catalog, play sessions, achievements, announcements, per-game data)
-- * Additive: no existing row is deleted. Existing saves/settings/missions are attributed to
--   'santo-domingo-open-world' through a temporary column default.
-- * Reversible: see drizzle/rollback/0001_dominicangames_platform.down.sql (npm run db:rollback).
-- * A JSON backup of every table is written before this runs (db:migrate / server boot).
-- ════════════════════════════════════════════════════════════════════════════════════════════
CREATE TYPE "public"."game_status" AS ENUM('published', 'development', 'coming_soon', 'hidden');--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(120) NOT NULL,
	"body" text NOT NULL,
	"game_id" varchar(64),
	"link_url" varchar(300),
	"link_label" varchar(40),
	"published" boolean DEFAULT true NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"game_id" varchar(64) NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"title" varchar(80) NOT NULL,
	"tagline" varchar(160) DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "game_status" DEFAULT 'coming_soon' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"platforms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"developer" varchar(80) DEFAULT 'DominicanGames' NOT NULL,
	"publisher" varchar(80) DEFAULT 'DominicanGames' NOT NULL,
	"release_label" varchar(60) DEFAULT '' NOT NULL,
	"launch_path" varchar(200),
	"cover_image" varchar(300),
	"hero_image" varchar(300),
	"screenshots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"theme" jsonb DEFAULT '{"accent":"#ff2e4d"}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "games" ("id","title","tagline","description","status","featured","sort_order","categories","platforms","developer","publisher","release_label","launch_path","cover_image","hero_image","screenshots","theme") VALUES
('santo-domingo-open-world','Santo Domingo Open World','Tu ciudad. Tu ritmo. Tu mundo abierto.',
 'Explora Santo Domingo como nunca antes. Conduce, descubre sus calles, visita lugares emblemáticos y vive una experiencia de mundo abierto inspirada en República Dominicana.',
 'published',true,1,'["Mundo abierto","Conducción","Aventura"]'::jsonb,'["PC · Navegador web"]'::jsonb,'DominicanGames','DominicanGames',
 'Gratis · Acceso anticipado','/jugar','/img/games/santo-domingo-open-world/cover.jpg','/img/games/santo-domingo-open-world/hero.jpg',
 '[{"src":"/img/games/santo-domingo-open-world/shot-malecon-noche.jpg","alt":"El Malecón de noche"},{"src":"/img/games/santo-domingo-open-world/shot-obelisco.jpg","alt":"El Obelisco del Malecón al atardecer"},{"src":"/img/games/santo-domingo-open-world/shot-el-conde.jpg","alt":"Calle El Conde al caer el sol"},{"src":"/img/games/santo-domingo-open-world/shot-lluvia-noche.jpg","alt":"Aguacero de noche en la Zona Colonial"},{"src":"/img/games/santo-domingo-open-world/shot-parque-colon.jpg","alt":"Parque Colón y la Zona Colonial desde el aire"},{"src":"/img/games/santo-domingo-open-world/shot-alcazar.jpg","alt":"Plaza de España y el Alcázar de Colón"},{"src":"/img/shot-moto.jpg","alt":"En motor por la ciudad"},{"src":"/img/shot-colmado.jpg","alt":"Don Ramón en su colmado"},{"src":"/img/games/santo-domingo-open-world/shot-gazcue-lluvia.jpg","alt":"Aguacero en Gazcue"},{"src":"/img/shot-traffic.jpg","alt":"Hora pico"}]'::jsonb,
 '{"accent":"#ff6a3d","accent2":"#ff3d6e","art":"sdow"}'::jsonb),
('moto-rd','Moto RD','Carreras y retos en motor.',
 'Concepto en desarrollo: carreras de motor, acrobacias y retos de habilidad inspirados en la cultura motorizada dominicana.',
 'coming_soon',false,10,'["Carreras","Motociclismo","Retos"]'::jsonb,'[]'::jsonb,'DominicanGames','DominicanGames',
 'Próximamente',NULL,NULL,NULL,'[]'::jsonb,'{"accent":"#ffb020","accent2":"#ff5a1f","art":"moto"}'::jsonb),
('caribbean-racing','Caribbean Racing','Carros, velocidad y calles caribeñas.',
 'Concepto en desarrollo: carreras callejeras y experiencias de conducción en escenarios inspirados en el Caribe.',
 'coming_soon',false,20,'["Carreras","Conducción"]'::jsonb,'[]'::jsonb,'DominicanGames','DominicanGames',
 'Próximamente',NULL,NULL,NULL,'[]'::jsonb,'{"accent":"#22d3ee","accent2":"#a855f7","art":"racing"}'::jsonb),
('island-survival','Island Survival','Sobrevive en una isla tropical.',
 'Concepto en desarrollo: aventura de supervivencia en una isla tropical: explora, recolecta y construye para resistir.',
 'coming_soon',false,30,'["Supervivencia","Aventura"]'::jsonb,'[]'::jsonb,'DominicanGames','DominicanGames',
 'Próximamente',NULL,NULL,NULL,'[]'::jsonb,'{"accent":"#34d399","accent2":"#0ea5e9","art":"island"}'::jsonb)
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"achievement_id" varchar(64) NOT NULL,
	"game_id" varchar(64),
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_settings" DROP CONSTRAINT "game_settings_user_id_unique";--> statement-breakpoint
ALTER TABLE "player_saves" DROP CONSTRAINT "player_saves_user_id_unique";--> statement-breakpoint
DROP INDEX "mission_progress_user_mission_uq";--> statement-breakpoint
ALTER TABLE "game_settings" ADD COLUMN "game_id" varchar(64) DEFAULT 'santo-domingo-open-world' NOT NULL;--> statement-breakpoint
ALTER TABLE "mission_progress" ADD COLUMN "game_id" varchar(64) DEFAULT 'santo-domingo-open-world' NOT NULL;--> statement-breakpoint
ALTER TABLE "player_saves" ADD COLUMN "game_id" varchar(64) DEFAULT 'santo-domingo-open-world' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar" varchar(32);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "show_in_rankings" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locale" varchar(5) DEFAULT 'es' NOT NULL;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcements_published_idx" ON "announcements" USING btree ("published","published_at");--> statement-breakpoint
CREATE INDEX "game_sessions_user_idx" ON "game_sessions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "game_sessions_game_idx" ON "game_sessions" USING btree ("game_id","started_at");--> statement-breakpoint
CREATE INDEX "games_status_idx" ON "games" USING btree ("status","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "user_achievements_user_ach_uq" ON "user_achievements" USING btree ("user_id","achievement_id");--> statement-breakpoint
ALTER TABLE "game_settings" ADD CONSTRAINT "game_settings_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_progress" ADD CONSTRAINT "mission_progress_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_saves" ADD CONSTRAINT "player_saves_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "game_settings_user_game_uq" ON "game_settings" USING btree ("user_id","game_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mission_progress_user_game_mission_uq" ON "mission_progress" USING btree ("user_id","game_id","mission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_saves_user_game_uq" ON "player_saves" USING btree ("user_id","game_id");--> statement-breakpoint
ALTER TABLE "game_settings" ALTER COLUMN "game_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "mission_progress" ALTER COLUMN "game_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "player_saves" ALTER COLUMN "game_id" DROP DEFAULT;--> statement-breakpoint
INSERT INTO "announcements" ("title","body","game_id","link_url","link_label","published","pinned") VALUES
('Santo Domingo Open World ahora es gratis',
 'Ya no hay que pagar para jugar: crea tu cuenta de DominicanGames gratis y explora Santo Domingo desde el navegador de tu computadora. Si compraste el acceso anteriormente, tu cuenta conserva la insignia Fundador.',
 'santo-domingo-open-world','/juegos/santo-domingo-open-world','Ver el juego',true,true);
