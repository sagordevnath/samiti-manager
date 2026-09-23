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
import { SharesPage } from '@/pages/SharesPage';
import { PassbookPage } from '@/pages/PassbookPage';
import { LoansPage } from '@/pages/LoansPage';
import { LoanApplyPage } from '@/pages/LoanApplyPage';
import { LoanDetailPage } from '@/pages/LoanDetailPage';
import { LoanProductsPage } from '@/pages/LoanProductsPage';
import { ProposalPage } from '@/pages/ProposalPage';
import { DisbursementPage } from '@/pages/DisbursementPage';
import { CollectionSheetPage } from '@/pages/CollectionSheetPage';
import { CashHandoverPage } from '@/pages/CashHandoverPage';
import { ReceiptPage } from '@/pages/ReceiptPage';
import { AccountingPage } from '@/pages/AccountingPage';
import { AccountingVoucherPrintPage } from '@/pages/AccountingVoucherPrintPage';
import { HrPage } from '@/pages/HrPage';
import { DelinquencyPage } from '@/pages/DelinquencyPage';
import { RecoveryPage } from '@/pages/RecoveryPage';
import { VoucherPage } from '@/pages/VoucherPage';
import { AgreementPage } from '@/pages/AgreementPage';

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
        <Route path="/savings/shares" element={<SharesPage />} />
        <Route path="/savings/passbook" element={<PassbookPage />} />
        <Route path="/loans" element={<LoansPage />} />
        <Route path="/loans/new" element={<LoanApplyPage />} />
        <Route path="/loans/products" element={<LoanProductsPage />} />
        <Route path="/loans/disbursements" element={<DisbursementPage />} />
        <Route path="/collection" element={<CollectionSheetPage />} />
        <Route path="/collection/cash" element={<CashHandoverPage />} />
        <Route path="/collection/receipt/:idempotencyKey" element={<ReceiptPage />} />
        <Route path="/delinquency" element={<DelinquencyPage />} />
        <Route path="/delinquency/recovery" element={<RecoveryPage />} />
        <Route path="/accounting" element={<AccountingPage />} />
        <Route path="/accounting/vouchers/:voucherId/print" element={<AccountingVoucherPrintPage />} />
        <Route path="/hr" element={<HrPage />} />
        <Route path="/loans/disbursements/:applicationId/voucher" element={<VoucherPage />} />
        <Route path="/loans/disbursements/:applicationId/agreement" element={<AgreementPage />} />
        <Route path="/loans/:id" element={<LoanDetailPage />} />
        <Route path="/loans/:id/proposal" element={<ProposalPage />} />
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
