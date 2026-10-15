import type { ReactNode, CSSProperties } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Home,
  BookOpen,
  PencilLine,
  Trophy,
  User,
  LogOut,
  ShieldCheck,
  Bell,
} from "lucide-react";
import { HolographicBrain } from "@/components/branding/HolographicBrain";
import { useAuth } from "@/app/providers/AuthProvider";
import { signOut } from "@/services/auth/authService";
import { ROUTES } from "@/app/router/routes";

/**
 * Student app shell:
 * - Mobile: five-item bottom navigation.
 * - Desktop/tablet: persistent sidebar.
 * - Authorized staff: Admin shortcut on mobile and desktop.
 *
 * Admin access is still protected by AdminRoute and backend permissions.
 */
const NAV_ITEMS = [
  { to: ROUTES.dashboard, label: "Home", icon: Home },
  { to: ROUTES.courses, label: "Courses", icon: BookOpen },
  { to: ROUTES.practice, label: "Practice", icon: PencilLine },
  { to: ROUTES.competitions, label: "Compete", icon: Trophy },
  { to: ROUTES.profile, label: "Profile", icon: User },
];

export function StudentShell({ children }: { children: ReactNode }) {
  const { isStaff } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate(ROUTES.login, { replace: true });
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex" }}>
      {/* Desktop / tablet persistent sidebar */}
      <aside
        className="student-sidebar"
        style={{
          width: "var(--sidebar-width)",
          display: "none",
          flexDirection: "column",
          gap: "var(--space-6)",
          padding: "var(--space-6)",
          borderRight: "1px solid var(--border-glass)",
        }}
      >
        <div className="cluster" style={{ gap: "var(--space-3)" }}>
          <HolographicBrain size={32} animated={false} />
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: "var(--font-weight-semibold)",
            }}
          >
            CampusIQ
          </span>
        </div>

        <nav className="stack" style={{ gap: "var(--space-1)" }}>
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              style={({ isActive }) => ({
                ...sidebarLinkStyle,
                color: isActive
                  ? "var(--accent-cyan)"
                  : sidebarLinkStyle.color,
                background: isActive ? "var(--bg-glass)" : "transparent",
              })}
            >
              <Icon size={18} aria-hidden="true" />
              {label}
            </NavLink>
          ))}

          <NavLink
            to={ROUTES.notifications}
            style={({ isActive }) => ({
              ...sidebarLinkStyle,
              color: isActive
                ? "var(--accent-cyan)"
                : sidebarLinkStyle.color,
              background: isActive ? "var(--bg-glass)" : "transparent",
            })}
          >
            <Bell size={18} aria-hidden="true" />
            Notifications
          </NavLink>

          {isStaff && (
            <NavLink
              to={ROUTES.admin}
              style={({ isActive }) => ({
                ...sidebarLinkStyle,
                color: isActive
                  ? "var(--accent-cyan)"
                  : sidebarLinkStyle.color,
                background: isActive ? "var(--bg-glass)" : "transparent",
              })}
            >
              <ShieldCheck size={18} aria-hidden="true" />
              Admin
            </NavLink>
          )}
        </nav>

        <button
          onClick={handleSignOut}
          className="sidebar-link"
          style={{
            ...sidebarLinkStyle,
            marginTop: "auto",
            background: "none",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
            font: "inherit",
          }}
        >
          <LogOut size={18} aria-hidden="true" />
          Log out
        </button>
      </aside>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        {/* Top shortcuts: available on mobile and desktop */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: "var(--space-2)",
            padding: "var(--space-2) var(--space-4) 0",
            flexWrap: "wrap",
          }}
        >
          {isStaff && (
            <button
              type="button"
              onClick={() => navigate(ROUTES.admin)}
              aria-label="Open admin dashboard"
              style={shortcutButtonStyle}
            >
              <ShieldCheck size={17} aria-hidden="true" />
              <span style={{ fontSize: "var(--text-xs)" }}>Admin</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => navigate(ROUTES.notifications)}
            aria-label="Open notifications"
            style={shortcutButtonStyle}
          >
            <Bell size={17} aria-hidden="true" />
            <span style={{ fontSize: "var(--text-xs)" }}>
              Notifications
            </span>
          </button>
        </div>

        <main
          style={{
            flex: 1,
            paddingBottom:
              "calc(var(--bottom-nav-height) + var(--safe-bottom) + var(--space-4))",
          }}
        >
          {children}
        </main>

        {/* Mobile bottom nav: keep the original five items */}
        <nav
          className="mobile-bottom-nav"
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "space-around",
            alignItems: "center",
            height: "var(--bottom-nav-height)",
            paddingBottom: "var(--safe-bottom)",
            background: "var(--bg-surface)",
            borderTop: "1px solid var(--border-glass)",
            zIndex: "var(--z-sticky)" as unknown as number,
          }}
          aria-label="Primary"
        >
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              style={({ isActive }) => ({
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "2px",
                fontSize: "var(--text-xs)",
                color: isActive
                  ? "var(--accent-cyan)"
                  : "var(--text-muted)",
                padding: "var(--space-2)",
              })}
            >
              <Icon size={20} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>

      <style>{`
        @media (min-width: 768px) {
          .student-sidebar {
            display: flex !important;
          }

          .mobile-bottom-nav {
            display: none !important;
          }

          main {
            padding-bottom: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}

const shortcutButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--space-2)",
  minHeight: "40px",
  border: "1px solid var(--border-glass)",
  borderRadius: "var(--radius-md)",
  padding: "var(--space-2) var(--space-3)",
  background: "var(--bg-glass)",
  color: "var(--text-secondary)",
  cursor: "pointer",
  font: "inherit",
};

const sidebarLinkStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-3)",
  padding: "var(--space-2) var(--space-3)",
  borderRadius: "var(--radius-md)",
  color: "var(--text-secondary)",
  fontSize: "var(--text-sm)",
};