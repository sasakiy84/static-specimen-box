import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { license: { fileName: 'THIRD-PARTY-NOTICES.md' } },
});
