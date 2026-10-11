-- Keep team-match answer reads and writes aligned with individual-match guards.
create or replace function public.get_tournament_team_match_attempt_answers(p_attempt_id uuid)
returns table(question_id uuid, selected_option_id text, answer_text text)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_attempt public.tournament_team_match_attempts%rowtype;
  v_match public.tournament_matches%rowtype;
  v_round public.tournament_rounds%rowtype;
  v_t public.tournaments%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_attempt from public.tournament_team_match_attempts
    where id = p_attempt_id and student_id = v_uid and status = 'in_progress';
  if not found then raise exception 'Active team attempt not found'; end if;
  select * into v_match from public.tournament_matches where id = v_attempt.tournament_match_id;
  if not found or v_match.status not in ('scheduled', 'in_progress') then
    raise exception 'Match is no longer accepting answers';
  end if;
  select * into v_round from public.tournament_rounds where id = v_match.tournament_round_id;
  select * into v_t from public.tournaments where id = v_round.tournament_id;
  if not found or v_t.status <> 'live' then raise exception 'Tournament is no longer live'; end if;
  if now() >= least(v_t.ends_at, v_match.scheduled_at + make_interval(mins => coalesce(v_t.match_duration_minutes, 30))) then
    raise exception 'Match deadline passed';
  end if;
  return query select a.question_id, coalesce(a.selected_option_snapshot_id, a.selected_option_id::text), a.answer_text
    from public.tournament_team_match_answers a where a.attempt_id = p_attempt_id;
end;
$$;
revoke all on function public.get_tournament_team_match_attempt_answers(uuid) from public, anon;
grant execute on function public.get_tournament_team_match_attempt_answers(uuid) to authenticated;

create or replace function public.save_tournament_team_match_answer(
  p_attempt_id uuid, p_question_id uuid, p_selected_option_id uuid default null, p_answer_text text default null
)
returns public.tournament_team_match_answers
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_attempt public.tournament_team_match_attempts%rowtype;
  v_match public.tournament_matches%rowtype;
  v_round public.tournament_rounds%rowtype;
  v_t public.tournaments%rowtype;
  v_question public.tournament_match_questions%rowtype;
  v_answer public.tournament_team_match_answers%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_attempt from public.tournament_team_match_attempts
    where id = p_attempt_id and student_id = v_uid for update;
  if not found or v_attempt.status <> 'in_progress' then raise exception 'Active team attempt not found'; end if;
  select * into v_match from public.tournament_matches where id = v_attempt.tournament_match_id;
  if not found or v_match.status not in ('scheduled', 'in_progress') then
    raise exception 'Match is no longer accepting answers';
  end if;
  select * into v_round from public.tournament_rounds where id = v_match.tournament_round_id;
  select * into v_t from public.tournaments where id = v_round.tournament_id;
  if not found or v_t.status <> 'live' then raise exception 'Tournament is no longer live'; end if;
  if now() >= least(v_t.ends_at, v_match.scheduled_at + make_interval(mins => coalesce(v_t.match_duration_minutes, 30))) then
    raise exception 'Match deadline has passed';
  end if;
  select * into v_question from public.tournament_match_questions
    where tournament_match_id = v_match.id and question_id = p_question_id and question_snapshot is not null;
  if not found then raise exception 'Question is not part of this frozen match'; end if;
  if v_question.question_snapshot->>'question_type' in ('multiple_choice', 'true_false') then
    if p_selected_option_id is null or not exists (
      select 1 from jsonb_array_elements(v_question.question_snapshot->'options') opt
      where opt->>'id' = p_selected_option_id::text
    ) then raise exception 'Choose a valid option'; end if;
  elsif p_selected_option_id is not null then
    raise exception 'This question expects a text answer';
  end if;
  insert into public.tournament_team_match_answers(
    attempt_id, question_id, selected_option_id, selected_option_snapshot_id, answer_text
  ) values (p_attempt_id, p_question_id, p_selected_option_id, p_selected_option_id::text, left(p_answer_text, 4000))
  on conflict (attempt_id, question_id) do update
    set selected_option_id = excluded.selected_option_id,
        selected_option_snapshot_id = excluded.selected_option_snapshot_id,
        answer_text = excluded.answer_text, is_correct = null, answered_at = now()
  returning * into v_answer;
  return v_answer;
end;
$$;
revoke all on function public.save_tournament_team_match_answer(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.save_tournament_team_match_answer(uuid, uuid, uuid, text) to authenticated;
