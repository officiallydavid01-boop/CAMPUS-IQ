import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, ClipboardList, RotateCcw } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonText } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/app/providers/AuthProvider";
import { getMyProfile } from "@/services/academic/academicService";
import { getCourseOfferingsForContext, listMyEnrollments } from "@/services/courses/coursesService";
import {
  startPracticeSession,
  getPracticeQuestions,
  submitPracticeAnswer,
  endPracticeSession,
  type PracticeQuestion,
} from "@/services/practice/practiceService";
import type { CourseOfferingWithCourse, PracticeSession } from "@/types/database.types";

export function QuizPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [offerings, setOfferings] = useState<CourseOfferingWithCourse[]>([]);
  const [offeringId, setOfferingId] = useState("");
  const [questionCount, setQuestionCount] = useState("10");
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [session, setSession] = useState<PracticeSession | null>(null);
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [answers, setAnswers] = useState<Array<{ questionId: string; correct: boolean | null }>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const profile = await getMyProfile(user.id);
        if (!profile?.institution_id || !profile.programme_id || !profile.level_id || !profile.current_semester_id) return;
        const [allOfferings, enrollments] = await Promise.all([
          getCourseOfferingsForContext({
            institutionId: profile.institution_id,
            programmeId: profile.programme_id,
            levelId: profile.level_id,
            semesterId: profile.current_semester_id,
          }),
          listMyEnrollments(user.id),
        ]);
        const enrolledIds = new Set(enrollments.map((e) => (e as unknown as { course_offering_id: string }).course_offering_id));
        setOfferings(allOfferings.filter((offering) => enrolledIds.has(offering.id)));
      } catch {
        showToast("Couldn't load your quiz courses.", "error");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [user, showToast]);

  const current = questions[index];
  const isChoiceQuestion = current?.question.question_type === "multiple_choice" || current?.question.question_type === "true_false";

  async function beginQuiz() {
    if (!user || !offeringId) return;
    const offering = offerings.find((item) => item.id === offeringId);
    if (!offering) return;
    setIsStarting(true);
    let createdSession: PracticeSession | null = null;
    try {
      createdSession = await startPracticeSession(user.id, "course", offering.course_id);
      const fetched = await getPracticeQuestions({ courseId: offering.course_id, count: Number(questionCount), mode: "course" });
      if (fetched.length === 0) {
        await endPracticeSession(createdSession.id);
        showToast("There are no published questions for this course yet.", "error");
        return;
      }
      setSession(createdSession);
      setQuestions([...fetched].sort(() => Math.random() - 0.5));
      setIndex(0);
      setAnswers([]);
      setIsFinished(false);
    } catch {
      if (createdSession) await endPracticeSession(createdSession.id).catch(() => {});
      showToast("Couldn't start your quiz. Please try again.", "error");
    } finally {
      setIsStarting(false);
    }
  }

  async function submitCurrent() {
    if (!session || !current) return;
    if (isChoiceQuestion && !selectedOptionId) return;
    if (!isChoiceQuestion && !answerText.trim()) return;
    setIsSubmitting(true);
    try {
      const result = await submitPracticeAnswer({
        practiceSessionId: session.id,
        questionId: current.question.id,
        selectedOptionId: selectedOptionId || undefined,
        answerText: isChoiceQuestion ? undefined : answerText.trim(),
      });
      setAnswers((previous) => [...previous, { questionId: current.question.id, correct: result.is_correct }]);
      setSelectedOptionId("");
      setAnswerText("");
      if (index + 1 < questions.length) {
        setIndex((value) => value + 1);
      } else {
        await endPracticeSession(session.id);
        setIsFinished(true);
      }
    } catch {
      showToast("Couldn't save your answer. Please try again.", "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) return <div className="container" style={{ paddingBlock: "var(--space-8)" }}><SkeletonText lines={4} /></div>;

  if (isFinished) {
    const correct = answers.filter((answer) => answer.correct === true).length;
    const graded = answers.filter((answer) => answer.correct !== null).length;
    const percentage = graded ? Math.round((correct / graded) * 100) : 0;
    return (
      <div className="container" style={{ paddingBlock: "var(--space-8)", maxWidth: "600px" }}>
        <GlassCard className="stack" style={{ alignItems: "center", textAlign: "center", gap: "var(--space-4)" }}>
          <CheckCircle2 size={42} color="var(--color-success)" />
          <div>
            <h1 style={{ fontSize: "var(--text-2xl)", margin: "0 0 var(--space-2)" }}>Quiz complete</h1>
            <p style={{ color: "var(--text-secondary)", margin: 0 }}>You have submitted all {answers.length} answers.</p>
          </div>
          <div style={{ fontSize: "var(--text-4xl)", fontWeight: 700, color: "var(--accent-cyan)" }}>{percentage}%</div>
          <p style={{ margin: 0, color: "var(--text-secondary)" }}>{correct} correct out of {graded} automatically graded</p>
          <div className="cluster" style={{ width: "100%", justifyContent: "center", flexWrap: "wrap" }}>
            <Button onClick={() => { setSession(null); setQuestions([]); setAnswers([]); setIsFinished(false); }}><RotateCcw size={16} /> New quiz</Button>
            <Button variant="secondary" onClick={() => navigate("/practice")}>Back to Practice</Button>
          </div>
        </GlassCard>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="container" style={{ paddingBlock: "var(--space-8)", maxWidth: "600px" }}>
        <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-2)" }}>Quiz</h1>
        <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-6)" }}>Choose a course and question count. Your score appears after you submit the final answer.</p>
        {offerings.length === 0 ? (
          <GlassCard><EmptyState icon={ClipboardList} title="No enrolled courses found." description="Complete your academic profile and enrol in a course to take a quiz." /></GlassCard>
        ) : (
          <GlassCard className="stack" style={{ gap: "var(--space-4)" }}>
            <Select label="Course" placeholder="Select a course" value={offeringId} onChange={(event) => setOfferingId(event.target.value)} options={offerings.map((item) => ({ value: item.id, label: `${item.course.course_code} — ${item.course.title}` }))} />
            <Select label="Number of questions" value={questionCount} onChange={(event) => setQuestionCount(event.target.value)} options={[{ value: "5", label: "5 questions" }, { value: "10", label: "10 questions" }, { value: "15", label: "15 questions" }, { value: "20", label: "20 questions" }]} />
            <Button onClick={beginQuiz} isLoading={isStarting} disabled={!offeringId}>Start quiz</Button>
          </GlassCard>
        )}
      </div>
    );
  }

  if (!current) return <div className="container" style={{ paddingBlock: "var(--space-8)" }}><EmptyState title="Quiz question unavailable." /></div>;

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)", maxWidth: "640px" }}>
      <div className="cluster" style={{ justifyContent: "space-between", marginBottom: "var(--space-4)" }}>
        <Badge tone="neutral">Question {index + 1} of {questions.length}</Badge>
        <Badge tone="accent">{answers.length} answered</Badge>
      </div>
      <GlassCard className="stack" style={{ gap: "var(--space-4)" }}>
        <p style={{ fontSize: "var(--text-lg)", color: "var(--text-primary)", margin: 0 }}>{current.question.prompt}</p>
        {isChoiceQuestion ? (
          <div className="stack" style={{ gap: "var(--space-2)" }}>
            {current.options.map((option) => (
              <button key={option.id} type="button" onClick={() => setSelectedOptionId(option.id)} className="cluster" style={{ justifyContent: "flex-start", padding: "var(--space-3) var(--space-4)", borderRadius: "var(--radius-md)", border: `1px solid ${selectedOptionId === option.id ? "var(--accent-cyan)" : "var(--border-glass)"}`, background: selectedOptionId === option.id ? "rgba(0, 229, 255, 0.08)" : "var(--bg-surface-secondary)", color: "var(--text-primary)", textAlign: "left" }}>
                {option.option_text}
              </button>
            ))}
          </div>
        ) : (
          <textarea value={answerText} onChange={(event) => setAnswerText(event.target.value)} rows={3} placeholder="Type your answer" style={{ width: "100%", resize: "vertical", background: "var(--bg-surface-secondary)", border: "1px solid var(--border-glass)", borderRadius: "var(--radius-md)", padding: "var(--space-3)", color: "var(--text-primary)" }} />
        )}
        <div className="cluster" style={{ justifyContent: "flex-end" }}>
          <Button onClick={submitCurrent} isLoading={isSubmitting} disabled={isChoiceQuestion ? !selectedOptionId : !answerText.trim()}>{index + 1 === questions.length ? "Submit and finish" : "Submit and continue"}</Button>
        </div>
      </GlassCard>
      <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: "var(--space-3)" }}>Answers are recorded as you go. Correctness is not shown until the quiz is complete.</p>
    </div>
  );
}
