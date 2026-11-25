# Panel Revisions — November 2026

What was changed for each item of the panel's revision list, and where it is in the code.
No database change is needed (no new migration); restart `pnpm dev` after pulling.

## I. Admin side

| # | Revision | What was done | Where |
|---|----------|---------------|-------|
| 1 | Owner App — messaging as a floating button | Messages is a round button at the bottom-right of every page, with the unread count. It opens the conversations in a window over the page (full screen on phones). Old `/messages?owner=…` links and the "Message" button on an owner's page open it. | `components/MessagesFab.tsx`, `pages/MessagesPage.tsx` |
| 1 | Owner App — remove the specified page | The Messages page was removed from the menu (replaced by the button). Owner App now holds the Review Queue. | `components/layout/nav.ts` |
| 2 | Registry — remove Violations | "Stray & Violations" is now **Stray Livestock**: the violation type and number of violations were taken out of the form, the list, the owner's page and the report. Old data stays in the database. | `pages/StraysPage.tsx`, `dialogs/animals.tsx`, `api/services/reports.ts` |
| 3 | Map & Monitoring — Monitoring Zones | Monitoring Zones moved into Map & Monitoring. | `nav.ts` |
| 4 | Disease Surveillance — remove Response Activities | The Response Activities page and step 4 "Response" of a case were removed. A case now has 5 steps: Report → Site visit → Samples & result → Update head count → Close. Response measures no longer block closing a case. `/response` opens Disease Reports. | `pages/CasesPages.tsx`, `shared/constants.ts` (`caseCloseBlockers`) |
| 4 | Remove Table and Board views | One list only; the Table/Board switch and the board were removed. | `CasesPages.tsx` |
| 4 | Simplify Disease Reports filters | Only the **Status** dropdown remains (Open Cases, each lab stage, Closed, Voided, All) plus search. The summary boxes above the list were removed. Filters that arrive from a chart link show as removable chips. Trends moved to Analytics. | `CasesPages.tsx` |
| 5 | Rename the module | "Deworming & Vet Services" → **Veterinary Field Services**. | `nav.ts` |
| 5 | Activity Log — offline + auto sync | The **Activity Log** (the list of services given) works without internet: entries are saved on the device, listed as "Waiting to Sync", and sent automatically when the connection returns (or with "Sync Now"). Edits of services and field visits can now be saved offline too. Rejected entries show the reason and can be discarded. | `pages/ServicesPage.tsx` (`OfflineSyncPanel`), `lib/hooks.ts` (`useOutbox`), `dialogs/services.tsx` |
| 5 | Announcements in this module | Announcements moved into Veterinary Field Services. | `nav.ts` |
| 5 | Service Requests | New **Service Requests** page for the services owners ask for in the owner app (schedule, done, decline with a reply). Moved out of the Review Queue tabs; it has its own menu badge. | `pages/ReviewPages.tsx` (`ServiceRequestsPage`), `App.tsx` |
| 5 | Remove Service Records | The Service Records tab was merged into the Activity Log (the Activity Log is that list). | `ServicesPage.tsx` |
| 5 | Rename Farm Visits | **Field Visits**, now its own page in the module; wording changed everywhere (forms, farm page, reports, prints). | `ServicesPage.tsx` (`FieldVisitsPage`) |
| 6 | Dashboard and Reports | New module **Dashboard & Reports** at the top of the menu: Dashboard, Monthly Report, All Reports, Analytics. | `nav.ts` |

## II. System-wide

| Revision | What was done | Where |
|----------|---------------|-------|
| One unified filter section | Each list has one labelled "Filter" row (search + every filter + Clear Filters), instead of filters in separate places. | `components/page.tsx` (`FilterBar`), `components/DataTable.tsx` |
| Navigation bar colours | Light menu with forest-green text, a gold marker on the open page, and a green top bar — the logo's colours. The owner app uses the same colours. | `tailwind.config.ts`, `AppLayout.tsx`, `owner/OwnerApp.tsx` |
| Form layout and sizes | One width scale for every form window (480 / 640 / 960 px), the same padding, and all fields, dropdowns and filter buttons 40 px high. | `components/ui/index.tsx` (`Dialog`) |
| Required fields in red | Every required field shows a red **\*** (screen readers say "required"); form windows with required fields show "\* Required" in the footer. | `ui/index.tsx` (`Label`, `RequiredMark`), `index.css` |
| Colour-coded dropdowns | Status and result dropdowns are coloured by value — Positive red, Negative green, Pending amber, Sent to lab blue, Closed grey — in forms and filters, with a coloured dot for the chosen value. Negative badges are now green to match. | `ui/index.tsx` (`VALUE_TONES`, `Select`), `page.tsx` (`FilterSelect`), `status.tsx` |
| Menu scrolling | Thin scrollbar that appears only while the menu is hovered, scrolling stays inside the menu, and the page you are on is scrolled into view. | `index.css` (`.nav-scroll`), `AppLayout.tsx` |
| Lab submission process | Every batch shows the **4 steps** (Prepare → Print forms & send → Enter results → Act on positives) with the current step marked "Do This Now" and the next button beside it. The list has a **Step** column; the form says "Step 1 of 4". The help page explains each step. | `pages/LabSubmissionsPages.tsx`, `components/PageHelp.tsx` |

## III. Owner side

| Revision | What was done | Where |
|----------|---------------|-------|
| Bigger home map (web) | On tablets and computers the Disease Map runs the full width under the shortcuts (about 560 px high). | `owner/OwnerApp.tsx` (`HomeMapCard`) |
| Kind → Species | The farm form's livestock rows say **Species** ("Add Another Species"). | `OwnerApp.tsx` |
| Disease Reports, Disease Map | Kept. | — |
| Messages layout | Chat card with the office's name and a call button, and the updates on what the owner sent in their own list (beside the chat on a computer, a second tab on a phone). | `owner/OwnerPages.tsx` (`MessagesScreen`) |
| Vaccination and Services in the main bar | Added to the phone bottom bar ("Services") and the home shortcuts. | `OwnerApp.tsx` |
| Remove My Verification | Page and menu items removed. The registration status and the ID (and "Send for Review Again") are now at the bottom of **My Profile**; old links open My Profile. | `OwnerPages.tsx` (`MyIdSection`) |

## IV. Additional

- **Logo:** an original mark — a gold map pin (GIS monitoring) holding a cow's head (livestock) with a health cross (the veterinary office), on forest green. Used in the menu, login, owner app, public pages, favicon and the installed-app icons. `components/Logo.tsx`, `public/favicon.svg`, `public/icons/*`.
- **Consistency:** the colours, form sizes, dropdowns and required markers above come from the shared components, so the admin and owner sides use the same ones.

## Tests

- Updated for the removed features: `apps/api/test/api.test.ts` (closing is not blocked by measures), and the e2e specs for Disease Reports, strays, the case steps, services, field visits, the registry menu and the owner farm form.
- Removed e2e tests of features that no longer exist (response steps).
