import {
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
  FolderOpen,
  Home,
  LayoutGrid,
  Map,
  MapPinned,
  Microscope,
  Radar,
  Settings,
  ShieldCheck,
  Stethoscope,
  Syringe,
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
    id: 'home',
    label: null,
    items: [{ to: '/', label: 'Dashboard', icon: LayoutGrid, hint: 'Summary of the whole city' }],
  },
  {
    id: 'registry',
    label: 'Masterlist',
    short: 'Masterlist',
    icon: BookOpen,
    items: [
      {
        to: '/owners',
        label: 'Livestock Owners',
        icon: Users,
        hint: 'Owners from the DA list and farm visits',
      },
      { to: '/farms', label: 'Farms', icon: Home, hint: 'Farms, livestock raised and last visit' },
      {
        to: '/population',
        label: 'Livestock Population',
        icon: ClipboardList,
        hint: 'Head count by species, age, sex and stage',
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
      { to: '/radius', label: 'Farms to Monitor', icon: Radar, hint: 'Farms near a disease report to visit' },
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
        hint: 'Incident reports, trends and their progress',
      },
      {
        to: '/investigation',
        label: 'Samples & Lab Results',
        icon: Microscope,
        hint: 'Lab results awaited and field visits due',
      },
      {
        to: '/response',
        label: 'Response Activities',
        icon: ShieldCheck,
        hint: 'Quarantines and checkpoints in force',
      },
    ],
  },
  {
    id: 'services',
    label: 'Deworming & Vet Services',
    short: 'Services',
    icon: Stethoscope,
    items: [
      {
        to: '/services',
        label: 'Deworming & Services',
        icon: Syringe,
        hint: 'Deworming, check-ups, vaccinations and farm visits',
      },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: BarChart3,
    items: [
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
    id: 'records',
    label: 'Other Records',
    icon: FolderOpen,
    items: [
      { to: '/animals', label: 'Ear Tags', icon: Tag, hint: 'Individually tagged animals' },
      {
        to: '/ownership',
        label: 'Ownership Records',
        icon: ArrowRightLeft,
        hint: 'Animal sales and transfers',
      },
      {
        to: '/strays',
        label: 'Stray & Violations',
        icon: CircleAlert,
        hint: 'Wandering animals and violations',
      },
    ],
  },
  {
    id: 'admin',
    label: 'Administration',
    icon: Settings,
    items: [
      { to: '/users', label: 'User Management', icon: UserCog, hint: 'Accounts and roles', adminOnly: true },
      { to: '/settings', label: 'System Settings', icon: Settings, hint: 'Office details and defaults' },
    ],
  },
];

/** Breadcrumb info for a pathname. */
export function crumbsFor(pathname: string): { trail: { label: string; to?: string }[]; title: string } {
  if (pathname === '/') return { trail: [{ label: 'Home' }], title: 'Dashboard' };
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
  return NAV.find((s) => s.items.some((i) => i.to === base));
}
