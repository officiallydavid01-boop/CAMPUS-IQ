import { supabase } from "@/services/supabase/client";

// Use the expanded database schema types for the Phase 7+ tables and RPCs.
const db = supabase;

export interface Competition {
  id: string; title: string; description: string | null; competition_type: "individual" | "weekly" | "team" | "department";
  status: string; starts_at: string; ends_at: string; registration_starts_at: string | null; registration_ends_at: string | null;
  time_limit_minutes: number; question_count: number; participant_limit: number | null; xp_reward: number;
  timezone: string; published_at: string | null; dispute_window_hours: number; team_scoring_method: string; team_top_n: number;
}
export interface CompetitionQuestion { question_id: string; display_order: number; prompt: string; question_type: string; points: number; options: Array<{ id: string; text: string }> }
export interface CompetitionResult { id: string; competition_id: string; student_id: string; score: number; accuracy: number | null; rank: number | null; published: boolean; status: string; dispute_until: string | null; result_version: number }
export interface CompetitionLeaderboardRow { rank: number; display_name: string; score: number; accuracy: number | null; completion_duration_ms: number | null; status: string }
export interface PublishedQuestion { id: string; prompt: string; question_type: string; course_id: string }
export interface Tournament { id: string; title: string; description: string | null; format: string; status: string; starts_at: string; ends_at: string; registration_starts_at?: string | null; registration_ends_at?: string | null; timezone: string; round_count: number; match_duration_minutes?: number | null; question_count?: number; participant_mode?: "individual" | "team"; team_top_n?: number }

export async function listCompetitions(): Promise<Competition[]> {
  const { data, error } = await db.from("competitions").select("*").neq("status", "draft").order("starts_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Competition[];
}
export async function getCompetition(id: string): Promise<Competition> {
  const { data, error } = await db.from("competitions").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Competition not found or not visible to this account.");
  return data as Competition;
}
export async function listMyCompetitionRegistrations(studentId: string): Promise<Array<{ competition_id: string; registration_status: string }>> {
  const { data, error } = await db.from("competition_participants").select("competition_id,registration_status").eq("student_id", studentId);
  if (error) throw error;
  return (data ?? []) as Array<{ competition_id: string; registration_status: string }>;
}
export async function listMyCompetitionResults(studentId: string): Promise<CompetitionResult[]> {
  const { data, error } = await db.from("competition_results").select("*").eq("student_id", studentId).eq("published", true).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CompetitionResult[];
}
export async function registerForCompetition(competitionId: string) {
  const { data, error } = await db.rpc("register_for_competition", { p_competition_id: competitionId });
  if (error) throw error;
  return data;
}
export async function startCompetitionAttempt(competitionId: string) {
  const { data, error } = await db.rpc("start_competition_attempt", { p_competition_id: competitionId });
  if (error) throw error;
  return data as { id: string; status: string; started_at: string };
}
export async function getCompetitionAttemptQuestions(attemptId: string): Promise<CompetitionQuestion[]> {
  const { data, error } = await db.rpc("get_competition_attempt_questions", { p_attempt_id: attemptId });
  if (error) throw error;
  return (data ?? []) as CompetitionQuestion[];
}
export async function getCompetitionAttemptAnswers(attemptId: string): Promise<Array<{ question_id: string; selected_option_id: string | null; answer_text: string | null }>> {
  const { data, error } = await db.rpc("get_competition_attempt_answers", { p_attempt_id: attemptId });
  if (error) throw error;
  return (data ?? []) as Array<{ question_id: string; selected_option_id: string | null; answer_text: string | null }>;
}
export async function saveCompetitionAnswer(attemptId: string, questionId: string, selectedOptionId: string | null, answerText: string | null) {
  const { error } = await db.rpc("save_competition_answer", { p_attempt_id: attemptId, p_question_id: questionId, p_selected_option_id: selectedOptionId, p_answer_text: answerText });
  if (error) throw error;
}
export async function submitCompetitionAttempt(attemptId: string) {
  const { data, error } = await db.rpc("submit_competition_attempt", { p_attempt_id: attemptId });
  if (error) throw error;
  return data;
}
export async function getMyCompetitionAttempt(competitionId: string, studentId: string) {
  const { data, error } = await db.from("competition_attempts").select("*").eq("competition_id", competitionId).eq("student_id", studentId).maybeSingle();
  if (error) throw error;
  return data as { id: string; status: string; started_at: string; submitted_at: string | null; score: number | null } | null;
}
export async function getCompetitionLeaderboard(competitionId: string): Promise<CompetitionLeaderboardRow[]> {
  const { data, error } = await db.rpc("get_competition_leaderboard", { p_competition_id: competitionId });
  if (error) throw error;
  return (data ?? []) as CompetitionLeaderboardRow[];
}
export async function submitCompetitionDispute(resultId: string, reason: string, evidenceUrl?: string) {
  const { data, error } = await db.rpc("submit_competition_dispute", { p_competition_result_id: resultId, p_reason: reason, p_evidence_url: evidenceUrl || null });
  if (error) throw error;
  return data;
}

export async function listAdminCompetitions(): Promise<Competition[]> {
  const { data, error } = await db.from("competitions").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Competition[];
}
export async function listPublishedQuestions(): Promise<PublishedQuestion[]> {
  const { data, error } = await db.from("questions").select("id,prompt,question_type,course_id").eq("status", "published").order("created_at", { ascending: false }).limit(300);
  if (error) throw error;
  return (data ?? []) as PublishedQuestion[];
}
export type CompetitionScopeType = "everyone" | "institution" | "faculty" | "department" | "programme" | "level" | "academic_session" | "semester" | "course_offering";
export interface ScopeOption { id: string; label: string }
export type CompetitionScopeOptions = Record<Exclude<CompetitionScopeType,"everyone">, ScopeOption[]>;
export interface CreateCompetitionInput {
  title: string; description: string; competitionType: Competition["competition_type"]; startsAt: string; endsAt: string;
  registrationStartsAt: string; registrationEndsAt: string; timeLimitMinutes: number; xpReward: number; timezone: string; questionIds: string[];
  participantLimit: number | null; teamScoringMethod: string; teamTopN: number; scopeType: CompetitionScopeType; scopeId: string | null;
}
export async function createCompetitionDraft(input: CreateCompetitionInput) {
  if (!input.title.trim()) throw new Error("Competition title is required.");
  if(input.competitionType==="department"&&input.scopeType!=="department") throw new Error("Department competitions must use a department eligibility scope.");
  if (input.questionIds.length === 0) throw new Error("Choose at least one published question.");
  if (input.scopeType!=="everyone"&&!input.scopeId) throw new Error("Choose a record for the selected academic scope.");
  if (new Date(input.startsAt).getTime() <= Date.now()) throw new Error("The live start must be in the future.");
  if (new Date(input.endsAt).getTime() <= new Date(input.startsAt).getTime()) throw new Error("The end must be after the start.");
  if (new Date(input.registrationStartsAt).getTime() >= new Date(input.registrationEndsAt).getTime() || new Date(input.registrationEndsAt).getTime() > new Date(input.startsAt).getTime()) throw new Error("Registration must close before the live start.");
  const { data: competition, error } = await db.from("competitions").insert({
    title: input.title.trim(), description: input.description.trim() || null, competition_type: input.competitionType,
    participation_mode: "scheduled_live", attempt_policy: "single_scored", starts_at: new Date(input.startsAt).toISOString(), ends_at: new Date(input.endsAt).toISOString(),
    registration_starts_at: new Date(input.registrationStartsAt).toISOString(), registration_ends_at: new Date(input.registrationEndsAt).toISOString(),
    time_limit_minutes: input.timeLimitMinutes, question_count: input.questionIds.length, xp_reward: input.xpReward,
    participant_limit: input.participantLimit, timezone: input.timezone, team_scoring_method: input.teamScoringMethod, team_top_n: input.teamTopN, status: "draft",
  }).select("id").single();
  if (error) throw error;
  const questionRows = input.questionIds.map((questionId, index) => ({ competition_id: competition.id, question_id: questionId, display_order: index, points: 1 }));
  const { error: questionError } = await db.from("competition_questions").insert(questionRows);
  if (questionError) {
    await db.from("competitions").delete().eq("id", competition.id);
    throw questionError;
  }
  if(input.scopeType!=="everyone"&&!input.scopeId) throw new Error("Choose a record for the selected academic scope.");
  const { error: scopeError } = await db.from("competition_scopes").insert({ competition_id: competition.id, scope_type: input.scopeType, scope_id: input.scopeType==="everyone"?null:input.scopeId });
  if (scopeError) throw scopeError;
  return competition.id as string;
}
export async function publishCompetition(competitionId: string) {
  const { data, error } = await db.rpc("publish_competition", { p_competition_id: competitionId });
  if (error) throw error;
  return data;
}
export async function publishCompetitionResults(competitionId: string) {
  const { data, error } = await db.rpc("publish_competition_results", { p_competition_id: competitionId });
  if (error) throw error;
  return data as number;
}
export async function finalizeCompetitionResults(competitionId: string) {
  const { data, error } = await db.rpc("finalize_competition_results", { p_competition_id: competitionId });
  if (error) throw error;
  return data as number;
}
export async function listAdminDisputes() {
  const { data, error } = await db.from("competition_disputes").select("*, competition_results(score,accuracy,rank,result_version)").order("submitted_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Array<Record<string, unknown>>;
}
export async function resolveCompetitionDispute(id: string, decision: "accepted" | "partially_accepted" | "rejected", note: string, newScore?: number, newAccuracy?: number) {
  const { data, error } = await db.rpc("resolve_competition_dispute", { p_dispute_id: id, p_decision: decision, p_resolution_note: note, p_new_score: newScore ?? null, p_new_accuracy: newAccuracy ?? null });
  if (error) throw error;
  return data;
}

export async function listTournaments(): Promise<Tournament[]> {
  const { data, error } = await db.from("tournaments").select("*").neq("status", "draft").order("starts_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Tournament[];
}
export async function getTournament(id: string): Promise<Tournament> {
  const { data, error } = await db.from("tournaments").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Tournament not found or not visible to this account.");
  return data as Tournament;
}
export async function listAdminTournaments(): Promise<Tournament[]> {
  const { data, error } = await db.from("tournaments").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Tournament[];
}
export async function listTournamentRounds(tournamentId: string) {
  const { data, error } = await db.from("tournament_rounds").select("*,tournament_matches(*)").eq("tournament_id", tournamentId).order("round_number");
  if (error) throw error;
  return (data ?? []) as Array<Record<string, unknown>>;
}

export interface CreateTournamentInput { title: string; description: string; format: string; participantMode?: "individual" | "team"; teamTopN?: number; teamCompetitionId?: string | null; startsAt: string; endsAt: string; registrationStartsAt: string; registrationEndsAt: string; timezone: string; questionIds: string[]; roundCount: number; matchDurationMinutes: number; participantLimit: number | null; scopeType: "everyone"|"institution"|"faculty"|"department"|"programme"|"level"; scopeId: string|null; }
export async function listAdminTeamCompetitions(): Promise<Array<{id:string;title:string}>> {
  const { data, error } = await db.from("competitions").select("id,title").eq("competition_type","team").neq("status","archived").order("created_at",{ascending:false});
  if (error) throw error;
  return (data ?? []) as Array<{id:string;title:string}>;
}
export async function createTournamentDraft(input: CreateTournamentInput) {
  if (!input.title.trim()) throw new Error("Tournament title is required.");
  if (input.participantMode === "team" && !input.teamCompetitionId) throw new Error("Choose the team competition this tournament belongs to.");
  if (!Number.isInteger(input.teamTopN ?? 3) || (input.teamTopN ?? 3) < 1 || (input.teamTopN ?? 3) > 20) throw new Error("Top scores per team must be between 1 and 20.");
  if (input.questionIds.length === 0) throw new Error("Choose at least one published question.");
  if (input.scopeType!=="everyone"&&!input.scopeId) throw new Error("Choose a record for the selected tournament scope.");
  if (new Date(input.startsAt).getTime() <= Date.now()) throw new Error("Tournament start must be in the future.");
  if (new Date(input.endsAt).getTime() <= new Date(input.startsAt).getTime()) throw new Error("Tournament end must be after its start.");
  if (new Date(input.registrationStartsAt).getTime() >= new Date(input.registrationEndsAt).getTime() || new Date(input.registrationEndsAt).getTime() > new Date(input.startsAt).getTime()) throw new Error("Registration must close before the tournament starts.");
  const { data, error } = await db.from("tournaments").insert({ title: input.title.trim(), description: input.description.trim() || null, format: input.format, participant_mode: input.participantMode ?? "individual", team_top_n: input.teamTopN ?? 3, team_competition_id: input.participantMode === "team" ? input.teamCompetitionId ?? null : null, starts_at: new Date(input.startsAt).toISOString(), ends_at: new Date(input.endsAt).toISOString(), registration_starts_at: new Date(input.registrationStartsAt).toISOString(), registration_ends_at: new Date(input.registrationEndsAt).toISOString(), timezone: input.timezone, question_count: input.questionIds.length, round_count: input.roundCount, match_duration_minutes: input.matchDurationMinutes, participant_limit: input.participantLimit, status: "draft", ...(input.scopeType!=="everyone"&&input.scopeId?{[`${input.scopeType}_id`]:input.scopeId}:{}) }).select("id").single();
  if (error) throw error;
  const { error: questionError } = await db.from("tournament_questions").insert(input.questionIds.map((questionId,index)=>({tournament_id:data.id,question_id:questionId,display_order:index,points:1})));
  if (questionError) { await db.from("tournaments").delete().eq("id",data.id); throw questionError; }
  return data.id as string;
}
export async function publishTournament(tournamentId: string) {
  const { data, error } = await db.rpc("publish_tournament", { p_tournament_id: tournamentId });
  if (error) throw error;
  return data;
}
export async function generateTournamentMatches(tournamentId: string, participantMode: "individual" | "team" = "individual") {
  const { data, error } = await db.rpc(participantMode === "team" ? "generate_tournament_team_matches" : "generate_tournament_matches", { p_tournament_id: tournamentId });
  if (error) throw error;
  return data as number;
}
export async function registerForTournament(tournamentId: string) {
  const { data, error } = await db.rpc("register_for_tournament", { p_tournament_id: tournamentId });
  if (error) throw error;
  return data;
}
export async function listMyTournamentRegistrations(studentId: string) {
  const { data, error } = await db.from("tournament_participants").select("tournament_id,registration_status").eq("student_id", studentId);
  if (error) throw error;
  return (data ?? []) as Array<{ tournament_id: string; registration_status: string }>;
}

export interface WeeklyChallengeSeries { id: string; title: string; template_competition_id: string; timezone: string; weekday: number; local_start_time: string; duration_minutes: number; registration_lead_minutes: number; is_active: boolean; created_at: string }
export async function listWeeklyChallengeSeries(): Promise<WeeklyChallengeSeries[]> {
  const { data, error } = await db.from("weekly_challenge_series").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as WeeklyChallengeSeries[];
}
export async function createWeeklyChallengeSeries(input: Omit<WeeklyChallengeSeries,"id"|"created_at"|"is_active">) {
  const { data, error } = await db.from("weekly_challenge_series").insert({ ...input, is_active: true }).select("id").single();
  if (error) throw error;
  return data.id as string;
}
export async function generateWeeklyChallengeInstance(seriesId: string, scheduledStart: Date, occurrenceKey: string) {
  const { data, error } = await db.rpc("generate_weekly_challenge_instance", { p_series_id: seriesId, p_scheduled_start: scheduledStart.toISOString(), p_occurrence_key: occurrenceKey });
  if (error) throw error;
  return data;
}

export interface CompetitionTeam { id: string; competition_id: string; name: string; captain_id: string; department_id: string | null; status: string; roster_locked_at: string | null; competition_team_members?: Array<{ student_id: string; role: string; status: string }> }
export async function listCompetitionTeams(competitionId: string): Promise<CompetitionTeam[]> {
  const { data, error } = await db.from("competition_teams").select("*,competition_team_members(student_id,role,status)").eq("competition_id", competitionId).order("created_at");
  if (error) throw error;
  return (data ?? []) as CompetitionTeam[];
}
export async function createCompetitionTeam(competitionId: string, name: string) {
  const { data, error } = await db.rpc("create_competition_team", { p_competition_id: competitionId, p_name: name, p_department_id: null });
  if (error) throw error;
  return data;
}
export async function inviteCompetitionTeamMember(teamId: string, studentId: string) {
  const { data, error } = await db.rpc("invite_competition_team_member", { p_team_id: teamId, p_student_id: studentId });
  if (error) throw error;
  return data;
}
export async function listMyTeamInvitations(studentId: string, competitionId: string) {
  const { data, error } = await db.from("competition_team_members").select("id,team_id,status,role,competition_teams!inner(name,competition_id)").eq("student_id", studentId).eq("status", "invited").eq("competition_teams.competition_id", competitionId);
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; team_id: string; status: string; role: string; competition_teams: { name: string; competition_id: string } }>;
}
export async function respondToTeamInvite(teamId: string, accept: boolean) {
  const { data, error } = await db.rpc("respond_competition_team_invite", { p_team_id: teamId, p_accept: accept });
  if (error) throw error;
  return data;
}
export async function listAdminTournamentMatches(tournamentId: string) {
  const { data, error } = await db.from("tournament_rounds").select("id,round_number,title,tournament_matches(*)").eq("tournament_id", tournamentId).order("round_number");
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; round_number: number; title: string | null; tournament_matches: Array<Record<string, unknown>> }>;
}
export async function recordTournamentMatchResult(matchId: string, outcome: string, aScore: number | null, bScore: number | null, reason: string) {
  const { data, error } = await db.rpc("record_tournament_match_result", { p_match_id: matchId, p_outcome: outcome, p_a_score: aScore, p_b_score: bScore, p_reason: reason });
  if (error) throw error;
  return data;
}
export async function transitionTournamentStatus(tournamentId: string, status: "live" | "completed" | "cancelled" | "archived") {
  const { data, error } = await db.rpc("transition_tournament_status", { p_tournament_id: tournamentId, p_new_status: status });
  if (error) throw error;
  return data;
}
export async function rescheduleTournamentMatch(matchId: string, scheduledAt: string, reason: string) {
  const { data, error } = await db.rpc("reschedule_tournament_match", { p_match_id: matchId, p_new_time: new Date(scheduledAt).toISOString(), p_reason: reason });
  if (error) throw error;
  return data;
}
export async function advanceGroupStageToKnockout(tournamentId: string) {
  const { data, error } = await db.rpc("advance_group_stage_to_knockout", { p_tournament_id: tournamentId });
  if (error) throw error;
  return data as number;
}
export async function finalizeTournamentStandings(tournamentId: string, participantMode: "individual" | "team" = "individual") {
  const { data, error } = await db.rpc(participantMode === "team" ? "finalize_team_tournament_standings" : "finalize_tournament_standings", { p_tournament_id: tournamentId });
  if (error) throw error;
  return data as number;
}
export async function getMyTournamentParticipantId(tournamentId: string, studentId: string): Promise<string | null> {
  const { data, error } = await db.from("tournament_participants").select("id").eq("tournament_id", tournamentId).eq("student_id", studentId).eq("registration_status", "registered").maybeSingle();
  if (error) throw error;
  return (data?.id as string | undefined) ?? null;
}
export interface TournamentMatchQuestion { question_id: string; display_order: number; prompt: string; question_type: string; points: number; options: Array<{ id: string; text: string }> }
export async function startTournamentMatchAttempt(matchId: string) {
  const { data, error } = await db.rpc("start_tournament_match_attempt", { p_match_id: matchId });
  if (error) throw error;
  return data as { id: string; status: string; started_at: string; score: number | null };
}
export async function getTournamentMatchAttemptQuestions(attemptId: string): Promise<TournamentMatchQuestion[]> {
  const { data, error } = await db.rpc("get_tournament_match_attempt_questions", { p_attempt_id: attemptId });
  if (error) throw error;
  return (data ?? []) as TournamentMatchQuestion[];
}
export async function getTournamentMatchAttemptAnswers(attemptId: string) {
  const { data, error } = await db.rpc("get_tournament_match_attempt_answers", { p_attempt_id: attemptId });
  if (error) throw error;
  return (data ?? []) as Array<{ question_id: string; selected_option_id: string | null; answer_text: string | null }>;
}
export async function saveTournamentMatchAnswer(attemptId: string, questionId: string, optionId: string | null, answerText: string | null) {
  const { error } = await db.rpc("save_tournament_match_answer", { p_attempt_id: attemptId, p_question_id: questionId, p_selected_option_id: optionId, p_answer_text: answerText });
  if (error) throw error;
}
export async function submitTournamentMatchAttempt(attemptId: string) {
  const { data, error } = await db.rpc("submit_tournament_match_attempt", { p_attempt_id: attemptId });
  if (error) throw error;
  return data;
}
export async function getMyTournamentMatchAttempt(matchId: string, studentId: string) {
  const { data, error } = await db.from("tournament_match_attempts").select("*").eq("tournament_match_id", matchId).eq("student_id", studentId).maybeSingle();
  if (error) throw error;
  return data as { id: string; status: string; started_at: string; submitted_at: string | null; score: number | null; accuracy: number | null } | null;
}

export interface TournamentTeamOption { team_id: string; team_name: string; competition_id: string; roster_locked_at: string | null; registered: boolean }
export async function listMyTournamentTeams(tournamentId: string): Promise<TournamentTeamOption[]> {
  const { data, error } = await db.rpc("list_my_tournament_teams", { p_tournament_id: tournamentId });
  if (error) throw error;
  return (data ?? []) as TournamentTeamOption[];
}
export async function registerTeamForTournament(tournamentId: string, teamId: string) {
  const { data, error } = await db.rpc("register_team_for_tournament", { p_tournament_id: tournamentId, p_team_id: teamId });
  if (error) throw error;
  return data;
}
export async function advanceTeamGroupStageToKnockout(tournamentId: string) {
  const { data, error } = await db.rpc("advance_team_group_stage_to_knockout", { p_tournament_id: tournamentId });
  if (error) throw error;
  return data as number;
}
export async function startTournamentTeamMatchAttempt(matchId: string) {
  const { data, error } = await db.rpc("start_tournament_team_match_attempt", { p_match_id: matchId });
  if (error) throw error;
  return data as { id: string; status: string; started_at: string; score: number | null };
}
export async function getTournamentTeamMatchAttemptQuestions(attemptId: string): Promise<TournamentMatchQuestion[]> {
  const { data, error } = await db.rpc("get_tournament_team_match_attempt_questions", { p_attempt_id: attemptId });
  if (error) throw error;
  return (data ?? []) as TournamentMatchQuestion[];
}
export async function getTournamentTeamMatchAttemptAnswers(attemptId: string) {
  const { data, error } = await db.rpc("get_tournament_team_match_attempt_answers", { p_attempt_id: attemptId });
  if (error) throw error;
  return (data ?? []) as Array<{ question_id: string; selected_option_id: string | null; answer_text: string | null }>;
}
export async function saveTournamentTeamMatchAnswer(attemptId: string, questionId: string, optionId: string | null, answerText: string | null) {
  const { error } = await db.rpc("save_tournament_team_match_answer", { p_attempt_id: attemptId, p_question_id: questionId, p_selected_option_id: optionId, p_answer_text: answerText });
  if (error) throw error;
}
export async function submitTournamentTeamMatchAttempt(attemptId: string) {
  const { data, error } = await db.rpc("submit_tournament_team_match_attempt", { p_attempt_id: attemptId });
  if (error) throw error;
  return data;
}
export async function getMyTournamentTeamMatchAttempt(matchId: string, studentId: string) {
  const { data, error } = await db.from("tournament_team_match_attempts").select("*").eq("tournament_match_id", matchId).eq("student_id", studentId).maybeSingle();
  if (error) throw error;
  return data as { id: string; team_id: string; status: string; started_at: string; submitted_at: string | null; score: number | null; accuracy: number | null } | null;
}
export interface StudentNotification { id: string; type: string; title: string; body: string | null; related_type: string | null; related_id: string | null; is_read: boolean; created_at: string }
export async function listMyNotifications(): Promise<StudentNotification[]> {
  const { data, error } = await db.from("notifications").select("id,type,title,body,related_type,related_id,is_read,created_at").order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []) as StudentNotification[];
}
export async function markNotificationRead(notificationId: string) {
  const { error } = await db.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", notificationId);
  if (error) throw error;
}
export async function markAllNotificationsRead() {
  const { error } = await db.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("is_read", false);
  if (error) throw error;
}

export async function lockCompetitionTeamRosters(competitionId: string) {
  const { data, error } = await db.rpc("lock_competition_team_rosters", { p_competition_id: competitionId });
  if (error) throw error;
  return data as number;
}

export async function listCompetitionScopeOptions(): Promise<CompetitionScopeOptions> {
  const queries = await Promise.all([
    db.from("institutions").select("id,name").order("name"),
    db.from("faculties").select("id,name").order("name"),
    db.from("departments").select("id,name").order("name"),
    db.from("programmes").select("id,name").order("name"),
    db.from("levels").select("id,name").order("name"),
    db.from("academic_sessions").select("id,name").order("name"),
    db.from("semesters").select("id,name").order("name"),
    db.from("course_offerings").select("id,courses(title),programmes(name),levels(name),semesters(name)").eq("status","published").order("created_at",{ascending:false}),
  ]);
  const labels = ["institution","faculty","department","programme","level","academic_session","semester","course_offering"] as const;
  const options = {} as CompetitionScopeOptions;
  for(let i=0;i<queries.length;i++){
    const {data,error}=queries[i]; if(error) throw error;
    options[labels[i]]=(data??[]).map((row:Record<string,unknown>)=>{
      if(labels[i]==="course_offering"){
        const course=row.courses as {title?:string}|null; const programme=row.programmes as {name?:string}|null; const level=row.levels as {name?:string}|null; const semester=row.semesters as {name?:string}|null;
        return {id:String(row.id),label:[course?.title,programme?.name,level?.name,semester?.name].filter(Boolean).join(" · ")||String(row.id).slice(0,8)};
      }
      return {id:String(row.id),label:String(row.name??row.id)};
    });
  }
  return options;
}
