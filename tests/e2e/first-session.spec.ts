import { expect, test, type Page } from '@playwright/test';

/**
 * The PRD's primary success criterion, as one test: the 8-step first-session
 * flow must complete end-to-end without errors.
 *
 * Also covers test-plan R-08 (anonymous access is refused).
 *
 * Requires a seeded Supabase project and E2E_EMAIL / E2E_PASSWORD in .env —
 * playwright.config.ts loads that file and refuses to start without them.
 */

const EMAIL = process.env.E2E_EMAIL!;
const PASSWORD = process.env.E2E_PASSWORD!;

const DATASHEET = `Prusament PLA Galaxy Black
Material: PLA
Nozzle temperature: 215 °C
Bed temperature: 60 °C
Print speed: 60 mm/s
Flow rate: 95 %
Cooling: 100 %`;

const STAMP = Date.now();
const FILAMENT_NAME = `E2E Prusament PLA ${STAMP}`;
const PROJECT_NAME = `E2E Benchy ${STAMP}`;
const INITIAL_G = 1000;
const USAGE_G = 200;

/**
 * Astro renders islands on the server and hydrates them afterwards. Filling a
 * field before hydration updates the DOM but not React state, and the first
 * render after hydration discards it — which shows up as a control that never
 * becomes enabled. The components expose `data-hydrated` for exactly this.
 */
async function waitForIsland(page: Page, testId: string) {
  await expect(page.getByTestId(testId)).toHaveAttribute('data-hydrated', 'true');
}

async function signIn(page: Page) {
  await page.goto('/login');
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/filaments/);
}

test('R-08 · redirects an anonymous visitor to the login page', async ({ page }) => {
  await page.goto('/filaments');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

// Serial: the second test acts on the project the first one creates. Declaring
// that makes the dependency explicit and skips the follow-up instead of
// reporting a second, misleading failure.
test.describe.serial('first-session flow', () => {
  test('the 8-step first-session flow completes end to end', async ({ page }) => {
    // Step 1 — log in.
    await signIn(page);

    // Step 2 — add a filament by pasting datasheet text; parameters are extracted.
    await page.getByTestId('add-filament-link').click();
    await waitForIsland(page, 'filament-form');

    await page.getByTestId('datasheet-input').fill(DATASHEET);
    await expect(page.getByTestId('extract-button')).toBeEnabled();
    await page.getByTestId('extract-button').click();
    await expect(page.getByTestId('extract-summary')).toBeVisible();

    // Step 3 — review the extracted parameters, then accept and save.
    await expect(page.getByTestId('nozzle_temp_c')).toHaveValue('215');
    await expect(page.getByTestId('bed_temp_c')).toHaveValue('60');
    await expect(page.getByTestId('print_speed_mms')).toHaveValue('60');

    await page.getByTestId('filament-name').fill(FILAMENT_NAME);
    await page.getByTestId('filament-manufacturer').fill('Prusament');
    await page.getByTestId('filament-material').fill('PLA');
    await page.getByTestId('filament-quantity').fill(String(INITIAL_G));
    await page.getByTestId('save-filament').click();

    await expect(page).toHaveURL(/\/filaments/);
    const row = page.getByTestId('inventory-row').filter({ hasText: FILAMENT_NAME });
    await expect(row).toBeVisible();
    await expect(row.getByTestId('available-quantity')).toHaveText(`${INITIAL_G} g`);

    // Step 4 — create a project using that filament with a declared usage.
    await page.goto('/projects/new');
    await waitForIsland(page, 'project-form');

    await page.getByTestId('project-name').fill(PROJECT_NAME);

    // selectOption matches labels exactly, and the option text carries an em
    // dash and the live quantity. Resolve the option's value from the DOM
    // instead of trying to reconstruct its label.
    const select = page.getByTestId('line-filament');
    const filamentId = await select
      .locator('option')
      .filter({ hasText: FILAMENT_NAME })
      .getAttribute('value');
    expect(filamentId, 'the new filament should be selectable').toBeTruthy();
    await select.selectOption(filamentId!);

    // Step 5 — the available quantity is visible BEFORE the project is created.
    await expect(page.getByTestId('line-available')).toContainText(
      `${INITIAL_G} g available`,
    );

    await page.getByTestId('line-usage').fill(String(USAGE_G));
    await expect(page.getByTestId('save-project')).toBeEnabled();
    await page.getByTestId('save-project').click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+/);

    // Step 6 — the aggregated print parameters are visible on the project.
    await expect(page.getByTestId('parameter-block')).toContainText('215');
    await expect(page.getByTestId('project-status')).toHaveText('Draft');

    // Step 7 — mark the project as printed.
    await page.getByTestId('mark-printed').click();
    await expect(page.getByTestId('project-status')).toHaveText('Printed');
    await expect(page.getByTestId('flash-ok')).toBeVisible();

    // Step 8 — inventory is reduced by exactly the declared usage.
    await page.goto('/filaments');
    const afterRow = page.getByTestId('inventory-row').filter({ hasText: FILAMENT_NAME });
    await expect(afterRow.getByTestId('available-quantity')).toHaveText(
      `${INITIAL_G - USAGE_G} g`,
    );
  });

  test('the deduction is reversed when a project goes back to draft', async ({ page }) => {
    await signIn(page);

    await page.goto('/projects');
    await page
      .getByTestId('project-row')
      .filter({ hasText: PROJECT_NAME })
      .getByRole('link', { name: 'Open' })
      .click();

    await page.getByTestId('mark-draft').click();
    await expect(page.getByTestId('project-status')).toHaveText('Draft');

    await page.goto('/filaments');
    const row = page.getByTestId('inventory-row').filter({ hasText: FILAMENT_NAME });
    await expect(row.getByTestId('available-quantity')).toHaveText(`${INITIAL_G} g`);
  });
});
