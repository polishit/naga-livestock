import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'prisma/seed.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Bundle the workspace package (it ships TypeScript source); keep real deps external.
  noExternal: ['@livestock/shared'],
});
