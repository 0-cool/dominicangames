import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
// Bundles the API (and the workspace @sd/shared + El Tapón simulation sources) into dist/index.js; node_modules stay
// external. fileURLToPath keeps the workspace paths valid on Windows too.
const src = (rel) => fileURLToPath(new URL(`../../../packages/${rel}`, import.meta.url));
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: true,
  packages: 'external',
  plugins: [
    {
      name: 'workspace',
      setup(b) {
        b.onResolve({ filter: /^@sd\/shared$/ }, () => ({ path: src('shared/src/index.ts') }));
        b.onResolve({ filter: /^@sd\/tapon\/sim$/ }, () => ({ path: src('tapon/src/sim/index.ts') }));
      },
    },
  ],
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
});
console.log('server bundled → dist/index.js');
