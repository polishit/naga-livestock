import { expect, test } from '@playwright/test';
import { clickMap, dialog, expectToast, login } from './helpers';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('report a disease incident and move it through the surveillance stages', async ({ page }) => {
  await page.goto('/cases/new');
  await page.getByRole('button', { name: 'Submit report' }).click();
  await expect(page.getByText('Select an owner')).toBeVisible();

  await page.getByLabel('Owner').selectOption({ label: 'Luz Navarro · Pacol' });
  await page.getByLabel('Farm').selectOption({ label: 'FRM-0014 · Pacol Poultry House' });
  await expect(page.getByLabel('Barangay')).toHaveValue('Pacol');
  await page.getByLabel('Species affected').selectOption('Chicken');
  await page.getByLabel('Suspected disease').fill('Avian Influenza (suspected)');
  await page.getByLabel('Animals affected').fill('15');
  await page.getByLabel('Deaths').fill('20');
  await page.getByRole('button', { name: 'Submit report' }).click();
  await expect(page.getByText('Deaths cannot exceed animals affected')).toBeVisible();
  await page.getByLabel('Deaths').fill('4');
  await page.getByLabel('Observed symptoms').fill('Sudden deaths, swollen heads');
  await page.getByLabel('Assigned inspector').selectOption({ label: 'Dr. Mark Inspector' });
  await page.getByRole('button', { name: 'Submit report' }).click();
  await expectToast(page, 'Disease incident reported.');
  await expect(page.getByRole('heading', { name: 'CASE-0010 · Avian Influenza (suspected)' })).toBeVisible();
  await expect(page.getByText('(Farm Coordinates)')).toBeVisible();

  // Status workflow
  await page.getByRole('button', { name: 'Update Status' }).click();
  await expect(dialog(page).getByLabel('New status')).toHaveValue('SAMPLE_COLLECTED');
  await dialog(page).getByLabel('Note').fill('Swabs taken');
  await dialog(page).getByRole('button', { name: 'Confirm' }).click();
  await expectToast(page, 'Case status updated.');
  await expect(page.getByText('Sample Collected').first()).toBeVisible();

  // Investigation
  await page.getByRole('tab', { name: 'Investigation' }).click();
  await page.getByRole('button', { name: 'Add investigation' }).click();
  await expect(dialog(page).getByRole('button', { name: 'Save' })).toBeDisabled();
  await dialog(page).getByLabel('Findings / notes').fill('Visited again; 4 deaths confirmed.');
  await dialog(page).getByRole('button', { name: 'Save' }).click();
  await expectToast(page, 'Investigation recorded.');
  await expect(page.getByRole('cell', { name: 'Visited again; 4 deaths confirmed.' })).toBeVisible();

  // Laboratory (required-field validation first)
  await page.getByRole('tab', { name: 'Laboratory' }).click();
  await page.getByRole('button', { name: 'Add lab record' }).click();
  await dialog(page).getByRole('button', { name: 'Save' }).click();
  await expect(dialog(page).getByText('Required')).toBeVisible();
  await dialog(page).getByLabel('Sample ID number').fill('RADDL-CASE-0010');
  await dialog(page).getByRole('button', { name: 'Save' }).click();
  await expectToast(page, 'Laboratory record added.');
  await expect(page.getByRole('cell', { name: 'RADDL-CASE-0010' })).toBeVisible();

  // Response
  await page.getByRole('tab', { name: 'Response' }).click();
  await expect(page.getByText('Farms within 1.00 km')).toBeVisible();
  await page.getByRole('button', { name: 'Log activity' }).click();
  await dialog(page).getByLabel('Activity type').selectOption('QUARANTINE');
  await dialog(page).getByLabel('Personnel involved').fill('City Vet Team B');
  await dialog(page).getByLabel('Remarks').fill('Farm placed under quarantine.');
  await dialog(page).getByRole('button', { name: 'Save' }).click();
  await expectToast(page, 'Response activity logged.');
  await expect(page.getByText('Farm placed under quarantine.')).toBeVisible();

  // History
  await page.getByRole('tab', { name: 'History' }).click();
  await expect(page.getByText('Swabs taken')).toBeVisible();
  await expect(page.getByText('Case reported', { exact: true })).toBeVisible();
});

test('add a location to a case awaiting geotagging', async ({ page }) => {
  await page.goto('/outbreak-map');
  await expect(page.getByText('1 awaiting geotagging')).toBeVisible();
  await page.getByRole('button', { name: 'Add location' }).click();
  const d = dialog(page);
  await clickMap(page, d, 0.5, 0.5);
  await d.getByRole('button', { name: 'Save location' }).click();
  await expectToast(page, 'CASE-0009 location saved.');
  await expect(page.getByText('All cases are geotagged.')).toBeVisible();
});

test('radius analysis matches the outbreak figures', async ({ page }) => {
  await page.goto('/radius?case=1');
  await expect(page.getByText('Ground-zero farm + 5 nearby')).toBeVisible();
  await expect(page.getByText('988', { exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: /^210 m/ })).toBeVisible();
  await expect(page.getByRole('cell', { name: /^910 m/ })).toBeVisible();
  await page.getByRole('button', { name: '500 m' }).click();
  await expect(page.getByText('Farms within 500 m')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV' }).click();
  expect((await download).suggestedFilename()).toBe('outbreak-area-report-case-0001.csv');
});

test('record a group vaccination and see it in records and coverage', async ({ page }) => {
  await page.goto('/vaccinations');
  await page.getByRole('button', { name: 'Record vaccination' }).click();
  const d = dialog(page);
  await d.getByLabel('Farm').selectOption({ label: 'FRM-0013 · Pacol Goat Farm (Pacol)' });
  await d.getByLabel('Group').selectOption({ label: 'GRP-0029 · Goat · 15 head' });
  await d.getByLabel('Number vaccinated').fill('99');
  await d.getByLabel('Vaccine name').fill('PPR Vaccine');
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(d.getByText('Group GRP-0029 only has 15 head')).toBeVisible();
  await d.getByLabel('Number vaccinated').fill('12');
  await d.getByRole('button', { name: 'Save' }).click();
  await expectToast(page, 'Vaccination recorded.');
  await expect(page.getByRole('cell', { name: 'PPR Vaccine' }).first()).toBeVisible();
  await page.getByRole('tab', { name: 'Coverage' }).click();
  await expect(page.getByText('≈ 12 of 87 head')).toBeVisible();
});

test('case tracking board and investigation page', async ({ page }) => {
  await page.goto('/case-tracking');
  await expect(page.getByRole('button', { name: /CASE-0006/ })).toBeVisible();
  await page.getByRole('button', { name: 'Table view' }).click();
  await expect(page.getByRole('cell', { name: 'CASE-0001' })).toBeVisible();
  await page.goto('/investigation');
  await expect(page.getByText('All laboratory records')).toBeVisible();
  await page.getByLabel('Case').selectOption({ label: 'CASE-0001 · African Swine Fever (ASF)' });
  await expect(page.getByText('Open case profile')).toBeVisible();
});
