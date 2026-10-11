import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Clock3, Send, ShieldCheck, Users } from "lucide-react";
import { useAuth } from "@/app/providers/AuthProvider";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonText } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { ROUTES } from "@/app/router/routes";
import { getMyTournamentTeamMatchAttempt, getTournament, getTournamentTeamMatchAttemptAnswers, getTournamentTeamMatchAttemptQuestions, listMyTournamentTeams, listTournamentRounds, saveTournamentTeamMatchAnswer, startTournamentTeamMatchAttempt, submitTournamentTeamMatchAttempt, type Tournament, type TournamentMatchQuestion } from "@/services/competitions/competitionService";

export function TournamentTeamMatchAttemptPage() {
  const { id="", matchId="" } = useParams();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [tournament,setTournament] = useState<Tournament|null>(null);
  const [match,setMatch] = useState<Record<string,unknown>|null>(null);
  const [myTeamIds,setMyTeamIds] = useState<string[]>([]);
  const [attempt,setAttempt] = useState<{id:string;status:string;started_at:string;submitted_at:string|null;score:number|null;accuracy:number|null}|null>(null);
  const [questions,setQuestions] = useState<TournamentMatchQuestion[]>([]);
  const [answers,setAnswers] = useState<Record<string,{optionId:string|null;text:string}>>({});
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!user || !id || !matchId) return;
    const [t,rounds,teams,a] = await Promise.all([getTournament(id),listTournamentRounds(id),listMyTournamentTeams(id),getMyTournamentTeamMatchAttempt(matchId,user.id)]);
    const found = rounds.flatMap(r=>((r.tournament_matches??[]) as Array<Record<string,unknown>>)).find(m=>String(m.id)===matchId)??null;
    setTournament(t); setMatch(found); setMyTeamIds(teams.filter(team=>team.registered).map(team=>team.team_id)); setAttempt(a);
    if (a?.status === "in_progress") {
      const [qs,saved] = await Promise.all([getTournamentTeamMatchAttemptQuestions(a.id),getTournamentTeamMatchAttemptAnswers(a.id)]);
      setQuestions(qs); setAnswers(Object.fromEntries(saved.map(answer=>[answer.question_id,{optionId:answer.selected_option_id,text:answer.answer_text??""}])));
    } else { setQuestions([]); setAnswers({}); }
  },[id,matchId,user]);

  useEffect(()=>{void refresh().catch(e=>showToast(e instanceof Error?e.message:"Couldn't load team match.","error")).finally(()=>setLoading(false));},[refresh,showToast]);
  async function start(){setBusy(true);try{const next=await startTournamentTeamMatchAttempt(matchId);setAttempt(next);setQuestions(await getTournamentTeamMatchAttemptQuestions(next.id));showToast("Team match attempt started. Your score contributes to your team's top-N total.","success");}catch(e){showToast(e instanceof Error?e.message:"Couldn't start team attempt.","error");}finally{setBusy(false);}}
  async function save(q:TournamentMatchQuestion,optionId:string|null,text:string){setAnswers(prev=>({...prev,[q.question_id]:{optionId,text}}));if(!attempt)return;try{await saveTournamentTeamMatchAnswer(attempt.id,q.question_id,optionId,text||null);}catch(e){showToast(e instanceof Error?e.message:"Answer save failed. Retry before submitting.","error");}}
  async function submit(){if(!attempt||!tournament||!match||!window.confirm("Submit your official team match attempt? You cannot take another attempt for this match."))return;setBusy(true);try{await Promise.all(questions.map(q=>{const a=answers[q.question_id];if(!a)return Promise.resolve();if(q.options.length>0&&!a.optionId)return Promise.resolve();return saveTournamentTeamMatchAnswer(attempt.id,q.question_id,a.optionId,a.text.trim()?a.text:null);}));await submitTournamentTeamMatchAttempt(attempt.id);await refresh();showToast("Team match attempt submitted.","success");}catch(e){showToast(e instanceof Error?e.message:"Submission failed.","error");}finally{setBusy(false);}}

  if(loading)return <div className="container" style={{paddingBlock:"var(--space-8)"}}><SkeletonText lines={5}/></div>;
  const teamIds=match?[String(match.team_a_id??""),String(match.team_b_id??"")]:[];
  const canParticipate=myTeamIds.some(teamId=>teamIds.includes(teamId));
  if(!tournament||!match||!canParticipate)return <div className="container" style={{paddingBlock:"var(--space-8)"}}><EmptyState icon={ShieldCheck} title="Team match unavailable" description="Only active members of a registered team assigned to this match may enter."/></div>;
  return <div className="container" style={{paddingBlock:"var(--space-8)",display:"grid",gap:"var(--space-4)"}}>
    <Link to={ROUTES.tournamentDetail.replace(":id",id)} className="cluster" style={{textDecoration:"none",color:"var(--text-secondary)"}}><ArrowLeft size={16}/> Back to tournament</Link>
    <GlassCard><Badge tone="accent">{tournament.title}</Badge><h1 style={{fontSize:"var(--text-2xl)",marginBlock:"var(--space-3)"}}>Team tournament match</h1><div className="cluster" style={{color:"var(--text-secondary)",fontSize:"var(--text-sm)"}}><Clock3 size={16}/>{match.scheduled_at?new Date(String(match.scheduled_at)).toLocaleString():"Schedule unavailable"} · {tournament.match_duration_minutes??30} min</div><p className="cluster" style={{color:"var(--text-secondary)",fontSize:"var(--text-sm)"}}><Users size={16}/>Your score contributes to your team's top {tournament.team_top_n??3} individual scores.</p>{!attempt&&<Button onClick={()=>void start()} isLoading={busy} disabled={tournament.status!=="live"||!["scheduled","in_progress"].includes(String(match.status))}>Start team attempt</Button>}{attempt&&attempt.status!=="in_progress"&&<div className="stack" style={{gap:"var(--space-2)",marginTop:"var(--space-3)"}}><Badge tone="success">Attempt {attempt.status}</Badge>{attempt.score!==null&&<strong>Individual score: {attempt.score} · Accuracy: {attempt.accuracy??0}%</strong>}<p style={{color:"var(--text-secondary)",fontSize:"var(--text-sm)"}}>The team result is computed server-side after every active roster member has submitted. Knockout ties require Admin review.</p></div>}</GlassCard>
    {attempt?.status==="in_progress"&&<section className="stack" style={{gap:"var(--space-3)"}}><h2 style={{fontSize:"var(--text-xl)"}}>Match questions</h2>{questions.map((q,i)=><GlassCard key={q.question_id}><div className="cluster" style={{justifyContent:"space-between"}}><Badge>Question {i+1} / {questions.length}</Badge><span style={{color:"var(--text-muted)",fontSize:"var(--text-xs)"}}>{q.points} points</span></div><h3 style={{fontSize:"var(--text-base)",marginBlock:"var(--space-3)"}}>{q.prompt}</h3>{q.options.length>0?<div className="stack" style={{gap:"var(--space-2)"}}>{q.options.map(option=><button type="button" key={option.id} onClick={()=>void save(q,option.id,"")} style={{textAlign:"left",padding:"var(--space-3)",borderRadius:"var(--radius-md)",border:`1px solid ${answers[q.question_id]?.optionId===option.id?"var(--accent-cyan)":"var(--border-glass)"}`,background:answers[q.question_id]?.optionId===option.id?"var(--bg-glass)":"transparent",color:"var(--text-primary)"}}>{option.text}</button>)}</div>:<input value={answers[q.question_id]?.text??""} onChange={e=>setAnswers(prev=>({...prev,[q.question_id]:{optionId:null,text:e.target.value}}))} onBlur={()=>void save(q,null,answers[q.question_id]?.text??"")} maxLength={4000} placeholder="Type your answer" style={{width:"100%",padding:"var(--space-3)",borderRadius:"var(--radius-md)",background:"var(--bg-surface)",border:"1px solid var(--border-glass)",color:"var(--text-primary)"}}/>}</GlassCard>)}<Button onClick={()=>void submit()} isLoading={busy}><Send size={16}/>Submit team attempt</Button></section>}
  </div>;
}
