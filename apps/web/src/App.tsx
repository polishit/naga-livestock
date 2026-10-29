import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Loading } from '@/components/page';
import LoginPage from '@/pages/LoginPage';

const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const OwnersPage = lazy(() => import('@/pages/OwnersPages').then((m) => ({ default: m.OwnersPage })));
const OwnerDetailPage = lazy(() =>
  import('@/pages/OwnersPages').then((m) => ({ default: m.OwnerDetailPage })),
);
const FarmsPage = lazy(() => import('@/pages/FarmsPages').then((m) => ({ default: m.FarmsPage })));
const FarmDetailPage = lazy(() => import('@/pages/FarmsPages').then((m) => ({ default: m.FarmDetailPage })));
const PopulationPage = lazy(() => import('@/pages/PopulationPage'));
const AnimalsPage = lazy(() => import('@/pages/AnimalsPages').then((m) => ({ default: m.AnimalsPage })));
const AnimalDetailPage = lazy(() =>
  import('@/pages/AnimalsPages').then((m) => ({ default: m.AnimalDetailPage })),
);
const OwnershipPage = lazy(() => import('@/pages/AnimalsPages').then((m) => ({ default: m.OwnershipPage })));
const StraysPage = lazy(() => import('@/pages/StraysPage'));
const GisMapPage = lazy(() => import('@/pages/GisPages').then((m) => ({ default: m.GisMapPage })));
const OutbreakMapPage = lazy(() => import('@/pages/GisPages').then((m) => ({ default: m.OutbreakMapPage })));
const RadiusPage = lazy(() => import('@/pages/GisPages').then((m) => ({ default: m.RadiusPage })));
const BarangayMapPage = lazy(() => import('@/pages/GisPages').then((m) => ({ default: m.BarangayMapPage })));
const CasesPage = lazy(() => import('@/pages/CasesPages').then((m) => ({ default: m.CasesPage })));
const CaseNewPage = lazy(() => import('@/pages/CasesPages').then((m) => ({ default: m.CaseNewPage })));
const CaseDetailPage = lazy(() => import('@/pages/CasesPages').then((m) => ({ default: m.CaseDetailPage })));
const InvestigationPage = lazy(() =>
  import('@/pages/CasesPages').then((m) => ({ default: m.InvestigationPage })),
);
const ResponseActivitiesPage = lazy(() =>
  import('@/pages/CasesPages').then((m) => ({ default: m.ResponseActivitiesPage })),
);
const VaccinationsPage = lazy(() => import('@/pages/VaccinationsPage'));
const AnalyticsPage = lazy(() => import('@/pages/ReportsPages').then((m) => ({ default: m.AnalyticsPage })));
const ReportsPage = lazy(() => import('@/pages/ReportsPages').then((m) => ({ default: m.ReportsPage })));
const UsersPage = lazy(() => import('@/pages/AdminPages').then((m) => ({ default: m.UsersPage })));
const SettingsPage = lazy(() => import('@/pages/AdminPages').then((m) => ({ default: m.SettingsPage })));

function RequireAuth({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (admin && !isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function RequireEditor({ children }: { children: ReactNode }) {
  const { canEdit } = useAuth();
  return canEdit ? <>{children}</> : <Navigate to="/cases" replace />;
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="owners" element={<OwnersPage />} />
          <Route path="owners/:id" element={<OwnerDetailPage />} />
          <Route path="farms" element={<FarmsPage />} />
          <Route path="farms/:id" element={<FarmDetailPage />} />
          <Route path="population" element={<PopulationPage />} />
          <Route path="animals" element={<AnimalsPage />} />
          <Route path="animals/:id" element={<AnimalDetailPage />} />
          <Route path="ownership" element={<OwnershipPage />} />
          <Route path="strays" element={<StraysPage />} />
          {/* Merged pages: old links and bookmarks land on the page that replaced them. */}
          <Route path="geotagging" element={<Navigate to="/farms?location=unmapped" replace />} />
          <Route path="gis-map" element={<GisMapPage />} />
          <Route path="outbreak-map" element={<OutbreakMapPage />} />
          <Route path="radius" element={<RadiusPage />} />
          <Route path="barangay-map" element={<BarangayMapPage />} />
          <Route path="cases" element={<CasesPage />} />
          <Route
            path="cases/new"
            element={
              <RequireEditor>
                <CaseNewPage />
              </RequireEditor>
            }
          />
          <Route path="cases/:id" element={<CaseDetailPage />} />
          <Route path="case-tracking" element={<Navigate to="/cases?view=board" replace />} />
          <Route path="investigation" element={<InvestigationPage />} />
          <Route path="response" element={<ResponseActivitiesPage />} />
          <Route path="vaccinations" element={<VaccinationsPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="export" element={<Navigate to="/reports" replace />} />
          <Route
            path="users"
            element={
              <RequireAuth admin>
                <UsersPage />
              </RequireAuth>
            }
          />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
