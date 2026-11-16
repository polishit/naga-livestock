import { expect, test } from '@playwright/test';
import { dialog, expectToast, login } from './helpers';

const SHOTS = process.env.SHOTS_DIR;
const shot = async (page: import('@playwright/test').Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await login(page);
});

const more = (page: import('@playwright/test').Page) => page.getByRole('button', { name: 'More actions' });

test('there is no delete: an owner is archived, never removed', async ({ page }) => {
  await page.goto('/owners/1');
  await more(page).click();
  await expect(page.getByRole('menuitem', { name: /Archive owner/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Delete/ })).toHaveCount(0);
  await shot(page, 'no-delete-owner');
  await page.keyboard.press('Escape');
  await page.goto('/farms/1');
  await more(page).click();
  await expect(page.getByRole('menuitem', { name: /Delete/ })).toHaveCount(0);
  // The server has no delete route either.
  expect((await page.request.delete('/api/owners/1')).status()).toBe(404);
  expect((await page.request.delete('/api/farms/1')).status()).toBe(404);
});

test('void a duplicate case; it leaves the lists and can be undone', async ({ page }) => {
  await page.goto('/cases/9');
  const title = await page.getByRole('heading', { level: 1 }).textContent();
  const code = title!.split(' · ')[0];
  await more(page).click();
  await page.getByRole('menuitem', { name: /Void case/ }).click();
  await dialog(page).getByLabel('Reason *').fill('Duplicate of an earlier report');
  await dialog(page).getByRole('button', { name: 'Void record' }).click();
  await expectToast(page, `case ${code} voided.`);
  await expect(page.getByText(/Voided.*Duplicate of an earlier report/)).toBeVisible();
  await shot(page, 'case-voided');

  await page.goto('/cases');
  await expect(page.getByRole('cell', { name: code, exact: true })).toHaveCount(0);
  await page.getByLabel('Case state').selectOption('voided');
  await expect(page.getByRole('cell', { name: code, exact: true })).toBeVisible();

  await page.goto('/cases/9');
  await page.getByRole('button', { name: 'Undo void' }).click();
  await expectToast(page, 'Case reopened.');
  await expect(page.getByRole('list', { name: 'Case steps' })).toBeVisible();
});

test('fix a typo in a vaccination and in a site visit', async ({ page }) => {
  await page.goto('/services?tab=records&type=VACCINATION');
  await page.getByRole('row').nth(1).getByRole('button', { name: 'Edit' }).click();
  const d = dialog(page);
  await d.getByLabel('Batch / lot no.').fill('LOT-FIXED-1');
  await d.getByRole('button', { name: 'Save changes' }).click();
  await expectToast(page, 'Record updated.');

  await page.goto('/cases/1?tab=investigation');
  const visits = page.getByRole('listitem', { name: 'Step 2: Site visit' });
  await visits.getByRole('button', { name: 'Edit' }).first().click();
  await expect(dialog(page).getByText('Edit Site Visit — CASE-0001')).toBeVisible();
  await dialog(page).getByLabel('Findings / summary').fill('Findings corrected after review.');
  await dialog(page).getByRole('button', { name: 'Save' }).click();
  await expectToast(page, 'Site visit updated.');
  await expect(visits.getByText('Findings corrected after review.')).toBeVisible();
});

test('archived farms are listed and can be restored', async ({ page }) => {
  // Register an empty farm, archive it, find it under "Show archived", then restore it.
  await page.goto('/farms');
  await page.getByRole('button', { name: 'Add Farm', exact: true }).click();
  const d = dialog(page);
  await d.getByLabel('Owner', { exact: true }).selectOption({ index: 1 });
  await d.getByLabel('Farm name *').fill('Closed Down Farm');
  await d.getByRole('button', { name: 'Add farm', exact: true }).click();
  await expectToast(page, 'Farm added to the masterlist.');
  page.once('dialog', (x) => x.accept());
  await more(page).click();
  await page.getByRole('menuitem', { name: /Archive farm/ }).click();
  await expectToast(page, 'Farm archived.');
  await page.getByLabel('Show archived').check();
  await page.getByRole('cell', { name: 'Closed Down Farm' }).click();
  await more(page).click();
  await page.getByRole('menuitem', { name: 'Restore farm' }).click();
  await expectToast(page, 'Farm restored.');
});

test('a stray report is voided with a reason, never deleted', async ({ page }) => {
  await page.goto('/strays');
  await page.getByLabel('Status').selectOption('CLOSED');
  await page.getByRole('row').nth(1).click();
  const d = dialog(page);
  await expect(d.getByRole('button', { name: 'Void (reported in error)' })).toBeVisible();
  await expect(d.getByRole('button', { name: 'Delete (entered by mistake)' })).toHaveCount(0);
});
