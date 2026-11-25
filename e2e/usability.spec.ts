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
    data: { farmId: 10, species: 'Cattle', count: 4 },
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
  await page.getByRole('tab', { name: 'Activity log' }).click();
  await expect(page.getByText(/Moved from GRP-0021 to GRP-\d+ — Now adult/)).toBeVisible();
});

test('the livestock map shades barangays and ranks them in the side panel', async ({ page }) => {
  // The old Barangay Summary page is now the side panel of the Livestock Map.
  await page.goto('/barangay-map');
  await expect(page).toHaveURL(/\/gis-map$/);
  await expect(page.getByRole('heading', { name: 'Livestock Map' })).toBeVisible();
  await expect(page.getByText(/[\d,]+ head in total/i)).toBeVisible();
  await shot(page, 'barangay-livestock');
  await page.getByRole('button', { name: /^Cararayan/i }).click();
  await expect(page.getByRole('heading', { name: 'Barangay Cararayan' })).toBeVisible();
  await shot(page, 'barangay-summary');
});

test('outbreak timeline replays the cases by month', async ({ page }) => {
  await page.goto('/outbreak-map');
  // The timeline is a tab of Disease Monitoring.
  await expect(page).toHaveURL(/\/disease-monitoring\?view=timeline/);
  await expect(page.getByRole('tab', { name: 'Outbreak Timeline' })).toHaveAttribute('aria-selected', 'true');
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

test('farms have no pasture fields', async ({ page }) => {
  await page.goto('/farms/10');
  await page.getByRole('button', { name: 'Edit Farm' }).click();
  const d = dialog(page);
  await expect(d.getByText('Pasture', { exact: false })).toHaveCount(0);
  await d.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('Pasture location')).toHaveCount(0);
  await expect(page.locator('.leaflet-marker-icon').filter({ hasText: 'P' })).toHaveCount(0);
});

test('cowlick is asked only for cattle and carabao', async ({ page }) => {
  await page.goto('/animals');
  await page.getByRole('button', { name: /Register animal/i }).click();
  const d = dialog(page);
  const group = d.getByLabel('Population group *');
  const options = await group.locator('option:not([disabled])').allTextContents();
  const pick = (re: RegExp) => options.find((o) => re.test(o))!;
  await group.selectOption({ label: pick(/· (Cattle|Carabao)/) });
  await expect(d.getByLabel('Cowlick (hair whorl) pattern')).toBeVisible();
  await group.selectOption({ label: pick(/· (Pig|Goat|Chicken|Sheep|Ducks)/) });
  await expect(d.getByLabel('Cowlick (hair whorl) pattern')).toHaveCount(0);
});

test('PCIC application lists its insured ear tags', async ({ page }) => {
  await page.goto('/owners/8');
  await page.getByRole('button', { name: 'Attach Application' }).click();
  const d = dialog(page);
  await d.getByLabel('Date of application *').fill('2026-02-03');
  await d.getByLabel('Species insured').selectOption('Cattle');
  await d.getByLabel(/ET-2411/).check();
  await shot(page, 'pcic-animals');
  await d.getByRole('button', { name: 'Save' }).click();
  await expectToast(page, 'Insurance application attached.');
  await expect(
    page.getByRole('group', { name: 'Insurance application Feb 3, 2026' }).getByText('ET-2411'),
  ).toBeVisible();
});

test('owners can be filtered by RSBSA registration', async ({ page }) => {
  await page.goto('/owners');
  // The less used filters are under "Filters".
  await page.getByRole('button', { name: 'Filters' }).click();
  await page.getByLabel('RSBSA').selectOption('no');
  await expect(page.getByRole('button', { name: 'RSBSA Control No.' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'OWN-0002' }).getByText('—').first()).toBeVisible();
  await shot(page, 'owners-rsbsa');
});
