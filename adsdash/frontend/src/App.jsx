// ============================================================
// src/App.jsx — Rutas completas PTI Analytics
// ============================================================
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout            from './components/Layout';
import LoginPage         from './pages/LoginPage';
import AgencyHome        from './pages/AgencyHome';
import ClientPage        from './pages/ClientPage';
import ReportsPage       from './pages/ReportsPage';
import ReportEditor      from './pages/ReportEditor';
import ConnectionsPage   from './pages/ConnectionsPage';
import AIInsightsPage    from './pages/AIInsightsPage';
import UploadPage        from './pages/UploadPage';
import AdminPage         from './pages/AdminPage';
import SharedReportPage  from './pages/SharedReportPage';

function PrivateRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loader" />;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Públicas */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/share/:token" element={<SharedReportPage />} />

          {/* Protegidas */}
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<AgencyHome />} />

            {/* Por cliente */}
            <Route path="clients/:clientId" element={<ClientPage />} />
            <Route path="clients/:clientId/connections" element={<ConnectionsPage />} />
            <Route path="clients/:clientId/ai-insights" element={<AIInsightsPage />} />
            <Route path="clients/:clientId/upload" element={<UploadPage />} />

            {/* Reportes */}
            <Route path="reports" element={<ReportsPage />} />
            <Route path="reports/:reportId/edit" element={<ReportEditor />} />

            {/* Admin */}
            <Route path="admin" element={
              <PrivateRoute adminOnly><AdminPage /></PrivateRoute>
            } />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
