import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AppShell } from "./components/layout/AppShell";
import Login from "./pages/Login";

import WasherHome from "./pages/washer/Home";
import WasherJobs from "./pages/washer/Jobs";
import WasherEarnings from "./pages/washer/Earnings";
import WasherStock from "./pages/washer/Stock";
import WasherMore from "./pages/washer/More";

import SupervisorDashboard from "./pages/supervisor/Dashboard";
import SupervisorAudit from "./pages/supervisor/Audit";
import SupervisorAlerts from "./pages/supervisor/Alerts";
import SupervisorIncentive from "./pages/supervisor/Incentive";
import SupervisorMore from "./pages/supervisor/More";

function Gate({ children }: { children: React.ReactNode }) {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Loading…</div>;
  }
  if (!session) return <Navigate to="/login" replace />;
  if (!profile) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Setting up your account…</div>;
  }
  return <AppShell>{children}</AppShell>;
}

function RoleHome() {
  const { profile } = useAuth();
  return <Navigate to={profile?.role === "supervisor" ? "/supervisor" : "/washer"} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Gate><RoleHome /></Gate>} />

          <Route path="/washer" element={<Gate><WasherHome /></Gate>} />
          <Route path="/washer/jobs" element={<Gate><WasherJobs /></Gate>} />
          <Route path="/washer/earnings" element={<Gate><WasherEarnings /></Gate>} />
          <Route path="/washer/stock" element={<Gate><WasherStock /></Gate>} />
          <Route path="/washer/more" element={<Gate><WasherMore /></Gate>} />

          <Route path="/supervisor" element={<Gate><SupervisorDashboard /></Gate>} />
          <Route path="/supervisor/audit" element={<Gate><SupervisorAudit /></Gate>} />
          <Route path="/supervisor/alerts" element={<Gate><SupervisorAlerts /></Gate>} />
          <Route path="/supervisor/incentive" element={<Gate><SupervisorIncentive /></Gate>} />
          <Route path="/supervisor/more" element={<Gate><SupervisorMore /></Gate>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
