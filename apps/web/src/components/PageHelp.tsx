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
  ['Remove / Void', 'Cross out a wrong entry with the reason (administrators only). It no longer counts.'],
  ['Delete', 'Remove for good. Only for a record entered by mistake that nothing depends on.'],
];

/** "How to use this page", keyed by route ("/farms", "/farms/:id", "/cases/new"). */
const HELP: Record<string, Help> = {
  '/': {
    title: 'Dashboard',
    purpose: 'The city at a glance, and the list of work waiting for you.',
    steps: [
      'Start with "My tasks": each row is one thing to do. Select its button to open the right page and form.',
      'Use the search box at the top to find any owner, farm, ear tag or disease report.',
      'Use "+ New" for the everyday jobs: record a farm visit, record deworming, report a disease incident.',
    ],
    terms: [
      ['Overdue', 'The due date has passed.'],
      ['Counted this month', 'The farm’s head count was updated this month.'],
    ],
  },
  '/owners': {
    title: 'Livestock Owners',
    purpose: 'The owner masterlist, built from the DA list and farm visits.',
    steps: [
      'Search by name, contact or RSBSA number, or filter by barangay or source.',
      'New entry from the DA list or a visit? Select "Add Owner, Farm and Livestock" and follow the steps.',
      'Select a row to open the owner: personal information first, then ownership and insurance.',
    ],
    terms: [
      ['RSBSA', 'Registry System for Basic Sectors in Agriculture number of the raiser.'],
      ['Source', 'Where the office got the record: DA masterlist, farm visit or barangay referral.'],
      ['Archived', 'No longer raising livestock; kept for history, hidden from lists.'],
    ],
  },
  '/owners/:id': {
    title: 'Owner profile',
    purpose: 'One livestock owner: personal information, ownership, insurance and farms.',
    steps: [
      'Owner Profile tab: personal information, then ownership records and PCIC insurance below it.',
      'Farms tab: one card per farm with the livestock raised and the last visit. Select a card to open the farm.',
      'Select "Add Farm" for each place where the owner keeps animals.',
      '"More" holds Archive (stopped raising livestock).',
    ],
    terms: REMOVE_TERMS,
  },
  '/farms': {
    title: 'Farms',
    purpose: 'The farm masterlist: where each farm is, what it raises and when it was last visited.',
    steps: [
      'Use the cards at the top (Piggery, Goat Only, Mixed…) or the filters to narrow the list.',
      'Filter "Not visited in 90 days" to plan the next farm visits.',
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
    title: 'Farm profile',
    purpose: 'One farm: information, livestock with classifications, visits and services, and cases.',
    steps: [
      'After each visit select "Record Farm Visit": note the findings, update the head count (with age, sex and stage) and the deworming given, all in one form.',
      'Livestock tab: one card per species. Select "Update count / classify" to change the numbers.',
      'Visits & Services tab: every visit and service on one timeline.',
      'Select "Print" for a paper copy with the letterhead.',
    ],
    terms: REMOVE_TERMS,
  },
  '/population': {
    title: 'Population Monitoring',
    purpose: 'Head count from the masterlist, by species, farm and barangay.',
    steps: [
      'By Species: total heads per species with the breakdown by age, sex and production stage.',
      'By Farm: each farm’s count per species. Select a row to open the farm.',
      'To update a farm, choose it in the box at the top and select "Update Head Count".',
    ],
    terms: [
      ['Not classified', 'Heads counted without an age, sex or stage breakdown yet.'],
      ['Last counted', 'Month of the latest count (farm visit or DA list).'],
    ],
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
    title: 'Animal record',
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
  '/strays': {
    title: 'Stray & Violations',
    purpose: 'Animals found wandering, the violations and the fines.',
    steps: [
      'Select "Report incident", describe the animal and click where it was found.',
      'Select the incident to update it: owner, violation and fine. Set the status to Closed when it is settled.',
      'Enter the fine. Tick "Fine paid" when it is paid, then enter the OR number.',
    ],
    terms: [['OR number', 'Official receipt number of the paid fine.']],
  },
  '/gis-map': {
    title: 'Livestock & Disease Map',
    purpose: 'Farms, disease reports and livestock population on one map.',
    steps: [
      'Filter by barangay, disease, livestock or farm type (livestock raised).',
      'Turn layers on or off: farms, disease reports, population by barangay, radius rings, strays.',
      'Click a disease report to see the farms inside its radius and record a monitoring visit.',
      'Click a farm to see its livestock and last visit.',
    ],
  },
  '/barangay-map': {
    title: 'Barangay Summary',
    purpose: 'Each barangay shaded by the figure you choose. Darker means more.',
    steps: [
      'Choose what to show (livestock, farms, cases…) and a species.',
      'Click a barangay to see its numbers on the right.',
    ],
  },
  '/outbreak-map': {
    title: 'Outbreak Timeline',
    purpose: 'How the disease reports appeared and spread, month by month.',
    steps: [
      'Press play to watch the reports appear over time, or drag the slider to a month.',
      'Open the "Open Reports" tab for the reports still open, and add a location to those not yet on the map.',
    ],
  },
  '/radius': {
    title: 'Farms to Monitor',
    purpose: 'Farms near a disease report, and whether each one was visited since the report.',
    steps: [
      'Choose the disease report, then the radius (for example 500 m or 1 km).',
      'Start with "Not yet visited": visit each farm and select "Record visit" to note the findings.',
      'If sick animals are found, select "Report" to file an incident for that farm.',
      'Download the Outbreak-Area Report for the response team.',
    ],
    terms: [
      ['Not yet visited', 'No farm visit recorded since the disease report.'],
      ['Left out', 'Farms without a map location cannot be measured. Set their locations first.'],
    ],
  },
  '/cases': {
    title: 'Disease Surveillance',
    purpose: 'Disease reports for ASF and the other monitored diseases, with trends.',
    steps: [
      'Select "Report Incident" when a raiser reports sick or dead animals.',
      'Filter by disease, barangay or state; the graphs follow the filters.',
      'Select a report to open it. Its Steps tab shows what to do next.',
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
    title: 'Report a disease incident',
    purpose: 'Record a new suspected case.',
    steps: [
      'Choose the owner and the farm. The location is copied from the farm.',
      'Choose the species and the suspected disease, and enter how many are sick and dead.',
      'Add photos if you have them, then save. The case starts as "Suspected".',
    ],
  },
  '/cases/:id': {
    title: 'Disease report',
    purpose: 'One incident from report to closing, as six steps.',
    steps: [
      'Steps tab: work from top to bottom. The step marked "Do this now" is the next thing to do.',
      '1 Report → 2 Site visit → 3 Samples & result → 4 Response (if positive) → 5 Update the head count → 6 Close.',
      'The status changes by itself when you add a sample, enter the date sent, or enter the result.',
      'No test needed (false alarm, animals recovered)? Close it at step 6 as "Disease not confirmed".',
      'Details tab: owner, farm, photos and linked incidents. Timeline tab: every event in date order.',
    ],
    terms: [
      ['In force', 'A quarantine, movement restriction or checkpoint that has started and not been lifted.'],
      [
        'Head count not updated',
        'Dead or culled animals still counted on the farm. Select "Update head count" in step 5.',
      ],
    ],
  },
  '/investigation': {
    title: 'Samples & Lab Results',
    purpose: 'Lab results not back yet and field visits that are due, across all open reports.',
    steps: [
      'Work from the top: the samples waiting longest and the overdue visits come first.',
      'Select a row to open the report, then enter the result or record the visit.',
    ],
  },
  '/lab-submissions': {
    title: 'Lab Submissions',
    purpose: 'Samples sent to the laboratory (RADDL) in one batch, as on the DA forms.',
    steps: [
      'New submission: choose the purpose (e.g. Surveillance) and the test (e.g. PCR – ASF).',
      'Add one row per sample: the farm, species, age, sex, live or dead, and the specimen (blood for a live pig, spleen / lymph node / liver for a dead one).',
      'Print the Analysis Request Form and the Sample Collection Form and send them with the samples.',
      'When the results arrive (negatives usually by email), open the batch and select "Enter results".',
      'A positive sample shows "Open case": the disease case starts as Active with the sample attached.',
    ],
  },
  '/search': {
    title: 'Search',
    purpose: 'Find any record from one place.',
    steps: [
      'Type a name, code, ear tag, RSBSA number, certificate number or sample ID.',
      'Narrow it with the record type, barangay or species. With only a barangay or species chosen, everything there is listed.',
    ],
  },
  '/response': {
    title: 'Response Activities',
    purpose: 'Quarantines and checkpoints in force, and measures ongoing or planned.',
    steps: [
      'Check the "Needs update" rows first: a planned measure whose date passed, or one that should have ended.',
      'Select a row to open the case at step 4 (Response) and update or lift the measure.',
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
    title: 'User management',
    purpose: 'Who can sign in and what they can do.',
    steps: [
      'Add a user and choose the role.',
      'Edit a user and set the status to Deactivated when they leave the office.',
    ],
    terms: [
      ['Administrator', 'Everything, including users, settings and targets.'],
      ['Staff', 'Can add and edit records.'],
      ['Viewer', 'Can only look and print.'],
    ],
  },
  '/settings': {
    title: 'System settings',
    purpose: 'Office details, letterhead and reminder periods.',
    steps: [
      'Edit the office name and letterhead lines used on printed reports.',
      'Set how many days before a head count is overdue, and how far ahead vaccinations are listed.',
      'Download a backup of all records.',
    ],
  },
  '/services': {
    title: 'Deworming & Veterinary Services',
    purpose: 'Deworming, check-ups, vaccinations and other field services, and the farm visits.',
    steps: [
      'Select "Record Service": choose the service (Deworming is first), the farm and species, and the number of heads.',
      'Select "Record Farm Visit" to record a visit with its head count and services in one form.',
      'Service Records: filter by service, species, barangay or dates; select "Print List" for a paper copy.',
      'Upcoming Schedule: the next deworming or vaccination that is due.',
    ],
  },
  '/monthly-report': {
    title: 'Monthly Report',
    purpose: 'The month’s population, disease reports, deworming, check-ups and farm visits.',
    steps: [
      'Choose the month (and a barangay if needed). The graphs update by themselves.',
      'Select "Print Monthly Report" for the printed report with the letterhead and signatures.',
      'Use XLSX, CSV or PDF to download the same figures as a table.',
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
        title="How to use this page"
      >
        <CircleHelp className="h-5 w-5" />
        <span className="hidden text-[14px] xl:inline">Help</span>
      </button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`How to use: ${help.title}`}
        guardChanges={false}
        footer={<Button onClick={() => setOpen(false)}>Got it</Button>}
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
              Words you will see
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
