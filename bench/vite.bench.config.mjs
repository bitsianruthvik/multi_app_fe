// The bench as a production build (minified, no dev React):
//   npx vite build --config bench/vite.bench.config.mjs && copy the models to bench/dist/bench/data/
//   npx vite preview --config bench/vite.bench.config.mjs   →  http://127.0.0.1:5192/bench/model3d.html?m=rdso
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
export default defineConfig({
  root, plugins: [react()],
  build: { outDir: 'bench/dist', emptyOutDir: true, rollupOptions: { input: `${root}bench/model3d.html` } },
  preview: { port: 5192, strictPort: true, host: '127.0.0.1' },
});
