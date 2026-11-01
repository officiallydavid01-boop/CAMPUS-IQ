
import { useCallback, useEffect, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { SkeletonText } from "@/components/ui/Skeleton";
import { supabase } from "@/services/supabase/client";

interface Metric {
  label: string;
  value: number | null;
  description: string;
}

interface RecentRegistration {
  id: string;
  full_name: string | null;
  created_at: string;
}

const dateFormatter = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<Metric[] | null>(null);
  const [recentUsers, setRecentUsers] = useState<RecentRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const results = await Promise.all([
        supabase.from("institutions").select("id", { count: "exact", head: true }),
        supabase.from("courses").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("study_sessions").select("id", { count: "exact", head: true }),
        supabase.from("practice_sessions").select("id", { count: "exact", head: true }),
        supabase
          .from("lesson_progress")
          .select("id", { count: "exact", head: true })
          .not("completed_at", "is", null),
        supabase.from("exam_attempts").select("id", { count: "exact", head: true }),
        supabase.from("competition_attempts").select("id", { count: "exact", head: true }),
        supabase
          .from("profiles")
          .select("id, full_name, created_at")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      const failed = results.find((result) => result.error);

      if (failed?.error) {
        throw failed.error;
      }

      const [
        institutions,
        courses,
        students,
        studySessions,
        practiceSessions,
        lessonCompletions,
        examAttempts,
        competitionAttempts,
        registrations,
      ] = results;

      setMetrics([
        {
          label: "Institutions",
          value: institutions.count ?? 0,
          description: "Institutions in CampusIQ",
        },
        {
          label: "Courses",
          value: courses.count ?? 0,
          description: "Courses in the database",
        },
        {
          label: "Registered users",
          value: students.count ?? 0,
          description: "Student profiles",
        },
        {
          label: "Study sessions",
          value: studySessions.count ?? 0,
          description: "Recorded study sessions",
        },
        {
          label: "Practice sessions",
          value: practiceSessions.count ?? 0,
          description: "Practice attempts recorded",
        },
        {
          label: "Lesson completions",
          value: lessonCompletions.count ?? 0,
          description: "Completed lessons",
        },
        {
          label: "Exam attempts",
          value: examAttempts.count ?? 0,
          description: "Recorded exam attempts",
        },
        {
          label: "Competition attempts",
          value: competitionAttempts.count ?? 0,
          description: "Recorded competition attempts",
        },
      ]);

      setRecentUsers(registrations.data ?? []);
    } catch (err) {
      console.error("Admin dashboard loading error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load dashboard data. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "var(--space-3)",
          flexWrap: "wrap",
          marginBottom: "var(--space-6)",
        }}
      >
        <div>
          <h1 style={{ fontSize: "var(--text-2xl)", margin: 0 }}>
            Admin dashboard
          </h1>
          <p style={{ color: "var(--text-secondary)", marginTop: "var(--space-2)" }}>
            CampusIQ overview and platform activity
          </p>
        </div>

        <button
          type="button"
          onClick={loadDashboard}
          disabled={loading}
          style={{
            padding: "10px 16px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--text-primary)",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Refreshing..." : "↻ Refresh"}
        </button>
      </div>

      {error && (
        <GlassCard>
          <div role="alert">
            <strong>Dashboard data could not be loaded.</strong>
            <p style={{ color: "var(--text-secondary)" }}>{error}</p>
            <button type="button" onClick={loadDashboard}>
              Try again
            </button>
          </div>
        </GlassCard>
      )}

      <h2 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-4)" }}>
        Platform overview
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
          gap: "var(--space-4)",
          marginBottom: "var(--space-8)",
        }}
      >
        {(metrics ?? Array.from({ length: 8 })).map((metric, index) => (
          <GlassCard key={metric?.label ?? index}>
            {loading || !metrics ? (
              <SkeletonText lines={2} />
            ) : (
              <>
                <div
                  style={{
                    fontSize: "var(--text-3xl)",
                    fontWeight: "var(--font-weight-bold)",
                  }}
                >
                  {metric.value?.toLocaleString("en-NG") ?? "—"}
                </div>
                <div style={{ fontWeight: 600 }}>{metric.label}</div>
                <div
                  style={{
                    color: "var(--text-secondary)",
                    fontSize: "var(--text-sm)",
                    marginTop: "var(--space-1)",
                  }}
                >
                  {metric.description}
                </div>
              </>
            )}
          </GlassCard>
        ))}
      </div>

      <GlassCard>
        <h2 style={{ fontSize: "var(--text-lg)", marginTop: 0 }}>
          Recent registrations
        </h2>

        {loading ? (
          <SkeletonText lines={5} />
        ) : recentUsers.length === 0 ? (
          <p style={{ color: "var(--text-secondary)" }}>
            No registrations found yet.
          </p>
        ) : (
          <div style={{ display: "grid", gap: "var(--space-3)" }}>
            {recentUsers.map((user) => (
              <div
                key={user.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "var(--space-3)",
                  flexWrap: "wrap",
                  paddingBlock: "var(--space-2)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {user.full_name || "Unnamed student"}
                  </div>
                  <div
                    style={{
                      color: "var(--text-secondary)",
                      fontSize: "var(--text-sm)",
                    }}
                  >
                    {dateFormatter.format(new Date(user.created_at))}
                  </div>
                </div>
                <span style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
                  Registered
                </span>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <p
        style={{
          color: "var(--text-secondary)",
          fontSize: "var(--text-sm)",
          marginTop: "var(--space-4)",
        }}
      >
        Dashboard figures are retrieved from CampusIQ database records.
      </p>
    </div>
  );
}
