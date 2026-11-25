import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  publicDir: '.generated/assets',
  optimizeDeps: { exclude: ['onnxruntime-web/wasm'] },
  build: { license: { fileName: 'THIRD-PARTY-NOTICES.md' } },
});
