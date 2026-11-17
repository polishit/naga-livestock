import { expect, test, type Browser, type Page } from '@playwright/test';
import { PASSWORD, dialog, expectToast, login } from './helpers';

const SHOTS = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

test.describe.configure({ mode: 'serial' });
// The staff half of each test uses a desktop window; the owner always uses a phone.
test.skip(({ viewport }) => (viewport?.width ?? 1280) < 900, 'runs once, on the desktop project');

const OWNER = { name: 'Lorna Belen', phone: '09175557001', password: 'Baboy#2026' };
/** A 1x1 PNG standing in for the photo of an ID. */
const ID_PHOTO = {
  name: 'id-front.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
};
/** Pacol, inside Naga City. */
const GPS = { latitude: 13.6549, longitude: 123.2236, accuracy: 9 };

/** A phone in the owner's hand, with location allowed. */
async function phone(browser: Browser) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    geolocation: GPS,
    permissions: ['geolocation'],
  });
  return { ctx, page: await ctx.newPage() };
}
async function ownerLogin(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email or mobile number').fill(OWNER.phone);
  await page.getByLabel('Password', { exact: true }).fill(OWNER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /^Hello, Lorna/i })).toBeVisible();
}

test('an owner creates an account and registers a farm with the phone GPS', async ({ browser }) => {
  const { ctx, page } = await phone(browser);
  await page.goto('/login');
  await page.getByRole('link', { name: 'Create an account' }).click();
  // Step by step: about you, address, a valid ID, then the password.
  await expect(page.getByRole('heading', { name: 'About You' })).toBeVisible();
  // Nothing filled in: the step says what is missing.
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Enter your full name')).toBeVisible();
  await page.getByLabel('Full name').fill(OWNER.name);
  await page.getByLabel('Mobile number').fill('0917 555 7001');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Barangay').selectOption('Pacol');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Valid ID' })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Add a photo of the front of your ID')).toBeVisible();
  await page.getByLabel('Type of ID').selectOption('PHILSYS');
  await page.getByLabel('ID number').fill('1234-5678-9012-3456');
  await page.getByLabel('Front of ID').setInputFiles(ID_PHOTO);
  await shot(page, 'owner-register-id');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Create my account' }).click();
  await expect(page.getByText('Please agree to continue')).toBeVisible();
  await page.getByLabel('Password *', { exact: true }).fill(OWNER.password);
  await page.getByLabel('Type the password again').fill(OWNER.password);
  await page.getByRole('checkbox').check();
  await shot(page, 'owner-register');
  await page.getByRole('button', { name: 'Create my account' }).click();

  await expect(page.getByRole('heading', { name: 'Hello, Lorna' })).toBeVisible();
  await expect(page.getByText('Verification in Progress')).toBeVisible();
  await shot(page, 'owner-home-pending');
  // Until verified, reports and head counts are closed; the office number is shown instead.
  await page.goto('/app/reports/new');
  await expect(page.getByRole('heading', { name: 'Available After Verification' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Hello, Lorna' })).toBeVisible();

  await page.getByRole('link', { name: 'Register a Farm' }).first().click();
  await page.getByLabel('Farm name').fill('Belen Piggery');
  // Sending without a pin or livestock is refused with a clear message.
  await page.getByRole('button', { name: 'Send for review' }).click();
  await expect(page.getByText('Set the farm location first.')).toBeVisible();
  await page.getByRole('button', { name: 'Use my current location' }).click();
  await expect(page.getByText(/GPS accurate to about 9 m/)).toBeVisible();
  await page.getByLabel('Livestock 1').selectOption('Pig');
  await page.getByLabel('Head count 1').fill('24');
  await page.getByRole('button', { name: 'Add another kind' }).click();
  await page.getByLabel('Livestock 2').selectOption('Chicken');
  await page.getByLabel('Head count 2').fill('40');
  await shot(page, 'owner-farm-form');
  await page.getByRole('button', { name: 'Send for review' }).click();
  await expectToast(page, 'Farm sent for review.');
  await expect(page.getByText('Pending review')).toBeVisible();
  await shot(page, 'owner-farms-pending');
  await ctx.close();
});

test('the office verifies the owner and the farm from the review queue', async ({ page }) => {
  await login(page);
  // The menu shows how many items are waiting.
  await expect(page.getByLabel(/waiting for review/).first()).toBeVisible();
  await page.goto('/review');
  await expect(page.getByRole('heading', { name: 'Review Queue' })).toBeVisible();
  // The farm opens with its pin and livestock; it cannot be verified before its owner.
  await page.getByRole('button', { name: /Belen Piggery/i }).click();
  await expect(page.getByText('phone GPS, about 9 m')).toBeVisible();
  await expect(page.getByRole('cell', { name: '24 head' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Verify', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: "Open the Owner's Application" }).click();

  // The owner: details, the ID photo, then a checklist and a confirmation.
  await expect(page.getByText('PhilSys National ID')).toBeVisible();
  await expect(page.getByRole('img', { name: 'ID photo 1' })).toBeVisible();
  await shot(page, 'review-registrations');
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  const d = dialog(page);
  await d.getByRole('button', { name: 'Next: Review and Confirm' }).click();
  await expect(d.getByText('Confirm every item in the checklist first.')).toBeVisible();
  for (const box of await d.getByRole('checkbox').all()) await box.check();
  await d.getByRole('button', { name: 'Next: Review and Confirm' }).click();
  await expect(d.getByText('Your registration is verified')).toBeVisible();
  await shot(page, 'review-confirm');
  await d.getByRole('button', { name: 'Confirm and Verify' }).click();
  await expectToast(page, 'Lorna Belen verified.');

  await page.getByRole('button', { name: /Belen Piggery/i }).click();
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  for (const box of await d.getByRole('checkbox').all()) await box.check();
  await d.getByRole('button', { name: 'Next: Review and Confirm' }).click();
  await d.getByRole('button', { name: 'Confirm and Verify' }).click();
  await expectToast(page, 'Belen Piggery verified.');
  await expect(page.getByRole('button', { name: /Belen Piggery/i })).toHaveCount(0);
  // It is now in the masterlist.
  await page.goto('/farms');
  await page.getByPlaceholder('Search farm, owner or barangay...').fill('Belen');
  await expect(page.getByRole('row', { name: /Belen Piggery/i }).first()).toBeVisible();
});

test('the owner updates the head count: a normal change is accepted at once, a large one waits', async ({
  browser,
  page,
}) => {
  const { ctx, page: p } = await phone(browser);
  await ownerLogin(p);
  await expect(p.getByText('Verification in Progress')).toHaveCount(0);
  await shot(p, 'owner-home');
  await p.getByRole('link', { name: /Belen Piggery/i }).click();
  await expect(p.getByText('64 head')).toBeVisible();
  await p.getByRole('link', { name: 'Update head count' }).click();
  await p.getByLabel('Which livestock?').selectOption('Pig');
  await p.getByLabel('What happened?').selectOption('BIRTH');
  await p.getByLabel('How many head?').fill('5');
  await expect(p.getByText('After this update: 29')).toBeVisible();
  await shot(p, 'owner-headcount');
  await p.getByRole('button', { name: 'Save update' }).click();
  await expectToast(p, 'Head count updated.');
  await expect(p.getByText('69 head')).toBeVisible();
  await expect(p.getByText('Pig: 24 → 29')).toBeVisible();

  // 25 of 29 pigs died: held for review, the record does not change yet.
  await p.getByRole('link', { name: 'Update head count' }).click();
  await p.getByLabel('Which livestock?').selectOption('Pig');
  await p.getByLabel('What happened?').selectOption('DEATH');
  await p.getByLabel('How many head?').fill('25');
  await p.getByRole('button', { name: 'Save update' }).click();
  await expectToast(p, /the office will check it first/);
  await expect(p.getByText('69 head')).toBeVisible();
  await expect(p.getByText('Waiting for review')).toBeVisible();
  await shot(p, 'owner-farm');
  await ctx.close();

  await login(page);
  await page.goto('/review?tab=population');
  await page.getByRole('button', { name: /Belen Piggery: Pig 29 → 4/i }).click();
  await expect(page.getByText('Change of 25 head is 86% of the recorded 29')).toBeVisible();
  await shot(page, 'review-population');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Next: Review and Confirm' }).click();
  await expect(dialog(page).getByText('Give the reason')).toBeVisible();
  await dialog(page).getByRole('textbox').fill('Owner confirmed by phone it was a typing mistake');
  await dialog(page).getByRole('button', { name: 'Next: Review and Confirm' }).click();
  await dialog(page).getByRole('button', { name: 'Cancel the Update' }).click();
  await expectToast(page, 'Update cancelled.');
});

test('the owner reports sick pigs; the office validates, confirms and alerts; the owner follows it', async ({
  browser,
  page,
}) => {
  const { ctx, page: p } = await phone(browser);
  await ownerLogin(p);
  await p.getByRole('link', { name: 'Report sick animals' }).click();
  await p.getByLabel('Which animals?').selectOption('Pig');
  await p.getByLabel('How many are sick?').fill('4');
  await p.getByLabel('How many died?').fill('1');
  await p.getByLabel('Fever').check();
  await p.getByLabel('Describe it in your own words').fill('Four pigs stopped eating and have red skin.');
  await expect(p.getByText(/Your phone's location will be sent with the report/)).toBeVisible();
  await shot(p, 'owner-report-form');
  await p.getByRole('button', { name: 'Send report' }).click();
  await expectToast(p, 'Report sent to the City Veterinary Office.');
  await expect(
    p.getByText('The City Veterinary Office received the report and will review it.'),
  ).toBeVisible();
  await shot(p, 'owner-report-sent');

  await login(page);
  await page.goto('/review?tab=reports');
  await page.getByRole('button', { name: /4 Pig, 1 dead/i }).click();
  await expect(page.getByText('Four pigs stopped eating and have red skin.')).toBeVisible();
  await shot(page, 'review-report');
  // Validating takes three steps: assess, case and visit, confirm.
  await page.getByRole('button', { name: 'Validate', exact: true }).click();
  const v = dialog(page);
  await v.getByRole('button', { name: 'Next' }).click();
  await expect(v.getByText('Confirm every item in the checklist first.')).toBeVisible();
  for (const box of await v.getByRole('checkbox').all()) await box.check();
  await v
    .getByLabel('Your assessment')
    .fill('Fever, red skin and one death in 4 pigs. ASF cannot be ruled out.');
  await v.getByRole('button', { name: 'Next' }).click();
  await v.getByRole('button', { name: 'Next' }).click();
  await expect(v.getByText('Select the suspected disease')).toBeVisible();
  await v.getByLabel('Suspected disease').fill('African Swine Fever (ASF)');
  await v.getByLabel('Message to the owner').fill('Keep the pigs inside. We will visit tomorrow.');
  await v.getByRole('button', { name: 'Next' }).click();
  await expect(v.getByText(/Staff will visit your farm on/)).toBeVisible();
  await shot(page, 'review-validate');
  await v.getByRole('button', { name: 'Confirm and Open the Case' }).click();
  await expectToast(page, /Report validated\. Case CASE-\d+ is under investigation\./);
  await page.getByRole('link', { name: /CASE-\d+ \(African Swine Fever/i }).click();
  await expect(page.getByText('Owner sees: Under investigation')).toBeVisible();
  const caseId = Number(page.url().match(/cases\/(\d+)/)![1]);

  // A positive laboratory result, then the monitoring zone.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const lab = await page.request.post(`/api/cases/${caseId}/labs`, {
    data: {
      sampleId: 'E2E-OWNER-1',
      sampleType: 'Whole blood',
      testMethod: 'PCR',
      collectedAt: today,
      sentAt: today,
      result: 'POSITIVE',
      resultDate: today,
    },
  });
  expect(lab.ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByText('Owner sees: Confirmed')).toBeVisible();
  // One step: the positive result set the monitoring zone and alerted the owners nearby.
  await page.getByRole('link', { name: /Monitoring zone ZONE-\d+ \(active\)/i }).click();
  await expect(page.getByRole('heading', { name: /ZONE-\d+: African Swine Fever/i })).toBeVisible();
  await expect(page.getByText(/alert\(s\) sent · /).first()).toBeVisible();
  await shot(page, 'zones');

  // Back on the phone: the stage, the result and the message from the office.
  await p.reload();
  await expect(p.getByText('Confirmed', { exact: true }).first()).toBeVisible();
  await expect(p.getByText('Keep the pigs inside. We will visit tomorrow.')).toBeVisible();
  await expect(p.getByText('Positive')).toBeVisible();
  await shot(p, 'owner-report-confirmed');
  // Messages: the office's updates on her report are in the conversation; she writes to the office.
  await p.getByRole('link', { name: /new in Messages/i }).click();
  await expect(p.getByText(/confirmed at Belen Piggery/).first()).toBeVisible();
  await p.getByLabel('Message', { exact: true }).fill('Can someone check the other pigs tomorrow?');
  await p.getByRole('button', { name: 'Send' }).click();
  await expect(p.getByText('Can someone check the other pigs tomorrow?')).toBeVisible();
  await shot(p, 'owner-messages');
  await ctx.close();
});

test('vaccination schedule and announcements reach the owner; the public page shows only totals', async ({
  browser,
  page,
}) => {
  await login(page);
  await page.goto('/vaccination-activities');
  await page.getByRole('button', { name: 'Schedule an activity' }).click();
  const d = dialog(page);
  await d.getByRole('button', { name: 'Next: Review' }).click();
  await expect(d.getByText('Enter a title')).toBeVisible();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  await d.getByLabel('Title').fill('Hog cholera vaccination');
  await d.getByLabel('For which livestock').selectOption('Pig');
  await d.getByLabel('Barangay').selectOption('Pacol');
  await d.getByLabel('Date').fill(today);
  await d.getByLabel('Venue').fill('Pacol covered court');
  await d.getByRole('button', { name: 'Next: Review' }).click();
  await expect(d.getByText('Who Will Be Told')).toBeVisible();
  await expect(d.getByText(/use the owner app and get a notification/)).toBeVisible();
  await d.getByRole('button', { name: 'Confirm and Notify Owners' }).click();
  await expectToast(page, /Scheduled\. \d+ owner\(s\) told\./);

  await page.goto('/announcements');
  await page.getByRole('button', { name: 'New announcement' }).click();
  const a = dialog(page);
  await a.getByLabel('Title').fill('ASF advisory for Pacol');
  await a.getByLabel('Announcement *').fill('Do not feed swill (kaning-baboy) to pigs.');
  await a.getByLabel('Send to').selectOption('BARANGAY');
  await a.getByLabel('Barangay').selectOption('Pacol');
  await a.getByRole('button', { name: 'Publish' }).click();
  await expectToast(page, /ANN-\d+ published to \d+ owner\(s\)\./);
  await shot(page, 'announcements');

  const { ctx, page: p } = await phone(browser);
  await ownerLogin(p);
  await p.getByRole('link', { name: 'Vaccination', exact: true }).click();
  await expect(p.getByRole('heading', { name: 'Hog cholera vaccination' })).toBeVisible();
  await p.getByRole('button', { name: 'Sign up my animals' }).click();
  await p.getByLabel('Livestock *').selectOption('Pig');
  await p.getByLabel('How many head?').fill('10');
  await shot(p, 'owner-vaccination');
  await p.getByRole('button', { name: 'Sign Up', exact: true }).click();
  await expectToast(p, 'You are signed up.');
  await expect(p.getByText('You signed up 10 Pig')).toBeVisible();
  // Announcements are on the home screen.
  await p.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(p.getByRole('heading', { name: 'ASF advisory for Pacol' })).toBeVisible();
  await shot(p, 'owner-announcements');
  // The owner cannot open the CVO system.
  await p.goto('/owners');
  await expect(p).toHaveURL(/\/app$/);
  await p.goto('/app/more/summary');
  await expect(p.getByRole('heading', { name: 'Livestock Owner and Farm Summary' })).toBeVisible();
  await shot(p, 'owner-summary');
  await ctx.close();

  // The office reads the owner's message and replies from Messages.
  await page.goto('/messages');
  await page.getByRole('button', { name: /Lorna Belen/ }).click();
  await expect(page.getByText('Can someone check the other pigs tomorrow?')).toBeVisible();
  await expect(page.getByText(/Disease report sent: RPT-/).first()).toBeVisible();
  await page.getByLabel('Message', { exact: true }).fill('Yes, Dr. Cruz will visit at 9 AM.');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Yes, Dr. Cruz will visit at 9 AM.')).toBeVisible();
  await shot(page, 'staff-messages');

  // Attendance puts the vaccination on the farm's record.
  await page.goto('/vaccination-activities');
  await page.getByRole('button', { name: /Hog cholera vaccination/i }).click();
  await page.getByRole('button', { name: 'Attended', exact: true }).click();
  await expectToast(page, /The vaccination is on the farm record/);

  const anon = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pub = await anon.newPage();
  await pub.goto('/public');
  await expect(pub.getByRole('heading', { name: 'Animal Disease Map' })).toBeVisible();
  await expect(pub.getByRole('button', { name: 'Back' })).toBeVisible();
  await expect(pub.getByText('Pacol').first()).toBeVisible();
  await expect(pub.getByText(/Belen|0917/)).toHaveCount(0);
  await shot(pub, 'public');
  await anon.close();
  expect(PASSWORD).toBeTruthy();
});
