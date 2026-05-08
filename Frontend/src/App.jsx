import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import AdminConsoleDashboard from './pages/AdminConsoleDashboard';
import SubmitNote from './pages/SubmitNote';
import NoteDetail from './pages/NoteDetail';
import Login from './pages/Login';
import AdminAuditLogs from './pages/AdminAuditLogs';
import AdminBanks from './pages/AdminBanks';
import AdminBankTechnical from './pages/AdminBankTechnical';
import AdminBranches from './pages/AdminBranches';
import AdminCities from './pages/AdminCities';
import Profile from './pages/Profile';
import FirstLogin from './pages/FirstLogin';
import AdminUserManagement from './pages/AdminUserManagement';
import AdminFmsRoles from './pages/AdminFmsRoles';
import ForgotPassword from './pages/ForgotPassword';
import FmsWorkspace from './pages/FmsWorkspace';
import FmsDocumentDetail from './pages/FmsDocumentDetail';
import AdminOperations from './pages/AdminOperations';
import { useAuth } from './context/AuthContext';
import { getDefaultHomePath, isAdminConsoleUser } from './utils/homeNavigation';
import { hasGrantedInboxOnlyAccess } from './utils/fmsNavigation';

const ProtectedRoute = ({ children, allowedRoles = [] }) => {
  const { user, loading, mustChangePassword } = useAuth();
  if (loading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  if (mustChangePassword) return <Navigate to="/first-login" />;
  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" />;
  }
  return <Layout>{children}</Layout>;
};

const DashboardEntry = () => {
  const { user } = useAuth();
  if (hasGrantedInboxOnlyAccess(user)) {
    return <Navigate to="/fms/inbox" replace />;
  }
  if (isAdminConsoleUser(user)) {
    return <Navigate to={getDefaultHomePath(user)} replace />;
  }
  return <Dashboard />;
};

const FmsEntry = () => {
  const { user } = useAuth();
  const fmsPermissions = new Set(user?.fms_permissions || []);
  const isAdminOperator = ['ADMIN', 'SUPER_ADMIN'].includes(user?.role);
  const canUseAccessDesk = fmsPermissions.has('FMS_SHARE')
    || fmsPermissions.has('FMS_REVOKE')
    || fmsPermissions.has('FMS_PUBLISH');
  const canUseRoleDesk = isAdminOperator;

  if (hasGrantedInboxOnlyAccess(user)) {
    return <Navigate to="/fms/inbox" replace />;
  }
  if (canUseRoleDesk) {
    return <Navigate to="/fms/roles" replace />;
  }
  if (canUseAccessDesk) {
    return <Navigate to="/fms/access" replace />;
  }
  if (fmsPermissions.has('FMS_UPLOAD')) {
    return <Navigate to="/fms/upload" replace />;
  }
  return <Navigate to="/fms/register" replace />;
};

const FmsRegisterPage = () => <FmsWorkspace section="register" />;
const FmsInboxPage = () => <FmsWorkspace section="inbox" />;
const FmsAdminPage = () => <FmsWorkspace section="admin" />;
const FmsUploadPage = () => <FmsWorkspace section="upload" />;
const FmsLibraryPage = () => <FmsWorkspace section="library" />;
const FmsAccessPage = () => <FmsWorkspace section="access" />;

const App = () => {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/login/otp" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/first-login" element={<FirstLogin />} />
        
        <Route path="/dashboard" element={
            <ProtectedRoute><DashboardEntry /></ProtectedRoute>
        } />
        <Route path="/admin/dashboard" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'SUPER_ADMIN']}><AdminConsoleDashboard /></ProtectedRoute>
        } />
        
        <Route path="/submit" element={
            <ProtectedRoute allowedRoles={['INITIATOR']}><SubmitNote /></ProtectedRoute>
        } />
        
        <Route path="/note/:id" element={
            <ProtectedRoute><NoteDetail /></ProtectedRoute>
        } />
        <Route path="/admin/banks" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'SUPER_ADMIN']}><AdminBanks /></ProtectedRoute>
        } />
        <Route path="/admin/banks/:id/technical" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'SUPER_ADMIN']}><AdminBankTechnical /></ProtectedRoute>
        } />
        <Route path="/admin/cities" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'SUPER_ADMIN']}><AdminCities /></ProtectedRoute>
        } />
        <Route path="/admin/branches" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'SUPER_ADMIN']}><AdminBranches /></ProtectedRoute>
        } />
        <Route path="/admin/audit" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'SUPER_ADMIN', 'AUDITOR']}><AdminAuditLogs /></ProtectedRoute>
        } />
        <Route path="/admin/fms-audit" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'SUPER_ADMIN']}><AdminAuditLogs initialSurface="fms" lockedSurface fmsSourceOrigin="MANUAL" pageTitle="FMS Library Audit Logs" pageDescription="Separate bank-side FMS-only audit for manual library records, controlled-copy downloads, opens, and release events." /></ProtectedRoute>
        } />
        <Route path="/admin/dms-archive-audit" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'SUPER_ADMIN']}><AdminAuditLogs initialSurface="fms" lockedSurface fmsSourceOrigin="DMS" pageTitle="DMS Archive Audit Logs" pageDescription="Separate bank-side audit for DMS files that were archived into FMS backup custody and later opened or downloaded." /></ProtectedRoute>
        } />
        <Route path="/admin/operations" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'SUPER_ADMIN']}><AdminOperations /></ProtectedRoute>
        } />
        <Route path="/admin/users" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'SUPER_ADMIN']}><AdminUserManagement /></ProtectedRoute>
        } />
        <Route path="/fms/roles" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'SUPER_ADMIN']}><AdminFmsRoles /></ProtectedRoute>
        } />
        <Route path="/profile" element={
            <ProtectedRoute><Profile /></ProtectedRoute>
        } />
        <Route path="/fms" element={
            <ProtectedRoute><FmsEntry /></ProtectedRoute>
        } />
        <Route path="/fms/register" element={
            <ProtectedRoute><FmsRegisterPage /></ProtectedRoute>
        } />
        <Route path="/fms/inbox" element={
            <ProtectedRoute><FmsInboxPage /></ProtectedRoute>
        } />
        <Route path="/fms/document/:id" element={
            <ProtectedRoute><FmsDocumentDetail /></ProtectedRoute>
        } />
        <Route path="/fms/admin" element={
            <ProtectedRoute><FmsAdminPage /></ProtectedRoute>
        } />
        <Route path="/fms/upload" element={
            <ProtectedRoute><FmsUploadPage /></ProtectedRoute>
        } />
        <Route path="/fms/library" element={
            <ProtectedRoute><FmsLibraryPage /></ProtectedRoute>
        } />
        <Route path="/fms/access" element={
            <ProtectedRoute><FmsAccessPage /></ProtectedRoute>
        } />

        <Route path="/queues" element={<ProtectedRoute allowedRoles={['INITIATOR', 'RECOMMENDER', 'APPROVER']}><Dashboard showQueueSelector /></ProtectedRoute>} />
        <Route path="/queue/drafts" element={<ProtectedRoute allowedRoles={['INITIATOR', 'RECOMMENDER', 'APPROVER']}><Dashboard view="DRAFTS" /></ProtectedRoute>} />
        <Route path="/queue/incoming" element={<ProtectedRoute allowedRoles={['INITIATOR', 'RECOMMENDER', 'APPROVER']}><Dashboard view="INCOMING" /></ProtectedRoute>} />
        <Route path="/queue/sent" element={<ProtectedRoute allowedRoles={['INITIATOR', 'RECOMMENDER', 'APPROVER']}><Dashboard view="SENT" /></ProtectedRoute>} />
        <Route path="/queue/returned" element={<ProtectedRoute allowedRoles={['INITIATOR', 'RECOMMENDER', 'APPROVER']}><Dashboard view="RETURNED" /></ProtectedRoute>} />
        <Route path="/queue/history" element={<ProtectedRoute allowedRoles={['INITIATOR', 'RECOMMENDER', 'APPROVER']}><Dashboard view="HISTORY" /></ProtectedRoute>} />
        
        <Route path="/" element={<Navigate to="/login" />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </Router>
  );
};

export default App;
