import { Link } from "react-router-dom";
import {
  BookOpenCheck,
  ClipboardList,
  FileClock,
  Swords,
  Users,
  ChevronRight,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/Badge";
import { ROUTES } from "@/app/router/routes";

const practiceOptions = [
  {
    title: "Practice Questions",
    description: "Work through questions by course or topic and get instant feedback.",
    detail: "Learn as you go",
    icon: BookOpenCheck,
    to: ROUTES.practiceQuestions,
  },
  {
    title: "Quiz",
    description: "Take a short quiz and see your score when you finish.",
    detail: "Test your knowledge",
    icon: ClipboardList,
    to: ROUTES.practiceQuiz,
  },
  {
    title: "Past Questions Practice",
    description: "Revise previous examination questions by course, year, semester and topic.",
    detail: "Prepare with past papers",
    icon: FileClock,
    to: ROUTES.pastQuestions,
  },
  {
    title: "Exam Mode",
    description: "Attempt published exams under their configured time and exam conditions.",
    detail: "Timed assessment",
    icon: Swords,
    to: ROUTES.exams,
  },
];

export function PracticePage() {
  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)", maxWidth: "900px" }}>
      <div style={{ marginBottom: "var(--space-6)" }}>
        <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-2)" }}>Practice</h1>
        <p style={{ color: "var(--text-secondary)", margin: 0 }}>Choose how you want to learn, revise or test yourself.</p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
          gap: "var(--space-3)",
        }}
      >
        {practiceOptions.map((option) => {
          const Icon = option.icon;
          return (
            <Link key={option.title} to={option.to} style={{ textDecoration: "none", minWidth: 0 }}>
              <GlassCard interactive className="stack" style={{ height: "100%", minHeight: "178px", gap: "var(--space-3)" }}>
                <div className="cluster" style={{ justifyContent: "space-between" }}>
                  <span
                    style={{
                      width: "44px",
                      height: "44px",
                      display: "grid",
                      placeItems: "center",
                      borderRadius: "var(--radius-md)",
                      background: "rgba(0, 229, 255, 0.09)",
                      color: "var(--accent-cyan)",
                    }}
                  >
                    <Icon size={22} aria-hidden="true" />
                  </span>
                  <ChevronRight size={18} color="var(--text-muted)" aria-hidden="true" />
                </div>
                <div>
                  <h2 style={{ fontSize: "var(--text-lg)", margin: "0 0 var(--space-1)", color: "var(--text-primary)" }}>{option.title}</h2>
                  <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", margin: 0 }}>{option.description}</p>
                </div>
                <span style={{ fontSize: "var(--text-xs)", color: "var(--accent-cyan)" }}>{option.detail}</span>
              </GlassCard>
            </Link>
          );
        })}

        <GlassCard className="stack" style={{ minHeight: "178px", gap: "var(--space-3)", opacity: 0.82 }}>
          <div className="cluster" style={{ justifyContent: "space-between" }}>
            <span style={{ width: "44px", height: "44px", display: "grid", placeItems: "center", borderRadius: "var(--radius-md)", background: "var(--bg-surface-secondary)", color: "var(--text-secondary)" }}>
              <Users size={22} aria-hidden="true" />
            </span>
            <Badge tone="neutral">Coming Soon</Badge>
          </div>
          <div>
            <h2 style={{ fontSize: "var(--text-lg)", margin: "0 0 var(--space-1)" }}>Friend Rivalry</h2>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", margin: 0 }}>Challenge friends, compare scores and keep each other motivated.</p>
          </div>
          <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Not available yet</span>
        </GlassCard>
      </div>
    </div>
  );
}
