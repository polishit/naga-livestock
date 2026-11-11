import { expect, test } from '@playwright/test';
import { clickMap, dialog, expectToast, login } from './helpers';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('register, edit and archive a livestock owner', async ({ page }) => {
  await page.goto('/owners');
  await page.getByRole('button', { name: 'Add Owner', exact: true }).click();
  const d = dialog(page);
  await d.getByRole('button', { name: 'Add owner', exact: true }).click();
  await expect(d.getByText('Required').first()).toBeVisible();
  await expect(d.getByText('Select a barangay')).toBeVisible();
  await d.getByLabel('Full name').fill('Benito Santiago');
  await d.getByLabel('Barangay').selectOption('Pacol');
  await d.getByLabel('Zone / Purok').fill('Zone 4');
  await d.getByLabel('Contact number').fill('0918-111-2222');
  await d.getByRole('button', { name: 'Add owner', exact: true }).click();
  await expectToast(page, 'Livestock owner added to the masterlist.');
  await expect(page.getByRole('heading', { name: 'Benito Santiago' })).toBeVisible();
  await expect(page.getByText(/OWN-00\d\d · Pacol/)).toBeVisible();

  await page.getByRole('button', { name: 'Edit Owner' }).click();
  await dialog(page).getByLabel('Street address').fill('22 Peñafrancia Ave.');
  await dialog(page).getByRole('button', { name: 'Save changes' }).click();
  await expectToast(page, 'Owner updated.');
  await expect(page.getByText('22 Peñafrancia Ave.')).toBeVisible();

  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: /Archive owner/ }).click();
  await expect(dialog(page).getByText('This owner has no active farms')).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Archive owner' }).click();
  await expectToast(page, 'Owner archived.');
  await expect(page).toHaveURL(/\/owners$/);
  await expect(page.getByText('Benito Santiago')).toHaveCount(0);
});

test('archive dialog blocks owners with active farms', async ({ page }) => {
  await page.goto('/owners/1');
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: /Archive owner/ }).click();
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
  await page.getByRole('button', { name: 'Add Farm', exact: true }).click();
  const d = dialog(page);
  await d.getByLabel('Owner', { exact: true }).selectOption({ label: 'Maria Santos · OWN-0002 · Cararayan' });
  await d.getByLabel('Farm name').fill('Santos Duck Pond');
  await d.getByLabel('Farm scale').selectOption('commercial');
  await clickMap(page, d, 0.4, 0.5);
  await expect(d.getByLabel('Latitude', { exact: true })).not.toHaveValue('');
  await d.getByRole('button', { name: 'Add farm', exact: true }).click();
  await expectToast(page, 'Farm added to the masterlist.');
  await expect(page.getByRole('heading', { name: 'Santos Duck Pond' })).toBeVisible();

  await page.getByRole('tab', { name: /Livestock/ }).click();
  await page.getByRole('button', { name: 'Add Species' }).click();
  await dialog(page).getByLabel('Species').selectOption('Duck');
  await dialog(page).getByLabel('Breed').fill('Pateros');
  await dialog(page).getByLabel('Head count').fill('50');
  // Optional classification by age, sex and stage must add up to the head count.
  await dialog(page).getByLabel('Classify by age, sex and stage').check();
  await dialog(page).getByLabel('Duckling').fill('30');
  await dialog(page).getByLabel('Layer').fill('10');
  await dialog(page).getByRole('button', { name: 'Add livestock' }).click();
  await expect(dialog(page).getByText('The classification must add up to the head count')).toBeVisible();
  await dialog(page).getByLabel('Drake').fill('10');
  await dialog(page).getByRole('button', { name: 'Add livestock' }).click();
  await expectToast(page, 'Livestock added to the farm.');
  await expect(page.getByText('Pateros')).toBeVisible();
  await expect(page.getByText('Duckling', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Update Head Count' }).click();
  const u = dialog(page);
  await u.getByRole('spinbutton', { name: /GRP-\d+ count/ }).fill('56');
  await expect(u.getByText('+6')).toBeVisible();
  // The classification shown (50 head) must be updated to match the new count.
  await u.getByLabel('Duckling').fill('36');
  await u.getByRole('button', { name: 'Save head count' }).click();
  await expectToast(page, /Population for Santos Duck Pond saved/);
  await expect(page.getByText('56', { exact: true })).toBeVisible();
});

test('population page: select farm, update and view totals', async ({ page }) => {
  await page.goto('/population');
  await expect(page.getByText('Total livestock:')).toBeVisible();
  await page.getByLabel('Farm to update').selectOption({ label: 'Cararayan Hog Farm · Cararayan' });
  await page.getByRole('button', { name: 'Update Head Count' }).click();
  const d = dialog(page);
  await expect(d.getByText('Update Head Count — Cararayan Hog Farm')).toBeVisible();
  await d.getByRole('button', { name: 'Save head count' }).click();
  await expectToast(page, /Population for Cararayan Hog Farm saved/);
  await page.getByRole('tab', { name: 'By Farm' }).click();
  await expect(page.getByText('Clear farm filter')).toBeVisible();
  await page.getByRole('tab', { name: 'By Barangay' }).click();
  await expect(page.getByRole('heading', { name: 'Livestock by Barangay' })).toBeVisible();
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
  const row = page.getByRole('row', { name: /STR-0007/ });
  await expect(row).toContainText('Pinned');
  await row.click();
  const u = dialog(page);
  await u.getByLabel('Status').selectOption('IMPOUNDED');
  await u.getByLabel('Number of violations').fill('1');
  // Impounding needs the date and the place.
  await u.getByRole('button', { name: 'Save changes' }).click();
  await expect(u.getByText('Enter where the animal is impounded')).toBeVisible();
  await u.getByLabel('Impound date').fill(new Date().toLocaleDateString('en-CA'));
  await u.getByLabel('Impound place').fill('City pound');
  await u.getByRole('button', { name: 'Save changes' }).click();
  await expectToast(page, 'Incident updated.');
  await expect(page.getByRole('row', { name: /STR-0007/ })).toContainText('Impounded');
});

test('set the location of a farm without coordinates (old geotagging link)', async ({ page }) => {
  await page.route('**/api/geocode/reverse**', (route) =>
    route.fulfill({ json: { address: 'Pacol Road, Pacol, Naga', barangay: 'Pacol' } }),
  );
  // The old Farm Geotagging page now opens the farm list filtered to farms without a location.
  await page.goto('/geotagging');
  await expect(page).toHaveURL(/\/farms\?location=unmapped/);
  await page
    .getByRole('cell', { name: /Pacol Carabao Yard/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Set location' }).click();
  const d = dialog(page);
  await clickMap(page, d, 0.55, 0.5);
  // The farm already had a typed address: it is kept unless "Use it" is chosen.
  await d.getByRole('button', { name: 'Use it' }).click();
  await expect(d.getByLabel('Farm address')).toHaveValue('Pacol Road, Pacol, Naga');
  // Fine-tune the pin by typing (kept away from the outbreak farms used by the radius test).
  await d.getByLabel('Latitude').fill('13.6705');
  await d.getByLabel('Longitude').fill('123.281');
  await d.getByRole('button', { name: 'Save changes' }).click();
  await expectToast(page, 'Farm updated.');
  // The farm profile shows the new address and pin straight away.
  await expect(page.getByRole('button', { name: 'Set location' })).toHaveCount(0);
  await expect(page.getByText('Pacol Road, Pacol, Naga').first()).toBeVisible();
});

test('clicking the map fills in the address and barangay', async ({ page }) => {
  await page.route('**/api/geocode/reverse**', (route) =>
    route.fulfill({ json: { address: 'Pacol Road, Pacol, Naga', barangay: 'Pacol' } }),
  );
  await page.goto('/farms');
  await page.getByRole('button', { name: 'Add Farm', exact: true }).click();
  const d = dialog(page);
  await clickMap(page, d, 0.4, 0.4);
  await expect(d.getByLabel('Farm address')).toHaveValue('Pacol Road, Pacol, Naga');
  await expect(d.getByLabel('Barangay')).toHaveValue('Pacol');
  await expect(d.getByText('Address filled in from the map (Barangay Pacol)')).toBeVisible();

  // An address the user typed is kept; the map address is offered instead.
  await d.getByLabel('Farm address').fill('Purok 3, near the chapel');
  await clickMap(page, d, 0.6, 0.6);
  await expect(d.getByText('Kept the address you typed.')).toBeVisible();
  await expect(d.getByLabel('Farm address')).toHaveValue('Purok 3, near the chapel');
  await d.getByRole('button', { name: 'Use it' }).click();
  await expect(d.getByLabel('Farm address')).toHaveValue('Pacol Road, Pacol, Naga');
  await d.getByRole('button', { name: 'Cancel' }).click();

  // Stray reports fill the Location field the same way.
  await page.goto('/strays');
  await page.getByRole('button', { name: 'Report incident' }).click();
  await clickMap(page, dialog(page), 0.5, 0.5);
  await expect(dialog(page).getByLabel('Location', { exact: false }).first()).toHaveValue(
    'Pacol Road, Pacol, Naga',
  );
  await expect(dialog(page).getByLabel('Barangay')).toHaveValue('Pacol');
});

test('a failed address lookup tells the user to type it', async ({ page }) => {
  await page.route('**/api/geocode/reverse**', (route) =>
    route.fulfill({ status: 502, json: { error: 'Address lookup is unavailable right now.' } }),
  );
  await page.goto('/farms');
  await page.getByRole('button', { name: 'Add Farm', exact: true }).click();
  await clickMap(page, dialog(page), 0.5, 0.5);
  await expect(dialog(page).getByText("Couldn't look up the address")).toBeVisible();
  await expect(dialog(page).getByLabel('Latitude', { exact: true })).not.toHaveValue('');
});

test('record a PCIC policy, then mark it claimed', async ({ page }) => {
  await page.goto('/owners/2');
  await page.getByRole('button', { name: 'Add Policy' }).click();
  const d = dialog(page);
  await d.getByLabel('Policy number').fill('PCIC-E2E-77');
  await d.getByLabel('Insured heads').fill('4');
  await d.getByLabel('Coverage start').fill('2026-01-01');
  await d.getByLabel('Coverage end').fill('2026-12-31');
  await d.getByRole('button', { name: 'Save' }).click();
  await expectToast(page, 'Insurance policy recorded.');
  const row = page.getByRole('group', { name: /PCIC-E2E-77/ });
  await expect(row.getByText('Active')).toBeVisible();
  await row.getByRole('button', { name: 'Update' }).click();
  await expect(dialog(page).getByLabel('Policy number')).toHaveValue('PCIC-E2E-77');
  await dialog(page).getByLabel('Status').selectOption('CLAIMED');
  await dialog(page).getByLabel('Remarks').fill('Claim paid for 2 heads');
  await dialog(page).getByRole('button', { name: 'Save' }).click();
  await expectToast(page, 'Insurance policy updated.');
  await expect(row.getByText('Claimed')).toBeVisible();
  await expect(row.getByText('Claim paid for 2 heads')).toBeVisible();
});
