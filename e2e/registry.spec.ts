import { expect, test } from '@playwright/test';
import { clickMap, dialog, expectToast, login } from './helpers';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('register, edit and archive a livestock owner', async ({ page }) => {
  await page.goto('/owners');
  await page.getByRole('button', { name: 'Register owner' }).click();
  const d = dialog(page);
  await d.getByRole('button', { name: 'Register owner' }).click();
  await expect(d.getByText('Required').first()).toBeVisible();
  await expect(d.getByText('Select a barangay')).toBeVisible();
  await d.getByLabel('Full name').fill('Benito Santiago');
  await d.getByLabel('Barangay').selectOption('Pacol');
  await d.getByLabel('Zone / Purok').fill('Zone 4');
  await d.getByLabel('Contact number').fill('0918-111-2222');
  await d.getByRole('button', { name: 'Register owner' }).click();
  await expectToast(page, 'Owner registered.');
  await expect(page.getByRole('heading', { name: 'Benito Santiago' })).toBeVisible();
  await expect(page.getByText(/OWN-00\d\d · Pacol/)).toBeVisible();

  await page.getByRole('button', { name: 'Edit' }).click();
  await dialog(page).getByLabel('Street address').fill('22 Peñafrancia Ave.');
  await dialog(page).getByRole('button', { name: 'Save changes' }).click();
  await expectToast(page, 'Owner updated.');
  await expect(page.getByText('22 Peñafrancia Ave.')).toBeVisible();

  await page.getByRole('button', { name: 'Archive' }).click();
  await expect(dialog(page).getByText('This owner has no active farms')).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Archive owner' }).click();
  await expectToast(page, 'Owner archived.');
  await expect(page).toHaveURL(/\/owners$/);
  await expect(page.getByText('Benito Santiago')).toHaveCount(0);
});

test('archive dialog blocks owners with active farms', async ({ page }) => {
  await page.goto('/owners/1');
  await page.getByRole('button', { name: 'Archive' }).click();
  const d = dialog(page);
  await expect(d.getByText('This owner still has 2 active farm(s)')).toBeVisible();
  await expect(
    d.getByText(
      'Cannot archive farm: Farm has population groups with animals; Farm has active tagged animals.',
    ),
  ).toBeVisible();
  await expect(d.getByRole('button', { name: 'Archive owner' })).toBeDisabled();
});

test('register a farm with a map pin, add a group and update its population', async ({ page }) => {
  await page.goto('/farms');
  await page.getByRole('button', { name: 'Register farm' }).click();
  const d = dialog(page);
  await d.getByLabel('Owner', { exact: true }).selectOption({ label: 'Maria Santos · OWN-0002 · Cararayan' });
  await d.getByLabel('Farm name').fill('Santos Duck Pond');
  await d.getByLabel('Farm type').selectOption('poultry');
  await clickMap(page, d, 0.4, 0.5);
  await expect(d.getByLabel('Latitude')).not.toHaveValue('');
  await d.getByRole('button', { name: 'Register farm' }).click();
  await expectToast(page, 'Farm registered.');
  await expect(page.getByRole('heading', { name: 'Santos Duck Pond' })).toBeVisible();

  await page.getByRole('tab', { name: /Population Groups/ }).click();
  await page.getByRole('button', { name: 'Add group' }).click();
  await dialog(page).getByLabel('Species').selectOption('Duck');
  await dialog(page).getByLabel('Breed').fill('Pateros');
  await dialog(page).getByLabel('Initial head count').fill('50');
  await dialog(page).getByRole('button', { name: 'Add group' }).click();
  await expectToast(page, 'Population group added.');
  await expect(page.getByRole('cell', { name: 'Pateros' })).toBeVisible();

  await page.getByRole('button', { name: 'Update population' }).click();
  const u = dialog(page);
  await u.getByRole('spinbutton', { name: /count/ }).fill('56');
  await expect(u.getByText('+6')).toBeVisible();
  await u.getByRole('button', { name: 'Save update' }).click();
  await expectToast(page, /Population for Santos Duck Pond saved/);
  await expect(page.getByRole('cell', { name: '56', exact: true })).toBeVisible();
});

test('population page: select farm, update and view totals', async ({ page }) => {
  await page.goto('/population');
  await page.getByLabel('Farm to update').selectOption({ label: 'FRM-0002 Cararayan Hog Farm' });
  await expect(page.getByText('Clear farm filter')).toBeVisible();
  await page.getByRole('button', { name: 'Update population' }).click();
  const d = dialog(page);
  await expect(d.getByText('Update population — Cararayan Hog Farm')).toBeVisible();
  await d.getByRole('button', { name: 'Save update' }).click();
  await expectToast(page, /Population for Cararayan Hog Farm saved/);
  await page.getByRole('tab', { name: 'Totals by barangay & species' }).click();
  await expect(page.getByRole('heading', { name: 'By barangay' })).toBeVisible();
  await expect(page.getByText('City total (your scope):')).toBeVisible();
});

test('register a tagged animal, then transfer and look it up', async ({ page }) => {
  await page.goto('/animals');
  await page.getByRole('button', { name: 'Register animal' }).click();
  const d = dialog(page);
  await d.getByLabel('Population group').selectOption('13');
  await d.getByLabel('Ear tag').fill('ET-9001');
  await d.getByLabel('Sex').selectOption('Male');
  await d.getByLabel('Estimated age').fill('2 yrs');
  await d.getByLabel('Color & markings').fill('Grey with white face');
  await d.getByRole('button', { name: 'Save' }).click();
  await expectToast(page, 'Animal registered.');
  await expect(page.getByText('Ear tag ET-9001 · Cattle')).toBeVisible();

  await page.getByRole('button', { name: 'Transfer' }).click();
  const t = dialog(page);
  await t
    .getByLabel('Receiving farm')
    .selectOption({ label: 'Ramon Mendoza · Carolina Cattle Range (Carolina)' });
  await t.getByLabel('Remarks').fill('Sold at livestock auction');
  await t.getByRole('button', { name: 'Record transfer' }).click();
  await expectToast(page, 'Ownership transfer recorded.');
  await expect(page.getByRole('link', { name: 'Ramon Mendoza' })).toBeVisible();

  await page.goto('/ownership');
  await page.getByLabel('Animal ID or ear tag').fill('ET-9001');
  await page.getByRole('button', { name: 'Look up' }).click();
  await expect(page.getByText('Current owner:')).toContainText('Ramon Mendoza');
  await expect(page.getByRole('cell', { name: 'Sold at livestock auction' })).toBeVisible();
});

test('duplicate ear tags are rejected with a field error', async ({ page }) => {
  await page.goto('/animals');
  await page.getByRole('button', { name: 'Register animal' }).click();
  const d = dialog(page);
  await d.getByLabel('Population group').selectOption('13');
  await d.getByLabel('Ear tag').fill('ET-2401');
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(d.getByText('Ear tag already used by NC-C-0001')).toBeVisible();
});

test('report a stray animal and update the incident', async ({ page }) => {
  await page.goto('/strays');
  await page.getByRole('button', { name: 'Report incident' }).click();
  const d = dialog(page);
  await d.getByLabel('Species').selectOption('Goat');
  await d.getByLabel('Barangay').selectOption('Balatas');
  await d.getByLabel('Location', { exact: false }).first().fill('Balatas covered court');
  await clickMap(page, d, 0.5, 0.5);
  await d.getByRole('button', { name: 'Save report' }).click();
  await expectToast(page, 'Stray livestock report saved.');
  const row = page.getByRole('row', { name: /STR-0005/ });
  await expect(row).toContainText('Pinned');
  await row.click();
  const u = dialog(page);
  await u.getByLabel('Status').selectOption('IMPOUNDED');
  await u.getByLabel('Violations').fill('1');
  await u.getByRole('button', { name: 'Save changes' }).click();
  await expectToast(page, 'Incident updated.');
  await expect(page.getByRole('row', { name: /STR-0005/ })).toContainText('Impounded');
});

test('geotag a farm without coordinates', async ({ page }) => {
  await page.goto('/geotagging');
  await page.getByRole('button', { name: /Pacol Carabao Yard/ }).click();
  await expect(page.getByText('No coordinates yet')).toBeVisible();
  await clickMap(page, page.locator('main'), 0.55, 0.5);
  await page.getByRole('button', { name: 'Save location' }).click();
  await expectToast(page, 'Pacol Carabao Yard location saved.');
  await expect(page.getByRole('button', { name: /Pacol Carabao Yard/ })).toContainText('Mapped');
});
