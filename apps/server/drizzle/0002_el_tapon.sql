-- DominicanGames 0002: El Tapón (second title). Adds arcade runs (high scores with server replay checks), guest play
-- in the catalog and the catalog entry itself. Reversible: drizzle/rollback/0002_el_tapon.down.sql (a JSON backup is
-- written before migrating).
CREATE TABLE "arcade_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" varchar(64) NOT NULL,
	"user_id" uuid,
	"guest_name" varchar(20),
	"seed" integer NOT NULL,
	"sim_version" integer NOT NULL,
	"secret_hash" char(64) NOT NULL,
	"ip_hash" char(64),
	"status" varchar(12) DEFAULT 'started' NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"score" integer,
	"distance_m" integer,
	"duration_ms" integer,
	"stats" jsonb,
	"replay" jsonb,
	"reject_reasons" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "guest_play" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "arcade_runs" ADD CONSTRAINT "arcade_runs_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arcade_runs" ADD CONSTRAINT "arcade_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "arcade_runs_board_idx" ON "arcade_runs" USING btree ("game_id","status","score");--> statement-breakpoint
CREATE INDEX "arcade_runs_user_idx" ON "arcade_runs" USING btree ("user_id","game_id");--> statement-breakpoint
CREATE INDEX "arcade_runs_ip_idx" ON "arcade_runs" USING btree ("ip_hash","started_at");
--> statement-breakpoint
INSERT INTO "games" ("id","title","tagline","description","status","featured","sort_order","categories","platforms","developer","publisher","release_label","launch_path","cover_image","hero_image","screenshots","theme","guest_play") VALUES
('el-tapon','El Tapón','Sobrevive al tapón de Santo Domingo en motoconcho.',
 'Eres motoconchista en plena hora pico: esquiva carros públicos, Sonatas mamey, guaguas, la OMSA, la platanera y los agentes de tránsito, rebasa por un pelo y lleva a tus pasajeros. Tres cascos y una ciudad entera de tapón. Juega gratis, con o sin cuenta.',
 'published',false,2,'["Arcade","Conducción","Humor"]'::jsonb,'["PC · Navegador web"]'::jsonb,'DominicanGames','DominicanGames',
 'Gratis · Nuevo','/juegos/el-tapon/jugar','/img/games/el-tapon/cover.jpg','/img/games/el-tapon/hero.jpg',
 '[{"src": "/img/games/el-tapon/shot-hora-pico.jpg", "alt": "Hora pico en la Lincoln"}, {"src": "/img/games/el-tapon/shot-platanera.jpg", "alt": "La Platanera soltando plátanos"}, {"src": "/img/games/el-tapon/shot-transito.jpg", "alt": "Carril cerrado por los agentes de tránsito"}, {"src": "/img/games/el-tapon/shot-omsa.jpg", "alt": "Rebasando la OMSA"}, {"src": "/img/games/el-tapon/shot-pasajera.jpg", "alt": "Con pasajera a bordo"}, {"src": "/img/games/el-tapon/shot-guagua.jpg", "alt": "La guagua frena de golpe: ¡Vamo, vamo!"}, {"src": "/img/games/el-tapon/shot-pare.jpg", "alt": "El agente de tránsito para un carril"}, {"src": "/img/games/el-tapon/shot-chequeo.jpg", "alt": "Chequeo policial en la Kennedy"}, {"src": "/img/games/el-tapon/shot-noche.jpg", "alt": "De noche en la Winston Churchill"}]'::jsonb,
 '{"accent":"#ff8a3d","accent2":"#ffd23f","art":"tapon"}'::jsonb,true)
ON CONFLICT ("id") DO NOTHING;
