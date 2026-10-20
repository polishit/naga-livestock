import { expect, test } from '@playwright/test';
import { dialog, expectToast, login } from './helpers';

test('mobile: navigation drawer, card lists and a full-screen form', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Toggle sidebar' }).click();
  await page.getByRole('link', { name: 'Livestock Owners' }).click();
  await expect(page.getByRole('heading', { name: 'Livestock Owners' })).toBeVisible();
  await expect(page.getByText('Juan Dela Cruz').first()).toBeVisible();

  await page.getByRole('button', { name: 'Register owner' }).click();
  const d = dialog(page);
  await d.getByLabel('Full name').fill('Mobile Miguel');
  await d.getByLabel('Barangay').selectOption('Tabuco');
  await d.getByRole('button', { name: 'Register owner' }).click();
  await expectToast(page, 'Owner registered.');
  await expect(page.getByRole('heading', { name: 'Mobile Miguel' })).toBeVisible();

  // No horizontal page scroll on phones.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
