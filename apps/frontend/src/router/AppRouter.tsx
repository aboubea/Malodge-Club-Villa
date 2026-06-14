import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthGuard } from '../features/auth/AuthGuard';
import { AppShell } from '../components/layout/AppShell';
import { LoginPage } from '../features/auth/LoginPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { VillasPage } from '../features/villas/VillasPage';
import { VillaDetailPage } from '../features/villas/VillaDetailPage';
import { ServicesPage } from '../features/services/ServicesPage';
import { UsersPage } from '../features/users/UsersPage';
import { SettingsPage } from '../features/settings/SettingsPage';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
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
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AppShell>
          </AuthGuard>
        }
      />
    </Routes>
  );
}
