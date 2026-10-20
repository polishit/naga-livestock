import { expect, test } from '@playwright/test';
import { dialog, expectToast, login } from './helpers';

test('writes made offline are queued in IndexedDB and synced when back online', async ({ page, context }) => {
  await login(page);
  await page.goto('/owners');
  await expect(page.getByRole('cell', { name: 'Juan Dela Cruz' })).toBeVisible();

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.getByRole('button', { name: 'Register owner' }).click();
  const d = dialog(page);
  await d.getByLabel('Full name').fill('Offline Ofelia');
  await d.getByLabel('Barangay').selectOption('Mabolo');
  await d.getByRole('button', { name: 'Register owner' }).click();
  await expectToast(page, /Saved offline/);
  await expect(page.getByText(/Offline · 1 queued/)).toBeVisible();

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expectToast(page, /Synced 1 offline change/);
  await page.getByLabel('Search table').fill('Ofelia');
  await expect(page.getByRole('cell', { name: 'Offline Ofelia' })).toBeVisible();
});
