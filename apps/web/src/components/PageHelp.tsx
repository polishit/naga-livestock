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

/** "How to use this page", keyed by route ("/farms", "/farms/:id", "/cases/new"). */
const HELP: Record<string, Help> = {
  '/': {
    title: 'Dashboard',
    purpose: 'The city at a glance, and the list of work waiting for you.',
    steps: [
      'Start with "My tasks": each row is one thing to do. Select its button to open the right page and form.',
      'Use the chips above the list (Field visits, Lab results…) to see one kind of task at a time.',
      'A red "Disease hotspot" strip means a barangay suddenly has more cases than usual. Open it and plan a response.',
      'Use "+ New" at the top for the common jobs: register a raiser, report a case, record a vaccination.',
    ],
    terms: [
      ['Overdue', 'The due date has passed.'],
      ['Verified this month', 'The farm’s head count was updated this month.'],
      ['Estimated coverage', 'Worked out from group vaccinations; exact only for tagged animals.'],
    ],
  },
  '/owners': {
    title: 'Livestock Owners',
    purpose: 'Everyone who raises livestock in the city.',
    steps: [
      'New raiser? Select "Register raiser". It asks for the owner, then the farm (pin it on the map), then the animals, one after another.',
      'Use "Register owner" only when you want to add the person now and the farm later.',
      'Search or filter by barangay, status or RSBSA, then select a row to open the owner’s profile.',
      'On the profile you can add another farm, a PCIC insurance policy, or archive the owner.',
    ],
    terms: [
      ['RSBSA', 'Registry System for Basic Sectors in Agriculture number of the raiser.'],
      ['Archived', 'No longer raising livestock; kept for history, hidden from lists.'],
    ],
  },
  '/owners/:id': {
    title: 'Owner profile',
    purpose: 'One raiser: details, farms, insurance and stray incidents.',
    steps: [
      'Check the details; select "Edit" to correct them.',
      'Select "Add farm" for each place where they keep animals.',
      'Add PCIC insurance policies and link the insured ear tags.',
    ],
  },
  '/farms': {
    title: 'Farms',
    purpose: 'Every farm, where it is, and how many animals it has.',
    steps: [
      'Select "Register farm", choose the owner, then click the map where the farm is. The address and barangay fill in by themselves.',
      'Tick "The animals graze on a pasture" only if they graze somewhere else, then click the pasture map.',
      'Filter "Location: unmapped" to find farms that still need a pin.',
      'Select a farm to update its head count, add animals or record a vaccination.',
    ],
    terms: [
      ['Overdue', 'The monthly head count was not updated in time.'],
      ['Unmapped', 'No map pin yet: the farm is left out of radius checks.'],
    ],
  },
  '/farms/:id': {
    title: 'Farm profile',
    purpose: 'One farm: location, animal groups, vaccinations and cases.',
    steps: [
      'Each month select "Update population" and enter the current count for every group.',
      'No map pin yet? Select "Set location" and click the map.',
      'Add a group for each species (head count), or register animals one by one with ear tags.',
      'Select "Print profile" for a paper copy with the letterhead.',
    ],
  },
  '/population': {
    title: 'Population Monitoring',
    purpose: 'Monthly head counts of every farm’s animal groups.',
    steps: [
      'Choose the farm first (the farm box at the top).',
      'Select "Update population" and enter this month’s count for each group. Give a reason when the number changes.',
      'Select "Add group" when the farm starts raising a new species.',
      'Open the "Totals by barangay & species" tab for the city totals.',
    ],
    terms: [
      ['Verified', 'Staff entered a count for that month.'],
      ['Carried forward', 'No count that month; the last known number is used.'],
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
    purpose: 'Animals found wandering, impounded or released, and the fines.',
    steps: [
      'Select "Report incident", describe the animal and click where it was found.',
      'Select the incident to update it. Impound details appear when the status is Impounded; release details when Released.',
      'Enter the fine. Tick "Fine paid" when it is paid, then enter the OR number.',
    ],
    terms: [['OR number', 'Official receipt number of the paid fine.']],
  },
  '/gis-map': {
    title: 'Livestock Map',
    purpose: 'Farms, cases and strays on one map.',
    steps: [
      'Turn layers on or off (farms, cases, strays) and filter by barangay, species or farm type.',
      'Click a marker to see the farm or case, then open it.',
      'Open the "By barangay" tab to see barangays shaded by livestock or cases.',
    ],
  },
  '/barangay-map': {
    title: 'Map by barangay',
    purpose: 'Each barangay shaded by the figure you choose. Darker means more.',
    steps: [
      'Choose what to show (livestock, farms, cases…) and a species.',
      'Click a barangay to see its numbers on the right.',
    ],
  },
  '/outbreak-map': {
    title: 'Disease Outbreak Map',
    purpose: 'Where the disease cases are, and how they spread over time.',
    steps: [
      'Filter by status to see, for example, only confirmed cases.',
      'Open the "Outbreak timeline" tab and press play to watch the cases appear over time.',
      'Click a case on the map to see it, then open it.',
    ],
  },
  '/radius': {
    title: 'Radius Analysis',
    purpose: 'Farms within a distance of a confirmed case (for quarantine and surveillance).',
    steps: [
      'Choose the case, then the radius (for example 500 m or 1 km).',
      'Read the list of farms inside the circle with their owners and contact numbers.',
      'Download the Outbreak-Area Report for the response team.',
    ],
    terms: [['Excluded', 'Farms without a map pin cannot be measured. Set their locations first.']],
  },
  '/cases': {
    title: 'Incident Reports',
    purpose: 'All disease cases. Report a new one here.',
    steps: [
      'Select "Report incident" when a raiser reports sick or dead animals.',
      'Switch between "Table" (a list) and "Board" (one column per stage).',
      'Select a case to open it. The "Next step" box at the top of the case tells you what to do.',
    ],
    terms: [
      [
        'Suspected → Sample collected → Sent to lab → Awaiting result → Positive / Negative',
        'The stages of a case.',
      ],
      ['Awaiting geotagging', 'The case has no map location yet.'],
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
    title: 'Case profile',
    purpose: 'One disease case from report to closing.',
    steps: [
      'Follow the "Next step" box at the top: it always shows the one thing to do now, with a button for it.',
      'Investigation tab: record each site visit. Laboratory tab: samples and results. Response tab: quarantine, disinfection, culling.',
      'When the lab result comes back, the system offers the matching status.',
      'Close the case when it is contained. A closed case is read-only.',
    ],
    terms: [
      ['In force', 'A quarantine, movement restriction or checkpoint that has started and not been lifted.'],
      [
        'Population not updated',
        'Dead or culled animals still counted on the farm. Select "Update population".',
      ],
    ],
  },
  '/investigation': {
    title: 'Investigation & Lab',
    purpose: 'Lab results not back yet and field visits that are due, across all open cases.',
    steps: [
      'Work from the top: the samples waiting longest and the overdue visits come first.',
      'Select a row to open the case on the right tab, then enter the result or record the visit.',
    ],
  },
  '/response': {
    title: 'Response Activities',
    purpose: 'Quarantines and checkpoints in force, and measures ongoing or planned.',
    steps: [
      'Check the "Needs update" rows first: a planned measure whose date passed, or one that should have ended.',
      'Select a row to open the case’s Response tab and update or lift the measure.',
    ],
  },
  '/vaccinations': {
    title: 'Vaccinations',
    purpose: 'Vaccination records, doses due, and coverage.',
    steps: [
      'Select "Record vaccination", choose the farm and the group (or a tagged animal), the vaccine and the number vaccinated.',
      'Enter the next dose date so it appears in "Upcoming" and in My tasks.',
      'The "Coverage" tab shows how much of each species is vaccinated.',
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
      'The first tab, "Accomplishment", is the monthly report of everything the office did. Pick the dates of the month or quarter.',
      'Other tabs hold the detailed reports. Choose one, then filter by barangay, species or dates.',
      'Download as Excel, CSV or PDF (with the letterhead), or print.',
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
        className="flex items-center gap-1.5 rounded-md p-2 text-slate-600 hover:bg-slate-100"
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
        <p className="text-[14.5px] text-slate-700">{help.purpose}</p>
        <ol className="mt-4 space-y-2.5">
          {help.steps.map((s, i) => (
            <li key={i} className="flex gap-3 text-[14.5px] text-slate-700">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-dark text-[12.5px] font-semibold text-white">
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