import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, XCircle } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SkeletonText } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import {
  getPracticeQuestions,
  submitPracticeAnswer,
  endPracticeSession,
  getQuestionExplanation,
  type PracticeQuestion,
} from "@/services/practice/practiceService";
import { supabase } from "@/services/supabase/client";
import { ROUTES } from "@/app/router/routes";
import type { PracticeSession } from "@/types/database.types";

/**
 * The actual practice flow: one question at a time, immediate
 * right/wrong feedback + explanation once answered (Master Spec section
 * 34: "track correctness, attempts, accuracy... instant feedback" is the
 * whole point of practice mode, unlike exams).
 */
export function PracticeSessionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [session, setSession] = useState<PracticeSession | null>(null);
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [hasSubmittedAnswer, setHasSubmittedAnswer] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [startedAt, setStartedAt] = useState<number>(Date.now());

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const { data: sessionRow, error } = await supabase.from("practice_sessions").select("*").eq("id", id).single();
        if (error) throw error;
        setSession(sessionRow);
        const qs = await getPracticeQuestions({
          courseId: sessionRow.course_id ?? undefined,
          topicId: sessionRow.mode === "topic" ? sessionRow.topic_id ?? undefined : undefined,
          count: 10,
          mode: sessionRow.mode,
          studentId: sessionRow.student_id,
        });
        setQuestions(qs);
      } catch {
        showToast("Couldn't load practice questions.", "error");
      } finally {
        setIsLoading(false);
        setStartedAt(Date.now());
      }
    })();
  }, [id, showToast]);

  const current = questions[index];
  const isMultipleChoice = current?.question.question_type === "multiple_choice" || current?.question.question_type === "true_false";

  async function handleSubmitAnswer() {
    if (!session || !current) return;
    setIsSubmitting(true);
    try {
      const answer = await submitPracticeAnswer({
        practiceSessionId: session.id,
        questionId: current.question.id,
        selectedOptionId: selectedOptionId ?? undefined,
        answerText: isMultipleChoice ? undefined : answerText,
        responseTimeMs: Date.now() - startedAt,
      });
      setIsCorrect(answer.is_correct);
      setHasSubmittedAnswer(true);
      getQuestionExplanation(current.question.id)
        .then(setExplanation)
        .catch(() => {
          // Non-critical — the answer already submitted successfully;
          // just show no explanation rather than an error toast.
        });
    } catch {
      showToast("Couldn't submit that answer.", "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleNext() {
    setSelectedOptionId(null);
    setAnswerText("");
    setIsCorrect(null);
    setHasSubmittedAnswer(false);
    setExplanation(null);
    setStartedAt(Date.now());
    if (index + 1 < questions.length) {
      setIndex((i) => i + 1);
    } else {
      handleFinish();
    }
  }

  async function handleFinish() {
    if (session) await endPracticeSession(session.id).catch(() => {});
    navigate(ROUTES.practice);
  }

  if (isLoading) {
    return (
      <div className="container" style={{ paddingBlock: "var(--space-8)", maxWidth: "600px" }}>
        <SkeletonText lines={5} />
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="container" style={{ paddingBlock: "var(--space-8)", maxWidth: "600px" }}>
        <EmptyState
          title={session?.mode === "weak_topic" ? "No weak-topic questions yet." : "No practice questions available yet."}
          description={session?.mode === "weak_topic" ? "Answer some questions first. Questions you miss will appear here for targeted revision." : "Check back once your institution's Admin publishes some."}
        />
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)", maxWidth: "600px" }}>
      <div className="cluster" style={{ justifyContent: "space-between", marginBottom: "var(--space-6)" }}>
        <Badge tone="neutral">
          Question {index + 1} of {questions.length}
        </Badge>
        {session && (
          <Badge tone="accent">
            {session.correct_count} correct
          </Badge>
        )}
      </div>

      <GlassCard className="stack" style={{ gap: "var(--space-5)" }}>
        <p style={{ fontSize: "var(--text-lg)", color: "var(--text-primary)" }}>{current.question.prompt}</p>

        {isMultipleChoice ? (
          <div className="stack" style={{ gap: "var(--space-2)" }}>
            {current.options.map((opt) => {
              const isSelected = selectedOptionId === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => isCorrect === null && setSelectedOptionId(opt.id)}
                  disabled={hasSubmittedAnswer}
                  className="cluster"
                  style={{
                    justifyContent: "flex-start",
                    gap: "var(--space-3)",
                    padding: "var(--space-3) var(--space-4)",
                    borderRadius: "var(--radius-md)",
                    border: `1px solid ${isSelected ? "var(--accent-cyan)" : "var(--border-glass)"}`,
                    background: isSelected ? "rgba(0, 229, 255, 0.08)" : "var(--bg-surface-secondary)",
                    color: "var(--text-primary)",
                    textAlign: "left",
                    cursor: isCorrect === null ? "pointer" : "default",
                  }}
                >
                  {opt.option_text}
                </button>
              );
            })}
          </div>
        ) : (
          <input
            value={answerText}
            onChange={(e) => setAnswerText(e.target.value)}
            disabled={hasSubmittedAnswer}
            placeholder="Type your answer"
            style={{ background: "var(--bg-surface-secondary)", border: "1px solid var(--border-glass)", borderRadius: "var(--radius-md)", padding: "var(--space-3) var(--space-4)", color: "var(--text-primary)" }}
          />
        )}

        {isCorrect !== null && (
          <div
            className="cluster"
            style={{ gap: "var(--space-2)", padding: "var(--space-3)", borderRadius: "var(--radius-md)", background: isCorrect ? "var(--color-success-bg)" : "var(--color-error-bg)" }}
          >
            {isCorrect ? <CheckCircle2 size={18} style={{ color: "var(--color-success)" }} /> : <XCircle size={18} style={{ color: "var(--color-error)" }} />}
            <span style={{ fontSize: "var(--text-sm)" }}>{isCorrect ? "Correct!" : "Not quite."}</span>
          </div>
        )}

        {hasSubmittedAnswer && isCorrect === null && (
          <p role="status" style={{ fontSize: "var(--text-sm)", color: "var(--color-warning)" }}>Response recorded. This question needs self-review rather than automatic grading.</p>
        )}
        {hasSubmittedAnswer && explanation && (
          <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>{explanation}</p>
        )}

        <div className="cluster" style={{ justifyContent: "flex-end", gap: "var(--space-3)" }}>
          {!hasSubmittedAnswer ? (
            <Button onClick={handleSubmitAnswer} isLoading={isSubmitting} disabled={!selectedOptionId && !answerText}>
              Check answer
            </Button>
          ) : (
            <Button onClick={handleNext}>{index + 1 < questions.length ? "Next question" : "Finish"}</Button>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
