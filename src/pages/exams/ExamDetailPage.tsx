import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Clock, FileText } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Badge } from "@/components/ui/Badge";
import { SkeletonText } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/app/providers/AuthProvider";
import {
  getExamById,
  getExamQuestions,
  getMyInProgressAttempt,
  startExamAttempt,
  getMyExamAnswers,
  saveExamAnswer,
  submitExamAttempt,
  countMyAttempts,
} from "@/services/exams/examAttemptService";
import { ROUTES } from "@/app/router/routes";
import type { Exam, ExamAnswer, ExamAttempt, ExamQuestionWithDetails } from "@/types/database.types";

/**
 * Exam-taking flow: Start -> answer every question (auto-saved per
 * change via saveExamAnswer, so a refresh mid-exam doesn't lose
 * progress) -> Submit, which transitions the attempt to 'submitted' and
 * immediately calls the grading RPC (see examAttemptService.ts
 * submitExamAttempt — two separate steps, deliberately, for the reasons
 * documented there).
 */
export function ExamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [exam, setExam] = useState<Exam | null>(null);
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null);
  const [questions, setQuestions] = useState<ExamQuestionWithDetails[]>([]);
  const [answers, setAnswers] = useState<Record<string, ExamAnswer>>({});
  const [attemptCount, setAttemptCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitConfirmOpen, setIsSubmitConfirmOpen] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const submitLockRef = useRef(false);

  async function load() {
    if (!id || !user) return;
    setIsLoading(true);
    setHasError(false);
    setAttempt(null);
    setQuestions([]);
    setAnswers({});
    setRemainingSeconds(null);
    try {
      const examRow = await getExamById(id);
      setExam(examRow);
      if (!examRow) return;

      const [inProgress, count] = await Promise.all([getMyInProgressAttempt(user.id, id), countMyAttempts(user.id, id)]);
      setAttemptCount(count);

      if (inProgress) {
        setAttempt(inProgress);
        const [qs, existingAnswers] = await Promise.all([getExamQuestions(id), getMyExamAnswers(inProgress.id)]);
        setQuestions(qs);
        setAnswers(Object.fromEntries(existingAnswers.map((a) => [a.question_id, a])));
      }
    } catch {
      setHasError(true);
      showToast("Couldn't load this exam.", "error");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user]);

  async function handleStart() {
    if (!user || !id) return;
    setIsStarting(true);
    try {
      const newAttempt = await startExamAttempt(user.id, id);
      setAttempt(newAttempt);
      setQuestions(await getExamQuestions(id));
      setAnswers({});
    } catch {
      showToast("Couldn't start the exam.", "error");
    } finally {
      setIsStarting(false);
    }
  }

  async function handleAnswerChange(questionId: string, patch: { selectedOptionId?: string; answerText?: string }) {
    if (!attempt) return;
    try {
      const saved = await saveExamAnswer({ examAttemptId: attempt.id, questionId, ...patch });
      setAnswers((prev) => ({ ...prev, [questionId]: saved }));
    } catch {
      showToast("Couldn't save that answer.", "error");
    }
  }

  const handleSubmit = useCallback(async () => {
    if (!attempt || submitLockRef.current) return;
    submitLockRef.current = true;
    setIsSubmitting(true);
    try {
      const graded = await submitExamAttempt(attempt.id);
      navigate(ROUTES.resultDetail.replace(":id", graded.id));
    } catch {
      showToast("Couldn't submit the exam. Check your connection and retry.", "error");
      submitLockRef.current = false;
    } finally {
      setIsSubmitting(false);
    }
  }, [attempt, navigate, showToast]);

  // Countdown is derived from the server-created started_at timestamp rather
  // than from when this page mounted, so refresh/resume does not reset time.
  useEffect(() => {
    if (!attempt || !exam || attempt.status !== "in_progress") return;
    const deadline = Date.parse(attempt.started_at) + exam.duration_minutes * 60_000;
    let timer: number | undefined;
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemainingSeconds(seconds);
      if (seconds === 0) {
        if (timer !== undefined) window.clearInterval(timer);
        void handleSubmit();
      }
    };
    timer = window.setInterval(tick, 1000);
    tick();
    return () => {
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [attempt, exam, handleSubmit]);

  if (isLoading) {
    return (
      <div className="container" style={{ paddingBlock: "var(--space-8)", maxWidth: "680px" }}>
        <SkeletonText lines={6} />
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

  if (!exam) {
    return (
      <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
        <EmptyState title="Exam not found." />
      </div>
    );
  }

  const atAttemptLimit = exam.attempt_limit !== null && attemptCount >= exam.attempt_limit;

  if (!attempt) {
    return (
      <div className="container" style={{ paddingBlock: "var(--space-8)", maxWidth: "560px" }}>
        <GlassCard className="stack" style={{ gap: "var(--space-4)", textAlign: "center", alignItems: "center" }}>
          <FileText size={32} style={{ color: "var(--accent-cyan)" }} aria-hidden="true" />
          <h1 style={{ fontSize: "var(--text-2xl)" }}>{exam.title}</h1>
          {exam.description && <p>{exam.description}</p>}
          <div className="cluster" style={{ gap: "var(--space-2)" }}>
            <Badge tone="neutral"><Clock size={12} /> {exam.duration_minutes} min</Badge>
            <Badge tone="neutral">{exam.question_count} questions</Badge>
          </div>
          {atAttemptLimit ? (
            <p style={{ color: "var(--color-warning)", fontSize: "var(--text-sm)" }}>
              You've used all {exam.attempt_limit} of your attempts for this exam.
            </p>
          ) : (
            <Button onClick={handleStart} isLoading={isStarting}>
              Start exam
            </Button>
          )}
        </GlassCard>
      </div>
    );
  }

  const answeredCount = Object.keys(answers).length;

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)", maxWidth: "680px" }}>
      <div className="cluster" style={{ justifyContent: "space-between", marginBottom: "var(--space-6)" }}>
        <h1 style={{ fontSize: "var(--text-2xl)" }}>{exam.title}</h1>
        <div className="cluster" style={{ gap: "var(--space-2)" }}>
          <Badge tone="accent">{answeredCount} / {questions.length} answered</Badge>
          <Badge tone={remainingSeconds !== null && remainingSeconds <= 60 ? "error" : "neutral"}>
            <Clock size={12} aria-hidden="true" /> {remainingSeconds === null ? "--:--" : `${Math.floor(remainingSeconds / 60).toString().padStart(2, "0")}:${(remainingSeconds % 60).toString().padStart(2, "0")}`}
          </Badge>
        </div>
      </div>
      {remainingSeconds === 0 && <p role="status" style={{ color: "var(--color-warning)", marginBottom: "var(--space-4)" }}>Time is up. Submitting your answers…</p>}

      <nav aria-label="Jump to exam question" className="cluster" style={{ gap: "var(--space-2)", flexWrap: "wrap", marginBottom: "var(--space-4)" }}>
        {questions.map((question, index) => <Button key={question.question_id} type="button" size="sm" variant={answers[question.question_id] ? "secondary" : "ghost"} aria-label={`Go to question ${index + 1}${answers[question.question_id] ? ", answered" : ", unanswered"}`} onClick={() => document.getElementById(`exam-question-${question.question_id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{index + 1}</Button>)}
      </nav>

      <div className="stack" style={{ gap: "var(--space-5)" }}>
        {questions.map((eq, i) => {
          const isMcq = eq.question.question_type === "multiple_choice" || eq.question.question_type === "true_false";
          const answer = answers[eq.question_id];
          return (
            <GlassCard key={eq.question_id} id={`exam-question-${eq.question_id}`} className="stack" style={{ gap: "var(--space-3)", scrollMarginTop: "var(--space-6)" }}>
              <p style={{ color: "var(--text-primary)" }}>
                {i + 1}. {eq.question.prompt}
              </p>
              {isMcq ? (
                <div className="stack" style={{ gap: "var(--space-2)" }}>
                  {eq.options.map((opt) => (
                    <label key={opt.id} className="cluster" style={{ gap: "var(--space-2)", fontSize: "var(--text-sm)" }}>
                      <input
                        type="radio"
                        name={`q-${eq.question_id}`}
                        checked={answer?.selected_option_id === opt.id}
                        disabled={remainingSeconds === 0 || isSubmitting}
                        onChange={() => handleAnswerChange(eq.question_id, { selectedOptionId: opt.id })}
                      />
                      {opt.option_text}
                    </label>
                  ))}
                </div>
              ) : (
                <input
                  defaultValue={answer?.answer_text ?? ""}
                  disabled={remainingSeconds === 0 || isSubmitting}
                  onBlur={(e) => handleAnswerChange(eq.question_id, { answerText: e.target.value })}
                  placeholder="Your answer"
                  style={{ background: "var(--bg-surface-secondary)", border: "1px solid var(--border-glass)", borderRadius: "var(--radius-md)", padding: "var(--space-2) var(--space-3)", color: "var(--text-primary)" }}
                />
              )}
            </GlassCard>
          );
        })}
      </div>

      <div className="cluster" style={{ justifyContent: "flex-end", marginTop: "var(--space-6)" }}>
        <Button onClick={() => setIsSubmitConfirmOpen(true)} isLoading={isSubmitting} disabled={isSubmitting}>
          {remainingSeconds === 0 ? "Submit expired exam" : "Submit exam"}
        </Button>
      </div>
      <ConfirmDialog
        isOpen={isSubmitConfirmOpen}
        title="Submit this exam?"
        description={`You have answered ${answeredCount} of ${questions.length} questions. Unanswered questions will count as incorrect. You cannot change answers after submission.`}
        confirmLabel="Submit exam"
        isLoading={isSubmitting}
        onCancel={() => setIsSubmitConfirmOpen(false)}
        onConfirm={() => { setIsSubmitConfirmOpen(false); void handleSubmit(); }}
      />
    </div>
  );
}
