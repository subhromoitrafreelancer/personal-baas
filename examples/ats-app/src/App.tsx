import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Navigate, Route, BrowserRouter, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppShell } from '@/components/layout/app-shell';
import { RequireAuth } from '@/components/layout/require-auth';
import { AuthProvider } from '@/providers/auth-provider';
import { DashboardPage } from '@/routes/dashboard';
import { DepartmentsPage } from '@/routes/admin/departments';
import { UsersPage } from '@/routes/admin/users';
import { ApplicationDetailPage } from '@/routes/applications/detail';
import { CandidateDetailPage } from '@/routes/candidates/detail';
import { CandidatesListPage } from '@/routes/candidates/list';
import { ClientsPage } from '@/routes/clients';
import { JobDetailPage } from '@/routes/jobs/detail';
import { JobsListPage } from '@/routes/jobs/list';
import { LoginPage } from '@/routes/login';
import { PendingApprovalPage } from '@/routes/pending-approval';
import { RegisterPage } from '@/routes/register';
import { RequirementsPage } from '@/routes/requirements';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Toaster richColors position="top-right" />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/pending-approval"
              element={
                <RequireAuth allowPending>
                  <PendingApprovalPage />
                </RequireAuth>
              }
            />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <AppShell>
                    <DashboardPage />
                  </AppShell>
                </RequireAuth>
              }
            />
            <Route
              path="/admin/departments"
              element={
                <RequireAuth roles={['ADMIN']}>
                  <AppShell>
                    <DepartmentsPage />
                  </AppShell>
                </RequireAuth>
              }
            />
            <Route
              path="/admin/users"
              element={
                <RequireAuth roles={['ADMIN']}>
                  <AppShell>
                    <UsersPage />
                  </AppShell>
                </RequireAuth>
              }
            />
            <Route
              path="/clients"
              element={
                <RequireAuth roles={['BDE', 'ADMIN']}>
                  <AppShell>
                    <ClientsPage />
                  </AppShell>
                </RequireAuth>
              }
            />
            <Route
              path="/requirements"
              element={
                <RequireAuth roles={['BDE', 'ADMIN']}>
                  <AppShell>
                    <RequirementsPage />
                  </AppShell>
                </RequireAuth>
              }
            />
            <Route
              path="/jobs"
              element={
                <RequireAuth>
                  <AppShell>
                    <JobsListPage />
                  </AppShell>
                </RequireAuth>
              }
            />
            <Route
              path="/jobs/:id"
              element={
                <RequireAuth>
                  <AppShell>
                    <JobDetailPage />
                  </AppShell>
                </RequireAuth>
              }
            />
            <Route
              path="/candidates"
              element={
                <RequireAuth>
                  <AppShell>
                    <CandidatesListPage />
                  </AppShell>
                </RequireAuth>
              }
            />
            <Route
              path="/candidates/:id"
              element={
                <RequireAuth>
                  <AppShell>
                    <CandidateDetailPage />
                  </AppShell>
                </RequireAuth>
              }
            />
            <Route
              path="/applications/:id"
              element={
                <RequireAuth>
                  <AppShell>
                    <ApplicationDetailPage />
                  </AppShell>
                </RequireAuth>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
