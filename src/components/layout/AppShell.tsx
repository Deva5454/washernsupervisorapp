import { type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Bell, Home, CalendarDays, Wallet, Package, MoreHorizontal, LayoutGrid, ClipboardCheck, AlertTriangle, TrendingUp } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

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
  const { profile } = useAuth();
  const nav = profile?.role === "supervisor" ? supervisorNav : washerNav;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-gray-900 text-white px-4 pt-5 pb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold">
            CleanCar<span className="text-blue-500">.</span>
          </h1>
          <Bell className="h-5 w-5 text-white/80" />
        </div>
      </div>

      <div className="pb-24">{children}</div>

      {/* Bottom nav */}
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
