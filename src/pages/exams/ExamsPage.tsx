import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, ChevronRight, Clock } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonText } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/app/providers/AuthProvider";
import { getMyProfile } from "@/services/academic/academicService";
import { getCourseOfferingsForContext, listMyEnrollments } from "@/services/courses/coursesService";
import { listAvailableExams } from "@/services/exams/examAttemptService";
import { ROUTES } from "@/app/router/routes";
import type { CourseOfferingWithCourse, Exam } from "@/types/database.types";

interface ExamWithCourse extends Exam {
  courseLabel: string;
}

export function ExamsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [exams, setExams] = useState<ExamWithCourse[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const profile = await getMyProfile(user.id);
        if (!profile?.institution_id || !profile.programme_id || !profile.level_id || !profile.current_semester_id) {
          setIsLoading(false);
          return;
        }
        const [offerings, enrollments] = await Promise.all([
          getCourseOfferingsForContext({
            institutionId: profile.institution_id,
            programmeId: profile.programme_id,
            levelId: profile.level_id,
            semesterId: profile.current_semester_id,
          }),
          listMyEnrollments(user.id),
        ]);
        const enrolledIds = new Set(
          enrollments.map((e) => (e as unknown as { course_offering_id: string }).course_offering_id)
        );
        const enrolledOfferings = offerings.filter((o: CourseOfferingWithCourse) => enrolledIds.has(o.id));

        const examLists = await Promise.all(enrolledOfferings.map((o) => listAvailableExams(o.id)));
        const combined: ExamWithCourse[] = examLists.flatMap((list, i) =>
          list.map((exam) => ({ ...exam, courseLabel: enrolledOfferings[i].course.course_code }))
        );
        setExams(combined);
      } catch {
        showToast("Couldn't load exams.", "error");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [user, showToast]);

  if (isLoading) {
    return (
      <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
        <SkeletonText lines={4} />
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-6)" }}>Exams</h1>

      {exams.length === 0 ? (
        <GlassCard>
          <EmptyState icon={FileText} title="No exams available right now." description="Published exams for your enrolled courses will show up here." />
        </GlassCard>
      ) : (
        <div className="stack" style={{ gap: "var(--space-3)" }}>
          {exams.map((exam) => (
            <Link key={exam.id} to={ROUTES.examDetail.replace(":id", exam.id)} style={{ textDecoration: "none" }}>
              <GlassCard interactive className="cluster" style={{ justifyContent: "space-between" }}>
                <div>
                  <Badge tone="accent">{exam.courseLabel}</Badge>
                  <div style={{ color: "var(--text-primary)", fontWeight: "var(--font-weight-medium)", marginTop: "var(--space-2)" }}>{exam.title}</div>
                  <div className="cluster" style={{ gap: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                    <Clock size={12} /> {exam.duration_minutes} min · {exam.question_count} questions
                  </div>
                </div>
                <ChevronRight size={18} aria-hidden="true" />
              </GlassCard>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
