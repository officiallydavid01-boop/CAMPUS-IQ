import { useNavigate } from "react-router-dom";
import { HolographicBrain } from "@/components/branding/HolographicBrain";
import { GlassCard } from "@/components/ui/GlassCard";
import { AcademicContextForm } from "@/features/academic/AcademicContextForm";
import { useAuth } from "@/app/providers/AuthProvider";
import { updateCurrentAcademicContext, type AcademicContext } from "@/services/academic/academicService";
import { ROUTES } from "@/app/router/routes";

/**
 * First-time setup (Master Spec section 15). Collects the same seven
 * fields as "Change Academic Context" later (see
 * pages/settings/AcademicProfilePage.tsx) via the shared
 * AcademicContextForm — onboarding is just that form with nowhere to go
 * back to and a redirect to /dashboard on success.
 */
export function OnboardingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(context: AcademicContext) {
    if (!user) return;
    await updateCurrentAcademicContext(user.id, context);
    navigate(ROUTES.dashboard, { replace: true });
  }

  return (
    <div
      className="container"
      style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", paddingBlock: "var(--space-12)" }}
    >
      <div className="stack" style={{ alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-8)", textAlign: "center" }}>
        <HolographicBrain size={56} />
        <h1 style={{ fontSize: "var(--text-2xl)" }}>Set up your academic profile</h1>
        <p style={{ maxWidth: "48ch" }}>
          Tell us where you study so CampusIQ can show the right courses. You can change this any time from Settings.
        </p>
      </div>
      <GlassCard style={{ maxWidth: "560px", marginInline: "auto", width: "100%" }}>
        <AcademicContextForm submitLabel="Finish setup" onSubmit={handleSubmit} />
      </GlassCard>
    </div>
  );
}
