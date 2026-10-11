import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { BookOpen, ArrowRight, Zap, Flame, Award, Target } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonText } from "@/components/ui/Skeleton";
import { useAuth } from "@/app/providers/AuthProvider";
import { getMyProfile } from "@/services/academic/academicService";
import { listMyEnrollments } from "@/services/courses/coursesService";
import { ROUTES } from "@/app/router/routes";
import type { Profile } from "@/types/database.types";
import { getGamificationSnapshot, type GamificationSnapshot } from "@/services/gamification/gamificationService";

interface EnrollmentRow {
  id: string;
  course_offering_id: string;
  course_offering: {
    id: string;
    course: { course_code: string; title: string };
  } | null;
}

/**
 * Student home: enrolled courses plus database-derived Phase 6 rewards.
 * If gamification data is unavailable (for example, migration 020 has not
 * been applied yet), the core dashboard and course links still render.
 */
export function DashboardPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [gamification, setGamification] = useState<GamificationSnapshot | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const myProfile = await getMyProfile(user.id);
        setProfile(myProfile);
        if (myProfile?.onboarding_completed_at) {
          const rows = await listMyEnrollments(user.id);
          setEnrollments(rows as unknown as EnrollmentRow[]);
        }
      } catch {
        // The core dashboard remains usable if a new gamification migration has not yet been applied.
      } finally {
        setIsLoading(false);
      }
      getGamificationSnapshot(user.id).then(setGamification).catch(() => setGamification(null));
    })();
  }, [user]);

  if (isLoading) {
    return (
      <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
        <SkeletonText lines={3} />
      </div>
    );
  }

  if (!profile?.onboarding_completed_at) {
    return <Navigate to={ROUTES.onboarding} replace />;
  }

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
      <h1 style={{ fontSize: "var(--text-3xl)", marginBottom: "var(--space-2)" }}>
        Welcome back{profile.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}.
      </h1>
      <p style={{ marginBottom: "var(--space-8)" }}>Here's your CampusIQ home base.</p>

      {gamification && <section className="stack" style={{ gap: "var(--space-3)", marginBottom: "var(--space-8)" }} aria-label="Learning rewards">
        <div className="cluster" style={{ justifyContent: "space-between" }}><h2 style={{ fontSize: "var(--text-lg)" }}>Your learning momentum</h2><Link to={ROUTES.profile} style={{ fontSize: "var(--text-sm)" }}>View profile <ArrowRight size={13} style={{ display: "inline", verticalAlign: "-2px" }} /></Link></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: "var(--space-3)" }}>
          <GlassCard><div className="cluster"><Zap size={18} color="var(--accent-cyan)" /><span style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>Total XP</span></div><strong style={{ display: "block", fontSize: "var(--text-2xl)", marginTop: 8 }}>{(gamification.xp?.total_xp ?? 0).toLocaleString()}</strong><span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>Level {gamification.xp?.campusiq_level ?? 1} · {gamification.currentLevel?.title ?? "Fresher"}</span></GlassCard>
          <GlassCard><div className="cluster"><Flame size={18} color="#F59E0B" /><span style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>Streak</span></div><strong style={{ display: "block", fontSize: "var(--text-2xl)", marginTop: 8 }}>{gamification.streak?.current_streak ?? 0} days</strong><span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>Longest: {gamification.streak?.longest_streak ?? 0}</span></GlassCard>
          <GlassCard><div className="cluster"><Award size={18} color="var(--accent-violet)" /><span style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>Achievements</span></div><strong style={{ display: "block", fontSize: "var(--text-2xl)", marginTop: 8 }}>{gamification.earnedAchievements.length}</strong><Link to={ROUTES.achievements} style={{ fontSize: "var(--text-xs)" }}>View badges</Link></GlassCard>
        </div>
        <div className="cluster" style={{ justifyContent: "space-between" }}><h3 style={{ fontSize: "var(--text-base)" }}><Target size={16} style={{ display: "inline", verticalAlign: "-3px" }} /> Active quests</h3></div>
        {gamification.quests.length === 0 ? <GlassCard><p style={{ color: "var(--text-secondary)" }}>No active quests are configured yet.</p></GlassCard> : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--space-3)" }}>{gamification.quests.slice(0, 3).map(({ quest, progress }) => <GlassCard key={quest.id} className="stack" style={{ gap: "var(--space-2)" }}><div className="cluster" style={{ justifyContent: "space-between" }}><strong>{quest.title}</strong><Badge tone="accent">+{quest.xp_reward} XP</Badge></div><p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>{quest.description}</p><div style={{ height: 6, background: "var(--bg-glass)", borderRadius: 99, overflow: "hidden" }}><div style={{ height: "100%", width: `${Math.min(100, ((progress?.current_count ?? 0) / quest.target_count) * 100)}%`, background: "var(--accent-gradient)" }} /></div><span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>{progress?.is_completed ? "Completed" : `${progress?.current_count ?? 0} / ${quest.target_count}`} · {quest.period}</span></GlassCard>)}</div>}
      </section>}

      <div className="cluster" style={{ justifyContent: "space-between", marginBottom: "var(--space-4)" }}>
        <h2 style={{ fontSize: "var(--text-lg)" }}>Your courses</h2>
        <Link to={ROUTES.courses} className="cluster" style={{ gap: "var(--space-1)", fontSize: "var(--text-sm)" }}>
          Browse all <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>

      {enrollments.length === 0 ? (
        <GlassCard>
          <EmptyState
            icon={BookOpen}
            title="You haven't enrolled in any courses yet."
            action={
              <Link to={ROUTES.courses}>
                <Button size="sm">Browse courses</Button>
              </Link>
            }
          />
        </GlassCard>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "var(--space-4)" }}>
          {enrollments.map((enrollment) =>
            enrollment.course_offering ? (
              <Link key={enrollment.id} to={ROUTES.courseDetail.replace(":id", enrollment.course_offering_id)} style={{ textDecoration: "none" }}>
                <GlassCard interactive className="stack" style={{ gap: "var(--space-2)" }}>
                  <Badge tone="accent">{enrollment.course_offering.course.course_code}</Badge>
                  <div style={{ color: "var(--text-primary)", fontWeight: "var(--font-weight-medium)" }}>
                    {enrollment.course_offering.course.title}
                  </div>
                </GlassCard>
              </Link>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}
