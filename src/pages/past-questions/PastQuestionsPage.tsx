import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonText } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/app/providers/AuthProvider";
import { getMyProfile } from "@/services/academic/academicService";
import { getCourseOfferingsForContext, listMyEnrollments, getCourseTopics } from "@/services/courses/coursesService";
import { getPublishedPastQuestions } from "@/services/questions/pastQuestionsService";
import type { CourseOfferingWithCourse, CourseTopic, ExamType, PastQuestion } from "@/types/database.types";
import { EXAM_TYPE_OPTIONS } from "@/services/exams/adminExamsService";

export function PastQuestionsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [offerings, setOfferings] = useState<CourseOfferingWithCourse[]>([]);
  const [offeringId, setOfferingId] = useState("");
  const [pastQuestions, setPastQuestions] = useState<PastQuestion[]>([]);
  const [topics, setTopics] = useState<CourseTopic[]>([]);
  const [sessionFilter, setSessionFilter] = useState("");
  const [semesterFilter, setSemesterFilter] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | ExamType>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const profile = await getMyProfile(user.id);
        if (profile?.institution_id && profile.programme_id && profile.level_id && profile.current_semester_id) {
          const [allOfferings, enrollments] = await Promise.all([
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
          setOfferings(allOfferings.filter((o) => enrolledIds.has(o.id)));
        }
      } catch {
        showToast("Couldn't load your courses.", "error");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [user, showToast]);

  useEffect(() => {
    const offering = offerings.find((o) => o.id === offeringId);
    if (!offering) {
      setPastQuestions([]);
      return;
    }
    setIsLoadingQuestions(true);
    setSessionFilter(""); setSemesterFilter(""); setTopicFilter(""); setTypeFilter("");
    Promise.all([getPublishedPastQuestions(offering.course_id), getCourseTopics(offering.course_id)])
      .then(([questions, courseTopics]) => { setPastQuestions(questions); setTopics(courseTopics); })
      .catch(() => showToast("Couldn't load past questions.", "error"))
      .finally(() => setIsLoadingQuestions(false));
  }, [offeringId, offerings, showToast]);

  const visibleQuestions = pastQuestions.filter((question) =>
    (!sessionFilter || question.session_label === sessionFilter) &&
    (!semesterFilter || (question.semester_label ?? "") === semesterFilter) &&
    (!topicFilter || question.topic_id === topicFilter) &&
    (!typeFilter || question.exam_type === typeFilter)
  );
  const sessionOptions = [...new Set(pastQuestions.map((q) => q.session_label))].sort((a, b) => b.localeCompare(a)).map((value) => ({ value, label: value }));
  const semesterOptions = [...new Set(pastQuestions.map((q) => q.semester_label).filter((value): value is string => Boolean(value)))].sort().map((value) => ({ value, label: value }));

  function toggleReveal(id: string) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (isLoading) {
    return (
      <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
        <SkeletonText lines={4} />
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)", maxWidth: "680px" }}>
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-6)" }}>Past questions</h1>

      <div style={{ maxWidth: "320px", marginBottom: "var(--space-6)" }}>
        <Select label="Course" placeholder="Select a course" value={offeringId} onChange={(e) => setOfferingId(e.target.value)} options={offerings.map((o) => ({ value: o.id, label: `${o.course.course_code} — ${o.course.title}` }))} />
      </div>

      {!offeringId ? (
        <GlassCard>
          <EmptyState icon={History} title="Pick a course to see its past questions." />
        </GlassCard>
      ) : isLoadingQuestions ? (
        <SkeletonText lines={4} />
      ) : pastQuestions.length === 0 ? (
        <GlassCard>
          <EmptyState title="No past questions published for this course yet." />
        </GlassCard>
      ) : (
        <>
        <div className="cluster" style={{ gap: "var(--space-3)", flexWrap: "wrap", marginBottom: "var(--space-4)" }}>
          <div style={{ minWidth: "150px" }}><Select label="Year / session" value={sessionFilter} onChange={(e) => setSessionFilter(e.target.value)} options={[{ value: "", label: "All sessions" }, ...sessionOptions]} /></div>
          <div style={{ minWidth: "150px" }}><Select label="Semester" value={semesterFilter} onChange={(e) => setSemesterFilter(e.target.value)} options={[{ value: "", label: "All semesters" }, ...semesterOptions]} /></div>
          <div style={{ minWidth: "170px" }}><Select label="Topic" value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)} options={[{ value: "", label: "All topics" }, ...topics.map((topic) => ({ value: topic.id, label: topic.title }))]} /></div>
          <div style={{ minWidth: "160px" }}><Select label="Exam type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as "" | ExamType)} options={[{ value: "", label: "All types" }, ...EXAM_TYPE_OPTIONS]} /></div>
        </div>
        {visibleQuestions.length === 0 ? <GlassCard><EmptyState title="No questions match these filters." description="Try changing or clearing one of the filters." /></GlassCard> : <div className="stack" style={{ gap: "var(--space-3)" }}>
          {visibleQuestions.map((pq) => {
            const isRevealed = revealed.has(pq.id);
            return (
              <GlassCard key={pq.id} className="stack" style={{ gap: "var(--space-2)" }}>
                <div className="cluster" style={{ gap: "var(--space-2)" }}>
                  <Badge tone="neutral">{pq.session_label}</Badge>
                  {pq.semester_label && <Badge tone="neutral">{pq.semester_label}</Badge>}
                </div>
                <p style={{ color: "var(--text-primary)" }}>{pq.prompt}</p>
                {pq.options && (
                  <div className="stack" style={{ gap: "var(--space-1)" }}>
                    {pq.options.map((opt, i) => (
                      <div
                        key={i}
                        style={{
                          fontSize: "var(--text-sm)",
                          padding: "var(--space-2) var(--space-3)",
                          borderRadius: "var(--radius-sm)",
                          background: isRevealed && opt.is_correct ? "var(--color-success-bg)" : "transparent",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {opt.text}
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => toggleReveal(pq.id)}
                  style={{ alignSelf: "flex-start", background: "none", border: "none", color: "var(--accent-cyan)", cursor: "pointer", fontSize: "var(--text-sm)", padding: 0 }}
                >
                  {isRevealed ? "Hide answer" : "Show answer"}
                </button>
                {isRevealed && (
                  <div className="stack" style={{ gap: "var(--space-1)" }}>
                    {pq.correct_answer_text && <p style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)" }}>Answer: {pq.correct_answer_text}</p>}
                    {pq.explanation && <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>{pq.explanation}</p>}
                  </div>
                )}
              </GlassCard>
            );
          })}
        </div>}
        </>
      )}
    </div>
  );
}
