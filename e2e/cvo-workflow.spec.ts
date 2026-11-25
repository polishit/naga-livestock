import { expect, test } from '@playwright/test';
import { dialog, expectToast, login } from './helpers';

/** The City Veterinary Office's field workflow: field visits, deworming, one map and the monthly report. */
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('record a field visit with head count and deworming in one form', async ({ page }) => {
  await page.goto('/farms/13');
  await expect(page.getByText('Not visited yet')).toBeVisible();
  await page.getByRole('button', { name: 'Record Field Visit' }).first().click();
  const d = dialog(page);
  await d.getByLabel('Purpose').selectOption('DEWORMING');
  // Deworming is suggested for the goats and sheep on the farm.
  await expect(d.getByLabel(/Services given during the visit/i)).toBeChecked();
  await expect(d.getByLabel('Goat service')).toHaveValue('DEWORMING');
  await d.getByLabel('Goat product used').fill('Albendazole');
  await d.getByLabel('Sheep product used').fill('Albendazole');

  // Head count only: no age, sex or stage classification.
  await d.getByLabel('Update the head count (masterlist) from this visit').check();
  await expect(d.getByLabel('Classify', { exact: true })).toHaveCount(0);
  await d.getByLabel('Goat head count').fill('15');
  await d.getByRole('button', { name: 'Save visit' }).click();
  await expectToast(page, /Field visit VIS-\d+ recorded \(head count updated, 2 service records added\)/);

  // Visits and services are listed at the bottom of the farm overview.
  await expect(page.getByText('Field Visit · Deworming')).toBeVisible();
  await expect(page.getByText(/Deworming · Goat · 15 head/)).toBeVisible();
  await page.getByRole('tab', { name: /Livestock/i }).click();
  const goats = page.locator('.card').filter({ hasText: 'GRP-0029' });
  await expect(goats.getByText('15', { exact: true })).toBeVisible();
  await expect(goats.getByText('Doe', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Not visited yet')).toHaveCount(0);
});

test('disease monitoring: one map of the cases leads to the farms in the radius', async ({ page }) => {
  await page.goto('/gis-map');
  await expect(page.getByRole('heading', { name: 'Livestock Map' })).toBeVisible();
  // The colour key sits above the map; the barangay summary is the side panel.
  await expect(page.getByRole('group', { name: 'Map legend' })).toContainText('Livestock (head)');
  await expect(page.getByRole('tab', { name: 'Barangay Summary' })).toBeVisible();
  await page.getByRole('tab', { name: /^Farms \(/ }).click();
  await expect(page.getByRole('button', { name: /Ground Zero Piggery/ })).toBeVisible();

  await page.goto('/disease-monitoring');
  await expect(page.getByRole('heading', { name: 'Disease Monitoring' })).toBeVisible();
  await page.getByLabel('Disease', { exact: true }).selectOption('African Swine Fever (ASF)');
  await expect(page.getByRole('heading', { name: /^Disease Reports \(/i })).toBeVisible();
  await page.getByRole('button', { name: /African Swine Fever \(ASF\).*CASE-0001/i }).click();
  // The ground-zero farm (the case's own farm) is not in the list of farms to monitor.
  await expect(page.getByText(/farm\(s\) within 1\.00 km \(ground-zero farm not included\)/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Farms in Radius' }).click();
  // Farms in the radius and the monitoring zone are one view: Farms & Zones.
  await expect(page).toHaveURL(/view=zones&case=1/);
  await expect(page.getByRole('heading', { name: /Farms Within 1\.00 km/ })).toBeVisible();
  // Old links land on the same place.
  await page.goto('/radius?case=1');
  await expect(page).toHaveURL(/\/disease-monitoring\?case=1&view=radius/);
  await expect(page.getByRole('tab', { name: 'Farms & Zones' })).toHaveAttribute('aria-selected', 'true');
});

test('the activity log lists services and farm visits together', async ({ page }) => {
  await page.goto('/services');
  await page.getByLabel('Activity', { exact: true }).selectOption('DEWORMING');
  // Plain headers: no click-to-sort on this page.
  await expect(page.getByRole('columnheader', { name: 'Date' }).getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('cell', { name: 'Albendazole' }).first()).toBeVisible();
  // Field visits are part of the log, as "Farm Visit" (old links still work).
  await page.goto('/field-visits');
  await expect(page).toHaveURL(/\/services\?type=VISIT/);
  await expect(page.getByText('Farm Visit').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Pacol Goat Farm' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Record Farm Visit' })).toBeVisible();
});

test('monthly report shows the month with graphs and prints the standard report', async ({
  page,
  context,
}) => {
  // The monthly report is a report type in All Reports.
  await page.goto('/reports?tab=summary&type=monthly-report');
  await expect(page.getByText('Updates automatically')).toBeVisible();
  await expect(page.getByText('Heads dewormed').first()).toBeVisible();
  const [win] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: 'Print Monthly Report' }).click(),
  ]);
  await win.evaluate(() => (window.print = () => {}));
  await expect(win.getByText('MONTHLY LIVESTOCK MONITORING REPORT')).toBeVisible();
  await expect(win.getByRole('heading', { name: 'III. Deworming' })).toBeVisible();
  await expect(win.getByRole('heading', { name: 'V. Field Visits' })).toBeVisible();
  await win.close();
});

test('dashboard boxes open their records; no shortcut buttons at the top', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Record Field Visit' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Report Incident' })).toHaveCount(0);
  await page.getByRole('link', { name: /^Confirmed Positive/ }).click();
  await expect(page).toHaveURL(/\/cases\?status=POSITIVE/);
  await page.goto('/');
  await page
    .getByRole('link', { name: /Livestock Owners/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/owners/);
});

test('the registry menu holds owners, farms, population, ear tags and ownership (no strays)', async ({
  page,
}) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  // Every module of the menu is open; the module name folds it.
  for (const name of [
    'Livestock Owners',
    'Farms',
    'Population Monitoring',
    'Animal ID / Ear Tags',
    'Ownership Records',
  ])
    await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Stray Livestock' })).toHaveCount(0);
});

test("the vaccination schedule is one calendar under the owners' pending requests", async ({ page }) => {
  await page.goto('/services?tab=upcoming');
  await page.goto('/vaccination-schedule');
  await expect(page.getByRole('heading', { name: 'Vaccination Schedule' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous month' })).toBeVisible();
  await expect(page.getByText(/scheduled in/)).toBeVisible();
  await page.getByRole('button', { name: 'Next month' }).click();
  await expect(page.getByRole('button', { name: 'Today' })).toBeVisible();
});
