import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, GraduationCap, BookOpen, Trophy, Swords, Users, Megaphone, Settings, LogOut, ArrowLeft, ClipboardCheck, Award, Target, Zap } from "lucide-react";
import { HolographicBrain } from "@/components/branding/HolographicBrain";
import { signOut } from "@/services/auth/authService";
import { ROUTES } from "@/app/router/routes";

/**
 * Admin CMS shell (Master Spec section 80: "Do NOT mix Admin and Student
 * navigation"). Deliberately its own component tree, not a variant of
 * StudentShell. Every link below routes to a real path (see routes.tsx);
 * most render ComingSoonPage in this phase (Phase 3 builds the actual
 * CRUD screens) — see the Phase boundary note in the README.
 */
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

  async function handleSignOut() {
    await signOut();
    navigate(ROUTES.login, { replace: true });
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex" }}>
      <aside
        style={{
          width: "var(--sidebar-width)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-6)",
          padding: "var(--space-6)",
          borderRight: "1px solid var(--border-glass)",
          flexShrink: 0,
        }}
        className="scroll-x"
      >
        <div className="cluster" style={{ gap: "var(--space-3)" }}>
          <HolographicBrain size={32} animated={false} />
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: "var(--font-weight-semibold)" }}>CampusIQ</div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Admin</div>
          </div>
        </div>

        <NavLink to={ROUTES.dashboard} className="cluster" style={{ gap: "var(--space-2)", fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
          <ArrowLeft size={14} aria-hidden="true" /> Back to student app
        </NavLink>

        <nav className="stack" style={{ gap: "var(--space-1)" }}>
          {ADMIN_NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === ROUTES.admin}
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
                padding: "var(--space-2) var(--space-3)",
                borderRadius: "var(--radius-md)",
                fontSize: "var(--text-sm)",
                color: isActive ? "var(--accent-cyan)" : "var(--text-secondary)",
                background: isActive ? "var(--bg-glass)" : "transparent",
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
            padding: "var(--space-2) var(--space-3)",
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
      </aside>

      <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
    </div>
  );
}
