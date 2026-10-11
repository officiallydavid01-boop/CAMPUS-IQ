-- CampusIQ Phase 7 follow-up: trusted, idempotent weekly challenge scheduling.
-- The scheduler runs with the Supabase service-role JWT from a private Edge Function.
-- Never expose SUPABASE_SERVICE_ROLE_KEY in the browser.

-- Permit the trusted service-role caller while preserving the authenticated-admin
-- gate for all ordinary client calls to the existing generator.
create or replace function public.generate_weekly_challenge_instance(
  p_series_id uuid,
  p_scheduled_start timestamptz,
  p_occurrence_key text
)
returns public.weekly_challenge_instances
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_series public.weekly_challenge_series%rowtype;
  v_template public.competitions%rowtype;
  v_comp public.competitions%rowtype;
  v_instance public.weekly_challenge_instances%rowtype;
  v_end timestamptz;
  v_registration_start timestamptz;
  v_registration_end timestamptz;
  v_actor uuid := auth.uid();
  v_is_service_role boolean := coalesce(auth.role(), '') = 'service_role';
begin
  if not v_is_service_role and (v_actor is null or not public.is_admin()) then
    raise exception 'Admin permission required';
  end if;
  if p_scheduled_start <= now() + interval '1 minute'
    or char_length(trim(coalesce(p_occurrence_key, ''))) not between 1 and 80 then
    raise exception 'A future occurrence and valid occurrence key are required';
  end if;

  select * into v_instance
  from public.weekly_challenge_instances
  where series_id = p_series_id and occurrence_key = p_occurrence_key;
  if found then return v_instance; end if;

  select * into v_series
  from public.weekly_challenge_series
  where id = p_series_id and is_active
  for update;
  if not found then raise exception 'Active weekly series not found'; end if;

  select * into v_template
  from public.competitions
  where id = v_series.template_competition_id and published_at is not null;
  if not found then raise exception 'Series template must be a published competition'; end if;

  v_end := p_scheduled_start + make_interval(mins => v_series.duration_minutes);
  v_registration_start := greatest(
    p_scheduled_start - make_interval(mins => v_series.registration_lead_minutes), now()
  );
  v_registration_end := p_scheduled_start - interval '1 minute';
  if v_registration_start >= v_registration_end then
    raise exception 'Registration window is too short for the scheduled occurrence';
  end if;

  insert into public.competitions(
    title, description, course_id, topic_id, difficulty, question_count,
    time_limit_minutes, starts_at, ends_at, participant_limit, xp_reward,
    achievement_id, leaderboard_scope, status, created_by, competition_type,
    participation_mode, registration_starts_at, registration_ends_at, timezone,
    team_scoring_method, team_top_n, scoring_config, dispute_window_hours,
    recurrence_series_id, attempt_policy, tie_breaker, rules_version,
    min_team_size, max_team_size
  ) values (
    v_series.title || ' · ' || p_occurrence_key, v_template.description,
    v_template.course_id, v_template.topic_id, v_template.difficulty,
    v_template.question_count, v_series.duration_minutes, p_scheduled_start,
    v_end, v_template.participant_limit, v_template.xp_reward,
    v_template.achievement_id, v_template.leaderboard_scope, 'draft', v_actor,
    'weekly', 'scheduled_live', v_registration_start, v_registration_end,
    v_series.timezone, v_template.team_scoring_method, v_template.team_top_n,
    v_template.scoring_config, 48, v_series.id, v_template.attempt_policy,
    v_template.tie_breaker, v_template.rules_version, v_template.min_team_size,
    v_template.max_team_size
  ) returning * into v_comp;

  insert into public.competition_questions(
    competition_id, question_id, display_order, points, question_snapshot, snapshot_version
  )
  select v_comp.id, question_id, display_order, points, question_snapshot, snapshot_version
  from public.competition_questions where competition_id = v_template.id;

  insert into public.competition_scopes(competition_id, scope_type, scope_id)
  select v_comp.id, scope_type, scope_id
  from public.competition_scopes where competition_id = v_template.id;

  perform set_config('campusiq.competition_transition', 'on', true);
  update public.competitions
  set status = 'scheduled', published_at = now(), updated_at = now()
  where id = v_comp.id;

  insert into public.weekly_challenge_instances(
    series_id, competition_id, occurrence_key, scheduled_start_at, scheduled_end_at
  ) values (p_series_id, v_comp.id, p_occurrence_key, p_scheduled_start, v_end)
  returning * into v_instance;
  return v_instance;
end;
$$;

revoke all on function public.generate_weekly_challenge_instance(uuid, timestamptz, text) from public, anon;
grant execute on function public.generate_weekly_challenge_instance(uuid, timestamptz, text) to authenticated, service_role;

-- Creates the next two future occurrences for each active series. The occurrence
-- key is the local calendar date, so repeated runs are safe and DST-aware.
create or replace function public.run_weekly_challenge_scheduler()
returns table(series_id uuid, occurrence_key text, competition_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_series public.weekly_challenge_series%rowtype;
  v_local_now timestamp without time zone;
  v_candidate timestamp without time zone;
  v_start timestamptz;
  v_key text;
  v_instance public.weekly_challenge_instances%rowtype;
  v_offset integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted scheduler credentials required';
  end if;
  perform pg_advisory_xact_lock(hashtext('campusiq-weekly-challenge-scheduler'));

  for v_series in
    select * from public.weekly_challenge_series where is_active order by id
  loop
    -- Reject invalid timezone names early with a useful database error.
    v_local_now := now() at time zone v_series.timezone;
    v_candidate := v_local_now::date + v_series.local_start_time
      + ((v_series.weekday - extract(dow from v_local_now)::integer + 7) % 7) * interval '1 day';
    if v_candidate <= v_local_now + interval '1 minute' then
      v_candidate := v_candidate + interval '7 days';
    end if;

    for v_offset in 0..1 loop
      v_start := (v_candidate + (v_offset * interval '7 days')) at time zone v_series.timezone;
      v_key := to_char((v_candidate + (v_offset * interval '7 days'))::date, 'YYYY-MM-DD');
      select * into v_instance from public.weekly_challenge_instances
      where weekly_challenge_instances.series_id = v_series.id
        and weekly_challenge_instances.occurrence_key = v_key;
      if found then
        series_id := v_series.id; occurrence_key := v_key;
        competition_id := v_instance.competition_id; outcome := 'already_exists';
      else
        v_instance := public.generate_weekly_challenge_instance(v_series.id, v_start, v_key);
        series_id := v_series.id; occurrence_key := v_key;
        competition_id := v_instance.competition_id; outcome := 'created';
      end if;
      return next;
    end loop;
  end loop;
  return;
end;
$$;

revoke all on function public.run_weekly_challenge_scheduler() from public, anon, authenticated;
grant execute on function public.run_weekly_challenge_scheduler() to service_role;
