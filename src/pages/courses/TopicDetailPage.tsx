import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronRight, CheckCircle2, Circle, Clock } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { SkeletonText } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/app/providers/AuthProvider";
import { getTopicById, getTopicLessons } from "@/services/courses/coursesService";
import { getLessonProgressForTopic } from "@/services/learning/progressService";
import { ROUTES } from "@/app/router/routes";
import type { CourseTopic, Lesson } from "@/types/database.types";

export function TopicDetailPage() {
  const { id, topicId } = useParams<{ id: string; topicId: string }>();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [topic, setTopic] = useState<CourseTopic | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [completedLessonIds, setCompletedLessonIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  async function load() {
    if (!topicId || !user) return;
    setIsLoading(true);
    setHasError(false);
    try {
      const [topicRow, lessonRows] = await Promise.all([getTopicById(topicId), getTopicLessons(topicId)]);
      setTopic(topicRow);
      setLessons(lessonRows);
      const progressByLesson = await getLessonProgressForTopic(user.id, lessonRows.map((l) => l.id));
      setCompletedLessonIds(
        new Set(Object.values(progressByLesson).filter((p) => p.completed_at).map((p) => p.lesson_id))
      );
    } catch {
      setHasError(true);
      showToast("Couldn't load this topic.", "error");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId, user]);

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

  if (!topic) {
    return (
      <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
        <EmptyState title="Topic not found." />
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
      <h1 style={{ fontSize: "var(--text-3xl)", marginBottom: "var(--space-2)" }}>{topic.title}</h1>
      {topic.description && <p style={{ marginBottom: "var(--space-8)" }}>{topic.description}</p>}

      {lessons.length === 0 ? (
        <GlassCard>
          <EmptyState title="No lessons published yet." />
        </GlassCard>
      ) : (
        <div className="stack" style={{ gap: "var(--space-3)" }}>
          {lessons.map((lesson) => {
            const isComplete = completedLessonIds.has(lesson.id);
            return (
              <Link key={lesson.id} to={ROUTES.lessonDetail.replace(":id", lesson.id)} state={{ courseOfferingId: id, topicId }} style={{ textDecoration: "none" }}>
                <GlassCard interactive className="cluster" style={{ justifyContent: "space-between" }}>
                  <div className="cluster" style={{ gap: "var(--space-3)" }}>
                    {isComplete ? (
                      <CheckCircle2 size={18} style={{ color: "var(--color-success)" }} aria-hidden="true" />
                    ) : (
                      <Circle size={18} style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                    )}
                    <div>
                      <div style={{ color: "var(--text-primary)", fontWeight: "var(--font-weight-medium)" }}>{lesson.title}</div>
                      {lesson.estimated_reading_minutes && (
                        <div className="cluster" style={{ gap: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                          <Clock size={12} aria-hidden="true" /> {lesson.estimated_reading_minutes} min
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
