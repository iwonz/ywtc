import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';
import {viteSingleFile} from 'vite-plugin-singlefile';

export default defineConfig({
  root: 'report-ui',
  base: './',
  publicDir: false,
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: '../dist/report-ui',
    emptyOutDir: true,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    sourcemap: false,
    target: 'es2022',
  },
});
