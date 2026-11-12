import { expect, test } from '@playwright/test';
import { dialog, expectToast, login } from './helpers';

const SHOTS = process.env.SHOTS_DIR;
const shot = async (page: import('@playwright/test').Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('closing a form with typed changes asks first', async ({ page }) => {
  await page.goto('/owners');
  await page.getByRole('button', { name: 'Add Owner', exact: true }).click();
  const d = dialog(page);
  // Untouched: closes straight away.
  await d.getByRole('button', { name: 'Cancel' }).click();
  await expect(d).toHaveCount(0);
  await page.getByRole('button', { name: 'Add Owner', exact: true }).click();
  await d.getByLabel('Full name').fill('Half Typed');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog', { name: 'Discard changes?' })).toBeVisible();
  await shot(page, 'discard');
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await expect(d.getByLabel('Full name')).toHaveValue('Half Typed');
  await d.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Discard' }).click();
  await expect(d).toHaveCount(0);
});

test('move a tagged animal to another group on its farm', async ({ page }) => {
  // Farm 10 (NC-C-0007's farm) gets an adult cattle group to move it into.
  const g = await page.request.post('/api/population/groups', {
    data: { farmId: 10, species: 'Cattle', lifeStage: 'adult', count: 4 },
  });
  expect(g.status()).toBe(201);
  await page.goto('/animals/7');
  await page.getByRole('button', { name: 'Move group' }).click();
  const d = dialog(page);
  await expect(d.getByText(/Now in GRP-0021/)).toBeVisible();
  await d.getByLabel('New group').selectOption({ index: 1 });
  await d.getByLabel('Reason').fill('Now adult');
  await shot(page, 'move-group');
  await d.getByRole('button', { name: 'Move animal' }).click();
  await expectToast(page, 'NC-C-0007 moved to its new group.');
  await page.getByRole('tab', { name: 'Record history' }).click();
  await expect(page.getByText(/Moved from GRP-0021 to GRP-\d+ — Now adult/)).toBeVisible();
});

test('stray report shows the owner’s earlier incidents', async ({ page }) => {
  await page.goto('/strays');
  await page.getByRole('button', { name: 'Report incident' }).click();
  const d = dialog(page);
  await d.getByLabel('Ear tag / Animal ID (if any)').fill('ET-2409');
  await d.getByLabel('Ear tag / Animal ID (if any)').blur();
  await expect(d.getByText(/Registered animal NC-K-0009/)).toBeVisible();
  await expect(d.getByText(/stray incident|No earlier stray incidents/)).toBeVisible();
  await d.getByLabel('Barangay *').selectOption('Pacol');
  await d.getByLabel('Location *').fill('Pacol road');
  await d.getByRole('button', { name: 'Save report' }).click();
  await expectToast(page, 'Stray livestock report saved.');
  await page.getByRole('button', { name: 'Report incident' }).click();
  await d.getByLabel('Ear tag / Animal ID (if any)').fill('ET-2409');
  await d.getByLabel('Ear tag / Animal ID (if any)').blur();
  await expect(d.getByText(/Earlier incident: 1 earlier stray incident/)).toBeVisible();
  await shot(page, 'stray-history');
});

test('barangay map shades barangays and ranks them', async ({ page }) => {
  await page.goto('/barangay-map');
  await expect(page.locator('path.leaflet-interactive')).toHaveCount(27);
  await expect(page.getByText(/Ranking · [\d,]+ head in total/i)).toBeVisible();
  await shot(page, 'barangay-livestock');
  await page.getByLabel('Show').selectOption('openCases');
  await expect(page.getByText(/Ranking · \d+ cases in total/i)).toBeVisible();
  await page.getByRole('button', { name: /^Cararayan/ }).click();
  await expect(page.getByRole('heading', { name: 'Cararayan' })).toBeVisible();
  await shot(page, 'barangay-cases');
});

test('outbreak timeline replays the cases by month', async ({ page }) => {
  await page.goto('/outbreak-map');
  // The timeline is the first tab.
  await expect(page.getByRole('heading', { name: 'Outbreak Timeline' })).toBeVisible();
  const slider = page.getByRole('slider', { name: 'Month' });
  // Wait for the cases to load (the slider then spans the months since the first case).
  await expect(slider).not.toHaveAttribute('max', '0');
  await slider.fill('0');
  await expect(page.getByText(/Reported in /i)).toBeVisible();
  await page.getByRole('button', { name: 'Next month' }).click();
  await shot(page, 'timeline');
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
});

test('print a farm profile and an owner ID card with QR codes', async ({ page, context }) => {
  await page.goto('/farms/1');
  const [farmWin] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: 'Print', exact: true }).click(),
  ]);
  await farmWin.evaluate(() => (window.print = () => {}));
  await expect(farmWin.getByRole('heading', { name: 'Farm Profile' })).toBeVisible();
  await expect(farmWin.locator('img[alt="QR code"]')).toHaveAttribute('src', /^data:image\/png/);
  await expect(farmWin.getByRole('heading', { name: 'Livestock Population' })).toBeVisible();
  if (SHOTS) await farmWin.screenshot({ path: `${SHOTS}/farm-profile.png`, fullPage: true });
  await farmWin.close();
  await page.goto('/owners/1');
  const [cardWin] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: 'Print ID card' }).click(),
  ]);
  await expect(cardWin.getByText('Livestock Owner Identification Card')).toBeVisible();
  await expect(cardWin.getByText('OWN-0001')).toBeVisible();
  if (SHOTS) await cardWin.screenshot({ path: `${SHOTS}/owner-card.png` });
  await cardWin.close();
});

test('stray incident: violation and fine with receipt', async ({ page }) => {
  const s = await page.request.post('/api/strays', {
    data: { species: 'Goat', barangay: 'Pacol', location: 'National highway', ownerId: 5 },
  });
  expect(s.status()).toBe(201);
  const { id, code } = await s.json();
  // Opened straight from a link (as from the owner's page).
  await page.goto(`/strays?open=${id}`);
  const d = dialog(page);
  await expect(d.getByText(`${code} · Stray goat`)).toBeVisible();
  const today = new Date().toLocaleDateString('en-CA');
  await d.getByLabel('Violation type').selectOption('Animal on a public road or highway');
  await d.getByLabel('Fine (₱)').fill('500');
  await d.getByLabel('Fine paid').check();
  await d.getByRole('button', { name: 'Save changes' }).click();
  await expect(d.getByText('Enter the official receipt (OR) number')).toBeVisible();
  await d.getByLabel('Official receipt (OR) no.').fill('OR-1200345');
  await d.getByLabel('Date paid').fill(today);
  await shot(page, 'stray-penalty');
  await d.getByRole('button', { name: 'Save changes' }).click();
  await expectToast(page, 'Incident updated.');
  const row = page.getByRole('row').filter({ hasText: code });
  await expect(row.getByText('₱500')).toBeVisible();
  await expect(row.getByText('Paid')).toBeVisible();
});

test('ASF case lists the response steps and logs a missing one', async ({ page }) => {
  await page.goto('/cases/3?tab=response');
  await expect(page.getByText('ASF response steps')).toBeVisible();
  const step = page
    .locator('.card')
    .filter({ hasText: 'ASF response steps' })
    .getByRole('listitem')
    .filter({ hasText: 'Coordinate with barangay officials' });
  await step.getByRole('button', { name: 'Log' }).click();
  const d = dialog(page);
  await expect(d.getByLabel('Activity type')).toHaveValue('BARANGAY_COORDINATION');
  await d.getByLabel('Personnel').fill('Brgy. Captain and kagawads');
  await d.getByRole('button', { name: 'Save' }).click();
  await expectToast(page, 'Response activity logged.');
  await expect(step.getByText(/^Done/)).toBeVisible();
  await shot(page, 'asf-steps');
});

test('farms have no pasture fields', async ({ page }) => {
  await page.goto('/farms/10');
  await page.getByRole('button', { name: 'Edit Farm' }).click();
  const d = dialog(page);
  await expect(d.getByText('Pasture', { exact: false })).toHaveCount(0);
  await d.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('Pasture location')).toHaveCount(0);
  await expect(page.locator('.leaflet-marker-icon').filter({ hasText: 'P' })).toHaveCount(0);
});

test('stray incident shows the payment part only when there is a fine', async ({ page }) => {
  await page.goto('/strays');
  await page.waitForLoadState('networkidle');
  await page.getByRole('row').nth(1).click();
  const d = dialog(page);
  await expect(d.getByLabel('Status')).toBeVisible();
  await d.getByLabel('Status').selectOption('REPORTED');
  await expect(d.getByLabel('Impound date')).toHaveCount(0);
  await expect(d.getByLabel('Release date')).toHaveCount(0);
  await d.getByLabel('Fine (₱)').fill('');
  await expect(d.getByLabel('Fine paid')).toHaveCount(0);
  await d.getByLabel('Status').selectOption('CLOSED');
  await d.getByLabel('Fine (₱)').fill('300');
  await d.getByLabel('Fine paid').uncheck();
  await expect(d.getByLabel('Official receipt (OR) no. *')).toHaveCount(0);
  await d.getByLabel('Fine paid').check();
  await expect(d.getByLabel('Official receipt (OR) no. *')).toBeVisible();
});

test('cowlick is asked only for cattle and carabao', async ({ page }) => {
  await page.goto('/animals');
  await page.getByRole('button', { name: /Register animal/ }).click();
  const d = dialog(page);
  const group = d.getByLabel('Population group *');
  const options = await group.locator('option:not([disabled])').allTextContents();
  const pick = (re: RegExp) => options.find((o) => re.test(o))!;
  await group.selectOption({ label: pick(/· (Cattle|Carabao)/) });
  await expect(d.getByLabel('Cowlick (hair whorl) pattern')).toBeVisible();
  await group.selectOption({ label: pick(/· (Swine|Goat|Chicken|Sheep|Duck)/) });
  await expect(d.getByLabel('Cowlick (hair whorl) pattern')).toHaveCount(0);
});

test('PCIC policy lists its insured ear tags', async ({ page }) => {
  await page.goto('/owners/8');
  await page.getByRole('button', { name: 'Add Policy' }).click();
  const d = dialog(page);
  const today = new Date().toLocaleDateString('en-CA');
  await d.getByLabel('Policy number').fill('PCIC-E2E-0001');
  await d.getByLabel('Species').selectOption('Cattle');
  await d.getByLabel('Insured heads').fill('2');
  await d.getByLabel('Coverage start').fill(today);
  await d.getByLabel('Coverage end').fill(`${Number(today.slice(0, 4)) + 1}${today.slice(4)}`);
  await d.getByLabel(/ET-2411/).check();
  await shot(page, 'pcic-animals');
  await d.getByRole('button', { name: 'Save' }).click();
  await expectToast(page, 'Insurance policy recorded.');
  await expect(page.getByRole('group', { name: /PCIC-E2E-0001/ }).getByText('ET-2411')).toBeVisible();
});

test('owners can be filtered by RSBSA registration', async ({ page }) => {
  await page.goto('/owners');
  await page.getByLabel('RSBSA').selectOption('no');
  await expect(page.getByRole('button', { name: 'RSBSA No.' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'OWN-0002' }).getByText('—').first()).toBeVisible();
  await shot(page, 'owners-rsbsa');
});
