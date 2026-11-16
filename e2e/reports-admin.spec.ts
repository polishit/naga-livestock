import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { dialog, expectToast, login } from './helpers';

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('reports: population by barangay and CSV/XLSX/PDF exports', async ({ page }) => {
  await page.goto('/reports?tab=population');
  await expect(page.getByRole('heading', { name: 'Current Recorded Population by Barangay' })).toBeVisible();
  await expect(page.getByText(/Total population:/)).toBeVisible();

  const csv = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV' }).click();
  const csvFile = await csv;
  const text = await fs.readFile((await csvFile.path())!, 'utf8');
  expect(text).toContain('Barangay,Farms,Current recorded population');
  expect(text).toContain('Cararayan');

  const xlsx = page.waitForEvent('download');
  await page.getByRole('button', { name: 'XLSX' }).click();
  expect((await xlsx).suggestedFilename()).toMatch(/\.xlsx$/);

  const pdf = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF' }).click();
  expect((await pdf).suggestedFilename()).toMatch(/\.pdf$/);
});

test('reports list all 35 report types and filter by barangay (old export link)', async ({ page }) => {
  await page.goto('/export');
  await expect(page).toHaveURL(/\/reports$/);
  await expect(page.getByText('35 ready-made reports')).toBeVisible();
  await page.getByRole('tab', { name: 'Disease Surveillance' }).click();
  await page
    .getByLabel('Report type', { exact: true })
    .selectOption({ label: 'Disease Case Monitoring Report' });
  await expect(page.getByRole('heading', { name: 'Disease Case Monitoring Report' })).toBeVisible();
  await page.getByLabel('Barangay').first().selectOption('Cararayan');
  await expect(page.getByText(/Cases: /)).toBeVisible();
});

test('analytics renders all charts', async ({ page }) => {
  await page.goto('/analytics');
  for (const t of [
    'Monthly population trend',
    'Cases by status',
    'Deworming and veterinary services',
    'Farms by livestock raised',
    'Largest farms (current population)',
  ]) {
    await expect(page.getByText(t)).toBeVisible();
  }
});

test('admin creates a staff account; the temporary password must be changed at first sign-in', async ({
  page,
  browser,
}) => {
  await page.goto('/users');
  await page.getByRole('button', { name: 'Add staff account' }).click();
  const d = dialog(page);
  await d.getByLabel('Full name').fill('Dr. Ana Field');
  await d.getByLabel('Email').fill('ana@nagacityvet.gov.ph');
  await d.getByLabel('Role').selectOption('VETERINARIAN');
  await d.getByRole('button', { name: 'Create account' }).click();
  const made = dialog(page);
  await expect(made.getByText('Account created')).toBeVisible();
  const temp = (await made.locator('code').textContent())!.trim();
  await made.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('row', { name: /Dr\. Ana Field/ })).toContainText('Temporary password');

  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto('/login');
  await p2.getByLabel('Email').fill('ana@nagacityvet.gov.ph');
  await p2.getByLabel('Password', { exact: true }).fill(temp);
  await p2.getByRole('button', { name: 'Sign in' }).click();
  // Nothing opens until she sets her own password.
  await expect(p2.getByRole('heading', { name: 'Set your own password' })).toBeVisible();
  await p2.goto('/owners');
  await expect(p2.getByRole('heading', { name: 'Set your own password' })).toBeVisible();
  await p2.getByLabel('Temporary password').fill(temp);
  await p2.getByLabel('New password *').fill('short');
  await p2.getByLabel('Type the new password again').fill('short');
  await p2.getByRole('button', { name: 'Save and continue' }).click();
  await expect(p2.getByText('At least 8 characters', { exact: true })).toBeVisible();
  await p2.getByLabel('New password *').fill('FieldVet#2026');
  await p2.getByLabel('Type the new password again').fill('FieldVet#2026');
  await p2.getByRole('button', { name: 'Save and continue' }).click();
  await expect(p2.getByRole('heading', { name: 'Livestock Owners' })).toBeVisible();
  await ctx.close();
});

test('settings can be saved', async ({ page }) => {
  await page.goto('/settings');
  await page.getByLabel('Default assessment radius (m)').fill('1500');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expectToast(page, 'Settings saved.');
  await page.getByLabel('Default assessment radius (m)').fill('1000');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expectToast(page, 'Settings saved.');
});

test('global search finds owners, farms and cases', async ({ page }) => {
  await page.getByLabel('Global search').fill('Hillside');
  await page.getByRole('button', { name: /Hillside Ranch/ }).click();
  await expect(page.getByRole('heading', { name: 'Hillside Ranch' })).toBeVisible();
});
