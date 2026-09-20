import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { DashboardPage } from '@/pages/DashboardPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import { OrgTreePage } from '@/pages/OrgTreePage';
import { BranchesPage } from '@/pages/BranchesPage';
import { BranchFormPage } from '@/pages/BranchFormPage';
import { BranchMapPage } from '@/pages/BranchMapPage';
import { WorkingAreasPage } from '@/pages/WorkingAreasPage';
import { MemberAdmissionPage } from '@/pages/MemberAdmissionPage';
import { SamityMobilePage } from '@/pages/SamityMobilePage';
import { SavingsPage } from '@/pages/SavingsPage';

export default function App() {
  return (
    <Routes>
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="/members" element={<PlaceholderPage />} />
        <Route path="/members/new" element={<MemberAdmissionPage />} />
        <Route path="/samities" element={<SamityMobilePage />} />
        <Route path="/savings" element={<SavingsPage />} />
        <Route path="/loans" element={<PlaceholderPage />} />
        <Route path="/branches" element={<BranchesPage />} />
        <Route path="/branches/new" element={<BranchFormPage />} />
        <Route path="/organization" element={<OrgTreePage />} />
        <Route path="/working-areas" element={<WorkingAreasPage />} />
        <Route path="/map" element={<BranchMapPage />} />
        <Route path="/users" element={<PlaceholderPage />} />
        <Route path="/reports" element={<PlaceholderPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
