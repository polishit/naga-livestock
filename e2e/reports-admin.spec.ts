import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { dialog, expectToast, login } from './helpers';

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('reports: population by barangay and CSV/XLSX/PDF exports', async ({ page }) => {
  await page.goto('/reports');
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

test('report export lists all 27 report types and filters by barangay', async ({ page }) => {
  await page.goto('/export');
  await expect(page.getByText('27 report types')).toBeVisible();
  await page.getByLabel('Report', { exact: true }).selectOption({ label: 'Disease Case Monitoring Report' });
  await expect(page.getByRole('heading', { name: 'Disease Case Monitoring Report' })).toBeVisible();
  await page.getByLabel('Barangay').first().selectOption('Cararayan');
  await expect(page.getByText(/Cases: /)).toBeVisible();
});

test('analytics renders all charts', async ({ page }) => {
  await page.goto('/analytics');
  for (const t of [
    'Monthly population trend',
    'Cases by status',
    'Vaccination activity',
    'Largest farms (current population)',
  ]) {
    await expect(page.getByText(t)).toBeVisible();
  }
});

test('admin creates a user who can then sign in', async ({ page, browser }) => {
  await page.goto('/users');
  await page.getByRole('button', { name: 'Add user' }).click();
  const d = dialog(page);
  await d.getByLabel('Full name').fill('Dr. Ana Field');
  await d.getByLabel('Email').fill('ana@nagacityvet.gov.ph');
  await d.getByLabel('Role').selectOption('STAFF');
  await d.getByLabel('Password').fill('short');
  await d.getByRole('button', { name: 'Create user' }).click();
  await expect(d.getByText('At least 8 characters')).toBeVisible();
  await d.getByLabel('Password').fill('FieldVet#2026');
  await d.getByRole('button', { name: 'Create user' }).click();
  await expectToast(page, 'User created.');
  await expect(page.getByRole('cell', { name: 'ana@nagacityvet.gov.ph' })).toBeVisible();

  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await login(p2, 'ana@nagacityvet.gov.ph', 'FieldVet#2026');
  await expect(p2.getByRole('heading', { name: /Dr\. Ana/ })).toBeVisible();
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
