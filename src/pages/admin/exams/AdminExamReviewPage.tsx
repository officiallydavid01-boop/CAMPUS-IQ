import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, XCircle, ClipboardCheck } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonText } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { listPendingStructuredReviews, markStructuredExamAnswer, type PendingStructuredReview } from "@/services/exams/adminExamReviewService";

export function AdminExamReviewPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<PendingStructuredReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);
    try { setItems(await listPendingStructuredReviews()); }
    catch { setHasError(true); showToast("Couldn't load pending structured responses.", "error"); }
    finally { setIsLoading(false); }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  async function mark(item: PendingStructuredReview, isCorrect: boolean) {
    setSavingId(item.answer.id);
    try {
      await markStructuredExamAnswer(item.answer.id, isCorrect);
      showToast("Response marked. The result will finalize when all manual reviews are complete.", "success");
      await load();
    } catch { showToast("Couldn't save this mark.", "error"); }
    finally { setSavingId(null); }
  }

  if (isLoading) return <div className="container" style={{ paddingBlock: "var(--space-8)" }}><SkeletonText lines={6} /></div>;
  if (hasError) return <div className="container" style={{ paddingBlock: "var(--space-8)" }}><ErrorState onRetry={load} /></div>;

  return <div className="container" style={{ paddingBlock: "var(--space-8)", maxWidth: "900px" }}>
    <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-2)" }}>Manual exam marking</h1>
    <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-6)" }}>Review submitted structured answers. Results are finalized automatically after every required response has been marked.</p>
    {items.length === 0 ? <GlassCard><EmptyState icon={ClipboardCheck} title="No responses awaiting marking" description="Submitted structured responses will appear here." /></GlassCard> :
      <div className="stack" style={{ gap: "var(--space-4)" }}>{items.map((item) => <GlassCard key={item.answer.id} className="stack" style={{ gap: "var(--space-3)" }}>
        <div className="cluster" style={{ justifyContent: "space-between", flexWrap: "wrap" }}><strong>{item.exam.title}</strong><span style={{ color: "var(--text-secondary)", fontSize: "var(--text-xs)" }}>Student ID: {item.attempt.student_id}</span></div>
        <p style={{ color: "var(--text-primary)" }}>{item.question.prompt}</p>
        <div style={{ whiteSpace: "pre-wrap", border: "1px solid var(--border-glass)", borderRadius: "var(--radius-md)", padding: "var(--space-3)", background: "var(--bg-surface-secondary)" }}>{item.answer.answer_text?.trim() || "No written response provided."}</div>
        <div className="cluster" style={{ justifyContent: "flex-end", gap: "var(--space-2)" }}>
          <Button variant="secondary" onClick={() => mark(item, false)} isLoading={savingId === item.answer.id} disabled={savingId !== null}><XCircle size={16} /> Mark incorrect</Button>
          <Button onClick={() => mark(item, true)} isLoading={savingId === item.answer.id} disabled={savingId !== null}><CheckCircle2 size={16} /> Mark correct</Button>
        </div>
      </GlassCard>)}</div>}
  </div>;
}
