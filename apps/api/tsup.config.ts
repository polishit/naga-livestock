import { defineConfig } from 'tsup';

export default defineConfig([
  {
  entry: ['src/index.ts', 'prisma/seed.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Bundle the workspace package (it ships TypeScript source); keep real deps external.
  noExternal: ['@livestock/shared'],
  },
  {
    // Vercel: the whole API as one self-contained bundle (every dependency included).
    entry: { index: 'src/vercel.ts' },
    format: ['esm'],
    target: 'node20',
    platform: 'node',
    outDir: 'dist-vercel',
    clean: true,
    noExternal: [/.*/],
    // Bundled CommonJS packages still call require() for Node built-ins.
    banner: {
      js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
    },
  },
]);
