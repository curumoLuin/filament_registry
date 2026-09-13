import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Load .env into process.env.
 *
 * Astro/Vite loads .env for the application, but the Playwright runner is a
 * separate Node process that gets nothing. Without this, E2E_EMAIL and
 * E2E_PASSWORD are simply undefined and the suite signs in with placeholder
 * credentials — which fails as "Invalid email or password" and looks like an
 * application bug rather than a configuration gap.
 *
 * Hand-rolled rather than pulling in dotenv: it is fifteen lines and keeps the
 * dependency list honest. Real environment variables always win, so CI can
 * override without touching the file.
 */
function loadEnvFile(file = '.env'): void {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) return;

  for (const raw of fs.readFileSync(full, 'utf8').split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile();

/** Fail loudly and early rather than as a confusing login failure 30s in. */
for (const key of ['E2E_EMAIL', 'E2E_PASSWORD'] as const) {
  if (!process.env[key]) {
    throw new Error(
      `${key} is not set. Copy .env.example to .env and fill in the credentials ` +
        'of the owner account you created in Supabase Studio. ' +
        'The end-to-end suite signs in as that account.',
    );
  }
}

// Astro dev binds to `localhost`, which resolves to ::1 before 127.0.0.1 on
// macOS. Polling 127.0.0.1 makes webServer time out even though the server is
// up, so address it the same way Astro advertises it.
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:4321';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
});
