import {
  ClipboardCheck,
  Footprints,
  HandHelping,
  Inbox,
  Megaphone,
  Smartphone,
  ScrollText,
  Activity,
  ArrowRightLeft,
  BookOpen,
  BarChart3,
  CalendarDays,
  CircleAlert,
  CircleDot,
  ClipboardList,
  FileText,
  FileWarning,
  FlaskConical,
  Home,
  LayoutGrid,
  Map,
  MapPinned,
  Microscope,
  Radar,
  Settings,
  Stethoscope,
  Tag,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** One plain-language line shown in the phone menu and as a tooltip. */
  hint: string;
  adminOnly?: boolean;
  /** Reached from a tab on another page; kept here only for the page title and breadcrumbs. */
  hidden?: boolean;
}
export interface NavSection {
  id: string;
  label: string | null;
  /** Short name for the phone bottom bar. */
  short?: string;
  icon?: LucideIcon;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    // Dashboard and every report in one module (panel revision: reports in one place).
    id: 'reports',
    label: 'Dashboard & Reports',
    short: 'Reports',
    icon: BarChart3,
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutGrid, hint: 'Summary of the whole city' },
      {
        to: '/monthly-report',
        label: 'Monthly Report',
        icon: CalendarDays,
        hint: 'Printable monthly summary with graphs',
      },
      {
        to: '/reports',
        label: 'All Reports',
        icon: FileText,
        hint: 'Ready-made reports; download as Excel, CSV or PDF',
      },
      { to: '/analytics', label: 'Analytics', icon: BarChart3, hint: 'Charts and trends' },
    ],
  },
  {
    // Messages moved to the floating button (bottom-right of every page); Monitoring Zones moved to
    // Map & Monitoring and Announcements to Veterinary Field Services.
    id: 'owners-app',
    label: 'Owner App',
    short: 'Owners',
    icon: Smartphone,
    items: [
      {
        to: '/review',
        label: 'Review Queue',
        icon: Inbox,
        hint: 'Registrations, updates and reports sent by owners',
      },
    ],
  },
  {
    id: 'registry',
    label: 'Livestock Registry',
    short: 'Registry',
    icon: BookOpen,
    items: [
      {
        to: '/owners',
        label: 'Livestock Owners',
        icon: Users,
        hint: 'Owners from the DA list and field visits',
      },
      { to: '/farms', label: 'Farms', icon: Home, hint: 'Farms, livestock raised and last visit' },
      {
        to: '/population',
        label: 'Population Monitoring',
        icon: ClipboardList,
        hint: 'Head count by species, age, sex and stage',
      },
      { to: '/animals', label: 'Animal ID / Ear Tags', icon: Tag, hint: 'Individually tagged animals' },
      {
        to: '/ownership',
        label: 'Ownership Records',
        icon: ArrowRightLeft,
        hint: 'Animal sales and transfers',
      },
      {
        to: '/strays',
        label: 'Stray Livestock',
        icon: CircleAlert,
        hint: 'Animals found wandering',
      },
    ],
  },
  {
    id: 'gis',
    label: 'Map & Monitoring',
    short: 'Map',
    icon: Map,
    items: [
      {
        to: '/gis-map',
        label: 'Livestock & Disease Map',
        icon: Map,
        hint: 'Farms, disease reports and population on one map',
      },
      {
        to: '/zones',
        label: 'Monitoring Zones',
        icon: Radar,
        hint: 'Areas around confirmed cases and the owners alerted',
      },
      {
        to: '/radius',
        label: 'Farms to Monitor',
        icon: MapPinned,
        hint: 'Farms near a disease report to visit',
      },
      {
        to: '/outbreak-map',
        label: 'Outbreak Timeline',
        icon: CircleDot,
        hint: 'Replay disease reports month by month',
      },
      {
        to: '/barangay-map',
        label: 'Barangay Summary',
        icon: MapPinned,
        hint: 'Barangays shaded by livestock or cases',
        hidden: true,
      },
    ],
  },
  {
    id: 'surveillance',
    label: 'Disease Surveillance',
    short: 'Disease',
    icon: Activity,
    items: [
      {
        to: '/cases',
        label: 'Disease Reports',
        icon: FileWarning,
        hint: 'Incident reports and their progress',
      },
      {
        to: '/investigation',
        label: 'Samples & Lab Results',
        icon: Microscope,
        hint: 'Lab results awaited and field visits due',
      },
      {
        to: '/lab-submissions',
        label: 'Lab Submissions',
        icon: FlaskConical,
        hint: 'Send samples to RADDL in 4 steps, with the forms to print',
      },
    ],
  },
  {
    // Renamed from "Deworming & Vet Services": the module now covers all field work, owner
    // requests and advisories, not only deworming.
    id: 'services',
    label: 'Veterinary Field Services',
    short: 'Services',
    icon: Stethoscope,
    items: [
      {
        to: '/services',
        label: 'Activity Log',
        icon: ClipboardCheck,
        hint: 'Deworming, check-ups and vaccinations given; works offline',
      },
      {
        to: '/field-visits',
        label: 'Field Visits',
        icon: Footprints,
        hint: 'Visits to farms and what was found',
      },
      {
        to: '/service-requests',
        label: 'Service Requests',
        icon: HandHelping,
        hint: 'Services asked for by livestock owners',
      },
      {
        to: '/vaccination-activities',
        label: 'Vaccination Schedule',
        icon: CalendarDays,
        hint: 'Vaccination activities by barangay and owner sign-ups',
      },
      { to: '/announcements', label: 'Announcements', icon: Megaphone, hint: 'Advisories sent to owners' },
    ],
  },
  {
    id: 'admin',
    label: 'Administration',
    icon: Settings,
    items: [
      {
        to: '/users',
        label: 'User Management',
        icon: UserCog,
        hint: 'Staff accounts and roles',
        adminOnly: true,
      },
      {
        to: '/audit-log',
        label: 'Audit Log',
        icon: ScrollText,
        hint: 'Who changed what, and when',
        adminOnly: true,
      },
      { to: '/settings', label: 'System Settings', icon: Settings, hint: 'Office details and defaults' },
    ],
  },
];

/** Breadcrumb info for a pathname. */
export function crumbsFor(pathname: string): { trail: { label: string; to?: string }[]; title: string } {
  if (pathname === '/') return { trail: [{ label: 'Dashboard & Reports' }], title: 'Dashboard' };
  const parts = pathname.split('/').filter(Boolean);
  const base = `/${parts[0]}`;
  for (const s of NAV) {
    const item = s.items.find((i) => i.to === base);
    if (item) {
      const trail: { label: string; to?: string }[] = [{ label: 'Home', to: '/' }];
      if (s.label) trail.push({ label: s.label });
      if (parts.length > 1) {
        trail.push({ label: item.label, to: item.to });
        return { trail, title: parts[1] === 'new' ? `New · ${item.label}` : item.label };
      }
      return { trail, title: item.label };
    }
  }
  return { trail: [{ label: 'Home', to: '/' }], title: 'Naga City Livestock Monitoring System' };
}

/** The module (menu section) a pathname belongs to. */
export function sectionFor(pathname: string): NavSection | undefined {
  const base = `/${pathname.split('/').filter(Boolean)[0] ?? ''}`;
  // Old addresses of moved pages still open their module in the menu.
  if (base === '/messages') return NAV.find((s) => s.id === 'owners-app');
  return NAV.find((s) => s.items.some((i) => i.to === base));
}
