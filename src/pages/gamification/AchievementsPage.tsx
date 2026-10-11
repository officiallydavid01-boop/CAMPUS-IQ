import { useEffect, useState } from "react";
import { Award, CheckCircle2, LockKeyhole } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/Badge";
import { SkeletonText } from "@/components/ui/Skeleton";
import { useAuth } from "@/app/providers/AuthProvider";
import { getGamificationSnapshot } from "@/services/gamification/gamificationService";
import type { Achievement } from "@/types/database.types";

export function AchievementsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Array<{ achievement: Achievement; earnedAt: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    getGamificationSnapshot(user.id).then((snapshot) => {
      const earned = new Map(snapshot.earnedAchievements.map((item) => [item.achievement.id, item.earned.earned_at]));
      setItems(snapshot.achievements.map((achievement) => ({ achievement, earnedAt: earned.get(achievement.id) ?? null })));
      setError(null);
    }).catch(() => setError("Achievements could not be loaded. Check your connection and Supabase setup.")).finally(() => setLoading(false));
  }, [user]);
  if (loading) return <div className="container" style={{ paddingBlock: "var(--space-8)" }}><SkeletonText lines={4} /></div>;
  return <div className="container stack" style={{ paddingBlock: "var(--space-8)", gap: "var(--space-5)" }}>
    <div><h1 style={{ fontSize: "var(--text-3xl)" }}>Achievements</h1><p style={{ color: "var(--text-secondary)" }}>Your hard-earned CampusIQ milestones.</p></div>
    {error && <GlassCard><p role="alert">{error}</p></GlassCard>}
    <GlassCard><div className="cluster" style={{ gap: "var(--space-3)" }}><Award color="var(--accent-cyan)" size={28} /><div><strong>{items.filter((item) => item.earnedAt).length} / {items.length} earned</strong><div style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>Milestones unlocked through real learning activity</div></div></div></GlassCard>
    {items.length === 0 && !error ? <GlassCard><div className="stack" style={{ alignItems: "center", padding: "var(--space-8)", textAlign: "center" }}><LockKeyhole size={32} color="var(--text-muted)" /><h2>No achievements configured yet</h2><p style={{ color: "var(--text-secondary)" }}>The achievement catalogue will appear here once configured.</p></div></GlassCard> : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--space-4)" }}>{items.map(({ achievement, earnedAt }) => <GlassCard key={achievement.id} className="stack" style={{ gap: "var(--space-2)", opacity: earnedAt ? 1 : 0.78 }}><div className="cluster" style={{ justifyContent: "space-between" }}><Award size={28} color={earnedAt ? "var(--accent-cyan)" : "var(--text-muted)"} /><Badge tone={earnedAt ? "success" : "neutral"}>{earnedAt ? <><CheckCircle2 size={12} style={{ display: "inline", verticalAlign: "-2px" }} /> Earned</> : "Locked"}</Badge></div><h2 style={{ fontSize: "var(--text-lg)" }}>{achievement.title}</h2><p style={{ color: "var(--text-secondary)" }}>{achievement.description}</p><p style={{ color: "var(--accent-cyan)", fontWeight: 600 }}>+{achievement.xp_reward} XP</p><small style={{ color: "var(--text-muted)" }}>{earnedAt ? `Unlocked ${new Date(earnedAt).toLocaleDateString()}` : "Keep learning to unlock this badge"}</small></GlassCard>)}</div>}
  </div>;
}
