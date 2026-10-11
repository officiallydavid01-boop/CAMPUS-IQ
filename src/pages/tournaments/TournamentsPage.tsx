import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, ChevronRight, Swords, Trophy } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonText } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { listTournaments, type Tournament } from "@/services/competitions/competitionService";
import { ROUTES } from "@/app/router/routes";

const formatLabel: Record<string,string> = { single_elimination: "Single elimination", knockout: "Single elimination (legacy)", round_robin: "Round-robin", group_stage_knockout: "Group stage + knockout", group_stage: "Group stage", head_to_head: "Head-to-head", leaderboard_challenge: "Leaderboard challenge" };
export function TournamentsPage() {
  const [items,setItems] = useState<Tournament[]>([]); const [loading,setLoading] = useState(true); const { showToast } = useToast();
  useEffect(()=>{ void listTournaments().then(setItems).catch(error=>showToast(error instanceof Error?error.message:"Couldn't load tournaments.","error")).finally(()=>setLoading(false)); },[showToast]);
  if(loading) return <div className="container" style={{paddingBlock:"var(--space-8)"}}><SkeletonText lines={4}/></div>;
  return <div className="container" style={{paddingBlock:"var(--space-8)",display:"grid",gap:"var(--space-5)"}}><header><Badge tone="accent">CAMPUSIQ ARENA</Badge><h1 style={{fontSize:"var(--text-2xl)",marginBlock:"var(--space-2)"}}>Tournaments</h1><p style={{color:"var(--text-secondary)"}}>Multi-round academic competition with published formats, scheduled matches and verified advancement.</p></header>{items.length===0?<GlassCard><EmptyState icon={Swords} title="No tournaments published yet" description="Scheduled tournaments will appear here once an Admin publishes them."/></GlassCard>:<div className="grid-auto-fit">{items.map(item=><Link key={item.id} to={ROUTES.tournamentDetail.replace(":id",item.id)} style={{textDecoration:"none",color:"inherit"}}><GlassCard interactive style={{height:"100%",display:"grid",gap:"var(--space-3)"}}><div className="cluster" style={{justifyContent:"space-between"}}><Badge tone="accent">{formatLabel[item.format]??item.format}</Badge><Trophy color="var(--accent-cyan)"/></div><h2 style={{fontSize:"var(--text-lg)",margin:0}}>{item.title}</h2><p style={{color:"var(--text-secondary)",margin:0,fontSize:"var(--text-sm)"}}>{item.description||"A CampusIQ tournament."}</p><div className="cluster" style={{color:"var(--text-secondary)",fontSize:"var(--text-sm)"}}><CalendarDays size={15}/>{new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short",timeZone:item.timezone}).format(new Date(item.starts_at))}</div><div className="cluster" style={{justifyContent:"space-between"}}><Badge>{item.status}</Badge><ChevronRight size={18}/></div></GlassCard></Link>)}</div>}</div>;
}
