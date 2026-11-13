import { expect, test, type Locator } from '@playwright/test';
import { dialog, expectToast, login } from './helpers';

test.beforeEach(async ({ page }) => {
  await login(page);
});

/** Choose the option whose text contains `text` (the option labels carry codes that vary). */
async function pickOption(select: Locator, text: string) {
  const value = await select.locator('option', { hasText: text }).first().getAttribute('value');
  await select.selectOption(value!);
}

test('send a batch of samples, print the DA forms, enter results and open a case from a positive', async ({
  page,
  context,
}) => {
  await page.goto('/lab-submissions');
  await page.getByRole('button', { name: 'New submission' }).click();
  await expect(page).toHaveURL(/\/lab-submissions\/new/);
  // The office's usual test and laboratory are filled in.
  await expect(page.getByLabel('Examination requested *')).toHaveValue(/African Swine Fever/);
  await expect(page.getByLabel('Laboratory *')).toHaveValue(/RADDL/);

  const s1 = page.getByRole('listitem', { name: 'Sample 1' });
  await pickOption(s1.getByLabel('Farm (owner) *'), 'San Felipe Piggery');
  await expect(s1.getByLabel('Species *')).toHaveValue('Swine');
  await s1.getByLabel('Age').fill('4 m');
  await s1.getByLabel('Sex').selectOption('M');
  await expect(s1.getByLabel('Specimen *')).toHaveValue('Blood');

  // A dead pig gives organs instead of blood.
  await page.getByRole('button', { name: 'Add sample' }).first().click();
  const s2 = page.getByRole('listitem', { name: 'Sample 2' });
  await expect(s2.getByLabel('Species *')).toHaveValue('Swine');
  await s2.getByLabel('Live / dead').selectOption('DEAD');
  await expect(s2.getByLabel('Specimen *')).toHaveValue('Tissue / Organs');
  await expect(s2.getByLabel('Organs taken *')).toHaveValue(/Spleen/);
  await s2.getByLabel('Hours since death').fill('6');

  await page.getByRole('button', { name: 'Save submission' }).click();
  await expectToast(page, /Lab submission saved/);
  await expect(page).toHaveURL(/\/lab-submissions\/\d+$/);
  await expect(page.getByRole('heading', { name: /SUB-\d+ · PCR/ })).toBeVisible();
  await expect(page.getByText('2 pending')).toBeVisible();

  // Both DA forms print with the samples listed.
  for (const name of ['Analysis Request Form', 'Sample Collection Form']) {
    const [win] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name }).click(),
    ]);
    await win.evaluate(() => (window.print = () => {}));
    await expect(win.getByText(name.toUpperCase()).first()).toBeVisible();
    await expect(win.getByText(/Teresa Garcia/).first()).toBeVisible();
    await win.close();
  }

  // Result: the first sample is positive, the second negative.
  await page.getByRole('button', { name: 'Enter results' }).click();
  const selects = page.locator('select[aria-label^="Result for"]:visible');
  await selects.nth(0).selectOption('POSITIVE');
  await selects.nth(1).selectOption('NEGATIVE');
  await page.getByRole('button', { name: /Save 2 results/ }).click();
  await expectToast(page, /2 result\(s\) saved\. 1 positive/);

  // A positive sample opens a disease case with the farm, disease and sample filled in.
  await page.getByRole('button', { name: 'Open case' }).click();
  await expect(page).toHaveURL(/\/cases\/new\?fromSample=\d+/);
  await expect(page.getByText(/Opened from sample/)).toBeVisible();
  await page
    .getByRole('button', { name: /Submit|Report incident|Save/ })
    .last()
    .click();
  await expectToast(page, 'Disease incident reported.');
  await expect(page).toHaveURL(/\/cases\/\d+$/);
  await expect(page.getByText('Active').first()).toBeVisible();
  await expect(page.getByText(/Positive/).first()).toBeVisible();
});

test('search everything by name, ear tag or code, narrowed by type and barangay', async ({ page }) => {
  await page.goto('/search');
  await page.getByLabel('Search everything').fill('Piggery');
  await expect(page.getByText(/\d+ result\(s\)/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Ground Zero Piggery/ }).first()).toBeVisible();
  await page.getByLabel('Record type').selectOption('farm');
  await expect(page).toHaveURL(/type=farm/);
  await page.getByLabel('Barangay').selectOption('Cararayan');
  await expect(page.getByRole('button', { name: /Ground Zero Piggery/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /San Felipe Piggery/ })).toHaveCount(0);
  await page
    .getByRole('button', { name: /Ground Zero Piggery/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/farms\/\d+/);

  // The top search bar leads to the full search.
  await page.getByPlaceholder(/Search owner, farm/).fill('ET-24');
  await page.getByRole('button', { name: /Search everything for/ }).click();
  await expect(page).toHaveURL(/\/search\?q=ET-24/);
  await expect(page.getByText(/Animal/).first()).toBeVisible();
});

test('pregnancy diagnosis is offered for cattle and counted with its result', async ({ page }) => {
  await page.goto('/services');
  await page.getByRole('tab', { name: 'Service Records' }).click();
  await page.getByRole('button', { name: 'Record Service' }).click();
  const d = dialog(page);
  await pickOption(d.getByLabel('Farm', { exact: true }), 'Carolina Cattle Range');
  await pickOption(d.getByLabel('Species / group'), 'Cattle');
  await d.getByRole('radio', { name: 'Pregnancy Diagnosis' }).click();
  await d.getByLabel('No. of heads examined *').fill('3');
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(d.getByText(/result/i).first()).toBeVisible();
  await d.getByLabel('Result *').selectOption('PREGNANT');
  await d.getByRole('button', { name: 'Save' }).click();
  await expectToast(page, 'Pregnancy Diagnosis recorded.');
  await expect(page.getByRole('cell', { name: 'Pregnancy Diagnosis' }).first()).toBeVisible();
  await expect(page.getByRole('cell', { name: /Pregnant/ }).first()).toBeVisible();
});

test('population by farm is filtered by farm type and printed', async ({ page, context }) => {
  await page.goto('/population?tab=farms');
  await page.getByLabel('Farm type').selectOption('commercial');
  await expect(page.getByRole('cell', { name: 'CM' }).first()).toBeVisible();
  await expect(page.getByRole('cell', { name: 'BY', exact: true })).toHaveCount(0);
  const [win] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: 'Print' }).click(),
  ]);
  await win.evaluate(() => (window.print = () => {}));
  await expect(win.getByText(/Commercial/).first()).toBeVisible();
  await win.close();
});

test('an animal shows its activity log and ownership certificate', async ({ page }) => {
  await page.goto('/animals/1');
  await expect(page.getByRole('tab', { name: 'Activity log' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Edit' }).click();
  const d = dialog(page);
  await d.getByLabel('Purpose').selectOption('DRAFT');
  await d.getByLabel(/Ownership certificate no\./).fill('COLC-E2E-1');
  await d.getByRole('button', { name: 'Save' }).click();
  await expectToast(page, /updated/);
  await expect(page.getByText('COLC-E2E-1').first()).toBeVisible();
  await expect(page.getByText(/Record updated: .*purpose/i).first()).toBeVisible();
});
