import { expect, test } from '@playwright/test';
import { PASSWORD, VIEWER, login } from './helpers';

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
  await expect(page.getByText('Registered owners')).toBeVisible();
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

test('read-only users cannot see write actions and the API refuses writes', async ({ page }) => {
  await login(page, VIEWER);
  await page.goto('/owners');
  await expect(page.getByRole('heading', { name: 'Livestock Owners' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Register owner' })).toHaveCount(0);
  const res = await page.request.post('/api/owners', { data: { fullName: 'X', barangay: 'Pacol' } });
  expect(res.status()).toBe(403);
});
