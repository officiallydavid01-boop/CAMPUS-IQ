-- Phase 7 security follow-up: lifecycle writes must go through validated RPCs.

-- Competition creation is draft-only. No client may directly create a published row.
drop policy if exists "staff writes competitions" on public.competitions;
drop policy if exists "staff updates competitions" on public.competitions;
drop policy if exists "staff deletes competitions" on public.competitions;
create policy "admins create competition drafts" on public.competitions for insert to authenticated
  with check (public.is_admin() and status='draft' and published_at is null);
create policy "admins update competition drafts" on public.competitions for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "admins delete competition drafts" on public.competitions for delete to authenticated
  using (public.is_admin() and status='draft' and published_at is null);

-- Official results and grades are writable only through server-side functions.
drop policy if exists "staff grades competition_attempts" on public.competition_attempts;
drop policy if exists "staff grades competition_answers" on public.competition_answers;
drop policy if exists "staff writes competition_results" on public.competition_results;
drop policy if exists "admins update competition_results" on public.competition_results;

-- Team/department aggregates are read-only over the client API; their values
-- are produced by the authorized rebuild functions.
drop policy if exists "admins manage team results" on public.competition_team_results;
create policy "admins read team results" on public.competition_team_results for select to authenticated using (public.is_admin());
drop policy if exists "admins manage department results" on public.department_competition_results;
create policy "admins read department results" on public.department_competition_results for select to authenticated using (public.is_admin());
drop policy if exists "admins manage competition disputes" on public.competition_disputes;
create policy "admins read and review disputes" on public.competition_disputes for select to authenticated using (public.is_admin());

-- Tournament publication/status is also controlled by RPCs. Preserve the
-- legacy status enum and old rows while protecting all new published events.
create or replace function public.ci_guard_tournament_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status and current_setting('campusiq.tournament_transition',true) is distinct from 'on' then
    raise exception 'Tournament lifecycle changes must use a validated operation';
  end if;
  if new.tournament_published_at is distinct from old.tournament_published_at and current_setting('campusiq.tournament_transition',true) is distinct from 'on' then
    raise exception 'Tournament publication must use the validated publish operation';
  end if;
  if old.tournament_published_at is not null then
    if new.title is distinct from old.title or new.description is distinct from old.description or new.format is distinct from old.format
      or new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or new.round_count is distinct from old.round_count
      or new.question_count is distinct from old.question_count or new.tie_breaker is distinct from old.tie_breaker or new.scoring_config is distinct from old.scoring_config
      or new.timezone is distinct from old.timezone or new.participant_limit is distinct from old.participant_limit
      or new.registration_starts_at is distinct from old.registration_starts_at or new.registration_ends_at is distinct from old.registration_ends_at
      or new.institution_id is distinct from old.institution_id or new.faculty_id is distinct from old.faculty_id or new.department_id is distinct from old.department_id
      or new.programme_id is distinct from old.programme_id or new.level_id is distinct from old.level_id or new.course_id is distinct from old.course_id or new.topic_id is distinct from old.topic_id
      or new.xp_reward is distinct from old.xp_reward or new.achievement_id is distinct from old.achievement_id or new.match_duration_minutes is distinct from old.match_duration_minutes then
      raise exception 'Published tournament rules are immutable; cancel and replace the tournament to change them';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.publish_tournament(p_tournament_id uuid)
returns public.tournaments language plpgsql security definer set search_path = '' as $$
declare v_t public.tournaments%rowtype; v_round integer; v_q record; v_question_count integer;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin permission required'; end if;
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found or v_t.status<>'draft' then raise exception 'Only tournament drafts can be published'; end if;
  if v_t.starts_at<=now() or v_t.ends_at<=v_t.starts_at then raise exception 'Tournament must have a valid future schedule'; end if;
  if v_t.registration_starts_at is null or v_t.registration_ends_at is null or v_t.registration_starts_at>=v_t.registration_ends_at or v_t.registration_ends_at>v_t.starts_at then raise exception 'Registration window must close before the tournament starts'; end if;
  select count(*) into v_question_count from public.tournament_questions where tournament_id=p_tournament_id;
  if v_question_count=0 or v_question_count<>v_t.question_count then raise exception 'Assigned tournament question count must match questions per match'; end if;
  for v_q in select question_id,points from public.tournament_questions where tournament_id=p_tournament_id for update loop
    update public.tournament_questions set question_snapshot=public.ci_snapshot_competition_question(v_q.question_id,v_q.points),snapshot_version=1 where tournament_id=p_tournament_id and question_id=v_q.question_id;
  end loop;
  if v_t.format in ('single_elimination','knockout','group_stage_knockout') and v_t.round_count<1 then raise exception 'Tournament requires at least one round'; end if;
  for v_round in 1..v_t.round_count loop
    insert into public.tournament_rounds(tournament_id,round_number,title,status) values(p_tournament_id,v_round,'Round '||v_round,'scheduled') on conflict(tournament_id,round_number) do nothing;
  end loop;
  perform set_config('campusiq.tournament_transition','on',true);
  update public.tournaments set status='scheduled',published_at=now(),tournament_published_at=now(),updated_at=now() where id=p_tournament_id returning * into v_t;
  return v_t;
end;
$$;

create or replace function public.transition_tournament_status(p_tournament_id uuid,p_new_status public.tournament_status)
returns public.tournaments language plpgsql security definer set search_path = '' as $$
declare v_t public.tournaments%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin permission required'; end if;
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found then raise exception 'Tournament not found'; end if;
  if p_new_status='live' then
    if v_t.status<>'scheduled' or now()<v_t.starts_at or now()>=v_t.ends_at then raise exception 'Tournament can go live only during its scheduled window'; end if;
    if not exists(select 1 from public.tournament_matches tm join public.tournament_rounds tr on tr.id=tm.tournament_round_id where tr.tournament_id=p_tournament_id) then raise exception 'Generate the tournament match schedule before going live'; end if;
  elsif p_new_status='completed' then
    if v_t.status<>'live' or now()<v_t.ends_at then raise exception 'Tournament can be completed only after its live window'; end if;
  elsif p_new_status='cancelled' then
    if v_t.status in ('completed','archived') then raise exception 'Completed or archived tournaments cannot be cancelled'; end if;
  elsif p_new_status='archived' then
    if v_t.status<>'completed' then raise exception 'Only completed tournaments can be archived'; end if;
  else raise exception 'Unsupported tournament transition'; end if;
  perform set_config('campusiq.tournament_transition','on',true);
  update public.tournaments set status=p_new_status,updated_at=now() where id=p_tournament_id returning * into v_t;
  return v_t;
end;
$$;

create or replace function public.reschedule_tournament_match(p_match_id uuid,p_new_time timestamptz,p_reason text)
returns public.tournament_matches language plpgsql security definer set search_path = '' as $$
declare v_match public.tournament_matches%rowtype; v_round public.tournament_rounds%rowtype; v_t public.tournaments%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin permission required'; end if;
  if p_new_time<=now() or char_length(trim(coalesce(p_reason,'')))<10 then raise exception 'Provide a future time and a reason of at least 10 characters'; end if;
  select * into v_match from public.tournament_matches where id=p_match_id for update;
  if not found or v_match.status<>'scheduled' then raise exception 'Only scheduled matches can be rescheduled'; end if;
  select * into v_round from public.tournament_rounds where id=v_match.tournament_round_id;
  select * into v_t from public.tournaments where id=v_round.tournament_id;
  if p_new_time<v_t.starts_at or p_new_time>=v_t.ends_at then raise exception 'New match time must remain inside the tournament window'; end if;
  insert into public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
    values(auth.uid(),'tournament.match.rescheduled','tournament_match',p_match_id,jsonb_build_object('old_time',v_match.scheduled_at,'new_time',p_new_time,'reason',left(trim(p_reason),2000)));
  update public.tournament_matches set scheduled_at=p_new_time where id=p_match_id returning * into v_match;
  return v_match;
end;
$$;

drop policy if exists "staff updates tournament_participants" on public.tournament_participants;
drop policy if exists "staff writes tournament_results" on public.tournament_results;
drop policy if exists "staff updates tournament_results" on public.tournament_results;

-- Tournament rows can be created only as drafts and deleted only before
-- publication. Match/round writes happen through schedule/result RPCs.
drop policy if exists "staff writes tournaments" on public.tournaments;
drop policy if exists "staff updates tournaments" on public.tournaments;
drop policy if exists "staff deletes tournaments" on public.tournaments;
create policy "admins create tournament drafts" on public.tournaments for insert to authenticated with check(public.is_admin() and status='draft' and tournament_published_at is null);
create policy "admins update tournament drafts" on public.tournaments for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "admins delete tournament drafts" on public.tournaments for delete to authenticated using(public.is_admin() and status='draft' and tournament_published_at is null);
drop policy if exists "staff writes tournament_rounds" on public.tournament_rounds;
drop policy if exists "staff updates tournament_rounds" on public.tournament_rounds;
drop policy if exists "staff deletes tournament_rounds" on public.tournament_rounds;
drop policy if exists "staff writes tournament_matches" on public.tournament_matches;
drop policy if exists "staff deletes tournament_matches" on public.tournament_matches;

revoke all on function public.transition_tournament_status(uuid,public.tournament_status) from public,anon;
revoke all on function public.reschedule_tournament_match(uuid,timestamptz,text) from public,anon;
grant execute on function public.transition_tournament_status(uuid,public.tournament_status) to authenticated;
grant execute on function public.reschedule_tournament_match(uuid,timestamptz,text) to authenticated;

-- Append-only audit coverage for privileged Phase 7 state changes. Question
-- snapshots and answer payloads are deliberately excluded from audit metadata.
create or replace function public.ci_audit_phase7_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_before jsonb; v_after jsonb; v_id uuid; v_action text;
begin
  if tg_op='INSERT' then v_after:=to_jsonb(new); v_id:=(v_after->>'id')::uuid;
  elsif tg_op='UPDATE' then v_before:=to_jsonb(old); v_after:=to_jsonb(new); v_id:=coalesce((v_after->>'id')::uuid,(v_before->>'id')::uuid);
  else v_before:=to_jsonb(old); v_id:=(v_before->>'id')::uuid; end if;
  v_action:='phase7.'||tg_table_name||'.'||lower(tg_op);
  insert into public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
    values(auth.uid(),v_action,tg_table_name,v_id,jsonb_strip_nulls(jsonb_build_object('before',v_before,'after',v_after)));
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
create trigger audit_phase7_competitions after insert or update or delete on public.competitions for each row execute function public.ci_audit_phase7_row();
create trigger audit_phase7_competition_results after insert or update or delete on public.competition_results for each row execute function public.ci_audit_phase7_row();
create trigger audit_phase7_tournaments after insert or update or delete on public.tournaments for each row execute function public.ci_audit_phase7_row();
create trigger audit_phase7_tournament_matches after insert or update or delete on public.tournament_matches for each row execute function public.ci_audit_phase7_row();
create trigger audit_phase7_competition_teams after insert or update or delete on public.competition_teams for each row execute function public.ci_audit_phase7_row();
create trigger audit_phase7_competition_team_members after insert or update or delete on public.competition_team_members for each row execute function public.ci_audit_phase7_row();
create trigger audit_phase7_competition_disputes after insert or update or delete on public.competition_disputes for each row execute function public.ci_audit_phase7_row();
create trigger audit_phase7_competition_corrections after insert or update or delete on public.competition_score_corrections for each row execute function public.ci_audit_phase7_row();
create trigger audit_phase7_weekly_series after insert or update or delete on public.weekly_challenge_series for each row execute function public.ci_audit_phase7_row();
create trigger audit_phase7_weekly_instances after insert or update or delete on public.weekly_challenge_instances for each row execute function public.ci_audit_phase7_row();
