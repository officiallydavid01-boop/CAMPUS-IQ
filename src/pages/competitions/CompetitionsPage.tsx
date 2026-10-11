import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Clock3, Trophy, Users, CalendarDays, ChevronRight, Medal } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonText } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/app/providers/AuthProvider";
import { listCompetitions, listMyCompetitionRegistrations, listMyCompetitionResults, type Competition, type CompetitionResult } from "@/services/competitions/competitionService";
import { ROUTES } from "@/app/router/routes";

function formatDate(value: string, timezone = "UTC") {
  try { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(value)); }
  catch { return new Date(value).toLocaleString(); }
}
function phaseFor(competition: Competition) {
  const now = Date.now();
  if (competition.status === "completed" || competition.status === "archived") return "Completed";
  if (now < new Date(competition.registration_starts_at ?? competition.starts_at).getTime()) return "Coming up";
  if (now < new Date(competition.registration_ends_at ?? competition.starts_at).getTime() && competition.status === "scheduled") return "Registration open";
  if (now >= new Date(competition.starts_at).getTime() && now < new Date(competition.ends_at).getTime()) return "Live";
  return competition.status.replaceAll("_", " ");
}
export function CompetitionsPage() {
  const { user } = useAuth(); const { showToast } = useToast();
  const [items, setItems] = useState<Competition[]>([]); const [registrations, setRegistrations] = useState<string[]>([]); const [results, setResults] = useState<CompetitionResult[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { if (!user) return; void (async () => { try { const [competitions, registered, myResults] = await Promise.all([listCompetitions(), listMyCompetitionRegistrations(user.id), listMyCompetitionResults(user.id)]); setItems(competitions); setRegistrations(registered.filter(r => r.registration_status === "registered").map(r => r.competition_id)); setResults(myResults); } catch (error) { showToast(error instanceof Error ? error.message : "Couldn't load competitions.", "error"); } finally { setLoading(false); } })(); }, [user, showToast]);
  if (loading) return <div className="container" style={{ paddingBlock: "var(--space-8)" }}><SkeletonText lines={5} /></div>;
  return <div className="container" style={{ paddingBlock: "var(--space-8)", display: "grid", gap: "var(--space-6)" }}>
    <header className="cluster" style={{ justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap" }}><div><Badge tone="accent">CAMPUSIQ ARENA</Badge><h1 style={{ fontSize: "var(--text-2xl)", marginBlock: "var(--space-2)" }}>Competitions</h1><p style={{ color: "var(--text-secondary)", margin: 0 }}>Scheduled challenges. One official attempt. Rankings built from verified results.</p></div><Link to={ROUTES.tournaments} style={{ textDecoration: "none" }}><Button variant="secondary"><Trophy size={16} /> View tournaments</Button></Link></header>
    {results.length > 0 && <section className="stack" style={{ gap: "var(--space-3)" }}><h2 style={{ fontSize: "var(--text-lg)" }}>Your published results</h2><div className="grid-auto-fit">{results.map(result => { const comp = items.find(i => i.id === result.competition_id); return <GlassCard key={result.id} padding="var(--space-4)"><div className="cluster" style={{ justifyContent: "space-between" }}><Medal color="var(--accent-cyan)"/><Badge tone={result.status === "finalized" ? "success" : "warning"}>{result.status}</Badge></div><strong>{comp?.title ?? "Competition result"}</strong><div style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>Score {result.score} · {result.accuracy ?? 0}% accuracy</div><div style={{ fontSize: "var(--text-sm)" }}>Rank: {result.rank ?? "Pending"}</div></GlassCard>; })}</div></section>}
    <section className="stack" style={{ gap: "var(--space-3)" }}><h2 style={{ fontSize: "var(--text-lg)" }}>Competition schedule</h2>{items.length === 0 ? <GlassCard><EmptyState icon={Trophy} title="No competitions published yet" description="When an Admin publishes a scheduled competition, it will appear here." /></GlassCard> : <div className="grid-auto-fit">{items.map(item => { const registered = registrations.includes(item.id); const status = phaseFor(item); return <Link key={item.id} to={ROUTES.competitionDetail.replace(":id", item.id)} style={{ textDecoration: "none", color: "inherit" }}><GlassCard interactive style={{ height: "100%", display: "grid", gap: "var(--space-3)" }}><div className="cluster" style={{ justifyContent: "space-between", alignItems: "flex-start" }}><Badge tone={item.status === "live" ? "success" : item.status === "completed" ? "neutral" : "accent"}>{status}</Badge><Trophy size={20} color="var(--accent-cyan)" /></div><div><h3 style={{ color: "var(--text-primary)", margin: 0, fontSize: "var(--text-lg)" }}>{item.title}</h3><p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", marginBlock: "var(--space-2)" }}>{item.description || "A scheduled CampusIQ academic challenge."}</p></div><div className="stack" style={{ gap: "var(--space-2)", fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}><span className="cluster"><CalendarDays size={15} /> {formatDate(item.starts_at, item.timezone)}</span><span className="cluster"><Clock3 size={15} /> {item.time_limit_minutes} min · {item.question_count} questions</span><span className="cluster"><Users size={15} /> {item.participant_limit ?? "Open"} participant limit</span></div><div className="cluster" style={{ justifyContent: "space-between", marginTop: "auto" }}><Badge tone={registered ? "success" : "neutral"}>{registered ? "Registered" : item.xp_reward > 0 ? `${item.xp_reward} XP reward` : item.competition_type}</Badge><ChevronRight size={18} /></div></GlassCard></Link>; })}</div>}</section>
  </div>;
}
