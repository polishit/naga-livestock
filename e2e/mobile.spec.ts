import { expect, test } from '@playwright/test';
import { dialog, expectToast, login } from './helpers';

test('mobile: navigation drawer, card lists and a full-screen form', async ({ page }) => {
  await login(page);
  // Phone bottom bar: tap a module, then pick a page from its list.
  await page.getByRole('navigation', { name: 'Modules' }).getByRole('button', { name: 'Masterlist' }).click();
  await expect(page.getByText('Owners from the DA list and farm visits')).toBeVisible();
  await page.getByRole('link', { name: /Livestock Owners/ }).click();
  await expect(page.getByRole('heading', { name: 'Livestock Owners' })).toBeVisible();
  await expect(page.getByText('Juan Dela Cruz').first()).toBeVisible();

  await page.getByRole('button', { name: 'Add Owner', exact: true }).click();
  const d = dialog(page);
  await d.getByLabel('Full name').fill('Mobile Miguel');
  await d.getByLabel('Barangay').selectOption('Tabuco');
  await d.getByRole('button', { name: 'Add owner', exact: true }).click();
  await expectToast(page, 'Livestock owner added to the masterlist.');
  await expect(page.getByRole('heading', { name: 'Mobile Miguel' })).toBeVisible();

  // The side menu still opens, showing the current module.
  await page.getByRole('button', { name: 'Toggle sidebar' }).click();
  await expect(page.getByRole('link', { name: 'Livestock Owners' })).toBeVisible();
  await page.getByRole('button', { name: 'Close menu' }).click();

  // No horizontal page scroll on phones.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('mobile: offers to install the app, and "Not now" hides it', async ({ page }) => {
  await login(page);
  // Browsers fire this when the app can be installed; tests fire it themselves.
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt') as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: string }>;
    };
    e.prompt = async () => {
      (window as unknown as { prompted: boolean }).prompted = true;
    };
    e.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(e);
  });
  const banner = page.getByRole('region', { name: 'Install the app' });
  await expect(banner).toBeVisible();
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/install-banner.png` });
  await banner.getByRole('button', { name: 'Install' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { prompted?: boolean }).prompted))
    .toBe(true);
  await expectToast(page, 'Naga City Vet was installed on this device.');
  await page.reload();
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt') as Event & {
      prompt: () => Promise<void>;
      userChoice: unknown;
    };
    e.prompt = async () => {};
    e.userChoice = Promise.resolve({ outcome: 'dismissed' });
    window.dispatchEvent(e);
  });
  await page
    .getByRole('region', { name: 'Install the app' })
    .getByRole('button', { name: 'Not now' })
    .click();
  await expect(page.getByRole('region', { name: 'Install the app' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Install the app' })).toHaveCount(0);
});
