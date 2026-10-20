import {
  ArrowRightLeft,
  BarChart3,
  CircleAlert,
  CircleDot,
  ClipboardList,
  Download,
  FileText,
  FileWarning,
  Home,
  LayoutGrid,
  ListChecks,
  Map,
  MapPin,
  Microscope,
  Radar,
  Settings,
  ShieldCheck,
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
  adminOnly?: boolean;
}
export interface NavSection {
  id: string;
  label: string | null;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  { id: 'home', label: null, items: [{ to: '/', label: 'Dashboard', icon: LayoutGrid }] },
  {
    id: 'registry',
    label: 'Livestock Registry',
    items: [
      { to: '/owners', label: 'Livestock Owners', icon: Users },
      { to: '/farms', label: 'Farms', icon: Home },
      { to: '/population', label: 'Population Monitoring', icon: ClipboardList },
      { to: '/animals', label: 'Animal ID / Ear Tags', icon: Tag },
      { to: '/ownership', label: 'Ownership Records', icon: ArrowRightLeft },
      { to: '/strays', label: 'Stray & Violations', icon: CircleAlert },
    ],
  },
  {
    id: 'gis',
    label: 'GIS & Outbreak Mapping',
    items: [
      { to: '/geotagging', label: 'Farm Geotagging', icon: MapPin },
      { to: '/gis-map', label: 'Livestock GIS Map', icon: Map },
      { to: '/outbreak-map', label: 'Disease Outbreak Map', icon: CircleDot },
      { to: '/radius', label: 'Radius Analysis', icon: Radar },
    ],
  },
  {
    id: 'surveillance',
    label: 'Disease Surveillance',
    items: [
      { to: '/cases', label: 'Incident Reports', icon: FileWarning },
      { to: '/case-tracking', label: 'Case Tracking', icon: ListChecks },
      { to: '/investigation', label: 'Investigation & Lab', icon: Microscope },
      { to: '/response', label: 'Response Activities', icon: ShieldCheck },
      { to: '/vaccinations', label: 'Vaccinations', icon: Syringe },
    ],
  },
  {
    id: 'reports',
    label: 'Reports & Analytics',
    items: [
      { to: '/analytics', label: 'Analytics', icon: BarChart3 },
      { to: '/reports', label: 'Reports', icon: FileText },
      { to: '/export', label: 'Report Export', icon: Download },
    ],
  },
  {
    id: 'admin',
    label: 'Administration',
    items: [
      { to: '/users', label: 'User Management', icon: UserCog, adminOnly: true },
      { to: '/settings', label: 'System Settings', icon: Settings },
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
        return { trail, title: parts[1] === 'new' ? 'Details' : 'Details' };
      }
      return { trail, title: item.label };
    }
  }
  return { trail: [{ label: 'Home', to: '/' }], title: 'Naga City Livestock Monitoring System' };
}
