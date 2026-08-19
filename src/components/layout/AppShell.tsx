import { type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Bell, Home, CalendarDays, Wallet, Package, MoreHorizontal, LayoutGrid, ClipboardCheck, AlertTriangle, TrendingUp } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import type { Role } from "../../lib/types";

interface NavItem {
  to: string;
  label: string;
  icon: typeof Home;
}

const washerNav: NavItem[] = [
  { to: "/washer", label: "Home", icon: Home },
  { to: "/washer/jobs", label: "Jobs", icon: CalendarDays },
  { to: "/washer/earnings", label: "Earnings", icon: Wallet },
  { to: "/washer/stock", label: "Stock", icon: Package },
  { to: "/washer/more", label: "More", icon: MoreHorizontal },
];

const supervisorNav: NavItem[] = [
  { to: "/supervisor", label: "Dashboard", icon: LayoutGrid },
  { to: "/supervisor/audit", label: "Audit", icon: ClipboardCheck },
  { to: "/supervisor/alerts", label: "Alerts", icon: AlertTriangle },
  { to: "/supervisor/incentive", label: "Incentive", icon: TrendingUp },
  { to: "/supervisor/more", label: "More", icon: MoreHorizontal },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { role, switchRole } = useAuth();
  const navigate = useNavigate();
  const nav = role === "supervisor" ? supervisorNav : washerNav;

  function selectRole(next: Role) {
    if (next === role) return;
    switchRole(next);
    navigate(next === "supervisor" ? "/supervisor" : "/washer");
  }

  return (
    // Full-viewport neutral backdrop so a wide/desktop browser doesn't
    // stretch the mobile layout edge to edge — the real content stays in
    // a max-w-md column, like a phone screen centered in the browser. On
    // an actual phone (viewport already narrow) this backdrop is
    // invisible and costs nothing; max-w-md is wider than any phone.
    <div className="min-h-screen bg-gray-200">
      <div className="max-w-md mx-auto min-h-screen bg-gray-50 shadow-xl">
        {/* Top bar */}
        <div className="bg-gray-900 text-white px-4 pt-5 pb-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-extrabold">
              CleanCar<span className="text-blue-500">.</span>
            </h1>
            <Bell className="h-5 w-5 text-white/80" />
          </div>

          {/* Role toggle — a local view switch, not a login */}
          <div className="flex rounded-full border border-white/20 p-1">
            <button
              onClick={() => selectRole("washer")}
              className={`flex-1 rounded-full py-1.5 text-sm font-bold transition-colors ${
                role === "washer" ? "bg-blue-600 text-white" : "text-white/70"
              }`}
            >
              Car Washer
            </button>
            <button
              onClick={() => selectRole("supervisor")}
              className={`flex-1 rounded-full py-1.5 text-sm font-bold transition-colors ${
                role === "supervisor" ? "bg-blue-600 text-white" : "text-white/70"
              }`}
            >
              Supervisor
            </button>
          </div>
        </div>

        <div className="pb-24">{children}</div>
      </div>

      {/* Bottom nav — its own fixed bar spanning the real viewport (not
          the card above), with its content constrained+centered to the
          same max-w-md so it lines up under the card on wide screens,
          and stays pinned to the bottom while the card's content
          scrolls, exactly like a real phone's tab bar. */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
        <div className="grid grid-cols-5 h-16 max-w-md mx-auto">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/washer" || to === "/supervisor"}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 ${
                  isActive ? "text-blue-600" : "text-gray-400"
                }`
              }
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
