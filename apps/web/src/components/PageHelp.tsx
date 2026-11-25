import { CircleHelp } from 'lucide-react';
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, Dialog } from './ui';

interface Help {
  title: string;
  /** What the page is for, in one sentence. */
  purpose: string;
  /** Numbered steps for the usual job on the page. */
  steps: string[];
  /** Words, badges and colours the user will see, explained. */
  terms?: [string, string][];
}

/** How records are removed, explained the same way wherever it applies. */
const REMOVE_TERMS: [string, string][] = [
  ['Archive', 'Put away a record that is no longer active. It can be restored.'],
  [
    'Remove / Void',
    'Cross out a wrong entry with the reason (veterinarian or administrator). It stays on record but no longer counts. Nothing is ever deleted.',
  ],
];

/** "How to use this page", keyed by route ("/farms", "/farms/:id", "/cases/new"). */
const HELP: Record<string, Help> = {
  '/': {
    title: 'Dashboard',
    purpose: 'The city at a glance, and the list of work waiting for you.',
    steps: [
      'Start with "My tasks": each row is one thing to do. Select its button to open the right page and form.',
      'Use the search box at the top to find any owner, farm, ear tag or disease report.',
      'Use "+ New" for the everyday jobs: record a field visit, record deworming, report a disease incident.',
    ],
    terms: [
      ['Overdue', 'The due date has passed.'],
      ['Counted this month', 'The farm’s head count was updated this month.'],
    ],
  },
  '/owners': {
    title: 'Livestock Owners',
    purpose: 'The owner masterlist, built from the DA list and field visits.',
    steps: [
      'Owners who registered in the owner app wait in "Pending Owner Registrations" at the top. Open one to check the ID and approve it, or return it with a reason.',
      'Search by name, contact or RSBSA Control Number, or choose a barangay. Other choices are under "Filters".',
      'New entry from the DA list or a visit? Select "Add Owner, Farm and Livestock" and follow the steps.',
      'Select a row to open the owner: personal information first, then ownership and insurance.',
    ],
    terms: [
      [
        'RSBSA Control Number',
        'The raiser’s control number in the Registry System for Basic Sectors in Agriculture.',
      ],
      ['Source', 'Where the office got the record: DA masterlist, field visit or barangay referral.'],
      ['Archived', 'No longer raising livestock; kept for history, hidden from lists.'],
    ],
  },
  '/owners/:id': {
    title: 'Owner Profile',
    purpose: 'One livestock owner: personal information, ownership, insurance and farms.',
    steps: [
      'Owner Profile tab: personal information, then ownership records and PCIC insurance below it.',
      'Farms tab: one card per farm with the livestock raised and the last visit. Select a card to open the farm.',
      'Select "Add Farm" for each place where the owner keeps animals.',
      'Owner App Login (below the personal information): give the owner a login, or reset a forgotten password.',
      '"More" holds Archive (stopped raising livestock).',
    ],
    terms: REMOVE_TERMS,
  },
  '/farms': {
    title: 'Farms',
    purpose: 'The farm masterlist: where each farm is, what it raises and when it was last visited.',
    steps: [
      'Farms added by owners in the owner app wait in "Pending Farm Registrations" at the top. Open one to check the location and approve it.',
      'Use the cards at the top (Piggery, Goat Only, Mixed…) or the filters to narrow the list.',
      'Filter "Not visited in 90 days" to plan the next field visits.',
      'Select "Add Farm", choose the owner, then click the map where the farm is.',
      'Select a farm to record a visit, update the head count or record deworming.',
    ],
    terms: [
      [
        'Livestock raised',
        'Worked out from the species counted on the farm (one species, poultry or mixed).',
      ],
      ['Farm scale', 'Backyard or commercial.'],
      [
        'No map location',
        'The farm is left out of the map and the farms-to-monitor list until it is pinned.',
      ],
    ],
  },
  '/farms/:id': {
    title: 'Farm Profile',
    purpose: 'One farm: information, livestock head counts, visits and services, and cases.',
    steps: [
      'After each visit select "Record Field Visit": note the findings, update the head count and the deworming given, all in one form.',
      'Livestock tab: one card per species. Select "Update count" on a card, or "Update Head Count" for all species, to change the numbers.',
      'Visits & Services tab: every visit and service on one timeline.',
      'Select "Print" for a paper copy with the letterhead.',
    ],
    terms: REMOVE_TERMS,
  },
  '/population': {
    title: 'Population Monitoring',
    purpose: 'Head count from the masterlist, by species, farm and barangay.',
    steps: [
      'Unusually large head count changes sent by owners wait in "Pending Head Count Updates" at the top. Accept, or cancel with a reason.',
      'By Species: total heads per species.',
      'Search: type a farm, owner, barangay, species or breed to list the matching farms.',
      'By Farm: each farm’s count per species. Select a row to open the farm.',
      'To update a farm, choose it in the box at the top and select "Update Head Count".',
    ],
    terms: [['Last counted', 'Month of the latest count (field visit or DA list).']],
  },
  '/animals': {
    title: 'Animal ID / Ear Tags',
    purpose: 'Animals registered one by one (usually cattle, carabao and breeders).',
    steps: [
      'Select "Register animal", choose the population group it belongs to and enter the ear tag.',
      'Add a photo, colour and markings — and for cattle and carabao, the cowlick (hair whorl) pattern.',
      'Select an animal to move it to another group, transfer it to a new owner, or edit it.',
    ],
  },
  '/animals/:id': {
    title: 'Animal Record',
    purpose: 'One tagged animal: identity, vaccinations, insurance and ownership history.',
    steps: [
      'Select "Transfer" when it is sold or given to another owner.',
      'Select "Move group" to move it to another group on the same farm.',
      'Select "Ownership summary" to print its identification and ownership history.',
    ],
  },
  '/ownership': {
    title: 'Ownership Records',
    purpose: 'Sales and transfers of tagged animals.',
    steps: [
      'Type the ear tag to find the animal, then select "Transfer".',
      'Choose the new owner and farm, and the date.',
      'Transfers out of a farm under quarantine are blocked until the quarantine is lifted.',
    ],
  },
  '/gis-map': {
    title: 'Livestock Map',
    purpose: 'Every farm on the map, and the barangays shaded by livestock population.',
    steps: [
      'Search a farm or owner, or choose a barangay. More choices (livestock, farm type, shading) are under "Filters".',
      'Tap a barangay on the map or in the Barangay Summary to see its farms, head count and open cases.',
      'Tap a farm to see its livestock and last visit, record a visit, or report a disease.',
    ],
  },
  '/disease-monitoring': {
    title: 'Disease Monitoring',
    purpose: 'Disease reports, monitoring zones and the farms around each case, in one place.',
    steps: [
      'Map: tap a case to see the farms inside the radius and record a monitoring visit. Choose the disease and barangay at the top; the radius is under "Filters".',
      'Outbreak Timeline: press play, or drag the slider to a month, to see how the cases spread.',
      'Farms & Zones: choose a case and a radius to list the farms to visit around it. Select "Set as Monitoring Zone" to alert the owners inside (confirmed cases); change the radius or lift the zone there too.',
    ],
    terms: [
      ['Active zone', 'The monitoring area is in force.'],
      ['Lifted', 'Ended. It stays on record.'],
    ],
  },
  '/cases': {
    title: 'Disease Reports',
    purpose: 'Disease reports for ASF and the other monitored diseases.',
    steps: [
      'Reports sent by owners from the owner app wait in "Pending Reports from Owners" at the top. Open one to validate it (a case is opened), ask a question, or reject it.',
      'Select "Report Incident" when a raiser reports sick or dead animals.',
      'Use the Status filter (open cases, a lab stage, closed or all) and the search box to find a report.',
      'Select a report to open it. Its Steps tab shows what to do next.',
      'Trends and graphs are in Dashboard & Reports → Analytics.',
    ],
    terms: [
      [
        'Suspected → Sample collected → Sent to lab → Positive / Negative',
        'The status of a report. It updates by itself from the samples; nobody types it in.',
      ],
      ['Closed', 'Finished; read-only.'],
    ],
  },
  '/cases/new': {
    title: 'Report a Disease Incident',
    purpose: 'Record a new suspected case.',
    steps: [
      'Choose the owner and the farm. The location is copied from the farm.',
      'Choose the species and the suspected disease, and enter how many are sick and dead.',
      'Add photos if you have them, then save. The case starts as "Suspected".',
    ],
  },
  '/cases/:id': {
    title: 'Disease Report',
    purpose: 'One incident from report to closing, as five steps.',
    steps: [
      'Steps tab: work from top to bottom. The step marked "Do this now" is the next thing to do.',
      '1 Report → 2 Site visit → 3 Samples & result → 4 Update the head count → 5 Close.',
      'The status changes by itself when you add a sample, enter the date sent, or enter the result.',
      'No test needed (false alarm, animals recovered)? Close it at step 5 as "Disease not confirmed".',
      'Details tab: owner, farm, photos and linked incidents. Timeline tab: every event in date order.',
    ],
    terms: [
      [
        'Head count not updated',
        'Dead or culled animals still counted on the farm. Select "Update head count" in step 4.',
      ],
    ],
  },
  '/laboratory': {
    title: 'Laboratory',
    purpose: 'Every sample sent for testing, from disease cases and surveillance batches.',
    steps: [
      'A sample added on a disease case (step 3, "Add Sample") appears here at once.',
      'Select "Enter Date Sent" when the sample leaves, then "Enter Result" when the laboratory answers. The case updates by itself.',
      'Batch Submissions: send a batch of surveillance samples with the Analysis Request and Sample Collection forms. A positive sample with no case shows "Report Incident".',
    ],
    terms: [
      ['Waiting for Result', 'Sent (or about to be sent); no result yet.'],
      ['Positive / Negative / Inconclusive', 'The laboratory result. A case sample sets the case status.'],
    ],
  },
  '/analytics': {
    title: 'Analytics',
    purpose: 'How the city is doing over a period.',
    steps: [
      'Choose the period (3, 6 or 12 months), and a barangay or species if you want.',
      'The top row compares the period with the one before (green = better, red = worse).',
      'Click a bar or slice in a chart to open the records behind it.',
      'Check "Record completeness" and select "Fix" to fill in missing details.',
    ],
    terms: [
      ['Hotspot', '2 or more cases in 30 days, at least twice the barangay’s usual number.'],
      ['Behind schedule', 'Fewer doses given than expected for the part of the year that has passed.'],
    ],
  },
  '/reports': {
    title: 'Reports',
    purpose: 'Ready-made reports to view, print or download.',
    steps: [
      'For the month’s report with graphs, select "Monthly Report".',
      'Choose a group (Livestock Population, Disease Surveillance, Deworming…), then the report.',
      'Filter by barangay, species or dates, then download as Excel, CSV or PDF, or print.',
    ],
  },
  '/users': {
    title: 'User Management',
    purpose: 'Who can sign in and what they can do.',
    steps: [
      'Select "Add staff account", enter the name and email, and choose the role.',
      'Give the temporary password shown to the staff member. They must change it the first time they sign in.',
      'Use the ⋯ menu on a row to edit, reset a forgotten password, unlock, suspend or deactivate.',
      'Before deactivating someone with open cases, the system asks who takes the cases over.',
    ],
    terms: [
      ['System Administrator', 'Everything, including accounts, settings, targets and the audit log.'],
      ['Veterinarian (Reviewer)', 'Records and reviews: closes and reopens cases and voids wrong entries.'],
      ['Field Technician', 'Records field work. Cannot review, void or manage accounts.'],
      ['Suspended', 'Temporarily blocked from signing in.'],
      ['Deactivated', 'Left the office. The account is kept so every record keeps its author.'],
      ['Locked', 'Too many wrong passwords. It unlocks by itself after a while, or you can unlock it.'],
    ],
  },
  '/vaccination-schedule': {
    title: 'Vaccination Schedule',
    purpose: 'Owner requests, vaccination activities and the doses due, in one calendar.',
    steps: [
      'Pending requests from owners are at the top: open one to schedule it, mark it done, or decline it with a reason.',
      'The calendar shows activities, scheduled owner requests and the next deworming or vaccination due. Tap a day for the list.',
      'Select "Schedule an Activity" to plan a vaccination day for a barangay. Owners there are told and can sign up.',
      'On the day, open the activity and mark each sign-up as attended.',
    ],
  },
  '/announcements': {
    title: 'Announcements',
    purpose: 'Advisories sent to livestock owners in the owner app.',
    steps: [
      'Select "New announcement", write it, and choose who gets it: everyone, one barangay, or a monitoring zone.',
      'A published announcement cannot be edited. Withdraw it with a reason and publish a new one.',
    ],
  },
  '/audit-log': {
    title: 'Audit Log',
    purpose: 'Who did what and when, with the old and new values. It cannot be edited or deleted.',
    steps: [
      'Filter by record type, action, person or dates to find a change.',
      'For a change, the old value is crossed out in red and the new value is in green.',
      'Sign-ins, wrong passwords, locked accounts, password resets and exports are listed too.',
    ],
    terms: [
      ['Created', 'A new record, with the values it started with.'],
      ['Changed', 'An edit, with the old and new value of each field.'],
      ['CVO system / Owner app / Automatic', 'Where the change came from.'],
    ],
  },
  '/settings': {
    title: 'System Settings',
    purpose: 'Office details, letterhead and reminder periods.',
    steps: [
      'Edit the office name and letterhead lines used on printed reports.',
      'Set how many days before a head count is overdue, and how far ahead vaccinations are listed.',
      'Set the sign-in security: wrong passwords before an account locks, how long it stays locked, and the idle time before sign-out.',
      'Download a backup of all records.',
    ],
  },
  '/services': {
    title: 'Activity Log',
    purpose: 'Every deworming, check-up, vaccination and other field service given. Works without internet.',
    steps: [
      'Select "Record Service": choose the service (Deworming is first), the farm and species, and the number of heads.',
      'No signal in the field? Keep recording. Entries are saved on this phone, listed as "Waiting to Sync", and sent automatically when the internet returns (or select "Sync Now").',
      'Select "Record Farm Visit" for a visit to a farm: purpose, findings, head count and services in one form. Visits show in the log as "Farm Visit".',
      'Choose the activity type at the top; barangay, species and dates are under "Filters". Select "Print List" for a paper copy.',
      'What is due next is on the Vaccination Schedule.',
    ],
    terms: [
      ['Waiting to Sync', 'Saved on this device; it is sent when the connection returns.'],
      [
        'Not Accepted',
        'The server refused the entry (the reason is shown). Record it again, then discard it.',
      ],
    ],
  },
};

function helpKey(pathname: string) {
  const parts = pathname.split('/').filter(Boolean);
  if (!parts.length) return '/';
  if (parts.length === 1) return `/${parts[0]}`;
  return parts[1] === 'new' ? `/${parts[0]}/new` : `/${parts[0]}/:id`;
}

/** The "?" button in the top bar: how to use the page you are on. */
export function PageHelp() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const help = HELP[helpKey(pathname)];
  if (!help) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg p-2 text-slate-600 hover:bg-slate-100"
        aria-label="How to use this page"
        title="How to Use This Page"
      >
        <CircleHelp className="h-5 w-5" />
        <span className="hidden text-[14px] xl:inline">Help</span>
      </button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`How to use: ${help.title}`}
        guardChanges={false}
        footer={<Button onClick={() => setOpen(false)}>Got It</Button>}
      >
        <p className="text-[15px] text-slate-700">{help.purpose}</p>
        <ol className="mt-4 space-y-2.5">
          {help.steps.map((s, i) => (
            <li key={i} className="flex gap-3 text-[15px] text-slate-700">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-dark text-[13px] font-semibold text-white">
                {i + 1}
              </span>
              <span className="pt-0.5">{s}</span>
            </li>
          ))}
        </ol>
        {help.terms && (
          <>
            <h3 className="mt-5 text-[13px] font-semibold uppercase tracking-wide text-slate-500">
              Words You Will See
            </h3>
            <dl className="mt-2 space-y-1.5 text-[14px]">
              {help.terms.map(([t, d]) => (
                <div key={t}>
                  <dt className="inline font-medium text-slate-900">{t}:</dt>{' '}
                  <dd className="inline text-slate-600">{d}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </Dialog>
    </>
  );
}
