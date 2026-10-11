import { useEffect, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { SkeletonText } from "@/components/ui/Skeleton";
import { supabase } from "@/services/supabase/client";

interface Metric {
  label: string;
  value: number | null;
}

/**
 * Master Spec section 22: "real database-driven metrics... do NOT use
 * fake numbers." Every count below is a live `select count`, gated by the
 * same RLS staff-only policies as everything else — an admin/staff
 * session is required for these queries to return anything at all. Only
 * a handful of the eventual dashboard's metrics are wired up in Phase 1
 * (the tables that already have staff-manageable rows); the rest join in
 * as later phases populate their tables — see the README's phase plan.
 */
export function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<Metric[] | null>(null);

  useEffect(() => {
    async function loadMetrics() {
      const [institutions, courses, students] = await Promise.all([
        supabase.from("institutions").select("*", { count: "exact", head: true }),
        supabase.from("courses").select("*", { count: "exact", head: true }),
        supabase.from("profiles").select("*", { count: "exact", head: true }),
      ]);

      setMetrics([
        { label: "Institutions", value: institutions.count ?? null },
        { label: "Courses", value: courses.count ?? null },
        { label: "Registered users", value: students.count ?? null },
      ]);
    }
    loadMetrics();
  }, []);

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-6)" }}>Admin dashboard</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "var(--space-4)",
          marginBottom: "var(--space-8)",
        }}
      >
        {(metrics ?? Array.from({ length: 3 })).map((metric, i) => (
          <GlassCard key={i}>
            {metric ? (
              <>
                <div style={{ fontSize: "var(--text-3xl)", fontWeight: "var(--font-weight-bold)" }}>{metric.value ?? "—"}</div>
                <div style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>{metric.label}</div>
              </>
            ) : (
              <SkeletonText lines={2} />
            )}
          </GlassCard>
        ))}
      </div>

      <GlassCard>
        <p style={{ color: "var(--text-secondary)" }}>
          Full CRUD for academic structure, courses, content, competitions and tournaments is built out in Phase 3
          onward. The navigation on the left already routes to every module named in the Master Specification; each
          currently renders a "coming in Phase N" placeholder until that phase implements it — see the README.
        </p>
      </GlassCard>
    </div>
  );
}
