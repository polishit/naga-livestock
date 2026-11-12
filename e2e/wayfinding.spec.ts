import { expect, test } from '@playwright/test';
import { clickMap, dialog, expectToast, login } from './helpers';

const SHOTS = process.env.SHOTS_DIR;
const shot = async (page: import('@playwright/test').Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('dashboard shows the guide and My tasks; a task opens the right form', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'How the system works' })).toBeVisible();
  const tasks = page.locator('.card').filter({ hasText: 'My tasks' });
  await expect(tasks.getByRole('button', { name: /^Field visits/ })).toBeVisible();
  await shot(page, 'dashboard-tasks');
  // Only field visits, then do the first one: the case opens with the visit form.
  await tasks.getByRole('button', { name: /^Field visits/ }).click();
  await tasks
    .getByRole('button', { name: /Record visit/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/cases\/\d+\?tab=investigation&do=visit/);
  await expect(dialog(page).getByLabel('Findings / summary')).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();

  // The guide can be hidden and stays hidden.
  await page.goto('/');
  await page.getByRole('button', { name: 'Got it, hide this guide' }).click();
  await expect(page.getByRole('heading', { name: 'How the system works' })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.card').filter({ hasText: 'My tasks' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How the system works' })).toHaveCount(0);
});

test('every page has "How to use this page" help', async ({ page }) => {
  for (const [path, title] of [
    ['/farms', 'How to use: Farms'],
    ['/cases/1', 'How to use: Disease report'],
    ['/reports', 'How to use: Reports'],
  ]) {
    await page.goto(path);
    await page.getByRole('button', { name: 'How to use this page' }).click();
    await expect(dialog(page).getByText(title)).toBeVisible();
    if (path === '/cases/1') await shot(page, 'page-help');
    await dialog(page).getByRole('button', { name: 'Got it' }).click();
  }
});

test('add owner: owner, farm and livestock with Back and Next, then one success message', async ({
  page,
}) => {
  await page.route('**/api/geocode/reverse**', (route) =>
    route.fulfill({ json: { address: 'Purok 2, Mabolo, Naga', barangay: 'Mabolo' } }),
  );
  await page.getByRole('button', { name: 'New' }).click();
  await page.getByRole('menuitem', { name: /Add an owner/ }).click();
  let d = dialog(page);
  await expect(d.getByText('Step 1 of 3: Livestock Owner')).toBeVisible();
  await expect(d.getByRole('button', { name: 'Back' })).toHaveCount(0);
  await d.getByLabel('Full name').fill('Rosario Wayfinder');
  await d.getByLabel('Barangay').selectOption('Mabolo');
  await d.getByLabel('Contact number').fill('0917-555-0199');
  await d.getByRole('button', { name: 'Next' }).click();

  d = dialog(page);
  await expect(d.getByText('Step 2 of 3: Farm')).toBeVisible();
  // The owner was just entered, so the farm step does not ask for it again.
  await expect(d.getByLabel('Search owner')).toHaveCount(0);
  await expect(d.getByLabel('Owner', { exact: true })).toHaveCount(0);
  await d.getByLabel('Farm name').fill('Wayfinder Backyard');
  await clickMap(page, d, 0.6, 0.4);
  await expect(d.getByLabel('Barangay')).toHaveValue('Mabolo');
  await d.getByRole('button', { name: 'Next' }).click();

  d = dialog(page);
  await expect(d.getByText('Step 3 of 3: Add Livestock (Species and Head Count)')).toBeVisible();
  // Back returns to the farm step with what was entered.
  await d.getByRole('button', { name: 'Back' }).click();
  d = dialog(page);
  await expect(d.getByText('Step 2 of 3: Farm')).toBeVisible();
  await expect(d.getByLabel('Farm name')).toHaveValue('Wayfinder Backyard');
  await d.getByRole('button', { name: 'Next' }).click();

  d = dialog(page);
  await d.getByLabel('Species').selectOption('Swine');
  await d.getByLabel('Head count').fill('6');
  await d.getByRole('button', { name: 'Save' }).click();
  // One success message at the end; no summary screen.
  await expectToast(page, 'Owner, farm and livestock added to the masterlist.');
  await expect(dialog(page)).toHaveCount(0);
  await page.goto('/farms');
  await page.getByLabel('Search table').fill('Wayfinder');
  await expect(page.getByRole('row', { name: /Wayfinder Backyard/ })).toBeVisible();
});

test('reports open on the monthly report; analytics compares periods and links to records', async ({
  page,
}) => {
  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: /Monthly Livestock Monitoring Report/ })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Total livestock (heads)' })).toBeVisible();
  await page.getByLabel('Report type', { exact: true }).selectOption({ label: 'Accomplishment Report' });
  await expect(page.getByRole('heading', { name: 'Accomplishment Report' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Vaccine doses given' })).toBeVisible();
  await shot(page, 'accomplishment');

  await page.goto('/analytics');
  await expect(page.getByText('This period compared with the one before')).toBeVisible();
  await expect(page.getByText('Disease hotspots (last 30 days)')).toBeVisible();
  await expect(page.getByText('Record completeness')).toBeVisible();
  await shot(page, 'analytics-insights');

  // Admin sets a vaccination target and sees its progress.
  await page.getByRole('button', { name: 'Set targets' }).click();
  const d = dialog(page);
  await d.getByLabel('Vaccine 1').fill('Hog Cholera Vaccine');
  await d.getByLabel('Species 1').selectOption('Swine');
  await d.getByLabel('Target doses 1').fill('500');
  await d.getByRole('button', { name: 'Save targets' }).click();
  await expectToast(page, /Vaccination targets for \d{4} saved/);
  await expect(page.getByText(/\/ 500 \(\d+%\)/)).toBeVisible();

  // Record completeness links to the records that need fixing.
  await page
    .locator('.card')
    .filter({ hasText: 'Record completeness' })
    .getByRole('listitem')
    .filter({ hasText: 'Owners without an RSBSA number' })
    .getByRole('link', { name: 'Fix' })
    .click();
  await expect(page).toHaveURL(/\/owners\?rsbsa=no/);
  await expect(page.getByLabel('RSBSA')).toHaveValue('no');

  // Clicking a bar opens the records behind it.
  await page.goto('/analytics');
  const byBarangay = page.locator('.card').filter({ hasText: 'Population by barangay' });
  await byBarangay.locator('.recharts-bar-rectangle').first().click();
  await expect(page).toHaveURL(/\/farms\?barangay=/);
});
