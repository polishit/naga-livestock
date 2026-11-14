import { expect, test } from '@playwright/test';
import { dialog, expectToast, login } from './helpers';

test.beforeEach(async ({ page }) => {
  await login(page);
});

const today = () => new Date().toLocaleDateString('en-CA');

test('population: "See farms raising" can be undone with Back; farms with 0 head are not listed', async ({
  page,
}) => {
  // Goose on two farms: 5 head on one, 0 head on the other.
  for (const [farmId, count] of [
    [12, 5],
    [13, 0],
  ])
    expect(
      (
        await page.request.post('/api/population/groups', { data: { farmId, species: 'Goose', count } })
      ).status(),
    ).toBe(201);
  await page.goto('/population');
  const card = page.locator('.card').filter({ hasText: 'See farms raising goose' });
  await expect(card.getByText('1 farm', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'See farms raising goose' }).click();
  await expect(page).toHaveURL(/species=Goose/);
  await expect(page.getByRole('tab', { name: 'By Farm' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('row').filter({ hasText: 'Goose' })).toHaveCount(1);
  // Back returns to the species cards with no species filter.
  await page.goBack();
  await expect(page).toHaveURL(/\/population$/);
  await expect(page.getByRole('tab', { name: 'By Species' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Species').first()).toHaveValue('');
});

test('disease reports: quick views on top, then the list; step to the next case', async ({ page }) => {
  await page.goto('/cases');
  const views = page.getByRole('group', { name: 'Quick views' });
  await expect(views.getByRole('button', { name: /Open cases/ })).toHaveAttribute('aria-pressed', 'true');
  // The graphs are folded away below the list.
  await expect(page.getByRole('button', { name: 'Show trends and graphs' })).toBeVisible();
  await views.getByRole('button', { name: /All cases/ }).click();
  await expect(page).toHaveURL(/state=all/);
  const rows = page.locator('tbody tr');
  const n = await rows.count();
  expect(n).toBeGreaterThan(1);
  const first = (await rows.first().locator('td').first().textContent())!.trim();
  const second = (await rows.nth(1).locator('td').first().textContent())!.trim();
  await rows.first().click();
  const nav = page.getByRole('navigation', { name: 'Case navigation' });
  await expect(nav.getByText(`Case 1 of ${n}`)).toBeVisible();
  await expect(page.getByRole('heading', { name: new RegExp(first) })).toBeVisible();
  await nav.getByRole('button', { name: 'Next case ›' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(second) })).toBeVisible();
  await expect(nav.getByText(`Case 2 of ${n}`)).toBeVisible();
  await nav.getByRole('link', { name: /Back to all cases/ }).click();
  await expect(page).toHaveURL(/\/cases\?state=all/);
});

test('a confirmed case of another disease has response steps too, each measure shown once', async ({
  page,
}) => {
  const c = await page.request.post('/api/cases', {
    data: { ownerId: 1, farmId: 1, species: 'Pig', disease: 'Hog Cholera', affected: 2, deaths: 0 },
  });
  const id = (await c.json()).id;
  await page.request.post(`/api/cases/${id}/labs`, {
    data: {
      sampleId: `HC-${Date.now()}`,
      collectedAt: today(),
      sentAt: today(),
      result: 'POSITIVE',
      resultDate: today(),
    },
  });
  await page.goto(`/cases/${id}?tab=response`);
  const steps = page.locator('.card').filter({ hasText: 'Response steps' });
  await expect(steps.getByText('0 of 5 completed')).toBeVisible();
  const step = steps.getByRole('listitem').filter({ hasText: 'Quarantine the farm' });
  await step.getByRole('button', { name: 'Log' }).click();
  const d = dialog(page);
  await expect(d.getByLabel('Activity type')).toHaveValue('QUARANTINE');
  await d.getByRole('button', { name: 'Save' }).click();
  await expectToast(page, 'Response activity logged.');
  await expect(step.getByRole('button', { name: /Update|Edit/ })).toBeVisible();
  // No second list repeating the same measure.
  await expect(page.getByText('Other measures')).toHaveCount(0);
  await expect(page.getByText('Measures logged')).toHaveCount(0);
});

test('the service form picks the farm from one list (no separate search box)', async ({ page }) => {
  await page.goto('/services?new=1');
  const d = dialog(page);
  await expect(d.getByLabel('Farm', { exact: true })).toBeVisible();
  await expect(d.getByLabel('Search farm')).toHaveCount(0);
});

test('accomplishment report: latest population first, with dates', async ({ page }) => {
  await page.goto('/reports?type=accomplishment');
  const rows = page.locator('tbody tr');
  await expect(rows.nth(0)).toContainText(/Recorded population as of .* \(end of period\)/);
  await expect(rows.nth(1)).toContainText(/Recorded population as of .* \(start of period\)/);
  await expect(rows.nth(2)).toContainText(/Change in recorded population during the period.*→/);
});

test('analytics charts open the matching records', async ({ page }) => {
  await page.goto('/analytics');
  // Cases by status: closed cases are included (state=all).
  const status = page.locator('.card').filter({ hasText: 'Cases by Status' });
  await status.scrollIntoViewIfNeeded();
  await status.locator('.recharts-legend-item').first().click();
  await expect(page).toHaveURL(/\/cases\?status=[A-Z_]+&state=all/);
  // Disease cases per month: a month opens that month's reports.
  await page.goto('/analytics');
  const perMonth = page.locator('.card').filter({ hasText: 'Disease Cases per Month' });
  await perMonth.scrollIntoViewIfNeeded();
  const box = (await perMonth.locator('.recharts-wrapper').boundingBox())!;
  await page.mouse.move(box.x + box.width - 30, box.y + box.height / 2);
  await page.mouse.click(box.x + box.width - 30, box.y + box.height / 2);
  await expect(page).toHaveURL(/\/cases\?month=\d{4}-\d{2}&state=all/);
  await expect(page.getByText(/Reported in /)).toBeVisible();
});

test('a vaccination target opens the vaccination records it counts', async ({ page }) => {
  const year = new Date().getFullYear();
  await page.request.put('/api/insights/vaccination-targets', {
    data: { year, targets: [{ vaccine: 'Hog Cholera Vaccine', species: 'Pig', target: 500 }] },
  });
  await page.goto('/analytics');
  const card = page.locator('.card').filter({ hasText: 'Vaccination targets' });
  await card.getByRole('link', { name: /Hog Cholera Vaccine/ }).click();
  await expect(page).toHaveURL(/tab=records&type=VACCINATION&species=Pig&vaccine=Hog\+Cholera\+Vaccine/);
  await expect(page.getByText('Vaccine: Hog Cholera Vaccine')).toBeVisible();
});
