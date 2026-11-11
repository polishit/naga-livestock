import { expect, test } from '@playwright/test';
import { clickMap, dialog, expectToast, login } from './helpers';

const SHOTS = process.env.SHOTS_DIR;
const shot = async (page: import('@playwright/test').Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

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
  // Only the species this farm keeps are offered; animals affected starts at the farm's head count.
  const speciesOptions = page.getByLabel('Species affected').locator('option');
  await expect(speciesOptions).toHaveText(['Select...', 'Chicken — 158 head', 'Other Poultry — 26 head']);
  await page.getByLabel('Species affected').selectOption('Chicken');
  await expect(page.getByLabel('Animals affected')).toHaveValue('158');
  await expect(page.getByText('158 chicken on this farm')).toBeVisible();
  // Diseases come from the monitored list (ASF first), with "Other" for anything else.
  await page.getByLabel('Suspected disease').selectOption('Avian Influenza (Bird Flu)');
  await page.getByLabel('Animals affected').fill('15');
  await page.getByLabel('Deaths').fill('20');
  await page.getByRole('button', { name: 'Submit report' }).click();
  await expect(page.getByText('Deaths cannot exceed animals affected')).toBeVisible();
  await page.getByLabel('Deaths').fill('4');
  await page.getByLabel('Observed symptoms').fill('Sudden deaths, swollen heads');
  await page.getByLabel('Assigned inspector').selectOption({ label: 'Dr. Mark Inspector' });
  await page.getByRole('button', { name: 'Submit report' }).click();
  await expectToast(page, 'Disease incident reported.');
  await expect(page.getByRole('heading', { name: 'CASE-0014 · Avian Influenza (Bird Flu)' })).toBeVisible();
  await expect(page.getByText('(Farm Coordinates)')).toBeVisible();
  // The case says what to do first.
  const next = page.getByLabel('Next step');
  await expect(next).toContainText('Record the first site visit');

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
  await dialog(page).getByLabel('Findings / summary').fill('Visited again; 4 deaths confirmed.');
  await dialog(page).getByRole('button', { name: 'Save' }).click();
  await expectToast(page, 'Investigation recorded.');
  await expect(page.getByRole('cell', { name: 'Visited again; 4 deaths confirmed.' })).toBeVisible();
  // After the visit, the next step moves on to the laboratory.
  await expect(next).toContainText('Collect samples and add a lab record');

  // Laboratory (required-field validation first), started from the next-step button
  await next.getByRole('button', { name: 'Add lab record' }).click();
  await dialog(page).getByRole('button', { name: 'Save' }).click();
  await expect(dialog(page).getByText('Required')).toBeVisible();
  await dialog(page).getByLabel('Sample ID number').fill('RADDL-CASE-0014');
  await dialog(page).getByRole('button', { name: 'Save' }).click();
  await expectToast(page, 'Laboratory record added.');
  await expect(page.getByRole('cell', { name: 'RADDL-CASE-0014' })).toBeVisible();

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

  // Overview: sample → testing → result steps and the response status.
  await page.getByRole('tab', { name: 'Overview' }).click();
  await expect(page.getByRole('heading', { name: 'Sample, Testing and Result' })).toBeVisible();
  await expect(page.getByText('RADDL-CASE-0014').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Response Status' })).toBeVisible();

  // Timeline: every event in date order.
  await page.getByRole('tab', { name: 'Timeline' }).click();
  await expect(page.getByRole('heading', { name: 'Incident Timeline' })).toBeVisible();
  await expect(page.getByText('Incident reported', { exact: true })).toBeVisible();
  await expect(page.getByText('Swabs taken').first()).toBeVisible();
  await expect(page.getByText('Case reported', { exact: true })).toBeVisible();
});

test('add a location to a case awaiting geotagging', async ({ page }) => {
  await page.goto('/outbreak-map');
  await page.getByRole('tab', { name: 'Open Reports' }).click();
  await expect(page.getByText('1 without a map location')).toBeVisible();
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
  await expect(page.getByText(/988 head/)).toBeVisible();
  // Monitoring: no nearby farm has been visited since the report yet.
  await expect(
    page.locator('button').filter({ hasText: 'Not yet visited' }).getByText('5', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('cell', { name: /^210 m/ })).toBeVisible();
  await expect(page.getByRole('cell', { name: /^910 m/ })).toBeVisible();
  await page.getByRole('button', { name: '500 m' }).click();
  await expect(page.getByText('Farms within 500 m')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV' }).click();
  expect((await download).suggestedFilename()).toBe('outbreak-area-report-case-0001.csv');
});

test('record deworming and a group vaccination; see them in records and coverage', async ({ page }) => {
  // The old Vaccinations link opens Deworming & Veterinary Services.
  await page.goto('/vaccinations');
  await expect(page).toHaveURL(/\/services/);
  await page.getByRole('tab', { name: 'Service Records' }).click();
  await page.getByRole('button', { name: 'Record Service' }).click();
  let d = dialog(page);
  // Deworming is the default service and needs no product.
  await expect(d.getByRole('radio', { name: 'Deworming' })).toHaveAttribute('aria-checked', 'true');
  await d.getByLabel('Farm', { exact: true }).selectOption({ label: 'FRM-0013 · Pacol Goat Farm (Pacol)' });
  await d.getByLabel('Species / group').selectOption('29');
  await d.getByLabel('No. of heads dewormed').fill('15');
  await d.getByRole('button', { name: 'Save' }).click();
  await expectToast(page, 'Deworming recorded.');
  await expect(page.getByRole('cell', { name: 'Deworming' }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Record Service' }).click();
  d = dialog(page);
  await d.getByRole('radio', { name: 'Vaccination' }).click();
  await d.getByLabel('Farm', { exact: true }).selectOption({ label: 'FRM-0013 · Pacol Goat Farm (Pacol)' });
  await d.getByLabel('Species / group').selectOption('29');
  await d.getByLabel('No. of heads vaccinated').fill('99');
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(d.getByText('Enter the vaccine used')).toBeVisible();
  await d.getByLabel('Vaccine used').fill('PPR Vaccine');
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(d.getByText('Group GRP-0029 only has 15 head')).toBeVisible();
  await d.getByLabel('No. of heads vaccinated').fill('12');
  await d.getByRole('button', { name: 'Save' }).click();
  await expectToast(page, 'Vaccination recorded.');
  await expect(page.getByRole('cell', { name: 'PPR Vaccine' }).first()).toBeVisible();
  await page.getByRole('tab', { name: 'Vaccination Coverage' }).click();
  await expect(page.getByText('≈ 12 of 87 head')).toBeVisible();
});

test('incident board view and the investigation / response work lists', async ({ page }) => {
  // The old Case Tracking page opens the board view of Incident Reports.
  await page.goto('/case-tracking');
  await expect(page).toHaveURL(/\/cases\?view=board/);
  await expect(page.getByRole('button', { name: /CASE-0006/ })).toBeVisible();
  await page.getByRole('button', { name: 'Table' }).click();
  await expect(page.getByRole('cell', { name: 'CASE-0001' })).toBeVisible();

  await page.goto('/investigation');
  await expect(page.getByText(/Lab samples awaiting results/i)).toBeVisible();
  await expect(page.getByText(/Field visits due/i)).toBeVisible();
  await shot(page, 'investigation-worklist');
  // A visit row opens the case on its Investigation tab.
  const visits = page.locator('.card').filter({ hasText: 'Field visits due' });
  await expect(visits.getByRole('row').nth(1)).toBeVisible();
  await visits.getByRole('row').nth(1).click();
  await expect(page).toHaveURL(/\/cases\/\d+\?tab=investigation/);
  await expect(page.getByRole('tab', { name: 'Investigation' })).toHaveAttribute('aria-selected', 'true');

  await page.goto('/response');
  await expect(page.getByText('Measures on open cases')).toBeVisible();
  await shot(page, 'response-worklist');
});

test('back button returns from a farm to the farm list', async ({ page }) => {
  await page.goto('/farms');
  await page
    .getByRole('cell', { name: /Pacol Poultry House/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/farms\/\d+$/);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(/\/farms$/);
  // Opened directly (no history): Back goes to the list page.
  await page.goto('/cases/1');
  await page.evaluate(() => history.replaceState({ ...history.state, idx: 0 }, ''));
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(/\/cases$/);
});

test('report a linked incident from radius analysis, then close and reopen the case', async ({ page }) => {
  await page.goto('/radius?case=1');
  await expect(page.getByText('Ground-zero farm + 5 nearby')).toBeVisible();
  // Monitor a nearby farm: record the visit; sick animals found → report it as a linked incident.
  await page.getByRole('button', { name: 'Record visit' }).first().click();
  const v = dialog(page);
  await expect(v.getByLabel('Purpose')).toHaveValue('MONITORING');
  await expect(v.getByLabel('Related disease case')).toHaveValue('1');
  await v.getByLabel('Findings').selectOption('SICK_ANIMALS');
  await v.getByRole('button', { name: 'Save visit' }).click();
  await expectToast(page, /Farm visit VIS-\d+ recorded/);
  await expect(page.getByRole('cell', { name: /Sick animals found/ })).toBeVisible();
  await page.getByRole('button', { name: 'Report', exact: true }).first().click();
  await expect(page).toHaveURL(/\/cases\/new\?farm=\d+&from=1/);
  await expect(page.getByText('This incident will be linked to')).toBeVisible();
  await expect(page.getByLabel('Suspected disease')).toHaveValue('African Swine Fever (ASF)');
  await expect(page.getByLabel('Farm')).not.toHaveValue('');
  await page.getByLabel('Animals affected').fill('3');
  await page.getByRole('button', { name: 'Submit report' }).click();
  await expectToast(page, 'Disease incident reported.');
  await expect(page.getByText('Reported as a linked incident of')).toBeVisible();
  await page.getByRole('link', { name: 'CASE-0001' }).click();
  await expect(page.getByText('Linked incidents')).toBeVisible();
  await expect(page.getByRole('link', { name: /^CASE-001[45]$/ })).toBeVisible();

  // CASE-0001 is Positive, so it can be closed.
  await page.getByRole('button', { name: 'Close case' }).first().click();
  await dialog(page).getByRole('button', { name: 'Close case' }).click();
  await expect(dialog(page).getByText('Select the outcome')).toBeVisible();
  await expect(dialog(page).getByText('Write the closing remarks / outcome')).toBeVisible();
  await dialog(page).getByLabel('Outcome').selectOption('CONTAINED');
  await dialog(page).getByLabel('Closing remarks').fill('Quarantine lifted; no new deaths for 30 days.');
  await dialog(page).getByRole('button', { name: 'Close case' }).click();
  await expectToast(page, 'CASE-0001 closed.');
  await expect(page.getByText('This case is read-only.')).toBeVisible();
  await expect(page.getByText('Contained — no further spread')).toBeVisible();
  // Records stay visible but locked.
  await page.getByRole('tab', { name: 'Laboratory' }).click();
  await expect(page.getByText(/This case is closed: these records are kept/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enter result' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add lab record' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Update Status' })).toHaveCount(0);

  // It leaves the open list and appears under Closed.
  await page.goto('/cases');
  await expect(page.getByText('CASE-0001', { exact: true })).toHaveCount(0);
  await page.getByLabel('Case state').selectOption('closed');
  await expect(page.getByRole('cell', { name: 'CASE-0001', exact: true })).toBeVisible();
  await page.goto('/cases?view=board');
  await page.getByLabel('Case state').selectOption('closed');
  await expect(page.getByRole('button', { name: /CASE-0001.*Positive/ })).toBeVisible();

  // Admin reopens it.
  await page.goto('/cases/1');
  await page.getByRole('button', { name: 'Reopen case' }).click();
  await expectToast(page, 'Case reopened.');
  await expect(page.getByRole('button', { name: 'Close case' }).first()).toBeVisible();
});

test('entering a lab result offers the matching status; more deaths prompt a population update', async ({
  page,
}) => {
  // CASE-0003 is awaiting its result.
  await page.goto('/cases/3');
  await page.getByRole('tab', { name: 'Laboratory' }).click();
  await page.getByRole('table').getByRole('button', { name: 'Enter result' }).click();
  await dialog(page).getByLabel('Result', { exact: true }).selectOption('NEGATIVE');
  await dialog(page).getByRole('button', { name: 'Save' }).click();
  await expect(dialog(page).getByText('Enter the date the result was released')).toBeVisible();
  await dialog(page).getByLabel('Result date').fill('2026-09-15');
  await dialog(page).getByRole('button', { name: 'Save' }).click();
  await expectToast(page, 'Laboratory record updated.');
  await expect(dialog(page).getByLabel('New status')).toHaveValue('NEGATIVE');
  await dialog(page).getByRole('button', { name: 'Confirm' }).click();
  await expectToast(page, 'Case status updated.');

  // CASE-0008: two more deaths → reminder → pre-filled population update.
  await page.goto('/cases/8');
  await page.getByRole('button', { name: 'Edit details' }).click();
  await dialog(page).getByLabel('Deaths').fill('3');
  await dialog(page).getByRole('button', { name: 'Save changes' }).click();
  await expectToast(page, 'CASE-0008 updated.');
  await expect(page.getByText(/animal\(s\) died or were culled/)).toBeVisible();
  await page.getByRole('button', { name: 'Update population' }).click();
  await expect(dialog(page).getByText('Suggested counts take 2 swine off for CASE-0008')).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Save head count' }).click();
  await expect(page.getByText(/animal\(s\) died or were culled/)).toHaveCount(0);
  await page.getByRole('tab', { name: 'Timeline' }).click();
  await expect(page.getByText(/deaths: 1 → 3/).first()).toBeVisible();
});

test('admin removes a service record, edits a species, and confirms a possible duplicate owner', async ({
  page,
}) => {
  await page.goto('/services?tab=records');
  await page.getByRole('button', { name: 'Remove' }).first().click();
  await dialog(page).getByRole('button', { name: 'Void record' }).click();
  await expect(dialog(page).getByText('Write why this record is being voided')).toBeVisible();
  await dialog(page).getByLabel('Reason').fill('Entered twice');
  await dialog(page).getByRole('button', { name: 'Void record' }).click();
  await expectToast(page, /record SRV-\d+ voided/);

  await page.goto('/farms/1?tab=livestock');
  await page
    .locator('.card')
    .filter({ hasText: 'GRP-0001' })
    .getByRole('button', { name: 'Edit details' })
    .click();
  await dialog(page).getByLabel('Breed').fill('Duroc');
  await dialog(page).getByRole('button', { name: 'Save changes' }).click();
  await expectToast(page, 'Group updated.');
  await expect(page.getByText('Duroc')).toBeVisible();

  await page.goto('/owners');
  await page.getByRole('button', { name: 'Add Owner', exact: true }).click();
  await dialog(page).getByLabel('Full name').fill('Juan Dela Cruz');
  await dialog(page).getByLabel('Barangay').selectOption('Cararayan');
  await dialog(page).getByRole('button', { name: 'Add owner', exact: true }).click();
  await expect(dialog(page).getByText(/Possible duplicate: OWN-0001/)).toBeVisible();
  await dialog(page).getByLabel('This is a different person — save anyway').check();
  await dialog(page).getByRole('button', { name: 'Add owner', exact: true }).click();
  await expectToast(page, 'Livestock owner added to the masterlist.');
});
