import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';
import {viteSingleFile} from 'vite-plugin-singlefile';

export default defineConfig({root: 'mentions-ui', base: './', publicDir: false, plugins: [react(), viteSingleFile()],
  build: {outDir: '../dist/mentions-ui', emptyOutDir: true, assetsInlineLimit: Number.MAX_SAFE_INTEGER, cssCodeSplit: false, sourcemap: false, target: 'es2022'},
});
