import { expect, test } from '@playwright/test';
import { ADMIN, PASSWORD, STAFF, TECH, dialog, expectToast, login } from './helpers';

const SHOTS = process.env.SHOTS_DIR;
const shot = async (page: import('@playwright/test').Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

test.describe.configure({ mode: 'serial' });

const row = (page: import('@playwright/test').Page, name: RegExp) => page.getByRole('row', { name });
const moreOn = (page: import('@playwright/test').Page, name: RegExp) =>
  row(page, name).getByRole('button', { name: 'More actions' });

test('user management shows the three roles, and accounts are suspended or deactivated, not deleted', async ({
  page,
  browser,
}) => {
  await login(page);
  await page.goto('/users');
  for (const r of ['System Administrator', 'Veterinarian (reviewer)', 'Field Technician'])
    await expect(page.getByText(r).first()).toBeVisible();
  await shot(page, 'users');

  // Suspend the field technician: he cannot sign in until made active again.
  await moreOn(page, /Ramil Bautista/).click();
  await expect(page.getByRole('menuitem', { name: /Delete/ })).toHaveCount(0);
  await page.getByRole('menuitem', { name: /Suspend/ }).click();
  await dialog(page).getByRole('button', { name: 'Suspend' }).click();
  await expectToast(page, 'Ramil Bautista was suspended.');
  await expect(row(page, /Ramil Bautista/)).toContainText('Suspended');

  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto('/login');
  await p2.getByLabel('Email').fill(TECH);
  await p2.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await p2.getByRole('button', { name: 'Sign in' }).click();
  await expect(p2.getByText('This account is suspended. Contact the System Administrator.')).toBeVisible();
  await ctx.close();

  await moreOn(page, /Ramil Bautista/).click();
  await page.getByRole('menuitem', { name: 'Make active again' }).click();
  await dialog(page).getByRole('button', { name: 'Make active' }).click();
  await expectToast(page, 'Ramil Bautista is active again.');
});

test('an account locks after repeated wrong passwords; the administrator resets the password', async ({
  page,
  browser,
}) => {
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto('/login');
  await p2.getByLabel('Email').fill(TECH);
  for (let i = 0; i < 5; i++) {
    await p2.getByLabel('Password', { exact: true }).fill(`wrong-${i}`);
    await p2.getByRole('button', { name: 'Sign in' }).click();
    await expect(
      p2.getByText(i < 4 ? /more wrong (try|tries) will lock the account/ : /This account is locked/),
    ).toBeVisible();
  }
  await shot(p2, 'login-locked');
  await ctx.close();

  await login(page);
  await page.goto('/users');
  await expect(row(page, /Ramil Bautista/)).toContainText('Locked');
  await moreOn(page, /Ramil Bautista/).click();
  await page.getByRole('menuitem', { name: /Reset password/ }).click();
  await dialog(page).getByRole('button', { name: 'Reset password' }).click();
  const shown = dialog(page);
  await expect(shown.getByText('Password reset')).toBeVisible();
  const temp = (await shown.locator('code').textContent())!.trim();
  await shown.getByRole('button', { name: 'Done' }).click();
  await expect(row(page, /Ramil Bautista/)).not.toContainText('Locked');

  // He signs in with the temporary password and must choose his own (back to the usual one here).
  const ctx2 = await browser.newContext();
  const p3 = await ctx2.newPage();
  await p3.goto('/login');
  await p3.getByLabel('Email').fill(TECH);
  await p3.getByLabel('Password', { exact: true }).fill(temp);
  await p3.getByRole('button', { name: 'Sign in' }).click();
  await p3.getByLabel('Temporary password').fill(temp);
  await p3.getByLabel('New password *').fill(PASSWORD);
  await p3.getByLabel('Type the new password again').fill(PASSWORD);
  await shot(p3, 'first-password');
  await p3.getByRole('button', { name: 'Save and continue' }).click();
  await expect(p3.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(p3.getByRole('heading', { name: 'Set your own password' })).toHaveCount(0);
  await ctx2.close();
});

test('a staff member with open cases must hand them over before being deactivated', async ({ page }) => {
  await login(page);
  // Assign an open case to the veterinarian.
  const cases = await (await page.request.get('/api/cases')).json();
  const open = cases.find((c: { closed: boolean; voided?: boolean }) => !c.closed && !c.voided);
  const users = await (await page.request.get('/api/users')).json();
  const mark = users.find((u: { email: string }) => u.email === STAFF);
  const joy = users.find((u: { email: string }) => u.email === 'joy@nagacityvet.gov.ph');
  const set = await page.request.patch(`/api/cases/${open.id}`, {
    data: { disease: open.disease, affected: open.affected, deaths: open.deaths, assignedToId: mark.id },
  });
  expect(set.ok()).toBeTruthy();

  await page.goto('/users');
  await moreOn(page, /Dr\. Mark/).click();
  await page.getByRole('menuitem', { name: /Deactivate/ }).click();
  const d = dialog(page);
  await expect(d.getByText(/Open work cannot stay with an account that can no longer sign in/)).toBeVisible();
  await d.getByRole('button', { name: 'Reassign and deactivate' }).click();
  await expect(d.getByText('Select a staff member', { exact: true })).toBeVisible();
  await d.getByLabel('Reassign to').selectOption(String(joy.id));
  await shot(page, 'reassign');
  await d.getByRole('button', { name: 'Reassign and deactivate' }).click();
  await expectToast(page, /open case\(s\) reassigned\. .* was deactivated\./);
  await expect(row(page, /Dr\. Mark/)).toContainText('Deactivated');
  // Bring him back for the other tests.
  await moreOn(page, /Dr\. Mark/).click();
  await page.getByRole('menuitem', { name: 'Make active again' }).click();
  await dialog(page).getByRole('button', { name: 'Make active' }).click();
  await expectToast(page, /is active again/);
});

test('the audit log shows who changed what, with the old and new values, and cannot be edited', async ({
  page,
}) => {
  await login(page);
  // Make a change to find in the log.
  await page.goto('/owners/2');
  await page.getByRole('button', { name: 'Edit' }).first().click();
  const d = dialog(page);
  await d.getByLabel('Contact number').fill('09175550123');
  await d.getByRole('button', { name: 'Save changes' }).click();
  await expectToast(page, /updated|saved/i);

  await page.goto('/audit-log');
  await expect(page.getByText('This log cannot be edited or deleted')).toBeVisible();
  await expect(page.getByText('the database itself refuses any change to a log entry')).toBeVisible();
  await page.getByLabel('Record type').selectOption('Owner');
  await page.getByLabel('Action').selectOption('UPDATE');
  const entry = page.locator('div.grid', { hasText: '09175550123' }).first();
  await expect(entry).toContainText('Contact:');
  await expect(entry).toContainText('Changed');
  await expect(entry).toContainText('CVO system');
  await shot(page, 'audit-log');
  // There is no edit or delete control on the page, and no such route on the server.
  await expect(page.getByRole('button', { name: /Delete|Edit|Remove/ })).toHaveCount(0);
  expect((await page.request.delete('/api/audit/1')).status()).toBe(404);

  // Sign-ins are in the log too.
  await page.getByLabel('Record type').selectOption('User');
  await page.getByLabel('Action').selectOption('LOGIN');
  await expect(page.locator('.divide-y').getByText('Signed in').first()).toBeVisible();
});

test('a veterinarian reviews but has no account management; anyone can change their own password', async ({
  page,
}) => {
  await login(page, STAFF);
  await expect(page.getByRole('link', { name: 'User Management' })).toHaveCount(0);
  await page.goto('/audit-log');
  await expect(page).toHaveURL(/\/$/);
  // Change password from the user menu, then put it back.
  const change = async (from: string, to: string) => {
    await page.getByRole('button', { name: /Dr\. Mark/ }).click();
    await page.getByRole('menuitem', { name: 'Change password' }).click();
    const d = dialog(page);
    await d.getByLabel('Current password').fill(from);
    await d.getByLabel('New password *').fill(to);
    await d.getByLabel('Type the new password again').fill(to);
    await d.getByRole('button', { name: 'Change password' }).click();
    await expectToast(page, 'Password changed.');
  };
  await change(PASSWORD, 'Bagong#2027');
  await change('Bagong#2027', PASSWORD);
  expect(ADMIN).toBeTruthy();
});
