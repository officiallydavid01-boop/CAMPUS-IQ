import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, XCircle, Trophy, Clock3 } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/Badge";
import { SkeletonText } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { useToast } from "@/components/ui/Toast";
import {
  getExamAttemptById,
  getExamById,
  getExamQuestions,
  getMyExamAnswers,
  getGradedAttemptCorrectAnswers,
} from "@/services/exams/examAttemptService";
import { getQuestionExplanation } from "@/services/practice/practiceService";
import { getCourseTopics } from "@/services/courses/coursesService";
import type { Exam, ExamAnswer, ExamAttempt, ExamQuestionWithDetails } from "@/types/database.types";

export function ResultDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { showToast } = useToast();
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<ExamQuestionWithDetails[]>([]);
  const [answers, setAnswers] = useState<Record<string, ExamAnswer>>({});
  const [correctOptionIds, setCorrectOptionIds] = useState<Set<string>>(new Set());
  const [correctAnswerTexts, setCorrectAnswerTexts] = useState<Record<string, string>>({});
  const [explanations, setExplanations] = useState<Record<string, string>>({});
  const [topicTitles, setTopicTitles] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  async function load() {
    if (!id) return;
    setIsLoading(true);
    setHasError(false);
    try {
      const attemptRow = await getExamAttemptById(id);
      setAttempt(attemptRow);
      if (!attemptRow) return;

      const examRow = await getExamById(attemptRow.exam_id);
      setExam(examRow);

      const [qs, answerRows] = await Promise.all([getExamQuestions(attemptRow.exam_id), getMyExamAnswers(attemptRow.id)]);
      setQuestions(qs);
      setAnswers(Object.fromEntries(answerRows.map((a) => [a.question_id, a])));
      const courseIds = [...new Set(qs.map((item) => item.question.course_id))];
      const topicLists = await Promise.all(courseIds.map((courseId) => getCourseTopics(courseId).catch(() => [])));
      setTopicTitles(Object.fromEntries(topicLists.flat().map((topic) => [topic.id, topic.title])));

      if (attemptRow.status === "graded") {
        const [correctRows, explanationRows] = await Promise.all([
          getGradedAttemptCorrectAnswers(attemptRow.id),
          Promise.all(qs.map(async (item) => ({ questionId: item.question_id, explanation: await getQuestionExplanation(item.question_id).catch(() => null) }))),
        ]);
        setCorrectOptionIds(new Set(correctRows.map((r) => r.optionId).filter((x): x is string => Boolean(x))));
        setCorrectAnswerTexts(Object.fromEntries(correctRows.filter((r) => r.answerText).map((r) => [r.questionId, r.answerText as string])));
        setExplanations(Object.fromEntries(explanationRows.filter((r) => r.explanation).map((r) => [r.questionId, r.explanation as string])));
      }
    } catch {
      setHasError(true);
      showToast("Couldn't load this result.", "error");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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

  if (!attempt || !exam) {
    return (
      <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
        <EmptyState title="Result not found." />
      </div>
    );
  }

  const percentage = attempt.max_score ? Math.round(((attempt.score ?? 0) / attempt.max_score) * 100) : null;
  const timeTakenSeconds = Math.max(0, Math.floor(((attempt.submitted_at ? Date.parse(attempt.submitted_at) : Date.now()) - Date.parse(attempt.started_at)) / 1000));
  const timeTakenLabel = `${Math.floor(timeTakenSeconds / 60)}m ${timeTakenSeconds % 60}s`;
  const topicBreakdown = new Map<string, { total: number; correct: number; pending: number }>();
  for (const item of questions) {
    const topicId = item.question.topic_id ?? "unassigned";
    const stats = topicBreakdown.get(topicId) ?? { total: 0, correct: 0, pending: 0 };
    stats.total += 1;
    const answer = answers[item.question_id];
    if (answer?.is_correct === true) stats.correct += 1;
    if (answer?.is_correct == null) stats.pending += 1;
    topicBreakdown.set(topicId, stats);
  }

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)", maxWidth: "680px" }}>
      <GlassCard className="stack" style={{ gap: "var(--space-3)", textAlign: "center", alignItems: "center", marginBottom: "var(--space-8)" }}>
        <Trophy size={32} style={{ color: "var(--accent-cyan)" }} aria-hidden="true" />
        <h1 style={{ fontSize: "var(--text-2xl)" }}>{exam.title}</h1>
        {attempt.status === "graded" ? (
          <>
            <div style={{ fontSize: "var(--text-4xl)", fontWeight: "var(--font-weight-bold)" }}>
              {attempt.score} / {attempt.max_score}
            </div>
            {percentage !== null && <Badge tone={percentage >= 50 ? "success" : "error"}>{percentage}%</Badge>}
          </>
        ) : (
          <Badge tone="warning">Awaiting manual review</Badge>
        )}
      </GlassCard>

      <GlassCard className="cluster" style={{ justifyContent: "space-between", gap: "var(--space-3)", marginBottom: "var(--space-6)", flexWrap: "wrap" }}>
        <div><p style={{ color: "var(--text-secondary)", fontSize: "var(--text-xs)" }}>Time taken</p><strong>{timeTakenLabel}</strong></div>
        <div><p style={{ color: "var(--text-secondary)", fontSize: "var(--text-xs)" }}>Correct</p><strong>{Object.values(answers).filter((answer) => answer.is_correct === true).length}</strong></div>
        <div><p style={{ color: "var(--text-secondary)", fontSize: "var(--text-xs)" }}>Incorrect</p><strong>{Object.values(answers).filter((answer) => answer.is_correct === false).length}</strong></div>
        <div><p style={{ color: "var(--text-secondary)", fontSize: "var(--text-xs)" }}>XP rewards</p><strong>{attempt.xp_awarded}</strong></div>
      </GlassCard>

      {(attempt.status === "graded" || attempt.status === "submitted") && (
        <>
        <GlassCard className="stack" style={{ gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
          <h2 style={{ fontSize: "var(--text-lg)" }}>Topic breakdown</h2>
          {[...topicBreakdown.entries()].map(([topicId, stats]) => <div key={topicId} className="cluster" style={{ justifyContent: "space-between", gap: "var(--space-3)" }}>
            <span style={{ fontSize: "var(--text-sm)" }}>{topicId === "unassigned" ? "Unassigned topic" : topicTitles[topicId] ?? "Topic"}</span>
            <span style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>{stats.correct}/{stats.total} correct{stats.pending ? ` · ${stats.pending} pending review` : ""}</span>
          </div>)}
        </GlassCard>
        <div className="stack" style={{ gap: "var(--space-4)" }}>
          {questions.map((eq, i) => {
            const answer = answers[eq.question_id];
            const isMcq = eq.question.question_type === "multiple_choice" || eq.question.question_type === "true_false";
            return (
              <GlassCard key={eq.question_id} className="stack" style={{ gap: "var(--space-2)" }}>
                <div className="cluster" style={{ gap: "var(--space-2)", justifyContent: "space-between" }}>
                  <p style={{ color: "var(--text-primary)" }}>
                    {i + 1}. {eq.question.prompt}
                  </p>
                  {answer?.is_correct === true ? (
                    <CheckCircle2 size={18} style={{ color: "var(--color-success)", flexShrink: 0 }} aria-label="Correct" />
                  ) : answer?.is_correct === false ? (
                    <XCircle size={18} style={{ color: "var(--color-error)", flexShrink: 0 }} aria-label="Incorrect" />
                  ) : (
                    <Clock3 size={18} style={{ color: "var(--color-warning)", flexShrink: 0 }} aria-label="Awaiting manual review" />
                  )}
                </div>
                {isMcq ? (
                  <div className="stack" style={{ gap: "var(--space-1)" }}>
                    {eq.options.map((opt) => {
                      const isYourAnswer = answer?.selected_option_id === opt.id;
                      const isTheCorrectOne = correctOptionIds.has(opt.id);
                      return (
                        <div
                          key={opt.id}
                          style={{
                            fontSize: "var(--text-sm)",
                            padding: "var(--space-2) var(--space-3)",
                            borderRadius: "var(--radius-sm)",
                            background: attempt.status === "graded" && isTheCorrectOne ? "var(--color-success-bg)" : attempt.status === "graded" && isYourAnswer && !isTheCorrectOne ? "var(--color-error-bg)" : "transparent",
                            color: isTheCorrectOne || isYourAnswer ? "var(--text-primary)" : "var(--text-secondary)",
                          }}
                        >
                          {opt.option_text}
                          {isYourAnswer && " (your answer)"}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="stack" style={{ gap: "var(--space-2)" }}>
                    <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>Your answer: {answer?.answer_text || "—"}</p>
                    {attempt.status === "graded" && correctAnswerTexts[eq.question_id] && <p style={{ fontSize: "var(--text-sm)" }}>Expected answer: {correctAnswerTexts[eq.question_id]}</p>}
                  </div>
                )}
                {attempt.status === "submitted" && answer?.is_correct === null && <p role="status" style={{ fontSize: "var(--text-sm)", color: "var(--color-warning)" }}>This response is awaiting manual marking.</p>}
                {attempt.status === "graded" && explanations[eq.question_id] && <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}><strong>Explanation:</strong> {explanations[eq.question_id]}</p>}
              </GlassCard>
            );
          })}
        </div>
        </>
      )}
    </div>
  );
}
