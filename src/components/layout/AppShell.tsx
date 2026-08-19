import { type ReactNode, useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Bell, Home, CalendarDays, Wallet, Package, MoreHorizontal, LayoutGrid, ClipboardCheck, AlertTriangle, TrendingUp, X } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
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
  const { profile, role, switchRole, gpsLostNotice, dismissGpsLostNotice } = useAuth();
  const navigate = useNavigate();
  const nav = role === "supervisor" ? supervisorNav : washerNav;
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profile.id)
      .is("read_at", null)
      .then(({ count }) => {
        if (!cancelled) setUnreadCount(count ?? 0);
      });
    return () => {
      cancelled = true;
    };
    // Re-checked on every navigation (children change) so the badge
    // clears shortly after visiting Notifications, without a live
    // subscription.
  }, [profile, children]);

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
      {/* The card itself hugs its content (no min-h-screen) — a
          data-sparse page (few team members, no jobs yet) shouldn't
          trail off into a wall of empty card background. Any leftover
          space below simply shows the backdrop, same as a real phone
          app's content ending above its tab bar. */}
      <div className="max-w-md mx-auto bg-gray-50 shadow-xl">
        {/* Top bar — deep navy fading to the brand cerulean, standing in
            for the near-black header this used to be. */}
        <div className="bg-gradient-to-r from-navy to-brand text-white px-4 pt-5 pb-4 shadow-md">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-extrabold tracking-tight">
              CleanCar<span className="text-white/70">.</span>
            </h1>
            <button
              aria-label="Notifications"
              onClick={() => navigate("/notifications")}
              className="relative h-9 w-9 rounded-full bg-white/10 flex items-center justify-center"
            >
              <Bell className="h-4.5 w-4.5 text-white" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
          </div>

          {/* Role toggle — a local view switch, not a login. The active
              segment is solid white so it reads clearly against the blue
              gradient, rather than blending into it. */}
          <div className="flex rounded-full bg-white/10 border border-white/15 p-1">
            <button
              onClick={() => selectRole("washer")}
              className={`flex-1 rounded-full py-1.5 text-sm font-bold transition-colors ${
                role === "washer" ? "bg-white text-navy shadow-sm" : "text-white/90"
              }`}
            >
              Car Washer
            </button>
            <button
              onClick={() => selectRole("supervisor")}
              className={`flex-1 rounded-full py-1.5 text-sm font-bold transition-colors ${
                role === "supervisor" ? "bg-white text-navy shadow-sm" : "text-white/75"
              }`}
            >
              Supervisor
            </button>
          </div>
        </div>

        {gpsLostNotice && (
          <div className="mx-4 mt-4 rounded-2xl bg-red-50 border border-red-200 px-4 py-3 flex items-start gap-2">
            <p className="text-sm text-red-700 flex-1">{gpsLostNotice}</p>
            <button onClick={dismissGpsLostNotice} aria-label="Dismiss">
              <X className="h-4 w-4 text-red-400" />
            </button>
          </div>
        )}

        {/* Padding lives here, once, so every page (washer or
            supervisor) gets consistent edge spacing automatically —
            individual pages no longer need to remember their own
            px-4/pt-6. */}
        <div className="px-4 pt-6 pb-24">{children}</div>
      </div>

      {/* Bottom nav — its own fixed bar spanning the real viewport (not
          the card above), with its content constrained+centered to the
          same max-w-md so it lines up under the card on wide screens,
          and stays pinned to the bottom while the card's content
          scrolls, exactly like a real phone's tab bar. */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-2px_12px_rgba(11,61,87,0.06)] z-50">
        <div className="grid grid-cols-5 h-16 max-w-md mx-auto">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/washer" || to === "/supervisor"}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 ${
                  isActive ? "text-brand" : "text-gray-400"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`h-7 w-11 rounded-full flex items-center justify-center transition-colors ${
                      isActive ? "bg-brand/10" : ""
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </span>
                  <span className={`text-[10px] leading-none ${isActive ? "font-bold" : "font-medium"}`}>
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
