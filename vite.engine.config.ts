import { defineConfig } from 'vite';
export default defineConfig({ build: {
  outDir: 'lib', lib: { entry: 'src/engine/index.ts', formats: ['es'], fileName: 'atmosphere-engine' },
  rollupOptions: { external: ['three'] }, sourcemap: true
} });
