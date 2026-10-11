-- Scheduled live attempts for individual tournament matches. Team matches remain
-- Admin-scored in this release until a tournament-specific team roster is assigned.
create table if not exists public.tournament_match_attempts (
  id uuid primary key default gen_random_uuid(),
  tournament_match_id uuid not null references public.tournament_matches(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  status public.attempt_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  score numeric(8,2),
  max_score numeric(8,2),
  accuracy numeric(6,2),
  response_time_ms integer,
  unique(tournament_match_id,student_id)
);
create table if not exists public.tournament_match_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.tournament_match_attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete restrict,
  selected_option_id uuid references public.question_options(id) on delete set null,
  selected_option_snapshot_id text,
  answer_text text,
  is_correct boolean,
  answered_at timestamptz not null default now(),
  unique(attempt_id,question_id)
);
alter table public.tournament_match_attempts enable row level security;
alter table public.tournament_match_answers enable row level security;
create policy "read own tournament match attempts" on public.tournament_match_attempts for select to authenticated using(student_id=auth.uid() or public.is_staff());
create policy "read own tournament match answers" on public.tournament_match_answers for select to authenticated using(exists(select 1 from public.tournament_match_attempts a where a.id=attempt_id and (a.student_id=auth.uid() or public.is_staff())));
create index if not exists tournament_match_attempts_student_idx on public.tournament_match_attempts(student_id,tournament_match_id);
create index if not exists tournament_match_answers_attempt_idx on public.tournament_match_answers(attempt_id);

create or replace function public.start_tournament_match_attempt(p_match_id uuid)
returns public.tournament_match_attempts language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_match public.tournament_matches%rowtype; v_round public.tournament_rounds%rowtype; v_t public.tournaments%rowtype; v_participant public.tournament_participants%rowtype; v_attempt public.tournament_match_attempts%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_match from public.tournament_matches where id=p_match_id for update;
  if not found or v_match.team_a_id is not null or v_match.team_b_id is not null then raise exception 'This match is unavailable for individual attempt-taking'; end if;
  if v_match.status not in ('scheduled','in_progress') then raise exception 'Match is not accepting attempts'; end if;
  select * into v_round from public.tournament_rounds where id=v_match.tournament_round_id;
  select * into v_t from public.tournaments where id=v_round.tournament_id;
  if v_t.status<>'live' then raise exception 'Tournament is not live'; end if;
  if v_match.scheduled_at is null or now()<v_match.scheduled_at or now()>=least(v_t.ends_at,v_match.scheduled_at+make_interval(mins=>coalesce(v_t.match_duration_minutes,30))) then raise exception 'Match is outside its scheduled live window'; end if;
  select * into v_participant from public.tournament_participants where student_id=v_uid and tournament_id=v_t.id and registration_status='registered' and id in (v_match.participant_a_id,v_match.participant_b_id);
  if not found then raise exception 'Only the two registered match participants may start this attempt'; end if;
  select * into v_attempt from public.tournament_match_attempts where tournament_match_id=p_match_id and student_id=v_uid for update;
  if found then if v_attempt.status in ('in_progress','submitted','graded') then return v_attempt; else raise exception 'Official match attempt already used'; end if; end if;
  update public.tournament_matches set status='in_progress',started_at=coalesce(started_at,now()) where id=p_match_id and status='scheduled';
  insert into public.tournament_match_attempts(tournament_match_id,student_id,status,started_at) values(p_match_id,v_uid,'in_progress',now()) returning * into v_attempt;
  return v_attempt;
end;
$$;

create or replace function public.get_tournament_match_attempt_questions(p_attempt_id uuid)
returns table(question_id uuid,display_order integer,prompt text,question_type public.question_type,points numeric,options jsonb)
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_attempt public.tournament_match_attempts%rowtype; v_match public.tournament_matches%rowtype; v_round public.tournament_rounds%rowtype; v_t public.tournaments%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_attempt from public.tournament_match_attempts where id=p_attempt_id and student_id=v_uid and status='in_progress';
  if not found then raise exception 'Active match attempt not found'; end if;
  select * into v_match from public.tournament_matches where id=v_attempt.tournament_match_id;
  if v_match.status not in ('scheduled','in_progress') then raise exception 'Match is no longer accepting answers'; end if;
  select * into v_round from public.tournament_rounds where id=v_match.tournament_round_id;
  select * into v_t from public.tournaments where id=v_round.tournament_id;
  if v_t.status<>'live' then raise exception 'Tournament is no longer live'; end if;
  if now()>=least(v_t.ends_at,v_match.scheduled_at+make_interval(mins=>coalesce(v_t.match_duration_minutes,30))) then raise exception 'Match deadline has passed'; end if;
  return query select tmq.question_id,tmq.display_order,tmq.question_snapshot->>'prompt',(tmq.question_snapshot->>'question_type')::public.question_type,tmq.points,
    coalesce((select jsonb_agg(jsonb_build_object('id',opt->>'id','text',opt->>'text') order by ordinality) from jsonb_array_elements(tmq.question_snapshot->'options') with ordinality as e(opt,ordinality)),'[]'::jsonb)
    from public.tournament_match_questions tmq where tmq.tournament_match_id=v_match.id and tmq.question_snapshot is not null order by tmq.display_order,tmq.question_id;
end;
$$;

create or replace function public.get_tournament_match_attempt_answers(p_attempt_id uuid)
returns table(question_id uuid,selected_option_id text,answer_text text)
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null or not exists(select 1 from public.tournament_match_attempts where id=p_attempt_id and student_id=v_uid and status='in_progress') then raise exception 'Active match attempt not found'; end if;
  return query select a.question_id,coalesce(a.selected_option_snapshot_id,a.selected_option_id::text),a.answer_text from public.tournament_match_answers a where a.attempt_id=p_attempt_id;
end;
$$;

create or replace function public.save_tournament_match_answer(p_attempt_id uuid,p_question_id uuid,p_selected_option_id uuid default null,p_answer_text text default null)
returns public.tournament_match_answers language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_attempt public.tournament_match_attempts%rowtype; v_match public.tournament_matches%rowtype; v_round public.tournament_rounds%rowtype; v_t public.tournaments%rowtype; v_question public.tournament_match_questions%rowtype; v_answer public.tournament_match_answers%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_attempt from public.tournament_match_attempts where id=p_attempt_id and student_id=v_uid for update;
  if not found or v_attempt.status<>'in_progress' then raise exception 'Active match attempt not found'; end if;
  select * into v_match from public.tournament_matches where id=v_attempt.tournament_match_id;
  if v_match.status not in ('scheduled','in_progress') then raise exception 'Match is no longer accepting answers'; end if;
  select * into v_round from public.tournament_rounds where id=v_match.tournament_round_id;
  select * into v_t from public.tournaments where id=v_round.tournament_id;
  if v_t.status<>'live' then raise exception 'Tournament is no longer live'; end if;
  if now()>=least(v_t.ends_at,v_match.scheduled_at+make_interval(mins=>coalesce(v_t.match_duration_minutes,30))) then raise exception 'Match deadline has passed'; end if;
  select * into v_question from public.tournament_match_questions where tournament_match_id=v_match.id and question_id=p_question_id and question_snapshot is not null;
  if not found then raise exception 'Question is not part of this frozen match'; end if;
  if v_question.question_snapshot->>'question_type' in ('multiple_choice','true_false') then
    if p_selected_option_id is null or not exists(select 1 from jsonb_array_elements(v_question.question_snapshot->'options') opt where opt->>'id'=p_selected_option_id::text) then raise exception 'Choose a valid option'; end if;
  elsif p_selected_option_id is not null then raise exception 'This question expects a text answer'; end if;
  insert into public.tournament_match_answers(attempt_id,question_id,selected_option_id,selected_option_snapshot_id,answer_text,is_correct,answered_at)
    values(p_attempt_id,p_question_id,p_selected_option_id,p_selected_option_id::text,left(p_answer_text,4000),null,now())
    on conflict(attempt_id,question_id) do update set selected_option_id=excluded.selected_option_id,selected_option_snapshot_id=excluded.selected_option_snapshot_id,answer_text=excluded.answer_text,is_correct=null,answered_at=now()
    returning * into v_answer;
  return v_answer;
end;
$$;

create or replace function public.ci_complete_tournament_match_from_attempts(p_match_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_match public.tournament_matches%rowtype; v_round public.tournament_rounds%rowtype; v_t public.tournaments%rowtype; v_a public.tournament_match_attempts%rowtype; v_b public.tournament_match_attempts%rowtype; v_outcome text; v_winner uuid; v_loser uuid; v_next uuid; v_slot text;
begin
  select * into v_match from public.tournament_matches where id=p_match_id for update;
  if not found or v_match.team_a_id is not null or v_match.team_b_id is not null then return false; end if;
  select * into v_round from public.tournament_rounds where id=v_match.tournament_round_id;
  select * into v_t from public.tournaments where id=v_round.tournament_id;
  select * into v_a from public.tournament_match_attempts where tournament_match_id=p_match_id and student_id=(select student_id from public.tournament_participants where id=v_match.participant_a_id) and status='graded';
  if not found then return false; end if;
  select * into v_b from public.tournament_match_attempts where tournament_match_id=p_match_id and student_id=(select student_id from public.tournament_participants where id=v_match.participant_b_id) and status='graded';
  if not found then return false; end if;
  if v_a.score=v_b.score then
    if v_t.format in ('single_elimination','knockout') or (v_t.format='group_stage_knockout' and v_round.round_number>1) then return false; end if;
    v_outcome:='draw';
  elsif v_a.score>v_b.score then v_outcome:='a_wins'; v_winner:=v_match.participant_a_id; v_loser:=v_match.participant_b_id;
  else v_outcome:='b_wins'; v_winner:=v_match.participant_b_id; v_loser:=v_match.participant_a_id; end if;
  insert into public.tournament_match_results(tournament_match_id,participant_a_score,participant_b_score,outcome,reason,result_version)
    values(p_match_id,v_a.score,v_b.score,v_outcome,'Server-scored from frozen match questions',v_match.result_version);
  update public.tournament_matches set status='completed',completed_at=now(),winner_participant_id=v_winner,result_version=result_version+1 where id=p_match_id;
  if v_t.format in ('single_elimination','knockout') or (v_t.format='group_stage_knockout' and v_round.round_number>1) then
    if v_loser is not null then update public.tournament_participants set is_eliminated=true,eliminated_at=now(),eliminated_round=v_round.round_number where id=v_loser; end if;
  end if;
  select next_match_id,next_slot into v_next,v_slot from public.tournament_matches where id=p_match_id;
  if v_next is not null and v_winner is not null then
    if v_slot='a' then update public.tournament_matches set participant_a_id=v_winner where id=v_next and participant_a_id is null;
    else update public.tournament_matches set participant_b_id=v_winner where id=v_next and participant_b_id is null; end if;
  end if;
  return true;
end;
$$;

create or replace function public.submit_tournament_match_attempt(p_attempt_id uuid)
returns public.tournament_match_attempts language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_attempt public.tournament_match_attempts%rowtype; v_match public.tournament_matches%rowtype; v_round public.tournament_rounds%rowtype; v_t public.tournaments%rowtype; v_q record; v_answer public.tournament_match_answers%rowtype; v_score numeric(8,2):=0; v_max numeric(8,2):=0; v_correct integer:=0; v_total integer:=0; v_is_correct boolean; v_accuracy numeric(6,2); v_duration integer;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_attempt from public.tournament_match_attempts where id=p_attempt_id and student_id=v_uid for update;
  if not found then raise exception 'Match attempt not found'; end if;
  if v_attempt.status='graded' then return v_attempt; end if;
  if v_attempt.status<>'in_progress' then raise exception 'Match attempt cannot be submitted'; end if;
  select * into v_match from public.tournament_matches where id=v_attempt.tournament_match_id;
  if v_match.status not in ('scheduled','in_progress') then raise exception 'Match has already been resolved'; end if;
  select * into v_round from public.tournament_rounds where id=v_match.tournament_round_id;
  select * into v_t from public.tournaments where id=v_round.tournament_id;
  if v_t.status<>'live' then raise exception 'Tournament is no longer live'; end if;
  for v_q in select tmq.question_id,tmq.question_snapshot,tmq.points from public.tournament_match_questions tmq where tmq.tournament_match_id=v_match.id and tmq.question_snapshot is not null order by tmq.display_order loop
    v_total:=v_total+1; v_max:=v_max+v_q.points;
    select * into v_answer from public.tournament_match_answers where attempt_id=p_attempt_id and question_id=v_q.question_id;
    v_is_correct:=false;
    if found then
      if v_q.question_snapshot->>'question_type' in ('multiple_choice','true_false') then
        select coalesce((opt->>'is_correct')::boolean,false) into v_is_correct from jsonb_array_elements(v_q.question_snapshot->'options') opt where opt->>'id'=coalesce(v_answer.selected_option_snapshot_id,v_answer.selected_option_id::text) limit 1;
        v_is_correct:=coalesce(v_is_correct,false);
      elsif v_q.question_snapshot->>'question_type'='numerical' then
        begin v_is_correct:=trim(coalesce(v_answer.answer_text,''))::numeric=trim(coalesce(v_q.question_snapshot->>'correct_answer_text',''))::numeric; exception when others then v_is_correct:=false; end;
      else
        v_is_correct:=nullif(regexp_replace(lower(trim(coalesce(v_answer.answer_text,''))), '\s+', ' ', 'g'),'') is not null and regexp_replace(lower(trim(coalesce(v_answer.answer_text,''))), '\s+', ' ', 'g')=regexp_replace(lower(trim(coalesce(v_q.question_snapshot->>'correct_answer_text',''))), '\s+', ' ', 'g');
      end if;
      update public.tournament_match_answers set is_correct=v_is_correct where id=v_answer.id;
    end if;
    if coalesce(v_is_correct,false) then v_correct:=v_correct+1; v_score:=v_score+v_q.points; end if;
  end loop;
  v_accuracy:=case when v_total>0 then round((v_correct::numeric/v_total::numeric)*100,2) else 0 end;
  v_duration:=greatest(0,least(2147483647,(extract(epoch from (least(now(),least(v_t.ends_at,v_match.scheduled_at+make_interval(mins=>coalesce(v_t.match_duration_minutes,30))))-v_attempt.started_at)*1000))::bigint))::integer;
  update public.tournament_match_attempts set status='graded',submitted_at=now(),score=v_score,max_score=v_max,accuracy=v_accuracy,response_time_ms=v_duration where id=p_attempt_id returning * into v_attempt;
  perform public.ci_complete_tournament_match_from_attempts(v_attempt.tournament_match_id);
  return v_attempt;
end;
$$;

revoke all on function public.start_tournament_match_attempt(uuid) from public,anon;
revoke all on function public.get_tournament_match_attempt_questions(uuid) from public,anon;
revoke all on function public.get_tournament_match_attempt_answers(uuid) from public,anon;
revoke all on function public.save_tournament_match_answer(uuid,uuid,uuid,text) from public,anon;
revoke all on function public.ci_complete_tournament_match_from_attempts(uuid) from public,anon,authenticated;
revoke all on function public.submit_tournament_match_attempt(uuid) from public,anon;
grant execute on function public.start_tournament_match_attempt(uuid) to authenticated;
grant execute on function public.get_tournament_match_attempt_questions(uuid) to authenticated;
grant execute on function public.get_tournament_match_attempt_answers(uuid) to authenticated;
grant execute on function public.save_tournament_match_answer(uuid,uuid,uuid,text) to authenticated;
grant execute on function public.submit_tournament_match_attempt(uuid) to authenticated;
