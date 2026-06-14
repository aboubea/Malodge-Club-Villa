import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthGuard } from '../features/auth/AuthGuard';
import { AppShell } from '../components/layout/AppShell';
import { LoginPage } from '../features/auth/LoginPage';
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
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

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/mot-de-passe-oublie" element={<ForgotPasswordPage />} />
      <Route path="/reinitialiser-mot-de-passe" element={<ResetPasswordPage />} />
      <Route
        path="/*"
        element={
          <AuthGuard>
            <AppShell>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/villas" element={<VillasPage />} />
                <Route path="/villas/:id" element={<VillaDetailPage />} />
                <Route path="/services" element={<ServicesPage />} />
                <Route path="/utilisateurs" element={<UsersPage />} />
                <Route path="/parametres" element={<SettingsPage />} />
                <Route path="/commandes" element={<OrdersPage />} />
                <Route path="/commandes/:id" element={<OrderDetailPage />} />
                <Route path="/finances" element={<FinancePage />} />
                <Route path="/messages" element={<ChatPage />} />
                <Route path="/concierge-ia" element={<AiConciergePage />} />
                <Route path="/documents" element={<DocumentsPage />} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AppShell>
          </AuthGuard>
        }
      />
    </Routes>
  );
}
