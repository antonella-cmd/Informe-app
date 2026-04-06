// ============================================================
// src/App.jsx  — Root with routing
// ============================================================
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout        from './components/Layout';
import LoginPage     from './pages/LoginPage';
import AgencyHome    from './pages/AgencyHome';
import ClientPage    from './pages/ClientPage';
import ReportsPage   from './pages/ReportsPage';
import ReportEditor  from './pages/ReportEditor';
import ConnectionsPage from './pages/ConnectionsPage';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loader" />;
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index                         element={<AgencyHome />} />
            <Route path="clients/:clientId"      element={<ClientPage />} />
            <Route path="clients/:clientId/connections" element={<ConnectionsPage />} />
            <Route path="reports"                element={<ReportsPage />} />
            <Route path="reports/:reportId/edit" element={<ReportEditor />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
