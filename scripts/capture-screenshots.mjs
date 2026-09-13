/**
 * Capture the submission screenshots from the running app.
 *
 * Usage:  npm run dev        (in one terminal)
 *         npm run screenshots
 *
 * Writes PNGs to docs/screenshots/. Deterministic and repeatable — if the UI
 * changes, re-run it rather than re-cropping images by hand.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

// --- .env (same approach as playwright.config.ts) -------------------------
for (const raw of fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8').split('\n') : []) {
  const line = raw.trim();
  if (line === '' || line.startsWith('#')) continue;
  const eq = line.indexOf('=');
  if (eq === -1) continue;
  const key = line.slice(0, eq).trim();
  let value = line.slice(eq + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  if (!(key in process.env)) process.env[key] = value;
}

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:4321';
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const OUT = path.resolve('docs/screenshots');

if (!EMAIL || !PASSWORD) {
  console.error('E2E_EMAIL and E2E_PASSWORD must be set in .env');
  process.exit(1);
}

const DATASHEET = `Prusament PETG Jet Black
Material: PETG
Nozzle temperature: 240 °C
Bed temperature: 90 °C
Print speed: 45 mm/s
Flow rate: 98 %
Cooling: 50 %`;

fs.mkdirSync(OUT, { recursive: true });

/** The Astro dev toolbar floats over the page in dev mode and lands in the
 *  middle of a full-page screenshot. Hide it for the capture only — this does
 *  not change the toolbar in normal development. */
const HIDE_DEV_TOOLBAR = `
  astro-dev-toolbar,
  astro-dev-overlay { display: none !important; }
`;

const shot = async (page, name) => {
  await page.addStyleTag({ content: HIDE_DEV_TOOLBAR }).catch(() => {});
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: true });
  console.log('  ✓', path.relative(process.cwd(), file));
};

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

try {
  console.log(`Capturing from ${BASE}`);

  // 1 — login screen
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('#email');
  await shot(page, '01-login.png');

  // sign in
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/filaments/);

  // 2 — post-login home: the inventory
  await page.waitForSelector('[data-testid="inventory-table"]');
  await shot(page, '02-inventory.png');

  // 3 — main feature #1: datasheet paste -> extracted parameters for review
  await page.goto(`${BASE}/filaments/new`);
  await page.waitForSelector('[data-testid="filament-form"][data-hydrated="true"]');
  await page.getByTestId('datasheet-input').fill(DATASHEET);
  await page.getByTestId('extract-button').click();
  await page.waitForSelector('[data-testid="extract-summary"]');
  await shot(page, '03-datasheet-extraction.png');

  // 4 — main feature #2: project parameters with conflict detection
  await page.goto(`${BASE}/projects`);
  const open = page.getByRole('link', { name: 'Open' }).first();
  if (await open.count()) {
    await open.click();
    await page.waitForSelector('[data-testid="parameter-block"]');
    await shot(page, '04-project-parameters.png');
  } else {
    console.warn('  ! no project found — skipping 04; create one first');
  }

  // 5 — validation refusing an over-committed project (bonus)
  await page.goto(`${BASE}/projects/new`);
  await page.waitForSelector('[data-testid="project-form"][data-hydrated="true"]');
  const select = page.getByTestId('line-filament');
  const value = await select.locator('option').nth(1).getAttribute('value');
  if (value) {
    await page.getByTestId('project-name').fill('Oversized test print');
    await select.selectOption(value);
    await page.getByTestId('line-usage').fill('99999');
    await page.waitForSelector('[data-testid="validation-errors"]');
    await shot(page, '05-validation.png');
  }

  console.log('\nDone. Files are in docs/screenshots/');
} finally {
  await browser.close();
}
