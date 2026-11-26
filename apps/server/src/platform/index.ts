import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../app.ts';
import { catalogRoutes } from './catalog.ts';
import { communityRoutes } from './community.ts';
import { dashboardRoutes } from './dashboard.ts';
import { seoRoutes } from './seo.ts';
import { sessionRoutes } from './sessions.ts';

/**
 * DOMINICANGAMES CORE — the centralized platform: identity (routes/auth.ts), catalog, game access, play sessions,
 * achievements, rankings, announcements, dashboard, SEO and administration. Game modules (games/*) plug into it.
 */
export function platformRoutes(app: FastifyInstance, ctx: Ctx) {
  catalogRoutes(app, ctx);
  sessionRoutes(app, ctx);
  communityRoutes(app, ctx);
  dashboardRoutes(app, ctx);
  seoRoutes(app, ctx);
  for (const m of ctx.modules) m.registerRoutes(app, ctx);
}
