/// <reference types="vitest" />
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Writes the hashed build assets and a build id into dist/sw.js. */
function precache(): Plugin {
  let assets: string[] = [];
  return {
    name: 'precache',
    apply: 'build',
    generateBundle(_, bundle) {
      assets = Object.keys(bundle).filter((f) => f.startsWith('assets/')).map((f) => `./${f}`);
    },
    closeBundle() {
      const file = resolve(__dirname, 'dist/sw.js');
      const build = Date.now().toString(36);
      const src = readFileSync(file, 'utf8')
        .replace('__BUILD__', build)
        .replace('/*__PRECACHE__*/ []', JSON.stringify(assets.sort()));
      writeFileSync(file, src);
    },
  };
}

// Relative base so the build works from any sub path (e.g. GitHub Pages).
export default defineConfig({
  base: './',
  plugins: [react(), precache()],
  worker: { format: 'es' },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
