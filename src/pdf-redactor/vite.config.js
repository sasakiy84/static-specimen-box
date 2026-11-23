import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  base: './',
  plugins: [
    wasm(),
    {
      name: 'preserve-redaction-wasm-initializer',
      transform(code, id) {
        // SDK の sideEffects 設定にかかわらず WASM の初期化を残す。
        if (id.endsWith('/vendor/pdf-wasm/pdf_wasm.js')) return { code, moduleSideEffects: true };
      },
    },
  ],
  optimizeDeps: { exclude: ['@fabifont/open-redact-pdf'] },
  publicDir: '.generated/assets',
  build: { license: { fileName: 'THIRD-PARTY-NOTICES.md' } },
});
