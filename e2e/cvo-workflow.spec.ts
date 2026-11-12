import { expect, test } from '@playwright/test';
import { dialog, expectToast, login } from './helpers';

/** The City Veterinary Office's field workflow: farm visits, deworming, one map and the monthly report. */
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('record a farm visit with head count, classification and deworming in one form', async ({ page }) => {
  await page.goto('/farms/13');
  await expect(page.getByText('Not visited yet')).toBeVisible();
  await page.getByRole('button', { name: 'Record Farm Visit' }).first().click();
  const d = dialog(page);
  await d.getByLabel('Purpose').selectOption('DEWORMING');
  // Deworming is suggested for the goats and sheep on the farm.
  await expect(d.getByLabel(/Services given during the visit/)).toBeChecked();
  await expect(d.getByLabel('Goat service')).toHaveValue('DEWORMING');
  await d.getByLabel('Goat product used').fill('Albendazole');
  await d.getByLabel('Sheep product used').fill('Albendazole');

  // Head count with the classification by age, sex and stage.
  await d.getByLabel('Update the head count (masterlist) from this visit').check();
  await d.getByLabel('Classify', { exact: true }).first().check();
  await d.locator('#visit-29-kid').fill('5');
  await d.locator('#visit-29-doe').fill('8');
  await d.getByRole('button', { name: 'Save visit' }).click();
  await expect(d.getByText('The classification must add up to the head count')).toBeVisible();
  await d.locator('#visit-29-buck').fill('2');
  await d.getByRole('button', { name: 'Save visit' }).click();
  await expectToast(page, /Farm visit VIS-\d+ recorded \(head count updated, 2 service records added\)/);

  // Visits and services are listed at the bottom of the farm overview.
  await expect(page.getByText('Farm Visit · Deworming')).toBeVisible();
  await expect(page.getByText(/Deworming · Goat · 15 head/)).toBeVisible();
  await page.getByRole('tab', { name: /Livestock/ }).click();
  await expect(
    page.locator('.card').filter({ hasText: 'GRP-0029' }).getByText('Doe', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Not visited yet')).toHaveCount(0);
});

test('one map with filters and layers leads to the farms to monitor', async ({ page }) => {
  await page.goto('/gis-map');
  await expect(page.getByRole('heading', { name: 'Livestock & Disease Map' })).toBeVisible();
  await page.getByLabel('Livestock population (by barangay)').check();
  await page.getByLabel('Disease', { exact: true }).selectOption('African Swine Fever (ASF)');
  await page.getByRole('button', { name: /African Swine Fever \(ASF\).*CASE-0001/ }).click();
  await expect(page.getByText(/farm\(s\) within 1\.00 km/)).toBeVisible();
  await page.getByRole('button', { name: 'Farms to monitor' }).click();
  await expect(page).toHaveURL(/\/radius\?case=1/);
  await expect(page.getByRole('heading', { name: 'Farms to Monitor' })).toBeVisible();
});

test('deworming records are filtered by service and the farm visits are listed', async ({ page }) => {
  await page.goto('/services?tab=records');
  await page.getByLabel('Service', { exact: true }).selectOption('DEWORMING');
  // Plain headers: no click-to-sort on this page.
  await expect(page.getByRole('columnheader', { name: 'Date' }).getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('cell', { name: 'Albendazole' }).first()).toBeVisible();
  await page.getByRole('tab', { name: 'Farm Visits' }).click();
  await expect(page.getByRole('link', { name: 'Pacol Goat Farm' })).toBeVisible();
});

test('monthly report shows the month with graphs and prints the standard report', async ({
  page,
  context,
}) => {
  await page.goto('/monthly-report');
  await expect(page.getByRole('heading', { name: 'Monthly Report' })).toBeVisible();
  await expect(page.getByText('Updates automatically')).toBeVisible();
  await expect(page.getByText('Heads dewormed').first()).toBeVisible();
  const [win] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: 'Print Monthly Report' }).click(),
  ]);
  await win.evaluate(() => (window.print = () => {}));
  await expect(win.getByText('MONTHLY LIVESTOCK MONITORING REPORT')).toBeVisible();
  await expect(win.getByRole('heading', { name: 'III. Deworming' })).toBeVisible();
  await expect(win.getByRole('heading', { name: 'V. Farm Visits' })).toBeVisible();
  await win.close();
});

test('dashboard boxes open their records; no shortcut buttons at the top', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Record Farm Visit' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Report Incident' })).toHaveCount(0);
  await page.getByRole('link', { name: /Confirmed Positive/ }).click();
  await expect(page).toHaveURL(/\/cases\?status=POSITIVE/);
  await page.goto('/');
  await page
    .getByRole('link', { name: /Livestock Owners/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/owners/);
});

test('the registry menu holds owners, farms, population, ear tags, ownership and strays', async ({
  page,
}) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await nav.getByRole('button', { name: 'Livestock Registry' }).click();
  for (const name of [
    'Livestock Owners',
    'Farms',
    'Population Monitoring',
    'Animal ID / Ear Tags',
    'Ownership Records',
    'Stray & Violations',
  ])
    await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
});

test('upcoming deworming and vaccination schedule is a calendar', async ({ page }) => {
  await page.goto('/services?tab=upcoming');
  await expect(page.getByRole('button', { name: 'Record Farm Visit' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Previous month' })).toBeVisible();
  await expect(page.getByText(/scheduled in/)).toBeVisible();
  await page.getByRole('button', { name: 'Next month' }).click();
  await expect(page.getByRole('button', { name: 'Today' })).toBeVisible();
});
