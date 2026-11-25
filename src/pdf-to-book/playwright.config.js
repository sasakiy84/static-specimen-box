import { defineConfig } from '@playwright/test';

const published = process.env.PDF_TO_BOOK_URL;
const baseURL = published || 'http://127.0.0.1:4186';
export default defineConfig({
  testDir: 'tests',
  testMatch: '*.spec.js',
  outputDir: '.generated/test-results',
  timeout: 120_000,
  use: { baseURL },
  webServer: published ? undefined : {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4186 --strictPort',
    url: baseURL,
  },
});
