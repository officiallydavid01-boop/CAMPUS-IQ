-- Do not serve team-tournament questions for completed/cancelled matches.
-- Keep the existing ownership, active-attempt, live-window, and deadline checks.
create or replace function public.get_tournament_team_match_attempt_questions(p_attempt_id uuid)
returns table(question_id uuid, display_order integer, prompt text, question_type public.question_type, points numeric, options jsonb)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_attempt public.tournament_team_match_attempts%rowtype;
  v_match public.tournament_matches%rowtype;
  v_round public.tournament_rounds%rowtype;
  v_t public.tournaments%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_attempt
  from public.tournament_team_match_attempts
  where id = p_attempt_id and student_id = v_uid and status = 'in_progress';
  if not found then raise exception 'Active team attempt not found'; end if;

  select * into v_match
  from public.tournament_matches
  where id = v_attempt.tournament_match_id;
  if not found or v_match.status not in ('scheduled', 'in_progress') then
    raise exception 'Match is no longer accepting questions';
  end if;

  select * into v_round from public.tournament_rounds where id = v_match.tournament_round_id;
  select * into v_t from public.tournaments where id = v_round.tournament_id;
  if not found or v_t.status <> 'live' then
    raise exception 'Tournament is no longer live';
  end if;
  if now() >= least(v_t.ends_at, v_match.scheduled_at + make_interval(mins => coalesce(v_t.match_duration_minutes, 30))) then
    raise exception 'Match deadline passed';
  end if;

  return query
    select q.question_id, q.display_order, q.question_snapshot->>'prompt',
      (q.question_snapshot->>'question_type')::public.question_type, q.points,
      coalesce((
        select jsonb_agg(jsonb_build_object('id', o->>'id', 'text', o->>'text') order by o->>'id')
        from jsonb_array_elements(q.question_snapshot->'options') o
      ), '[]'::jsonb)
    from public.tournament_team_match_questions q
    where q.tournament_match_id = v_match.id and q.question_snapshot is not null
    order by q.display_order;
end;
$$;

revoke all on function public.get_tournament_team_match_attempt_questions(uuid) from public, anon;
grant execute on function public.get_tournament_team_match_attempt_questions(uuid) to authenticated;
