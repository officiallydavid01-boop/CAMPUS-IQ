import { supabase } from "@/services/supabase/client";

/**
 * Real, database-derived aggregates only (Master Spec section 58:
 * "calculate analytics from real data... do not manufacture analytics").
 * This is Phase 5's modest slice — overall practice accuracy and exam
 * history. Per-topic weak-area breakdowns, study-time trends, and
 * streak-aware framing are deferred to whichever later phase needs them
 * (Phase 6 gamification touches some of this), so this file stays small
 * rather than half-implementing a bigger analytics surface.
 */

export interface PracticeAccuracySummary {
  totalQuestions: number;
  totalCorrect: number;
  accuracyPercent: number | null;
}

export async function getPracticeAccuracySummary(studentId: string): Promise<PracticeAccuracySummary> {
  const { data: sessions, error: sessionsError } = await supabase
    .from("practice_sessions")
    .select("id")
    .eq("student_id", studentId);
  if (sessionsError) throw sessionsError;
  const sessionIds = (sessions ?? []).map((session) => session.id);
  if (sessionIds.length === 0) return { totalQuestions: 0, totalCorrect: 0, accuracyPercent: null };

  // Only auto-graded answers count toward accuracy. Structured responses still
  // awaiting self-review are activity, not a false/wrong mark.
  const { data: answers, error } = await supabase
    .from("practice_answers")
    .select("is_correct")
    .in("practice_session_id", sessionIds)
    .not("is_correct", "is", null);
  if (error) throw error;
  const totalQuestions = answers?.length ?? 0;
  const totalCorrect = (answers ?? []).filter((answer) => answer.is_correct === true).length;
  return {
    totalQuestions,
    totalCorrect,
    accuracyPercent: totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : null,
  };
}

export interface ExamHistoryRow {
  attemptId: string;
  examId: string;
  examTitle: string;
  score: number | null;
  maxScore: number | null;
  submittedAt: string | null;
}

export async function getExamHistory(studentId: string): Promise<ExamHistoryRow[]> {
  const { data, error } = await supabase
    .from("exam_attempts")
    .select("*, exam:exams(title)")
    .eq("student_id", studentId)
    .eq("status", "graded")
    .order("submitted_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => {
    const r = row as unknown as { id: string; exam_id: string; score: number | null; max_score: number | null; submitted_at: string | null; exam: { title: string } | null };
    return {
      attemptId: r.id,
      examId: r.exam_id,
      examTitle: r.exam?.title ?? "Exam",
      score: r.score,
      maxScore: r.max_score,
      submittedAt: r.submitted_at,
    };
  });
}

export interface TopicPerformanceRow {
  topicId: string;
  topicTitle: string;
  answered: number;
  correct: number;
  accuracyPercent: number;
}

export interface DailyPracticePoint {
  date: string;
  questions: number;
  correct: number;
}

export interface ExtendedAnalytics {
  trackedStudyMinutes: number;
  topicPerformance: TopicPerformanceRow[];
  lastSevenDays: DailyPracticePoint[];
}

/** Builds topic-level strengths/weaknesses from the student's own recorded
 * answers. Ungraded structured responses are excluded instead of counted wrong. */
export async function getExtendedAnalytics(studentId: string): Promise<ExtendedAnalytics> {
  const [sessionsResult, studyResult] = await Promise.all([
    supabase.from("practice_sessions").select("id, started_at, ended_at, question_count, correct_count").eq("student_id", studentId),
    supabase.from("study_sessions").select("duration_minutes").eq("student_id", studentId),
  ]);
  if (sessionsResult.error) throw sessionsResult.error;
  if (studyResult.error) throw studyResult.error;
  const sessions = sessionsResult.data ?? [];
  const sessionIds = sessions.map((session) => session.id);

  let topicPerformance: TopicPerformanceRow[] = [];
  if (sessionIds.length > 0) {
    const { data: answers, error: answersError } = await supabase
      .from("practice_answers")
      .select("question_id, is_correct")
      .in("practice_session_id", sessionIds)
      .not("is_correct", "is", null);
    if (answersError) throw answersError;

    const questionIds = [...new Set((answers ?? []).map((answer) => answer.question_id))];
    if (questionIds.length > 0) {
      const { data: questions, error: questionsError } = await supabase
        .from("questions_public")
        .select("id, topic_id")
        .in("id", questionIds);
      if (questionsError) throw questionsError;
      const topicIds = [...new Set((questions ?? []).map((question) => question.topic_id).filter((id): id is string => Boolean(id)))];
      const { data: topics, error: topicsError } = topicIds.length
        ? await supabase.from("course_topics").select("id, title").in("id", topicIds)
        : { data: [], error: null };
      if (topicsError) throw topicsError;
      const questionTopic = new Map<string, string | null>((questions ?? []).map((question) => [question.id, question.topic_id] as [string, string | null]));
      const topicStats = new Map<string, { answered: number; correct: number }>();
      for (const answer of answers ?? []) {
        const topicId = questionTopic.get(answer.question_id);
        if (!topicId) continue;
        const stat = topicStats.get(topicId) ?? { answered: 0, correct: 0 };
        stat.answered += 1;
        if (answer.is_correct === true) stat.correct += 1;
        topicStats.set(topicId, stat);
      }
      topicPerformance = [...topicStats.entries()].map(([topicId, stat]) => ({
        topicId,
        topicTitle: topics?.find((topic) => topic.id === topicId)?.title ?? "Topic",
        answered: stat.answered,
        correct: stat.correct,
        accuracyPercent: stat.answered ? Math.round((stat.correct / stat.answered) * 100) : 0,
      })).sort((a, b) => a.accuracyPercent - b.accuracyPercent);
    }
  }

  const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const today = new Date();
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);
  const dailyMap = new Map<string, DailyPracticePoint>();
  for (let i = 0; i < 7; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    const key = dateKey(day);
    dailyMap.set(key, { date: key, questions: 0, correct: 0 });
  }
  for (const session of sessions) {
    const key = dateKey(new Date(session.started_at));
    const point = dailyMap.get(key);
    if (point) {
      point.questions += session.question_count;
      point.correct += session.correct_count;
    }
  }

  const recordedMinutes = (studyResult.data ?? []).reduce((sum, row) => sum + (row.duration_minutes ?? 0), 0);
  const practiceMinutes = sessions.reduce((sum, session) => {
    if (!session.ended_at) return sum;
    return sum + Math.max(0, Math.round((Date.parse(session.ended_at) - Date.parse(session.started_at)) / 60_000));
  }, 0);

  return {
    trackedStudyMinutes: recordedMinutes + practiceMinutes,
    topicPerformance,
    lastSevenDays: [...dailyMap.values()],
  };
}
