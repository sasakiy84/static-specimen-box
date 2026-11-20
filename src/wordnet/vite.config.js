import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const metadata = JSON.parse(readFileSync(new URL('./.generated/metadata.json', import.meta.url), 'utf8'));

export default defineConfig({
  base: './',
  publicDir: '.generated/public',
  define: {
    WORDNET_DATA_VERSION: JSON.stringify(metadata.version),
    WORDNET_STATS: JSON.stringify(metadata.stats),
  },
});
