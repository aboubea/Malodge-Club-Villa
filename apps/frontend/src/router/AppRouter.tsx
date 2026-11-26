import { ReactNode, Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthGuard } from '../features/auth/AuthGuard';
import { AppShell } from '../components/layout/AppShell';
import { LoginPage } from '../features/auth/LoginPage';
import { useAuthStore } from '../store/authStore';

// Each page is loaded when first opened: the first screen downloads far less code.
const ForgotPasswordPage = lazy(() => import('../features/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('../features/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })));
const RegisterPage = lazy(() => import('../features/auth/RegisterPage').then((m) => ({ default: m.RegisterPage })));
const DashboardPage = lazy(() => import('../features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const VillasPage = lazy(() => import('../features/villas/VillasPage').then((m) => ({ default: m.VillasPage })));
const VillaDetailPage = lazy(() => import('../features/villas/VillaDetailPage').then((m) => ({ default: m.VillaDetailPage })));
const ServicesPage = lazy(() => import('../features/services/ServicesPage').then((m) => ({ default: m.ServicesPage })));
const UsersPage = lazy(() => import('../features/users/UsersPage').then((m) => ({ default: m.UsersPage })));
const CoherencePage = lazy(() => import('../features/coherence/CoherencePage').then((m) => ({ default: m.CoherencePage })));
const SettingsPage = lazy(() => import('../features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const OrdersPage = lazy(() => import('../features/orders/OrdersPage').then((m) => ({ default: m.OrdersPage })));
const OrderDetailPage = lazy(() => import('../features/orders/OrderDetailPage').then((m) => ({ default: m.OrderDetailPage })));
const FinancePage = lazy(() => import('../features/finance/FinancePage').then((m) => ({ default: m.FinancePage })));
const PerformancePage = lazy(() => import('../features/finance/PerformancePage').then((m) => ({ default: m.PerformancePage })));
const OwnerStatementsPage = lazy(() => import('../features/finance/OwnerStatementsPage').then((m) => ({ default: m.OwnerStatementsPage })));
const ChatPage = lazy(() => import('../features/chat/ChatPage').then((m) => ({ default: m.ChatPage })));
const AiConciergePage = lazy(() => import('../features/ai/AiConciergePage').then((m) => ({ default: m.AiConciergePage })));
const DocumentsPage = lazy(() => import('../features/documents/DocumentsPage').then((m) => ({ default: m.DocumentsPage })));
const NotificationsPage = lazy(() => import('../features/notifications/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const ProvidersPage = lazy(() => import('../features/providers/ProvidersPage').then((m) => ({ default: m.ProvidersPage })));
const ReservationsPage = lazy(() => import('../features/reservations/ReservationsPage').then((m) => ({ default: m.ReservationsPage })));
const ServiceCataloguePage = lazy(() => import('../features/catalogue/ServiceCataloguePage').then((m) => ({ default: m.ServiceCataloguePage })));
const CalendarPage = lazy(() => import('../features/calendar/CalendarPage').then((m) => ({ default: m.CalendarPage })));
const ProviderConfirmPage = lazy(() => import('../features/confirm/ProviderConfirmPage').then((m) => ({ default: m.ProviderConfirmPage })));
const ClientStaysPage = lazy(() => import('../features/stays/ClientStaysPage').then((m) => ({ default: m.ClientStaysPage })));
const ExtrasPage = lazy(() => import('../features/extras/ExtrasPage').then((m) => ({ default: m.ExtrasPage })));
const MyAccountPage = lazy(() => import('../features/extras/MyAccountPage').then((m) => ({ default: m.MyAccountPage })));

const STAFF = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'];
const ADMIN_UP = ['SUPER_ADMIN', 'ADMIN'];
const ALL_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'PROVIDER', 'CLIENT'];
/** Owners and employees only have their extras account (and notifications). */
const RESTRICTED = ['OWNER', 'EMPLOYEE'];
const ACCOUNT_HOLDERS = ['CLIENT', 'PROVIDER', 'OWNER', 'EMPLOYEE'];

function RoleGuard({ roles, children, fallback = '/villas' }: {
  roles: string[];
  children: ReactNode;
  fallback?: string;
}) {
  const { user } = useAuthStore();
  const role = user?.role || '';
  if (!roles.includes(role)) return <Navigate to={RESTRICTED.includes(role) ? '/mon-compte' : fallback} replace />;
  return <>{children}</>;
}

/** Shown for the instant a page's code is being fetched. */
function PageFallback() {
  return (
    <div className="space-y-4 max-w-[1400px] animate-pulse" aria-busy="true" aria-label="Chargement">
      <div className="h-8 w-56 rounded-xl bg-surface-2" />
      <div className="h-4 w-80 rounded-lg bg-surface-2" />
      <div className="h-64 rounded-2xl bg-surface-2" />
    </div>
  );
}

export function AppRouter() {
  return (
    <Suspense fallback={<PageFallback />}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/inscription" element={<RegisterPage />} />
      <Route path="/mot-de-passe-oublie" element={<ForgotPasswordPage />} />
      <Route path="/reinitialiser-mot-de-passe" element={<ResetPasswordPage />} />
      <Route path="/confirmer" element={<ProviderConfirmPage />} />
      <Route
        path="/*"
        element={
          <AuthGuard>
            <AppShell>
              <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/" element={<RoleGuard roles={STAFF} fallback="/catalogue"><DashboardPage /></RoleGuard>} />
                <Route path="/reservations" element={<RoleGuard roles={STAFF}><ReservationsPage /></RoleGuard>} />
                <Route path="/mes-sejours" element={<RoleGuard roles={['CLIENT']} fallback="/"><ClientStaysPage /></RoleGuard>} />
                <Route path="/catalogue" element={<RoleGuard roles={ALL_ROLES}><ServiceCataloguePage /></RoleGuard>} />
                <Route path="/extras/*" element={<RoleGuard roles={STAFF}><ExtrasPage /></RoleGuard>} />
                <Route path="/mon-compte" element={<RoleGuard roles={ACCOUNT_HOLDERS} fallback="/extras"><MyAccountPage /></RoleGuard>} />
                <Route path="/agenda" element={<RoleGuard roles={STAFF}><CalendarPage /></RoleGuard>} />
                <Route path="/villas" element={<RoleGuard roles={STAFF} fallback="/catalogue"><VillasPage /></RoleGuard>} />
                <Route path="/villas/:id" element={<RoleGuard roles={STAFF} fallback="/catalogue"><VillaDetailPage /></RoleGuard>} />
                <Route path="/services" element={<RoleGuard roles={STAFF}><ServicesPage /></RoleGuard>} />
                <Route path="/commandes" element={<RoleGuard roles={ALL_ROLES}><OrdersPage /></RoleGuard>} />
                <Route path="/commandes/:id" element={<RoleGuard roles={ALL_ROLES}><OrderDetailPage /></RoleGuard>} />
                <Route path="/prestataires" element={<RoleGuard roles={STAFF}><ProvidersPage /></RoleGuard>} />
                <Route path="/finances" element={<RoleGuard roles={STAFF}><FinancePage /></RoleGuard>} />
                <Route path="/performance" element={<RoleGuard roles={STAFF}><PerformancePage /></RoleGuard>} />
                <Route path="/releves" element={<RoleGuard roles={ADMIN_UP}><OwnerStatementsPage /></RoleGuard>} />
                <Route path="/documents" element={<RoleGuard roles={STAFF}><DocumentsPage /></RoleGuard>} />
                <Route path="/messages" element={<RoleGuard roles={ALL_ROLES}><ChatPage /></RoleGuard>} />
                <Route path="/concierge-ia" element={<RoleGuard roles={ALL_ROLES}><AiConciergePage /></RoleGuard>} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/utilisateurs" element={<RoleGuard roles={ADMIN_UP}><UsersPage /></RoleGuard>} />
                <Route path="/controle" element={<RoleGuard roles={ADMIN_UP}><CoherencePage /></RoleGuard>} />
                <Route path="/parametres" element={<RoleGuard roles={STAFF}><SettingsPage /></RoleGuard>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              </Suspense>
            </AppShell>
          </AuthGuard>
        }
      />
    </Routes>
    </Suspense>
  );
}
