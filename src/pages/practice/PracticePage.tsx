import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PencilLine } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonText } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/app/providers/AuthProvider";
import { getMyProfile } from "@/services/academic/academicService";
import { getCourseOfferingsForContext, listMyEnrollments, getCourseTopics } from "@/services/courses/coursesService";
import { startPracticeSession, getMyRecentPracticeSessions } from "@/services/practice/practiceService";
import { ROUTES } from "@/app/router/routes";
import type { CourseOfferingWithCourse, CourseTopic, PracticeMode, PracticeSession } from "@/types/database.types";

const MODE_OPTIONS: { value: PracticeMode; label: string }[] = [
  { value: "topic", label: "By topic" },
  { value: "mixed", label: "Mixed topics" },
  { value: "weak_topic", label: "Focus on weak topics" },
];

/** Mode/course/topic picker + "start session" (Master Spec section 34).
 * Only offers courses the student is actually enrolled in — practice
 * against a course you haven't enrolled in wouldn't have any published
 * questions visible in a meaningful, scoped way anyway. */
export function PracticePage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [offerings, setOfferings] = useState<CourseOfferingWithCourse[]>([]);
  const [offeringId, setOfferingId] = useState("");
  const [topics, setTopics] = useState<CourseTopic[]>([]);
  const [topicId, setTopicId] = useState("");
  const [mode, setMode] = useState<PracticeMode>("topic");
  const [recentSessions, setRecentSessions] = useState<PracticeSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const profile = await getMyProfile(user.id);
        if (profile?.institution_id && profile.programme_id && profile.level_id && profile.current_semester_id) {
          const [allOfferings, enrollments, sessions] = await Promise.all([
            getCourseOfferingsForContext({
              institutionId: profile.institution_id,
              programmeId: profile.programme_id,
              levelId: profile.level_id,
              semesterId: profile.current_semester_id,
            }),
            listMyEnrollments(user.id),
            getMyRecentPracticeSessions(user.id, 5),
          ]);
          const enrolledIds = new Set(
            enrollments.map((e) => (e as unknown as { course_offering_id: string }).course_offering_id)
          );
          setOfferings(allOfferings.filter((o) => enrolledIds.has(o.id)));
          setRecentSessions(sessions);
        }
      } catch {
        showToast("Couldn't load your practice options.", "error");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [user, showToast]);

  useEffect(() => {
    setTopicId("");
    setTopics([]);
    const offering = offerings.find((o) => o.id === offeringId);
    if (offering) getCourseTopics(offering.course_id).then(setTopics).catch(() => showToast("Couldn't load topics.", "error"));
  }, [offeringId, offerings, showToast]);

  async function handleStart() {
    if (!user || !offeringId) return;
    const offering = offerings.find((o) => o.id === offeringId);
    if (!offering) return;
    if (mode === "topic" && !topicId) {
      showToast("Pick a topic first.", "error");
      return;
    }

    setIsStarting(true);
    try {
      const session = await startPracticeSession(user.id, mode, offering.course_id, mode === "topic" ? topicId : undefined);
      navigate(ROUTES.practiceSession.replace(":id", session.id));
    } catch {
      showToast("Couldn't start a practice session.", "error");
    } finally {
      setIsStarting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
        <SkeletonText lines={4} />
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)", maxWidth: "560px" }}>
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-6)" }}>Practice</h1>

      {offerings.length === 0 ? (
        <GlassCard>
          <EmptyState icon={PencilLine} title="Enroll in a course first." description="Practice questions are scoped to courses you're enrolled in." />
        </GlassCard>
      ) : (
        <GlassCard className="stack" style={{ gap: "var(--space-4)" }}>
          <Select label="Course" placeholder="Select a course" value={offeringId} onChange={(e) => setOfferingId(e.target.value)} options={offerings.map((o) => ({ value: o.id, label: `${o.course.course_code} — ${o.course.title}` }))} />
          <Select label="Mode" value={mode} onChange={(e) => setMode(e.target.value as PracticeMode)} options={MODE_OPTIONS} disabled={!offeringId} />
          {mode === "topic" && (
            <Select label="Topic" placeholder="Select a topic" value={topicId} onChange={(e) => setTopicId(e.target.value)} options={topics.map((t) => ({ value: t.id, label: t.title }))} disabled={!offeringId} />
          )}
          <Button onClick={handleStart} isLoading={isStarting} disabled={!offeringId}>
            Start practice
          </Button>
        </GlassCard>
      )}

      {recentSessions.length > 0 && (
        <div style={{ marginTop: "var(--space-8)" }}>
          <h2 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-3)" }}>Recent sessions</h2>
          <div className="stack" style={{ gap: "var(--space-2)" }}>
            {recentSessions.map((s) => (
              <GlassCard key={s.id} className="cluster" style={{ justifyContent: "space-between" }}>
                <span style={{ fontSize: "var(--text-sm)" }}>{s.mode} practice</span>
                <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
                  {s.correct_count} / {s.question_count} correct
                </span>
              </GlassCard>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
