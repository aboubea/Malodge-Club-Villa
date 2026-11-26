import { ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthGuard } from '../features/auth/AuthGuard';
import { AppShell } from '../components/layout/AppShell';
import { LoginPage } from '../features/auth/LoginPage';
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { VillasPage } from '../features/villas/VillasPage';
import { VillaDetailPage } from '../features/villas/VillaDetailPage';
import { ServicesPage } from '../features/services/ServicesPage';
import { UsersPage } from '../features/users/UsersPage';
import { CoherencePage } from '../features/coherence/CoherencePage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { OrdersPage } from '../features/orders/OrdersPage';
import { OrderDetailPage } from '../features/orders/OrderDetailPage';
import { FinancePage } from '../features/finance/FinancePage';
import { ChatPage } from '../features/chat/ChatPage';
import { AiConciergePage } from '../features/ai/AiConciergePage';
import { DocumentsPage } from '../features/documents/DocumentsPage';
import { NotificationsPage } from '../features/notifications/NotificationsPage';
import { ProvidersPage } from '../features/providers/ProvidersPage';
import { ReservationsPage } from '../features/reservations/ReservationsPage';
import { ServiceCataloguePage } from '../features/catalogue/ServiceCataloguePage';
import { CalendarPage } from '../features/calendar/CalendarPage';
import { ProviderConfirmPage } from '../features/confirm/ProviderConfirmPage';
import { ClientStaysPage } from '../features/stays/ClientStaysPage';
import { ExtrasPage } from '../features/extras/ExtrasPage';
import { MyAccountPage } from '../features/extras/MyAccountPage';
import { useAuthStore } from '../store/authStore';

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

export function AppRouter() {
  return (
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
                <Route path="/documents" element={<RoleGuard roles={STAFF}><DocumentsPage /></RoleGuard>} />
                <Route path="/messages" element={<RoleGuard roles={ALL_ROLES}><ChatPage /></RoleGuard>} />
                <Route path="/concierge-ia" element={<RoleGuard roles={ALL_ROLES}><AiConciergePage /></RoleGuard>} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/utilisateurs" element={<RoleGuard roles={ADMIN_UP}><UsersPage /></RoleGuard>} />
                <Route path="/controle" element={<RoleGuard roles={ADMIN_UP}><CoherencePage /></RoleGuard>} />
                <Route path="/parametres" element={<RoleGuard roles={STAFF}><SettingsPage /></RoleGuard>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AppShell>
          </AuthGuard>
        }
      />
    </Routes>
  );
}
