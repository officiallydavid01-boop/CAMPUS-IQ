import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3 } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonText } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/app/providers/AuthProvider";
import { getPracticeAccuracySummary, getExamHistory, getExtendedAnalytics, type ExamHistoryRow, type PracticeAccuracySummary, type ExtendedAnalytics } from "@/services/analytics/analyticsService";
import { ROUTES } from "@/app/router/routes";

export function AnalyticsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [summary, setSummary] = useState<PracticeAccuracySummary | null>(null);
  const [examHistory, setExamHistory] = useState<ExamHistoryRow[]>([]);
  const [extended, setExtended] = useState<ExtendedAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([getPracticeAccuracySummary(user.id), getExamHistory(user.id), getExtendedAnalytics(user.id)])
      .then(([s, history, detail]) => {
        setSummary(s);
        setExamHistory(history);
        setExtended(detail);
      })
      .catch(() => showToast("Couldn't load your analytics.", "error"))
      .finally(() => setIsLoading(false));
  }, [user, showToast]);

  if (isLoading) {
    return (
      <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
        <SkeletonText lines={4} />
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)", maxWidth: "680px" }}>
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-6)" }}>Analytics</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--space-4)", marginBottom: "var(--space-8)" }}>
        <GlassCard>
          <div style={{ fontSize: "var(--text-3xl)", fontWeight: "var(--font-weight-bold)" }}>
            {summary?.accuracyPercent !== null && summary?.accuracyPercent !== undefined ? `${summary.accuracyPercent}%` : "—"}
          </div>
          <div style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>Practice accuracy</div>
        </GlassCard>
        <GlassCard>
          <div style={{ fontSize: "var(--text-3xl)", fontWeight: "var(--font-weight-bold)" }}>{summary?.totalQuestions ?? 0}</div>
          <div style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>Practice questions answered</div>
        </GlassCard>
        <GlassCard>
          <div style={{ fontSize: "var(--text-3xl)", fontWeight: "var(--font-weight-bold)" }}>{examHistory.length}</div>
          <div style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>Exams completed</div>
        </GlassCard>
        <GlassCard>
          <div style={{ fontSize: "var(--text-3xl)", fontWeight: "var(--font-weight-bold)" }}>{extended?.trackedStudyMinutes ?? 0}</div>
          <div style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>Tracked study minutes</div>
        </GlassCard>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "var(--space-4)", marginBottom: "var(--space-8)" }}>
        <GlassCard className="stack" style={{ gap: "var(--space-3)" }}>
          <h2 style={{ fontSize: "var(--text-lg)" }}>Topic strengths & weak areas</h2>
          {!extended?.topicPerformance.length ? <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>Answer practice questions to build topic-level insights.</p> : extended.topicPerformance.map((topic) => (
            <div key={topic.topicId} className="stack" style={{ gap: "var(--space-1)" }}>
              <div className="cluster" style={{ justifyContent: "space-between", gap: "var(--space-2)" }}>
                <span style={{ fontSize: "var(--text-sm)" }}>{topic.topicTitle}</span>
                <Badge tone={topic.accuracyPercent >= 75 ? "success" : topic.accuracyPercent < 50 ? "error" : "neutral"}>{topic.accuracyPercent}%</Badge>
              </div>
              <div style={{ height: "6px", borderRadius: "999px", background: "var(--bg-surface-secondary)", overflow: "hidden" }}>
                <div style={{ width: `${topic.accuracyPercent}%`, height: "100%", background: "var(--accent-gradient)" }} />
              </div>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{topic.correct} correct of {topic.answered} graded answers</span>
            </div>
          ))}
        </GlassCard>
        <GlassCard className="stack" style={{ gap: "var(--space-3)" }}>
          <h2 style={{ fontSize: "var(--text-lg)" }}>Last 7 days</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>Practice questions recorded each day.</p>
          <div className="cluster" style={{ alignItems: "flex-end", justifyContent: "space-between", gap: "var(--space-2)", minHeight: "150px" }}>
            {(extended?.lastSevenDays ?? []).map((day) => {
              const maxQuestions = Math.max(1, ...(extended?.lastSevenDays ?? []).map((point) => point.questions));
              const height = Math.max(4, Math.round((day.questions / maxQuestions) * 100));
              return <div key={day.date} className="stack" style={{ alignItems: "center", justifyContent: "flex-end", gap: "var(--space-1)", flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{day.questions}</span>
                <div title={`${day.date}: ${day.questions} questions`} style={{ width: "100%", maxWidth: "28px", height: `${height}px`, minHeight: "4px", borderRadius: "5px 5px 2px 2px", background: "var(--accent-gradient)" }} />
                <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{day.date.slice(5)}</span>
              </div>;
            })}
          </div>
        </GlassCard>
      </div>

      <h2 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-4)" }}>Exam history</h2>
      {examHistory.length === 0 ? (
        <GlassCard>
          <EmptyState icon={BarChart3} title="No graded exams yet." />
        </GlassCard>
      ) : (
        <div className="stack" style={{ gap: "var(--space-2)" }}>
          {examHistory.map((row) => {
            const percent = row.maxScore ? Math.round(((row.score ?? 0) / row.maxScore) * 100) : null;
            return (
              <Link key={row.attemptId} to={ROUTES.resultDetail.replace(":id", row.attemptId)} style={{ textDecoration: "none" }}>
                <GlassCard interactive className="cluster" style={{ justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-primary)" }}>{row.examTitle}</span>
                  <Badge tone={percent !== null && percent >= 50 ? "success" : "error"}>
                    {row.score} / {row.maxScore}
                  </Badge>
                </GlassCard>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
