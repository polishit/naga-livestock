import {
  ClipboardCheck,
  Megaphone,
  ScrollText,
  Activity,
  ArrowRightLeft,
  BookOpen,
  BarChart3,
  CalendarDays,
  ClipboardList,
  FileText,
  FileWarning,
  FlaskConical,
  Home,
  LayoutGrid,
  Map,
  MapPinned,
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
    // Dashboard and every report in one module.
    id: 'reports',
    label: 'Dashboard & Reports',
    short: 'Reports',
    icon: BarChart3,
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutGrid, hint: 'Summary of the whole city' },
      {
        to: '/reports',
        label: 'All Reports',
        icon: FileText,
        hint: 'Every report, including the monthly accomplishment report, to view, print or export',
      },
      { to: '/analytics', label: 'Analytics', icon: BarChart3, hint: 'Charts and trends' },
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
        hint: 'Owner masterlist, with new owner applications on top',
      },
      { to: '/farms', label: 'Farms', icon: Home, hint: 'Farms, with new farm applications on top' },
      {
        to: '/population',
        label: 'Population Monitoring',
        icon: ClipboardList,
        hint: 'Monthly head counts, with owner updates waiting on top',
      },
      { to: '/animals', label: 'Animal ID / Ear Tags', icon: Tag, hint: 'Individually tagged animals' },
      {
        to: '/ownership',
        label: 'Ownership Records',
        icon: ArrowRightLeft,
        hint: 'Transfers of tagged animals between owners',
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
        label: 'Livestock Map',
        icon: MapPinned,
        hint: 'Farms by species and the totals of each barangay',
      },
      {
        to: '/disease-monitoring',
        label: 'Disease Monitoring',
        icon: Radar,
        hint: 'Cases, monitoring zones, the farms inside them and the outbreak over time',
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
        hint: 'Disease cases, with owner reports waiting on top',
      },
      {
        to: '/laboratory',
        label: 'Laboratory',
        icon: FlaskConical,
        hint: 'Every sample: send it to the laboratory and enter the result',
      },
    ],
  },
  {
    id: 'services',
    label: 'Veterinary Field Services',
    short: 'Services',
    icon: Stethoscope,
    items: [
      {
        to: '/services',
        label: 'Activity Log',
        icon: ClipboardCheck,
        hint: 'Deworming, check-ups, vaccinations and farm visits done in the field',
      },
      {
        to: '/vaccination-schedule',
        label: 'Vaccination Schedule',
        icon: CalendarDays,
        hint: 'Owner requests waiting on top, then the calendar of activities and doses due',
      },
      { to: '/announcements', label: 'Announcements', icon: Megaphone, hint: 'Advisories sent to owners' },
    ],
  },
  {
    id: 'admin',
    label: 'Administration',
    short: 'Admin',
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

/** Pages without a menu item of their own, shown under the page they belong to. */
const PART_OF: Record<string, string> = { '/lab-submissions': '/laboratory' };

/** Breadcrumb info for a pathname. */
export function crumbsFor(pathname: string): { trail: { label: string; to?: string }[]; title: string } {
  if (pathname === '/') return { trail: [{ label: 'Dashboard & Reports' }], title: 'Dashboard' };
  const parts = pathname.split('/').filter(Boolean);
  const base = PART_OF[`/${parts[0]}`] ?? `/${parts[0]}`;
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
  const first = `/${pathname.split('/').filter(Boolean)[0] ?? ''}`;
  const base = PART_OF[first] ?? first;
  return NAV.find((s) => s.items.some((i) => i.to === base));
}
