
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import "katex/dist/katex.min.css";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  BookOpen,
  Clock3,
  Download,
  Lightbulb,
  ListChecks,
  ListTree,
  Target,
  Trophy,
} from "lucide-react";

import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SkeletonText } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/app/providers/AuthProvider";
import {
  getLessonById,
  getAdjacentLessons,
  getLessonMaterials,
} from "@/services/courses/coursesService";
import {
  getLessonProgress,
  markLessonComplete,
} from "@/services/learning/progressService";
import { supabase } from "@/services/supabase/client";
import { ROUTES } from "@/app/router/routes";
import type {
  Lesson,
  MaterialWithFile,
} from "@/types/database.types";


const lessonSanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "svg",
    "g",
    "path",
    "rect",
    "circle",
    "ellipse",
    "line",
    "polyline",
    "polygon",
    "text",
    "tspan",
    "defs",
    "marker",
    "title",
    "desc",
    "linearGradient",
    "stop",
    "clipPath",
  ],
  attributes: {
    ...defaultSchema.attributes,
    "*": [
      ...(defaultSchema.attributes?.["*"] ?? []),
      "aria-label",
      "role",
    ],
    svg: ["xmlns", "viewBox", "width", "height", "preserveAspectRatio"],
    g: ["transform", "fill", "stroke", "strokeWidth", "strokeLinecap", "strokeLinejoin", "opacity"],
    path: ["d", "fill", "stroke", "strokeWidth", "strokeLinecap", "strokeLinejoin", "fillRule", "transform", "opacity"],
    rect: ["x", "y", "width", "height", "rx", "ry", "fill", "stroke", "strokeWidth", "opacity"],
    circle: ["cx", "cy", "r", "fill", "stroke", "strokeWidth", "opacity"],
    ellipse: ["cx", "cy", "rx", "ry", "fill", "stroke", "strokeWidth", "opacity"],
    line: ["x1", "y1", "x2", "y2", "stroke", "strokeWidth", "strokeLinecap", "opacity"],
    polyline: ["points", "fill", "stroke", "strokeWidth", "strokeLinecap", "strokeLinejoin"],
    polygon: ["points", "fill", "stroke", "strokeWidth", "strokeLinejoin"],
    text: ["x", "y", "dx", "dy", "fill", "fontSize", "fontFamily", "fontWeight", "textAnchor"],
    tspan: ["x", "y", "dx", "dy", "fill", "fontSize", "fontFamily", "fontWeight"],
    marker: ["id", "markerWidth", "markerHeight", "refX", "refY", "orient", "markerUnits", "viewBox"],
    linearGradient: ["id", "x1", "y1", "x2", "y2", "gradientUnits"],
    stop: ["offset", "stopColor", "stopOpacity"],
    clipPath: ["id", "clipPathUnits"],
  },
};

interface LocationState {
  courseOfferingId?: string;
  topicId?: string;
}

interface LessonSection {
  id: string;
  title: string;
  icon: typeof BookOpen;
  content: string;
  kind: "text" | "example" | "formula";
}

interface LessonMarkdownProps {
  content: string;
  kind?: LessonSection["kind"];
}

function LessonMarkdown({
  content,
  kind = "text",
}: LessonMarkdownProps) {
  return (
    <div
      className="lesson-markdown"
      style={{
        minWidth: 0,
        overflowWrap: "anywhere",
        lineHeight: 1.9,
        color: "var(--text-secondary)",
        fontSize:
          kind === "formula"
            ? "var(--text-sm)"
            : "var(--text-base)",
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
  rehypeRaw,
  [rehypeSanitize, lessonSanitizeSchema],
  rehypeKatex,
]}
        components={{
svg: ({ children, ...props }) => (
  <svg
    {...props}
    style={{
      display: "block",
      maxWidth: "100%",
      height: "auto",
      margin: "1rem auto",
      ...props.style,
    }}
  >
    {children}
  </svg>
),
          h1: ({ children }) => (
            <h1
              style={{
                fontSize: "1.8rem",
                lineHeight: 1.3,
                margin: "1.2em 0 0.6em",
                color: "var(--text-primary)",
                overflowWrap: "anywhere",
              }}
            >
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2
              style={{
                fontSize: "1.45rem",
                lineHeight: 1.4,
                margin: "1.1em 0 0.5em",
                color: "var(--text-primary)",
                overflowWrap: "anywhere",
              }}
            >
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3
              style={{
                fontSize: "1.2rem",
                lineHeight: 1.5,
                margin: "1em 0 0.4em",
                color: "var(--text-primary)",
              }}
            >
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p
              style={{
                margin: "0.65em 0 1em",
                overflowWrap: "anywhere",
              }}
            >
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul
              style={{
                paddingLeft: "1.5rem",
                margin: "0.6em 0 1em",
              }}
            >
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol
              style={{
                paddingLeft: "1.5rem",
                margin: "0.6em 0 1em",
              }}
            >
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li style={{ paddingLeft: "0.2rem", marginBottom: "0.35em" }}>
              {children}
            </li>
          ),
          strong: ({ children }) => (
            <strong
              style={{
                color: "var(--text-primary)",
                fontWeight: 700,
              }}
            >
              {children}
            </strong>
          ),
          blockquote: ({ children }) => (
            <blockquote
              style={{
                margin: "1em 0",
                padding: "0.6rem 1rem",
                borderLeft: "3px solid var(--accent-cyan)",
                background:
                  "var(--surface-secondary, rgba(255,255,255,0.04))",
                borderRadius: "0 8px 8px 0",
              }}
            >
              {children}
            </blockquote>
          ),
          hr: () => (
            <hr
              style={{
                border: 0,
                borderTop:
                  "1px solid var(--border-subtle, rgba(255,255,255,0.12))",
                margin: "1.5rem 0",
              }}
            />
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "var(--accent-cyan)",
                textDecoration: "underline",
                overflowWrap: "anywhere",
              }}
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div
              style={{
                width: "100%",
                overflowX: "auto",
                margin: "1rem 0",
                borderRadius: "8px",
              }}
            >
              <table
                style={{
                  width: "100%",
                  minWidth: "320px",
                  borderCollapse: "collapse",
                  fontSize: "var(--text-sm)",
                }}
              >
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th
              style={{
                padding: "0.7rem",
                textAlign: "left",
                border: "1px solid var(--border-subtle, rgba(255,255,255,0.12))",
                background:
                  "var(--surface-secondary, rgba(255,255,255,0.06))",
                color: "var(--text-primary)",
              }}
            >
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td
              style={{
                padding: "0.7rem",
                verticalAlign: "top",
                border: "1px solid var(--border-subtle, rgba(255,255,255,0.12))",
              }}
            >
              {children}
            </td>
          ),
          pre: ({ children }) => (
            <pre
              style={{
                padding: "1rem",
                margin: "1rem 0",
                overflowX: "auto",
                maxWidth: "100%",
                borderRadius: "8px",
                background:
                  "var(--surface-secondary, rgba(0,0,0,0.18))",
                border:
                  "1px solid var(--border-subtle, rgba(255,255,255,0.1))",
                fontSize: "0.875rem",
                lineHeight: 1.65,
              }}
            >
              {children}
            </pre>
          ),
          code: ({ children, className }) => (
            <code
              className={className}
              style={{
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "0.92em",
                overflowWrap: "anywhere",
              }}
            >
              {children}
            </code>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

const sectionId = (value: string) =>
  `lesson-section-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

const formatReadingTime = (text: string) => {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.ceil(words / 200))} min read`;
};

export function LessonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const state = (location.state as LocationState | null) ?? null;

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [materials, setMaterials] = useState<MaterialWithFile[]>([]);
  const [adjacent, setAdjacent] = useState<{
    previous: Lesson | null;
    next: Lesson | null;
  }>({ previous: null, next: null });

  const [isComplete, setIsComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isMarking, setIsMarking] = useState(false);
  const [readingProgress, setReadingProgress] = useState(0);
  const [showContents, setShowContents] = useState(true);

  const load = useCallback(async () => {
    if (!id || !user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setHasError(false);

    try {
      const lessonRow = await getLessonById(id);

      if (!lessonRow) {
        setLesson(null);
        setMaterials([]);
        setAdjacent({ previous: null, next: null });
        setIsComplete(false);
        return;
      }

      const [adj, progress, mats] = await Promise.all([
        getAdjacentLessons(lessonRow.topic_id, lessonRow.display_order),
        getLessonProgress(user.id, lessonRow.id),
        getLessonMaterials(lessonRow.id),
      ]);

      setLesson(lessonRow);
      setAdjacent(adj);
      setIsComplete(Boolean(progress?.completed_at));
      setMaterials(mats);
      setReadingProgress(0);
    } catch {
      setHasError(true);
      showToast("Couldn't load this lesson.", "error");
    } finally {
      setIsLoading(false);
    }
  }, [id, user, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!lesson) return;

    let ticking = false;

    const updateProgress = () => {
      if (ticking) return;
      ticking = true;

      window.requestAnimationFrame(() => {
        const scrollableHeight =
          document.documentElement.scrollHeight - window.innerHeight;

        const progress =
          scrollableHeight <= 0
            ? 100
            : Math.round((window.scrollY / scrollableHeight) * 100);

        setReadingProgress(Math.min(100, Math.max(0, progress)));
        ticking = false;
      });
    };

    updateProgress();

    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress);

    return () => {
      window.removeEventListener("scroll", updateProgress);
      window.removeEventListener("resize", updateProgress);
    };
  }, [lesson]);

  const sections = useMemo<LessonSection[]>(() => {
    if (!lesson) return [];

    const result: LessonSection[] = [];

    if (lesson.core_concept?.trim()) {
      result.push({
        id: sectionId("core-concept"),
        title: "Core concept",
        icon: Lightbulb,
        content: lesson.core_concept,
        kind: "text",
      });
    }

    if (lesson.detailed_explanation?.trim()) {
      result.push({
        id: sectionId("explanation"),
        title: "Detailed explanation",
        icon: BookOpen,
        content: lesson.detailed_explanation,
        kind: "text",
      });
    }

    if (lesson.examples?.trim()) {
      result.push({
        id: sectionId("examples"),
        title: "Worked examples",
        icon: Lightbulb,
        content: lesson.examples,
        kind: "example",
      });
    }

    if (lesson.formulas?.trim()) {
      result.push({
        id: sectionId("formulas"),
        title: "Formulas",
        icon: ListChecks,
        content: lesson.formulas,
        kind: "formula",
      });
    }

    if (lesson.key_points?.length) {
      result.push({
        id: sectionId("key-points"),
        title: "Key takeaways",
        icon: Target,
        content: lesson.key_points.join("\n"),
        kind: "text",
      });
    }

    if (lesson.notes?.trim()) {
      result.push({
        id: sectionId("notes"),
        title: "Study notes",
        icon: ListChecks,
        content: lesson.notes,
        kind: "text",
      });
    }

    return result;
  }, [lesson]);

  const readingText = useMemo(() => {
    if (!lesson) return "";

    return [
      lesson.introduction,
      ...sections.map((section) => section.content),
      ...(lesson.learning_objectives ?? []),
    ]
      .filter(Boolean)
      .join(" ");
  }, [lesson, sections]);

  function scrollToSection(targetId: string) {
    document.getElementById(targetId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  async function handleMarkComplete() {
    if (!user || !lesson || isComplete || isMarking) return;

    setIsMarking(true);

    try {
      await markLessonComplete(user.id, lesson.id, lesson.topic_id);

      setIsComplete(true);
      setReadingProgress(100);
      showToast("Lesson marked complete. Great work!", "success");
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

      if (error || !data) {
        throw error ?? new Error("No signed URL returned");
      }

      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      showToast("Couldn't open that file.", "error");
    }
  }

  if (isLoading) {
    return (
      <div
        className="container"
        style={{ paddingBlock: "var(--space-8)", maxWidth: "760px" }}
      >
        <SkeletonText lines={6} />
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
        <ErrorState onRetry={() => void load()} />
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

  const readingTime = formatReadingTime(readingText);

  return (
    <div
      className="container"
      style={{
        paddingTop: "var(--space-5)",
        paddingBottom: "var(--space-10)",
        maxWidth: "1000px",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: `${readingProgress}%`,
          height: "3px",
          background: "var(--accent-cyan)",
          zIndex: 100,
          transition: "width 120ms linear",
        }}
      />

      <button
        onClick={() =>
          state?.courseOfferingId && state?.topicId
            ? navigate(-1)
            : navigate(ROUTES.dashboard)
        }
        className="cluster"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--space-2)",
          minHeight: "44px",
          padding: "var(--space-2) 0",
          marginBottom: "var(--space-5)",
          fontSize: "var(--text-sm)",
          color: "var(--text-muted)",
          background: "none",
          border: "none",
          cursor: "pointer",
        }}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Back to learning
      </button>

      <header style={{ marginBottom: "var(--space-6)" }}>
        <div
          className="cluster"
          style={{
            gap: "var(--space-2)",
            marginBottom: "var(--space-3)",
            flexWrap: "wrap",
          }}
        >
          <Badge tone="default">
            <BookOpen size={12} aria-hidden="true" />
            Lesson
          </Badge>

          {isComplete && (
            <Badge tone="success">
              <CheckCircle2 size={12} aria-hidden="true" />
              Completed
            </Badge>
          )}
        </div>

        <h1
          style={{
            fontSize: "clamp(1.65rem, 5vw, 2.5rem)",
            lineHeight: 1.2,
            overflowWrap: "anywhere",
            marginBottom: "var(--space-4)",
          }}
        >
          {lesson.title}
        </h1>

        {lesson.introduction && (
          <LessonMarkdown content={lesson.introduction} />
        )}

        <div
          className="cluster"
          style={{
            gap: "var(--space-4)",
            flexWrap: "wrap",
            color: "var(--text-muted)",
            fontSize: "var(--text-sm)",
          }}
        >
          <span className="cluster" style={{ gap: "var(--space-1)" }}>
            <Clock3 size={15} aria-hidden="true" />
            {readingTime}
          </span>

          <span className="cluster" style={{ gap: "var(--space-1)" }}>
            <ListTree size={15} aria-hidden="true" />
            {sections.length} learning sections
          </span>

          <span>{readingProgress}% page progress</span>
        </div>
      </header>

      <GlassCard>
        <div
          className="cluster"
          style={{
            justifyContent: "space-between",
            gap: "var(--space-3)",
            marginBottom: "var(--space-2)",
          }}
        >
          <span style={{ fontWeight: 600 }}>
            {isComplete ? "Lesson completed" : "Your reading progress"}
          </span>

          {isComplete ? (
            <Trophy size={18} aria-hidden="true" />
          ) : (
            <span
              style={{
                color: "var(--text-muted)",
                fontSize: "var(--text-sm)",
              }}
            >
              Keep going
            </span>
          )}
        </div>

        <div
          role="progressbar"
          aria-label="Lesson reading progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={readingProgress}
          style={{
            width: "100%",
            height: "7px",
            borderRadius: "999px",
            overflow: "hidden",
            background:
              "var(--surface-secondary, rgba(255,255,255,0.08))",
          }}
        >
          <div
            style={{
              width: `${readingProgress}%`,
              height: "100%",
              borderRadius: "999px",
              background: "var(--accent-cyan)",
              transition: "width 160ms ease",
            }}
          />
        </div>

        <p
          style={{
            marginTop: "var(--space-2)",
            marginBottom: 0,
            fontSize: "var(--text-sm)",
            color: "var(--text-muted)",
          }}
        >
          {isComplete
            ? "Excellent work. You have completed this lesson."
            : "Read through the material, then mark the lesson complete when you're ready."}
        </p>
      </GlassCard>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: "var(--space-6)",
          marginTop: "var(--space-6)",
          marginBottom: "var(--space-8)",
        }}
      >
        {lesson.learning_objectives?.length ? (
          <GlassCard>
            <h2
              className="cluster"
              style={{
                gap: "var(--space-2)",
                fontSize: "var(--text-lg)",
                marginBottom: "var(--space-3)",
              }}
            >
              <Target size={18} aria-hidden="true" />
              What you'll learn
            </h2>

            <ul
              style={{
                margin: 0,
                paddingLeft: "var(--space-5)",
                color: "var(--text-secondary)",
                lineHeight: 1.9,
              }}
            >
              {lesson.learning_objectives.map((objective, index) => (
                <li key={`${index}-${objective}`}>
                  {objective}
                </li>
              ))}
            </ul>
          </GlassCard>
        ) : null}

        {sections.length > 0 && (
          <GlassCard>
            <button
              type="button"
              onClick={() => setShowContents((current) => !current)}
              aria-expanded={showContents}
              className="cluster"
              style={{
                width: "100%",
                minHeight: "44px",
                justifyContent: "space-between",
                gap: "var(--space-3)",
                padding: 0,
                border: 0,
                background: "transparent",
                color: "inherit",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span className="cluster" style={{ gap: "var(--space-2)" }}>
                <ListTree size={18} aria-hidden="true" />
                <strong>In this lesson</strong>
                <span
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "var(--text-sm)",
                  }}
                >
                  ({sections.length})
                </span>
              </span>

              <ChevronDown
                size={18}
                aria-hidden="true"
                style={{
                  transform: showContents ? "rotate(180deg)" : "rotate(0)",
                  transition: "transform 160ms ease",
                  flexShrink: 0,
                }}
              />
            </button>

            {showContents && (
              <nav
                aria-label="Lesson contents"
                className="stack"
                style={{
                  gap: "var(--space-1)",
                  marginTop: "var(--space-3)",
                }}
              >
                {sections.map((section, index) => {
                  const Icon = section.icon;

                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => scrollToSection(section.id)}
                      className="cluster"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--space-3)",
                        width: "100%",
                        minHeight: "44px",
                        padding: "var(--space-2)",
                        border: "none",
                        borderRadius: "var(--radius-md, 10px)",
                        background: "transparent",
                        color: "var(--text-secondary)",
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      <span
                        style={{
                          display: "grid",
                          placeItems: "center",
                          width: "28px",
                          height: "28px",
                          borderRadius: "8px",
                          flexShrink: 0,
                          background:
                            "var(--surface-secondary, rgba(255,255,255,0.06))",
                        }}
                      >
                        <Icon size={15} aria-hidden="true" />
                      </span>

                      <span style={{ flex: 1 }}>
                        {index + 1}. {section.title}
                      </span>

                      <ArrowRight size={14} aria-hidden="true" />
                    </button>
                  );
                })}
              </nav>
            )}
          </GlassCard>
        )}

        <div
          className="stack"
          style={{
            gap: "var(--space-5)",
            minWidth: 0,
          }}
        >
          {sections.map((section, index) => {
            const Icon = section.icon;
            const isHighlighted =
              section.kind === "example" || section.kind === "formula";

            const content = (
              <LessonMarkdown
                content={section.content}
                kind={section.kind}
              />
            );

            return (
              <section
                key={section.id}
                id={section.id}
                aria-labelledby={`${section.id}-heading`}
                style={{
                  scrollMarginTop: "24px",
                  minWidth: 0,
                }}
              >
                {isHighlighted ? (
                  <GlassCard>
                    <h2
                      id={`${section.id}-heading`}
                      className="cluster"
                      style={{
                        gap: "var(--space-2)",
                        fontSize: "var(--text-lg)",
                        marginBottom: "var(--space-3)",
                      }}
                    >
                      <Icon size={19} aria-hidden="true" />
                      {section.title}
                    </h2>
                    {content}
                  </GlassCard>
                ) : (
                  <>
                    <div
                      className="cluster"
                      style={{
                        alignItems: "center",
                        gap: "var(--space-2)",
                        marginBottom: "var(--space-3)",
                      }}
                    >
                      <span
                        style={{
                          display: "grid",
                          placeItems: "center",
                          width: "32px",
                          height: "32px",
                          borderRadius: "10px",
                          flexShrink: 0,
                          background:
                            "var(--surface-secondary, rgba(255,255,255,0.06))",
                        }}
                      >
                        <Icon size={17} aria-hidden="true" />
                      </span>

                      <h2
                        id={`${section.id}-heading`}
                        style={{
                          fontSize: "var(--text-lg)",
                          margin: 0,
                        }}
                      >
                        {section.title}
                      </h2>
                    </div>

                    {content}
                  </>
                )}

                {index < sections.length - 1 && (
                  <div
                    aria-hidden="true"
                    style={{
                      height: "1px",
                      marginTop: "var(--space-5)",
                      background:
                        "var(--border-subtle, rgba(255,255,255,0.08))",
                    }}
                  />
                )}
              </section>
            );
          })}

          {materials.length > 0 && (
            <GlassCard>
              <h2
                style={{
                  fontSize: "var(--text-lg)",
                  marginBottom: "var(--space-3)",
                }}
              >
                Supporting materials
              </h2>

              <p
                style={{
                  color: "var(--text-muted)",
                  fontSize: "var(--text-sm)",
                  marginBottom: "var(--space-3)",
                }}
              >
                Use these resources to deepen your understanding.
              </p>

              <div className="stack" style={{ gap: "var(--space-2)" }}>
                {materials.map((material) => (
                  <button
                    key={material.id}
                    type="button"
                    onClick={() => void handleDownload(material)}
                    disabled={!material.file}
                    className="cluster"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--space-3)",
                      width: "100%",
                      minHeight: "48px",
                      padding: "var(--space-3)",
                      borderRadius: "var(--radius-md, 10px)",
                      border:
                        "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
                      background: "transparent",
                      color: material.file
                        ? "var(--accent-cyan)"
                        : "var(--text-muted)",
                      cursor: material.file ? "pointer" : "not-allowed",
                      textAlign: "left",
                    }}
                  >
                    <Download size={17} aria-hidden="true" />

                    <span
                      style={{
                        flex: 1,
                        overflowWrap: "anywhere",
                      }}
                    >
                      {material.title}
                    </span>

                    <ArrowRight size={15} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </GlassCard>
          )}
        </div>
      </div>

      <GlassCard>
        <div className="stack" style={{ gap: "var(--space-4)" }}>
          <div>
            <h2
              style={{
                fontSize: "var(--text-lg)",
                marginBottom: "var(--space-2)",
              }}
            >
              {isComplete ? "Lesson complete!" : "Ready to finish?"}
            </h2>

            <p
              style={{
                color: "var(--text-secondary)",
                lineHeight: 1.7,
                margin: 0,
              }}
            >
              {isComplete
                ? "Your completion has been recorded. Continue to the next lesson when you're ready."
                : "When you've worked through the material, mark this lesson complete to update your learning progress."}
            </p>
          </div>

          <div
            className="cluster"
            style={{
              justifyContent: "space-between",
              alignItems: "stretch",
              gap: "var(--space-3)",
              flexWrap: "wrap",
            }}
          >
            {adjacent.previous ? (
              <Link
                to={ROUTES.lessonDetail.replace(":id", adjacent.previous.id)}
                state={state}
                style={{ textDecoration: "none" }}
              >
                <Button variant="secondary">
                  <ArrowLeft size={16} aria-hidden="true" />
                  Previous
                </Button>
              </Link>
            ) : (
              <span />
            )}

            {!isComplete && (
              <Button
                onClick={() => void handleMarkComplete()}
                isLoading={isMarking}
              >
                <CheckCircle2 size={17} aria-hidden="true" />
                Mark complete
              </Button>
            )}

            {adjacent.next ? (
              <Link
                to={ROUTES.lessonDetail.replace(":id", adjacent.next.id)}
                state={state}
                style={{ textDecoration: "none" }}
              >
                <Button variant="secondary">
                  Next lesson
                  <ArrowRight size={16} aria-hidden="true" />
                </Button>
              </Link>
            ) : (
              <span />
            )}
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
