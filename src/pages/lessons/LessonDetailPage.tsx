import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle2, Download, Target, Lightbulb, ListChecks } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SkeletonText } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/app/providers/AuthProvider";
import { getLessonById, getAdjacentLessons, getLessonMaterials } from "@/services/courses/coursesService";
import { getLessonProgress, markLessonComplete } from "@/services/learning/progressService";
import { supabase } from "@/services/supabase/client";
import { ROUTES } from "@/app/router/routes";
import type { Lesson, MaterialWithFile } from "@/types/database.types";

interface LocationState {
  courseOfferingId?: string;
  topicId?: string;
}

/**
 * Lesson content + Previous/Complete/Next controls (Master Spec section
 * 35). Adjacent-lesson lookup uses `lesson.topic_id` from the fetched
 * lesson itself (never the caller-supplied :id alone), so this page works
 * correctly even reached via a bookmark/direct link with no router state.
 */
export function LessonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const state = (location.state as LocationState | null) ?? null;

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [materials, setMaterials] = useState<MaterialWithFile[]>([]);
  const [adjacent, setAdjacent] = useState<{ previous: Lesson | null; next: Lesson | null }>({ previous: null, next: null });
  const [isComplete, setIsComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isMarking, setIsMarking] = useState(false);

  async function load() {
    if (!id || !user) return;
    setIsLoading(true);
    setHasError(false);
    try {
      const lessonRow = await getLessonById(id);
      setLesson(lessonRow);
      if (lessonRow) {
        const [adj, progress, mats] = await Promise.all([
          getAdjacentLessons(lessonRow.topic_id, lessonRow.display_order),
          getLessonProgress(user.id, lessonRow.id),
          getLessonMaterials(lessonRow.id),
        ]);
        setAdjacent(adj);
        setIsComplete(Boolean(progress?.completed_at));
        setMaterials(mats);
      }
    } catch {
      setHasError(true);
      showToast("Couldn't load this lesson.", "error");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user]);

  async function handleMarkComplete() {
    if (!user || !lesson) return;
    setIsMarking(true);
    try {
      await markLessonComplete(user.id, lesson.id, lesson.topic_id);
      setIsComplete(true);
      showToast("Lesson marked complete.", "success");
    } catch {
      showToast("Couldn't update your progress.", "error");
    } finally {
      setIsMarking(false);
    }
  }

  async function handleDownload(material: MaterialWithFile) {
    if (!material.file) return;
    try {
      const { data, error } = await supabase.storage
        .from(material.file.storage_bucket)
        .createSignedUrl(material.file.storage_path, 60);
      if (error || !data) throw error ?? new Error("No signed URL returned");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      showToast("Couldn't open that file.", "error");
    }
  }

  if (isLoading) {
    return (
      <div className="container" style={{ paddingBlock: "var(--space-8)", maxWidth: "720px" }}>
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

  if (!lesson) {
    return (
      <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
        <EmptyState title="Lesson not found." />
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)", maxWidth: "720px" }}>
      <button
        onClick={() => (state?.courseOfferingId && state?.topicId ? navigate(-1) : navigate(ROUTES.dashboard))}
        className="cluster"
        style={{ gap: "var(--space-2)", fontSize: "var(--text-sm)", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", marginBottom: "var(--space-6)" }}
      >
        <ArrowLeft size={14} aria-hidden="true" /> Back
      </button>

      <div className="cluster" style={{ justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
        <h1 style={{ fontSize: "var(--text-3xl)" }}>{lesson.title}</h1>
        {isComplete && <Badge tone="success"><CheckCircle2 size={12} /> Completed</Badge>}
      </div>

      {lesson.introduction && <p style={{ marginBottom: "var(--space-8)", fontSize: "var(--text-lg)" }}>{lesson.introduction}</p>}

      <div className="stack" style={{ gap: "var(--space-6)", marginBottom: "var(--space-8)" }}>
        {lesson.learning_objectives && lesson.learning_objectives.length > 0 && (
          <GlassCard>
            <h2 className="cluster" style={{ gap: "var(--space-2)", fontSize: "var(--text-base)", marginBottom: "var(--space-3)" }}>
              <Target size={16} aria-hidden="true" /> Learning objectives
            </h2>
            <ul style={{ margin: 0, paddingLeft: "var(--space-5)", color: "var(--text-secondary)" }}>
              {lesson.learning_objectives.map((obj, i) => (
                <li key={i}>{obj}</li>
              ))}
            </ul>
          </GlassCard>
        )}

        {lesson.core_concept && (
          <div>
            <h2 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-2)" }}>Core concept</h2>
            <p style={{ whiteSpace: "pre-wrap" }}>{lesson.core_concept}</p>
          </div>
        )}

        {lesson.detailed_explanation && (
          <div>
            <h2 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-2)" }}>Explanation</h2>
            <p style={{ whiteSpace: "pre-wrap" }}>{lesson.detailed_explanation}</p>
          </div>
        )}

        {lesson.examples && (
          <GlassCard>
            <h2 className="cluster" style={{ gap: "var(--space-2)", fontSize: "var(--text-base)", marginBottom: "var(--space-3)" }}>
              <Lightbulb size={16} aria-hidden="true" /> Examples
            </h2>
            <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{lesson.examples}</p>
          </GlassCard>
        )}

        {lesson.formulas && (
          <div>
            <h2 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-2)" }}>Formulas</h2>
            <p style={{ whiteSpace: "pre-wrap", fontFamily: "monospace" }}>{lesson.formulas}</p>
          </div>
        )}

        {lesson.key_points && lesson.key_points.length > 0 && (
          <GlassCard>
            <h2 className="cluster" style={{ gap: "var(--space-2)", fontSize: "var(--text-base)", marginBottom: "var(--space-3)" }}>
              <ListChecks size={16} aria-hidden="true" /> Key points
            </h2>
            <ul style={{ margin: 0, paddingLeft: "var(--space-5)", color: "var(--text-secondary)" }}>
              {lesson.key_points.map((point, i) => (
                <li key={i}>{point}</li>
              ))}
            </ul>
          </GlassCard>
        )}

        {lesson.notes && (
          <div>
            <h2 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-2)" }}>Notes</h2>
            <p style={{ whiteSpace: "pre-wrap" }}>{lesson.notes}</p>
          </div>
        )}

        {materials.length > 0 && (
          <GlassCard>
            <h2 style={{ fontSize: "var(--text-base)", marginBottom: "var(--space-3)" }}>Materials</h2>
            <div className="stack" style={{ gap: "var(--space-2)" }}>
              {materials.map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleDownload(m)}
                  disabled={!m.file}
                  className="cluster"
                  style={{ gap: "var(--space-2)", background: "none", border: "none", color: "var(--accent-cyan)", cursor: m.file ? "pointer" : "not-allowed", padding: 0, textAlign: "left" }}
                >
                  <Download size={14} aria-hidden="true" /> {m.title}
                </button>
              ))}
            </div>
          </GlassCard>
        )}
      </div>

      <div className="cluster" style={{ justifyContent: "space-between", gap: "var(--space-3)", flexWrap: "wrap" }}>
        {adjacent.previous ? (
          <Link to={ROUTES.lessonDetail.replace(":id", adjacent.previous.id)} state={state}>
            <Button variant="secondary">
              <ArrowLeft size={16} /> Previous
            </Button>
          </Link>
        ) : (
          <span />
        )}

        {!isComplete && (
          <Button onClick={handleMarkComplete} isLoading={isMarking}>
            Mark complete
          </Button>
        )}

        {adjacent.next ? (
          <Link to={ROUTES.lessonDetail.replace(":id", adjacent.next.id)} state={state}>
            <Button variant="secondary">
              Next <ArrowRight size={16} />
            </Button>
          </Link>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}
