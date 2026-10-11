import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronRight, CheckCircle2, Circle } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/Badge";
import { SkeletonText } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/app/providers/AuthProvider";
import { getCourseOfferingById, getCourseTopics } from "@/services/courses/coursesService";
import { ROUTES } from "@/app/router/routes";
import type { CourseOfferingWithCourse, CourseTopic } from "@/types/database.types";
import { getTopicProgress } from "@/services/learning/progressService";

/**
 * Route param `:id` is the course_offering id (what the student actually
 * enrolled in), but its Topics are fetched by `offering.course_id` — the
 * reusable course identity topics/lessons attach to. See the design note
 * in supabase/migrations/004_academic_structure.sql.
 */
export function CourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [offering, setOffering] = useState<CourseOfferingWithCourse | null>(null);
  const [topics, setTopics] = useState<CourseTopic[]>([]);
  const [progressByTopic, setProgressByTopic] = useState<Record<string, { completed: number; total: number }>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  async function load() {
    if (!id || !user) return;
    setIsLoading(true);
    setHasError(false);
    try {
      const off = await getCourseOfferingById(id);
      setOffering(off);
      if (off) {
        const topicRows = await getCourseTopics(off.course_id);
        setTopics(topicRows);
        const progressEntries = await Promise.all(
          topicRows.map(async (t) => {
            const p = await getTopicProgress(user.id, t.id);
            return [t.id, { completed: p?.lessons_completed ?? 0, total: p?.lessons_total ?? 0 }] as const;
          })
        );
        setProgressByTopic(Object.fromEntries(progressEntries));
      }
    } catch {
      setHasError(true);
      showToast("Couldn't load this course.", "error");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user]);

  if (isLoading) {
    return (
      <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
        <SkeletonText lines={5} />
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
        <ErrorState onRetry={load} />
      </div>
    );
  }

  if (!offering) {
    return (
      <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
        <EmptyState title="Course not found." description="It may have been unpublished or removed." />
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
      <Badge tone="accent">{offering.course.course_code}</Badge>
      <h1 style={{ fontSize: "var(--text-3xl)", marginTop: "var(--space-2)", marginBottom: "var(--space-2)" }}>
        {offering.course.title}
      </h1>
      {offering.course.description && <p style={{ marginBottom: "var(--space-8)" }}>{offering.course.description}</p>}

      <h2 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-4)" }}>Topics</h2>

      {topics.length === 0 ? (
        <GlassCard>
          <EmptyState title="No topics published yet." description="Check back once your institution's Admin adds content." />
        </GlassCard>
      ) : (
        <div className="stack" style={{ gap: "var(--space-3)" }}>
          {topics.map((topic) => {
            const progress = progressByTopic[topic.id];
            const isComplete = progress && progress.total > 0 && progress.completed >= progress.total;
            return (
              <Link key={topic.id} to={ROUTES.topicDetail.replace(":id", offering.id).replace(":topicId", topic.id)} style={{ textDecoration: "none" }}>
                <GlassCard interactive className="cluster" style={{ justifyContent: "space-between" }}>
                  <div className="cluster" style={{ gap: "var(--space-3)" }}>
                    {isComplete ? (
                      <CheckCircle2 size={18} style={{ color: "var(--color-success)" }} aria-hidden="true" />
                    ) : (
                      <Circle size={18} style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                    )}
                    <div>
                      <div style={{ color: "var(--text-primary)", fontWeight: "var(--font-weight-medium)" }}>{topic.title}</div>
                      {progress && progress.total > 0 && (
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                          {progress.completed} / {progress.total} lessons
                        </div>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={18} aria-hidden="true" />
                </GlassCard>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
