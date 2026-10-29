import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/app/providers/AuthProvider";
import { LoadingScreen } from "@/components/feedback/LoadingScreen";
import { HolographicBrain } from "@/components/branding/HolographicBrain";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { ROUTES } from "@/app/router/routes";

const PILLARS = [
  { title: "Learn", description: "Structured lessons built around your actual course offerings." },
  { title: "Practice", description: "Topic, course, and past-question practice with instant feedback." },
  { title: "Level Up", description: "XP, streaks, quests, achievements, competitions, and tournaments." },
];

export function LandingPage() {
  const { user, isLoading, isStaff } = useAuth();

  // Wait until Supabase has restored any saved session before showing
  // the public landing page. This avoids asking returning users to sign in.
  if (isLoading) {
    return <LoadingScreen label="Restoring your session…" />;
  }

  if (user) {
    return <Navigate to={isStaff ? ROUTES.admin : ROUTES.dashboard} replace />;
  }

  return (
    <div className="container" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header className="cluster" style={{ justifyContent: "space-between", paddingBlock: "var(--space-6)" }}>
        <div className="cluster" style={{ gap: "var(--space-3)" }}>
          <HolographicBrain size={32} animated={false} />
          <span style={{ fontFamily: "var(--font-display)", fontWeight: "var(--font-weight-semibold)" }}>CampusIQ</span>
        </div>
        <div className="cluster" style={{ gap: "var(--space-3)" }}>
          <Link to={ROUTES.login}>
            <Button variant="ghost" size="sm">
              Log in
            </Button>
          </Link>
          <Link to={ROUTES.register}>
            <Button size="sm">Get started</Button>
          </Link>
        </div>
      </header>

      <main style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", paddingBlock: "var(--space-12)" }}>
        <div className="stack" style={{ gap: "var(--space-4)", maxWidth: "640px", marginBottom: "var(--space-10)" }}>
          <h1 style={{ fontSize: "var(--text-5xl)", lineHeight: "var(--leading-tight)" }}>
            Learn. Practice. <span style={{ background: "var(--accent-gradient)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Level Up.</span>
          </h1>
          <p style={{ fontSize: "var(--text-lg)" }}>
            CampusIQ is your university's academic operating system — courses, practice, exams, and gamified
            competition, all in one place.
          </p>
          <div className="cluster" style={{ gap: "var(--space-3)" }}>
            <Link to={ROUTES.register}>
              <Button size="lg">Create your account</Button>
            </Link>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--space-4)" }}>
          {PILLARS.map((pillar) => (
            <GlassCard key={pillar.title}>
              <h2 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-2)" }}>{pillar.title}</h2>
              <p style={{ fontSize: "var(--text-sm)" }}>{pillar.description}</p>
            </GlassCard>
          ))}
        </div>
      </main>
    </div>
  );
}
