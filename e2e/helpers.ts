import { expect, type Page } from '@playwright/test';

export const ADMIN = 'admin@nagacityvet.gov.ph';
export const STAFF = 'mark@nagacityvet.gov.ph';
export const VIEWER = 'viewer@nagacityvet.gov.ph';
export const PASSWORD = 'Livestock@2026';

export async function login(page: Page, email = ADMIN, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
}

/** The open dialog. */
export const dialog = (page: Page) => page.getByRole('dialog');

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: text }).first()).toBeVisible();
}

/** Click on a Leaflet map at a fractional position. */
export async function clickMap(page: Page, scope = page.locator('body'), fx = 0.5, fy = 0.5) {
  const map = scope.locator('.leaflet-container').first();
  await expect(map).toBeVisible();
  const box = (await map.boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}
