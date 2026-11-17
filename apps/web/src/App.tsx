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
const ServicesPage = lazy(() => import('@/pages/ServicesPage'));
const LabSubmissionsPage = lazy(() =>
  import('@/pages/LabSubmissionsPages').then((m) => ({ default: m.LabSubmissionsPage })),
);
const LabSubmissionFormPage = lazy(() =>
  import('@/pages/LabSubmissionsPages').then((m) => ({ default: m.LabSubmissionFormPage })),
);
const LabSubmissionDetailPage = lazy(() =>
  import('@/pages/LabSubmissionsPages').then((m) => ({ default: m.LabSubmissionDetailPage })),
);
const MonthlyReportPage = lazy(() => import('@/pages/MonthlyReportPage'));
const AnalyticsPage = lazy(() => import('@/pages/ReportsPages').then((m) => ({ default: m.AnalyticsPage })));
const ReportsPage = lazy(() => import('@/pages/ReportsPages').then((m) => ({ default: m.ReportsPage })));
const UsersPage = lazy(() => import('@/pages/AccountPages').then((m) => ({ default: m.UsersPage })));
const OwnerApp = lazy(() => import('@/owner/OwnerApp').then((m) => ({ default: m.OwnerApp })));
const RegisterPage = lazy(() => import('@/pages/PublicPages').then((m) => ({ default: m.RegisterPage })));
const PublicPage = lazy(() => import('@/pages/PublicPages').then((m) => ({ default: m.PublicPage })));
const ReviewPage = lazy(() => import('@/pages/ReviewPages').then((m) => ({ default: m.ReviewPage })));
const MessagesPage = lazy(() => import('@/pages/MessagesPage').then((m) => ({ default: m.MessagesPage })));
const ZonesPage = lazy(() => import('@/pages/OutreachPages').then((m) => ({ default: m.ZonesPage })));
const ActivitiesPage = lazy(() =>
  import('@/pages/OutreachPages').then((m) => ({ default: m.ActivitiesPage })),
);
const AnnouncementsPage = lazy(() =>
  import('@/pages/OutreachPages').then((m) => ({ default: m.AnnouncementsPage })),
);
const AuditLogPage = lazy(() => import('@/pages/AccountPages').then((m) => ({ default: m.AuditLogPage })));
const FirstPasswordScreen = lazy(() =>
  import('@/pages/AccountPages').then((m) => ({ default: m.FirstPasswordScreen })),
);
const SettingsPage = lazy(() => import('@/pages/AdminPages').then((m) => ({ default: m.SettingsPage })));

function RequireAuth({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  // A temporary password must be changed before anything else can be opened.
  if (user.mustChangePassword) return <FirstPasswordScreen />;
  // Livestock owners use the owner app, never the CVO system.
  if (user.role === 'OWNER') return <Navigate to="/app" replace />;
  if (admin && !isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** The owner app: livestock owners only (staff are sent to the CVO system). */
function RequireOwner({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <FirstPasswordScreen />;
  if (user.role !== 'OWNER') return <Navigate to="/" replace />;
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
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/public" element={<PublicPage />} />
        <Route
          path="/app/*"
          element={
            <RequireOwner>
              <OwnerApp />
            </RequireOwner>
          }
        />
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
          <Route path="lab-submissions" element={<LabSubmissionsPage />} />
          <Route
            path="lab-submissions/new"
            element={
              <RequireEditor>
                <LabSubmissionFormPage />
              </RequireEditor>
            }
          />
          <Route
            path="lab-submissions/:id/edit"
            element={
              <RequireEditor>
                <LabSubmissionFormPage />
              </RequireEditor>
            }
          />
          <Route path="lab-submissions/:id" element={<LabSubmissionDetailPage />} />
          <Route path="search" element={<Navigate to="/population" replace />} />
          <Route path="services" element={<ServicesPage />} />
          <Route path="vaccinations" element={<Navigate to="/services" replace />} />
          <Route path="monthly-report" element={<MonthlyReportPage />} />
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
          <Route
            path="audit-log"
            element={
              <RequireAuth admin>
                <AuditLogPage />
              </RequireAuth>
            }
          />
          <Route path="review" element={<ReviewPage />} />
          <Route path="messages" element={<MessagesPage />} />
          <Route path="zones" element={<ZonesPage />} />
          <Route path="vaccination-activities" element={<ActivitiesPage />} />
          <Route path="announcements" element={<AnnouncementsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
