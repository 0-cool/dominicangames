import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Development-only: serves world data to the engine harness (harness.html) without
 * a session so artists/devs can iterate on visuals. Never active in builds, and
 * only when SD_DEV_HARNESS=1. Production world data is served exclusively by the API
 * to signed-in DominicanGames players (GET /api/game/assets/*).
 */
function devWorldData(): Plugin {
  const root = resolve(__dirname, '../server/game-data');
  return {
    name: 'sd-dev-world-data',
    apply: 'serve',
    configureServer(server) {
      if (process.env.SD_DEV_HARNESS !== '1') return;
      server.middlewares.use('/dev-world', (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '');
        const file = resolve(root, rel);
        if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : 'application/octet-stream');
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), devWorldData()],
  server: {
    port: 5173,
    // API + server-generated SEO files (robots.txt / sitemap.xml come from the catalog)
    proxy: { '/api': 'http://127.0.0.1:4000', '/sandbox-pay': 'http://127.0.0.1:4000', '/robots.txt': 'http://127.0.0.1:4000', '/sitemap.xml': 'http://127.0.0.1:4000' },
  },
  preview: { port: 5173, proxy: { '/api': 'http://127.0.0.1:4000', '/sandbox-pay': 'http://127.0.0.1:4000', '/robots.txt': 'http://127.0.0.1:4000', '/sitemap.xml': 'http://127.0.0.1:4000' } },
  build: {
    target: 'es2022',
    sourcemap: true,
    // The lazy game chunk (three.js + Rapier WASM inlined + engine) is ~5.3 MB raw / ~2 MB gzip by design.
    chunkSizeWarningLimit: 6000,
    rollupOptions: { input: { main: resolve(__dirname, 'index.html') } },
  },
});
