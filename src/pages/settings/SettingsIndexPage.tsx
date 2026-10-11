import { Link } from "react-router-dom";
import { GraduationCap, ChevronRight } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { ROUTES } from "@/app/router/routes";

/** Master Spec section 60. Only "Academic Profile" is wired up in Phase 1;
 * Appearance/Notifications/Study Preferences/Privacy/Data Usage land with
 * the phases that give them something real to configure. */
export function SettingsIndexPage() {
  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)", maxWidth: "640px" }}>
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-6)" }}>Settings</h1>
      <Link to={ROUTES.settingsAcademicProfile} style={{ textDecoration: "none" }}>
        <GlassCard interactive className="cluster" style={{ justifyContent: "space-between" }}>
          <div className="cluster" style={{ gap: "var(--space-3)" }}>
            <GraduationCap size={20} aria-hidden="true" />
            <div>
              <div style={{ color: "var(--text-primary)", fontWeight: "var(--font-weight-medium)" }}>Academic profile</div>
              <div style={{ fontSize: "var(--text-sm)" }}>Institution, programme, level, session &amp; semester</div>
            </div>
          </div>
          <ChevronRight size={18} aria-hidden="true" />
        </GlassCard>
      </Link>
    </div>
  );
}
