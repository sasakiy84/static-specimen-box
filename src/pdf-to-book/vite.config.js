import { defineConfig } from 'vite';

const headers = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  base: './',
  server: { headers },
  preview: { headers },
  publicDir: '.generated/assets',
  optimizeDeps: { exclude: ['onnxruntime-web/wasm'] },
  build: { license: { fileName: 'THIRD-PARTY-NOTICES.md' } },
});
