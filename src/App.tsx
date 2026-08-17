import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AppShell } from "./components/layout/AppShell";

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
  const { profile, loading, role } = useAuth();

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Loading…</div>;
  }
  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-center px-6 text-gray-400">
        No {role} account found yet — add one in Supabase (Authentication → Users → Add User, then set that
        user's role to "{role}" in the profiles table).
      </div>
    );
  }
  return <AppShell>{children}</AppShell>;
}

function RoleHome() {
  const { role } = useAuth();
  return <Navigate to={role === "supervisor" ? "/supervisor" : "/washer"} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
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
