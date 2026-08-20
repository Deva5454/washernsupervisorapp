import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AppShell } from "./components/layout/AppShell";

import WasherHome from "./pages/washer/Home";
import WasherJobs from "./pages/washer/Jobs";
import ActiveWash from "./pages/washer/ActiveWash";
import WasherEarnings from "./pages/washer/Earnings";
import WasherStock from "./pages/washer/Stock";
import WasherMore from "./pages/washer/More";
import WasherDaySummary from "./pages/washer/DaySummary";
import Notifications from "./pages/Notifications";
import Track from "./pages/Track";

import SupervisorDashboard from "./pages/supervisor/Dashboard";
import SupervisorAudit from "./pages/supervisor/Audit";
import SupervisorAlerts from "./pages/supervisor/Alerts";
import SupervisorIncentive from "./pages/supervisor/Incentive";
import SupervisorMore from "./pages/supervisor/More";

function Gate({ children }: { children: React.ReactNode }) {
  const { profile, loading, role } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-200 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-4 border-brand/20 border-t-brand animate-spin" />
          <p className="text-gray-400 text-sm font-semibold">Loading CleanCar…</p>
        </div>
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-200 flex items-center justify-center px-6">
        <div className="max-w-sm w-full rounded-3xl bg-white shadow-sm border border-gray-200 px-6 py-8 text-center">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-brand/10 flex items-center justify-center mb-4">
            <span className="text-brand text-xl font-extrabold">!</span>
          </div>
          <p className="font-extrabold text-gray-900 mb-1">No {role} account found yet</p>
          <p className="text-sm text-gray-500">
            Add one in Supabase (Authentication → Users → Add User, then set that user's role to "{role}" in
            the profiles table).
          </p>
        </div>
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
          <Route path="/notifications" element={<Gate><Notifications /></Gate>} />
          <Route path="/track/:jobId" element={<Track />} />

          <Route path="/washer" element={<Gate><WasherHome /></Gate>} />
          <Route path="/washer/jobs" element={<Gate><WasherJobs /></Gate>} />
          <Route path="/washer/active-wash/:jobId" element={<Gate><ActiveWash /></Gate>} />
          <Route path="/washer/earnings" element={<Gate><WasherEarnings /></Gate>} />
          <Route path="/washer/stock" element={<Gate><WasherStock /></Gate>} />
          <Route path="/washer/more" element={<Gate><WasherMore /></Gate>} />
          <Route path="/washer/day-summary" element={<Gate><WasherDaySummary /></Gate>} />

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
