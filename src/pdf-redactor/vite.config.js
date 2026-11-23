import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  publicDir: '.generated/assets',
  build: { license: { fileName: 'THIRD-PARTY-NOTICES.md' } },
});
