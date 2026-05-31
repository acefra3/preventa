import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth.store';
import LoginPage        from './pages/LoginPage';
import RecoveryPage     from './pages/RecoveryPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import DashboardPage    from './pages/DashboardPage';
import ProposalsPage    from './pages/ProposalsPage';
import ProposalDetail   from './pages/ProposalDetail';
import KanbanPage       from './pages/KanbanPage';
import UsersPage        from './pages/UsersPage';
import NewOpportunityPage from './pages/NewOpportunityPage';
import PipelinePage from './pages/PipelinePage';
import AppLayout        from './components/shared/AppLayout';

function PrivateRoute({ children, roles }) {
  const { user, isAuthenticated } = useAuthStore();
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user?.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login"          element={<LoginPage />} />
      <Route path="/recovery"       element={<RecoveryPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route path="/" element={<PrivateRoute><AppLayout /></PrivateRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"  element={<DashboardPage />} />
        <Route path="proposals"  element={<ProposalsPage />} />
        <Route path="proposals/:id" element={<ProposalDetail />} />
        <Route path="kanban"     element={<KanbanPage />} />
        <Route path="users"      element={<PrivateRoute roles={['admin']}><UsersPage /></PrivateRoute>} />
        <Route path="nueva-oportunidad" element={<PrivateRoute roles={['admin','comercial']}><NewOpportunityPage /></PrivateRoute>} />
        <Route path="pipeline" element={<PipelinePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
