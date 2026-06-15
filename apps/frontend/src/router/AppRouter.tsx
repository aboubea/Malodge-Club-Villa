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
import { SettingsPage } from '../features/settings/SettingsPage';
import { OrdersPage } from '../features/orders/OrdersPage';
import { OrderDetailPage } from '../features/orders/OrderDetailPage';
import { FinancePage } from '../features/finance/FinancePage';
import { ChatPage } from '../features/chat/ChatPage';
import { AiConciergePage } from '../features/ai/AiConciergePage';
import { DocumentsPage } from '../features/documents/DocumentsPage';
import { NotificationsPage } from '../features/notifications/NotificationsPage';
import { useAuthStore } from '../store/authStore';

const STAFF = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'];
const ADMIN_UP = ['SUPER_ADMIN', 'ADMIN'];

function RoleGuard({ roles, children, fallback = '/villas' }: {
  roles: string[];
  children: ReactNode;
  fallback?: string;
}) {
  const { user } = useAuthStore();
  const role = user?.role || '';
  if (!roles.includes(role)) return <Navigate to={fallback} replace />;
  return <>{children}</>;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/inscription" element={<RegisterPage />} />
      <Route path="/mot-de-passe-oublie" element={<ForgotPasswordPage />} />
      <Route path="/reinitialiser-mot-de-passe" element={<ResetPasswordPage />} />
      <Route
        path="/*"
        element={
          <AuthGuard>
            <AppShell>
              <Routes>
                <Route path="/" element={<RoleGuard roles={STAFF}><DashboardPage /></RoleGuard>} />
                <Route path="/villas" element={<VillasPage />} />
                <Route path="/villas/:id" element={<VillaDetailPage />} />
                <Route path="/services" element={<ServicesPage />} />
                <Route path="/commandes" element={<OrdersPage />} />
                <Route path="/commandes/:id" element={<OrderDetailPage />} />
                <Route path="/finances" element={<RoleGuard roles={STAFF}><FinancePage /></RoleGuard>} />
                <Route path="/documents" element={<RoleGuard roles={STAFF}><DocumentsPage /></RoleGuard>} />
                <Route path="/messages" element={<ChatPage />} />
                <Route path="/concierge-ia" element={<AiConciergePage />} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/utilisateurs" element={<RoleGuard roles={ADMIN_UP}><UsersPage /></RoleGuard>} />
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
