import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarClock, Swords, Users } from "lucide-react";
import { useAuth } from "@/app/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonText } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { getTournament, listTournamentRounds, listMyTournamentRegistrations, getMyTournamentParticipantId, registerForTournament, listMyTournamentTeams, registerTeamForTournament, type Tournament, type TournamentTeamOption } from "@/services/competitions/competitionService";
import { ROUTES } from "@/app/router/routes";

const labels: Record<string,string> = { single_elimination:"Single elimination",knockout:"Single elimination (legacy)",round_robin:"Round-robin",group_stage_knockout:"Group stage + knockout",group_stage:"Group stage",head_to_head:"Head-to-head",leaderboard_challenge:"Leaderboard challenge" };

export function TournamentDetailPage() {
  const { id = "" } = useParams();
  const { showToast } = useToast();
  const { user } = useAuth();
  const [item,setItem] = useState<Tournament|null>(null);
  const [rounds,setRounds] = useState<Array<Record<string,unknown>>>([]);
  const [registered,setRegistered] = useState(false);
  const [myParticipantId,setMyParticipantId] = useState<string|null>(null);
  const [teams,setTeams] = useState<TournamentTeamOption[]>([]);
  const [selectedTeam,setSelectedTeam] = useState("");
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!id) return;
      try {
        const [t,r,regs,pid] = await Promise.all([
          getTournament(id), listTournamentRounds(id),
          user ? listMyTournamentRegistrations(user.id) : Promise.resolve([]),
          user ? getMyTournamentParticipantId(id,user.id) : Promise.resolve(null),
        ]);
        const myTeams = user && t.participant_mode === "team" ? await listMyTournamentTeams(id) : [];
        if (!active) return;
        setItem(t); setRounds(r); setRegistered(regs.some(reg=>reg.tournament_id===id&&reg.registration_status==="registered"));
        setMyParticipantId(pid); setTeams(myTeams);
        const registeredTeam = myTeams.find(team=>team.registered);
        setSelectedTeam(registeredTeam?.team_id ?? myTeams.find(team=>team.roster_locked_at)?.team_id ?? "");
        if (t.participant_mode === "team") setRegistered(Boolean(registeredTeam));
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Couldn't load tournament details.","error");
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  },[id,showToast,user]);

  async function register() {
    setBusy(true);
    try {
      if (item?.participant_mode === "team") {
        if (!selectedTeam) throw new Error("Choose a team with a locked roster first.");
        await registerTeamForTournament(id,selectedTeam);
        setTeams(current=>current.map(team=>({...team,registered:team.team_id===selectedTeam||team.registered})));
      } else {
        await registerForTournament(id);
        setRegistered(true);
      }
      setRegistered(true); showToast("Tournament registration confirmed.","success");
    } catch(error) { showToast(error instanceof Error?error.message:"Registration failed.","error"); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="container" style={{paddingBlock:"var(--space-8)"}}><SkeletonText lines={5}/></div>;
  if (!item) return <div className="container" style={{paddingBlock:"var(--space-8)"}}><EmptyState icon={Swords} title="Tournament unavailable" description="This tournament may be unpublished or not visible to your account."/></div>;
  const registrationOpen = ["scheduled","registration_open"].includes(item.status) && Date.now() >= new Date(item.registration_starts_at ?? item.starts_at).getTime() && Date.now() < new Date(item.registration_ends_at ?? item.starts_at).getTime();
  const availableTeams = teams.filter(team=>team.roster_locked_at || team.registered);

  return <div className="container" style={{paddingBlock:"var(--space-8)",display:"grid",gap:"var(--space-4)"}}>
    <Link to={ROUTES.tournaments} className="cluster" style={{textDecoration:"none",color:"var(--text-secondary)"}}><ArrowLeft size={16}/> All tournaments</Link>
    <GlassCard>
      <div className="cluster" style={{gap:"var(--space-2)",flexWrap:"wrap"}}><Badge tone="accent">{labels[item.format]??item.format}</Badge><Badge>{item.participant_mode === "team" ? "Team tournament" : "Individual tournament"}</Badge></div>
      <h1 style={{fontSize:"var(--text-2xl)",marginBlock:"var(--space-3)"}}>{item.title}</h1>
      <p style={{color:"var(--text-secondary)"}}>{item.description||"Tournament details and verified match schedule."}</p>
      <div className="cluster" style={{color:"var(--text-secondary)",fontSize:"var(--text-sm)"}}><CalendarClock size={16}/>Starts {new Intl.DateTimeFormat(undefined,{dateStyle:"full",timeStyle:"short",timeZone:item.timezone}).format(new Date(item.starts_at))}</div>
      <div className="cluster" style={{marginTop:"var(--space-3)",gap:"var(--space-3)",flexWrap:"wrap"}}><Badge>{item.status}</Badge>
        {registrationOpen && !registered && item.participant_mode !== "team" && <Button onClick={()=>void register()} isLoading={busy}>Register</Button>}
        {registered && <Badge tone="success">Registered</Badge>}
      </div>
      {item.participant_mode === "team" && registrationOpen && !registered && <div className="stack" style={{gap:"var(--space-2)",marginTop:"var(--space-4)"}}>
        <strong className="cluster"><Users size={17}/>Register one of your teams</strong>
        {availableTeams.length===0 ? <p style={{color:"var(--text-secondary)",fontSize:"var(--text-sm)"}}>No eligible team with a locked roster is available. Open the linked team competition, complete the roster, and ask the captain to lock it before registering.</p> : <>
          <select value={selectedTeam} onChange={e=>setSelectedTeam(e.target.value)} style={{width:"100%",padding:"var(--space-3)",borderRadius:"var(--radius-md)",background:"var(--bg-surface)",border:"1px solid var(--border-glass)",color:"var(--text-primary)"}}>
            {availableTeams.map(team=><option key={team.team_id} value={team.team_id}>{team.team_name}{team.registered?" · Registered":""}</option>)}
          </select>
          <Button onClick={()=>void register()} isLoading={busy} disabled={!selectedTeam}><Users size={16}/>Register team</Button>
        </>}
      </div>}
    </GlassCard>
    <section className="stack" style={{gap:"var(--space-3)"}}><h2 style={{fontSize:"var(--text-xl)"}}>Rounds and matches</h2>
      {rounds.length===0?<GlassCard><EmptyState icon={Swords} title="Schedule not published yet" description="Round and match information will appear when the tournament schedule is created."/></GlassCard>:rounds.map(round=>{
        const matches=(round.tournament_matches??[]) as Array<Record<string,unknown>>;
        return <GlassCard key={String(round.id)}><div className="cluster" style={{justifyContent:"space-between"}}><h3 style={{margin:0}}>Round {String(round.round_number)}{round.title?` · ${String(round.title)}`:""}</h3><Badge>{String(round.status??"scheduled")}</Badge></div>
          {matches.length===0?<p style={{color:"var(--text-secondary)",fontSize:"var(--text-sm)"}}>No match slots published for this round.</p>:<div className="stack" style={{gap:"var(--space-2)",marginTop:"var(--space-3)"}}>{matches.map(match=>{
            const matchTeams=[String(match.team_a_id??""),String(match.team_b_id??"")];
            const myTeamInMatch=teams.some(team=>matchTeams.includes(team.team_id));
            const individualMatch=[String(match.participant_a_id??""),String(match.participant_b_id??"")].includes(myParticipantId??"-");
            const canEnter=item.status==="live"&&["scheduled","in_progress"].includes(String(match.status))&&(item.participant_mode==="team"?registered&&myTeamInMatch:individualMatch);
            return <div key={String(match.id)} className="cluster" style={{justifyContent:"space-between",padding:"var(--space-3)",border:"1px solid var(--border-glass)",borderRadius:"var(--radius-md)",flexWrap:"wrap"}}>
              <span>Match {String(match.id).slice(0,8)}</span><Badge>{String(match.status)}</Badge><span style={{fontSize:"var(--text-xs)",color:"var(--text-secondary)"}}>{match.scheduled_at?new Date(String(match.scheduled_at)).toLocaleString():"Time pending"}</span>
              {canEnter&&<Link to={ROUTES.tournamentMatchDetail.replace(":id",id).replace(":matchId",String(match.id))} style={{color:"var(--accent-cyan)",fontSize:"var(--text-sm)",fontWeight:600,textDecoration:"none"}}>Enter match</Link>}
            </div>;
          })}</div>}
        </GlassCard>;
      })}
    </section>
  </div>;
}
