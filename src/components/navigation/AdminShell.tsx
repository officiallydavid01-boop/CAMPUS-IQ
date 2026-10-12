
import { useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  GraduationCap,
  BookOpen,
  Trophy,
  Swords,
  Users,
  Megaphone,
  Settings,
  LogOut,
  ArrowLeft,
  ClipboardCheck,
  Award,
  Target,
  Zap,
  Menu,
  X,
} from "lucide-react";
import { HolographicBrain } from "@/components/branding/HolographicBrain";
import { signOut } from "@/services/auth/authService";
import { ROUTES } from "@/app/router/routes";

const ADMIN_NAV = [
  { to: ROUTES.admin, label: "Dashboard", icon: LayoutDashboard },
  { to: ROUTES.adminInstitutions, label: "Academic structure", icon: GraduationCap },
  { to: ROUTES.adminCourses, label: "Courses & content", icon: BookOpen },
  { to: ROUTES.adminExams, label: "Exams", icon: ClipboardCheck },
  { to: ROUTES.adminExamReview, label: "Manual marking", icon: ClipboardCheck },
  { to: ROUTES.adminXp, label: "XP & levels", icon: Zap },
  { to: ROUTES.adminQuests, label: "Quests", icon: Target },
  { to: ROUTES.adminAchievements, label: "Achievements", icon: Award },
  { to: ROUTES.adminCompetitions, label: "Competitions", icon: Trophy },
  { to: ROUTES.adminTournaments, label: "Tournaments", icon: Swords },
  { to: ROUTES.adminUsers, label: "Users", icon: Users },
  { to: ROUTES.adminAnnouncements, label: "Announcements", icon: Megaphone },
  { to: ROUTES.adminSettings, label: "Platform settings", icon: Settings },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
    navigate(ROUTES.login, { replace: true });
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  const sidebar = (
    <>
      <div className="cluster" style={{ gap: "var(--space-3)" }}>
        <HolographicBrain size={32} animated={false} />
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: "var(--font-weight-semibold)" }}>
            CampusIQ
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            Admin
          </div>
        </div>
      </div>

      <NavLink
        to={ROUTES.dashboard}
        onClick={closeMenu}
        className="cluster"
        style={{ gap: "var(--space-2)", fontSize: "var(--text-sm)", color: "var(--text-muted)" }}
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Back to student app
      </NavLink>

      <nav className="stack" aria-label="Admin navigation" style={{ gap: "var(--space-1)" }}>
        {ADMIN_NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === ROUTES.admin}
            onClick={closeMenu}
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: "var(--space-3)",
              padding: "var(--space-3)",
              minHeight: "44px",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--text-sm)",
              color: isActive ? "var(--accent-cyan)" : "var(--text-secondary)",
              background: isActive ? "var(--bg-glass)" : "transparent",
              textDecoration: "none",
            })}
          >
            <Icon size={18} aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>

      <button
        onClick={handleSignOut}
        style={{
          marginTop: "auto",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          padding: "var(--space-3)",
          minHeight: "44px",
          background: "none",
          border: "none",
          color: "var(--text-secondary)",
          cursor: "pointer",
          font: "inherit",
          fontSize: "var(--text-sm)",
          textAlign: "left",
        }}
      >
        <LogOut size={18} aria-hidden="true" />
        Log out
      </button>
    </>
  );

  return (
    <div className="admin-responsive-shell">
      <header className="admin-mobile-header">
        <button
          type="button"
          className="admin-menu-button"
          onClick={() => setMenuOpen(true)}
          aria-label="Open admin menu"
          aria-expanded={menuOpen}
        >
          <Menu size={22} />
        </button>
        <div className="cluster" style={{ gap: "var(--space-2)" }}>
          <HolographicBrain size={28} animated={false} />
          <span style={{ fontFamily: "var(--font-display)", fontWeight: "var(--font-weight-semibold)" }}>
            CampusIQ
          </span>
        </div>
        <span className="admin-mobile-label">ADMIN</span>
      </header>

      <aside className="admin-desktop-sidebar">
        {sidebar}
      </aside>

      {menuOpen && (
        <div
          className="admin-menu-backdrop"
          onClick={closeMenu}
          aria-hidden="true"
        />
      )}

      <aside
        id="admin-mobile-menu"
        className={`admin-mobile-sidebar${menuOpen ? " is-open" : ""}`}
        aria-label="Admin menu"
        aria-hidden={!menuOpen}
        inert={!menuOpen}
      >
        <div className="admin-mobile-menu-top">
          <span style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
            ADMIN MENU
          </span>
          <button
            type="button"
            className="admin-menu-button"
            onClick={closeMenu}
            aria-label="Close admin menu"
          >
            <X size={22} />
          </button>
        </div>
        {sidebar}
      </aside>

      <main className="admin-responsive-main">
        {children}
      </main>

      <style>{`
        .admin-responsive-shell {
          min-height: 100vh;
          display: flex;
          width: 100%;
        }

        .admin-desktop-sidebar {
          width: var(--sidebar-width);
          flex: 0 0 var(--sidebar-width);
          display: flex;
          flex-direction: column;
          gap: var(--space-6);
          padding: var(--space-6);
          border-right: 1px solid var(--border-glass);
          align-self: flex-start;
          min-height: 100vh;
        }

        .admin-mobile-header {
          display: none;
        }

        .admin-menu-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          flex-shrink: 0;
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-md);
          background: var(--bg-glass);
          color: var(--text-primary);
          cursor: pointer;
        }

        .admin-responsive-main {
          flex: 1;
          min-width: 0;
        }

        .admin-mobile-sidebar,
        .admin-menu-backdrop {
          display: none;
        }

        @media (max-width: 767px) {
          .admin-responsive-shell {
            display: block;
          }

          .admin-desktop-sidebar {
            display: none;
          }

          .admin-mobile-header {
            position: sticky;
            top: 0;
            z-index: 40;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: var(--space-2);
            min-height: 60px;
            padding: var(--space-2) var(--space-3);
            background: var(--bg-surface);
            border-bottom: 1px solid var(--border-glass);
          }

          .admin-mobile-label {
            font-size: 10px;
            letter-spacing: 0.12em;
            color: var(--accent-cyan);
          }

          .admin-mobile-sidebar {
            display: flex;
            flex-direction: column;
            gap: var(--space-5);
            position: fixed;
            z-index: 60;
            top: 0;
            bottom: 0;
            left: 0;
            width: min(300px, 86vw);
            overflow-y: auto;
            overscroll-behavior: contain;
            padding: var(--space-4);
            padding-bottom: calc(var(--space-6) + var(--safe-bottom));
            background: var(--bg-primary);
            border-right: 1px solid var(--border-glass);
            transform: translateX(-105%);
            visibility: hidden;
            transition: transform 200ms ease, visibility 200ms ease;
          }

          .admin-mobile-sidebar.is-open {
            transform: translateX(0);
            visibility: visible;
          }

          .admin-menu-backdrop {
            display: block;
            position: fixed;
            inset: 0;
            z-index: 50;
            background: rgba(0, 0, 0, 0.65);
          }

          .admin-mobile-menu-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: var(--space-3);
          }

          .admin-responsive-main {
            width: 100%;
            min-width: 0;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .admin-mobile-sidebar {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}
