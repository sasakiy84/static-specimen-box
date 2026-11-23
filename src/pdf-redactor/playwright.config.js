import { defineConfig } from '@playwright/test';

const publishedUrl = process.env.PDF_REDACTOR_TEST_URL;
const baseURL = publishedUrl || 'http://127.0.0.1:4188';

export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.js',
  outputDir: '.generated/test-results',
  use: { baseURL },
  webServer: publishedUrl ? undefined : {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4188 --strictPort',
    url: baseURL,
  },
});
