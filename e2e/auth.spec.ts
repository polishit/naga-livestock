import { expect, test } from '@playwright/test';
import { PASSWORD, TECH, login } from './helpers';

test('rejects a wrong password and validates required fields', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Email is required')).toBeVisible();
  await expect(page.getByText('Password is required')).toBeVisible();
  await page.getByLabel('Email').fill('admin@nagacityvet.gov.ph');
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Incorrect email or password' })).toBeVisible();
});

test('signs in, shows the dashboard figures and signs out', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('heading', { name: /Dr\. Liza/ })).toBeVisible();
  await expect(page.getByText('Livestock owners')).toBeVisible();
  await expect(page.getByText('3,473')).toBeVisible();
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login/);
});

test('protected routes redirect to sign-in and return afterwards', async ({ page }) => {
  await page.goto('/farms');
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('Email').fill('admin@nagacityvet.gov.ph');
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/farms$/);
});

test('a field technician records field work but cannot review or manage accounts', async ({ page }) => {
  await login(page, TECH);
  await page.goto('/owners');
  await expect(page.getByRole('heading', { name: 'Livestock Owners' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Owner', exact: true })).toBeVisible();
  // No account management or audit log in the menu, and the pages are refused.
  await expect(page.getByRole('link', { name: 'User Management' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Audit Log' })).toHaveCount(0);
  await page.goto('/users');
  await expect(page).toHaveURL(/\/$/);
  expect((await page.request.get('/api/users')).status()).toBe(403);
  expect((await page.request.post('/api/cases/1/void', { data: { reason: 'x' } })).status()).toBe(403);
});
