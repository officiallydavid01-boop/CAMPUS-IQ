import { useEffect, useState } from "react";
import { Award, Flame, Zap, TrendingUp } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/Badge";
import { SkeletonText } from "@/components/ui/Skeleton";
import { useAuth } from "@/app/providers/AuthProvider";
import { getGamificationSnapshot, type GamificationSnapshot } from "@/services/gamification/gamificationService";
import { getMyProfile } from "@/services/academic/academicService";
import type { Profile } from "@/types/database.types";

export function ProfilePage() {
  const { user } = useAuth(); const [snapshot, setSnapshot] = useState<GamificationSnapshot | null>(null); const [profile, setProfile] = useState<Profile | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!user) return; Promise.all([getGamificationSnapshot(user.id), getMyProfile(user.id)]).then(([stats, p]) => { setSnapshot(stats); setProfile(p); }).catch(() => setError("Your profile stats could not be loaded. Check your connection and Supabase setup.")).finally(() => setLoading(false)); }, [user]);
  if (loading) return <div className="container" style={{ paddingBlock: "var(--space-8)" }}><SkeletonText lines={5} /></div>;
  const total = snapshot?.xp?.total_xp ?? 0; const level = snapshot?.currentLevel; const next = snapshot?.nextLevel; const progress = next && level ? Math.max(0, Math.min(100, ((total - level.xp_required) / Math.max(1, next.xp_required - level.xp_required)) * 100)) : 100;
  return <div className="container stack" style={{ paddingBlock: "var(--space-8)", gap: "var(--space-5)" }}>
    <div><h1 style={{ fontSize: "var(--text-3xl)" }}>Your profile</h1><p style={{ color: "var(--text-secondary)" }}>Your learning journey, all in one place.</p></div>
    {error && <GlassCard><p role="alert">{error}</p></GlassCard>}
    <GlassCard><div className="cluster" style={{ gap: "var(--space-4)" }}><div style={{ width: 64, height: 64, borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--bg-glass)", border: "1px solid var(--border-glass-strong)", fontSize: "var(--text-2xl)" }}>{(profile?.full_name ?? user?.email ?? "S").slice(0, 1).toUpperCase()}</div><div><h2 style={{ fontSize: "var(--text-xl)" }}>{profile?.full_name || "CampusIQ student"}</h2><p style={{ color: "var(--text-secondary)" }}>{user?.email}</p><Badge tone="accent">{level?.title ?? "Fresher"} · Level {snapshot?.xp?.campusiq_level ?? 1}</Badge></div></div></GlassCard>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--space-3)" }}>
      <GlassCard><Zap color="var(--accent-cyan)" /><p style={{ color: "var(--text-secondary)", marginTop: 8 }}>Total XP</p><strong style={{ fontSize: "var(--text-2xl)" }}>{total.toLocaleString()}</strong></GlassCard>
      <GlassCard><Flame color="#F59E0B" /><p style={{ color: "var(--text-secondary)", marginTop: 8 }}>Current streak</p><strong style={{ fontSize: "var(--text-2xl)" }}>{snapshot?.streak?.current_streak ?? 0} days</strong><p style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>Longest: {snapshot?.streak?.longest_streak ?? 0} days</p></GlassCard>
      <GlassCard><Award color="var(--accent-violet)" /><p style={{ color: "var(--text-secondary)", marginTop: 8 }}>Achievements</p><strong style={{ fontSize: "var(--text-2xl)" }}>{snapshot?.earnedAchievements.length ?? 0}</strong></GlassCard>
    </div>
    <GlassCard className="stack" style={{ gap: "var(--space-3)" }}><div className="cluster" style={{ justifyContent: "space-between" }}><h2>Level progression</h2><TrendingUp color="var(--accent-cyan)" /></div><div className="cluster" style={{ justifyContent: "space-between" }}><strong>Level {snapshot?.xp?.campusiq_level ?? 1} · {level?.title ?? "Fresher"}</strong><span style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>{next ? `${total} / ${next.xp_required} XP` : "Maximum configured level reached"}</span></div><div style={{ height: 10, borderRadius: 99, background: "var(--bg-glass)", overflow: "hidden" }}><div style={{ width: `${progress}%`, height: "100%", background: "var(--accent-gradient)", borderRadius: 99 }} /></div>{next && <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>{Math.max(0, next.xp_required - total)} XP to {next.title ?? `Level ${next.level}`}</p>}</GlassCard>
    <GlassCard className="stack" style={{ gap: "var(--space-3)" }}><h2>Recent XP activity</h2>{!snapshot?.recentXp.length ? <p style={{ color: "var(--text-secondary)" }}>Your XP history will appear here as you complete learning activities.</p> : snapshot.recentXp.map((item) => <div key={item.id} className="cluster" style={{ justifyContent: "space-between", borderBottom: "1px solid var(--border-glass)", paddingBlock: "var(--space-2)" }}><div><strong>{item.note || item.source.replaceAll("_", " ")}</strong><div style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>{new Date(item.created_at).toLocaleString()}</div></div><Badge tone={item.amount >= 0 ? "success" : "error"}>{item.amount > 0 ? "+" : ""}{item.amount} XP</Badge></div>)}</GlassCard>
  </div>;
}
