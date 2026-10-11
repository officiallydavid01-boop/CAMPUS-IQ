-- CampusIQ Phase 7: scheduled-live competitions, verified scoring, teams,
-- weekly challenge records, disputes, and tournament format foundations.
-- This migration extends the Phase 1-6 schema; it does not replace it.

-- The locked Phase 7 contract is scheduled-live only and one official scored
-- attempt per participant. The legacy tables remain the canonical records.
alter table public.competitions
  add column if not exists competition_type text not null default 'individual'
    check (competition_type in ('individual','weekly','team','department')),
  add column if not exists participation_mode text not null default 'scheduled_live'
    check (participation_mode = 'scheduled_live'),
  add column if not exists registration_starts_at timestamptz,
  add column if not exists registration_ends_at timestamptz,
  add column if not exists timezone text not null default 'UTC',
  add column if not exists attempt_policy text not null default 'single_scored'
    check (attempt_policy = 'single_scored'),
  add column if not exists team_scoring_method text not null default 'top_n_aggregate'
    check (team_scoring_method in ('top_n_aggregate','sum','average','match_based')),
  add column if not exists team_top_n integer not null default 3 check (team_top_n > 0),
  add column if not exists scoring_config jsonb not null default '{"negative_marking":false,"accuracy_tiebreaker":true,"duration_tiebreaker":true}'::jsonb,
  add column if not exists rules_version integer not null default 1 check (rules_version > 0),
  add column if not exists published_at timestamptz,
  add column if not exists finalized_at timestamptz,
  add column if not exists dispute_window_hours integer not null default 48 check (dispute_window_hours = 48),
  add column if not exists recurrence_series_id uuid,
  add column if not exists tournament_id uuid references public.tournaments(id) on delete set null,
  add column if not exists min_team_size integer not null default 2 check (min_team_size > 0),
  add column if not exists max_team_size integer not null default 5 check (max_team_size >= min_team_size);

alter table public.competition_questions
  add column if not exists points numeric(6,2) not null default 1 check (points > 0),
  add column if not exists question_snapshot jsonb,
  add column if not exists snapshot_version integer not null default 0 check (snapshot_version >= 0);

alter table public.competition_participants
  add column if not exists eligibility_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists registration_status text not null default 'registered'
    check (registration_status in ('registered','withdrawn','disqualified')),
  add column if not exists roster_locked_at timestamptz;

alter table public.competition_answers add column if not exists selected_option_snapshot_id text;

-- A source question cannot be deleted while a published competition references it.
alter table public.competition_questions drop constraint if exists competition_questions_question_id_fkey;
alter table public.competition_questions add constraint competition_questions_question_id_fkey foreign key (question_id) references public.questions(id) on delete restrict;

alter table public.competition_attempts
  add column if not exists max_score numeric(6,2),
  add column if not exists accuracy numeric(6,2),
  add column if not exists submitted_at timestamptz,
  add column if not exists rules_version integer not null default 1;

alter table public.competition_results
  add column if not exists accuracy numeric(6,2),
  add column if not exists completion_duration_ms integer,
  add column if not exists result_version integer not null default 1 check (result_version > 0),
  add column if not exists provisional_published_at timestamptz,
  add column if not exists dispute_until timestamptz,
  add column if not exists finalized_at timestamptz,
  add column if not exists source_attempt_id uuid references public.competition_attempts(id) on delete set null,
  add column if not exists status text not null default 'provisional'
    check (status in ('provisional','under_review','finalized','corrected','disqualified'));

-- Explicit academic scopes keep eligibility dynamic and reference Admin-created
-- records. A scope row of type 'everyone' has a null scope_id.
create table if not exists public.competition_scopes (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  scope_type text not null check (scope_type in ('everyone','institution','faculty','department','programme','level','academic_session','semester','course_offering')),
  scope_id uuid,
  created_at timestamptz not null default now(),
  constraint competition_scopes_value_check check ((scope_type = 'everyone' and scope_id is null) or (scope_type <> 'everyone' and scope_id is not null)),
  unique (competition_id, scope_type, scope_id)
);

-- Weekly series and occurrence records. Each occurrence links to its own
-- competition row and therefore has independent attempts/results/rewards.
create or replace function public.ci_validate_competition_scope()
returns trigger language plpgsql set search_path = '' as $$
declare v_exists boolean:=true;
begin
  if new.scope_type='everyone' then return new; end if;
  if new.scope_type='institution' then select exists(select 1 from public.institutions where id=new.scope_id) into v_exists;
  elsif new.scope_type='faculty' then select exists(select 1 from public.faculties where id=new.scope_id) into v_exists;
  elsif new.scope_type='department' then select exists(select 1 from public.departments where id=new.scope_id) into v_exists;
  elsif new.scope_type='programme' then select exists(select 1 from public.programmes where id=new.scope_id) into v_exists;
  elsif new.scope_type='level' then select exists(select 1 from public.levels where id=new.scope_id) into v_exists;
  elsif new.scope_type='academic_session' then select exists(select 1 from public.academic_sessions where id=new.scope_id) into v_exists;
  elsif new.scope_type='semester' then select exists(select 1 from public.semesters where id=new.scope_id) into v_exists;
  elsif new.scope_type='course_offering' then select exists(select 1 from public.course_offerings where id=new.scope_id and status='published') into v_exists;
  end if;
  if not coalesce(v_exists,false) then raise exception 'Selected academic scope record does not exist or is not published'; end if;
  return new;
end;
$$;
create trigger validate_competition_scope before insert or update on public.competition_scopes for each row execute function public.ci_validate_competition_scope();

create table if not exists public.weekly_challenge_series (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  template_competition_id uuid not null references public.competitions(id) on delete restrict,
  timezone text not null default 'UTC',
  weekday smallint not null check (weekday between 0 and 6),
  local_start_time time not null,
  duration_minutes integer not null check (duration_minutes > 0),
  registration_lead_minutes integer not null default 10080 check (registration_lead_minutes >= 0),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.weekly_challenge_instances (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.weekly_challenge_series(id) on delete restrict,
  competition_id uuid not null unique references public.competitions(id) on delete restrict,
  occurrence_key text not null,
  scheduled_start_at timestamptz not null,
  scheduled_end_at timestamptz not null,
  generated_at timestamptz not null default now(),
  unique (series_id, occurrence_key),
  check (scheduled_end_at > scheduled_start_at)
);

-- Teams are scoped to a single competition. Roster changes are separately
-- recorded so the competition can freeze membership before it starts.
create table if not exists public.competition_teams (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  name text not null,
  normalized_name text generated always as (lower(trim(name))) stored,
  captain_id uuid not null references auth.users(id) on delete restrict,
  department_id uuid references public.departments(id) on delete set null,
  status text not null default 'active' check (status in ('active','withdrawn','disqualified')),
  created_at timestamptz not null default now(),
  roster_locked_at timestamptz,
  unique (competition_id, normalized_name),
  unique (competition_id, id)
);
create table if not exists public.competition_team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.competition_teams(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete restrict,
  role text not null default 'member' check (role in ('captain','member')),
  status text not null default 'invited' check (status in ('invited','active','declined','removed')),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  unique (team_id, student_id)
);
create table if not exists public.competition_team_results (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  team_id uuid not null references public.competition_teams(id) on delete cascade,
  score numeric(8,2) not null default 0,
  contributing_scores jsonb not null default '[]'::jsonb,
  rank integer,
  result_version integer not null default 1,
  status text not null default 'provisional' check (status in ('provisional','under_review','finalized','corrected','disqualified')),
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  unique (competition_id, team_id)
);
create table if not exists public.department_competition_results (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  score numeric(10,2) not null default 0,
  contributing_result_count integer not null default 0 check (contributing_result_count >= 0),
  rank integer,
  result_version integer not null default 1,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  unique (competition_id, department_id)
);

-- Tournament formats are extended without removing legacy enum values.
alter type public.tournament_format add value if not exists 'single_elimination';
alter type public.tournament_format add value if not exists 'round_robin';
alter type public.tournament_format add value if not exists 'group_stage_knockout';
alter table public.tournaments
  add column if not exists timezone text not null default 'UTC',
  add column if not exists participation_mode text not null default 'scheduled_live' check (participation_mode = 'scheduled_live'),
  add column if not exists scoring_config jsonb not null default '{}'::jsonb,
  add column if not exists rules_version integer not null default 1,
  add column if not exists published_at timestamptz;
alter table public.tournament_matches
  add column if not exists team_a_id uuid references public.competition_teams(id) on delete set null,
  add column if not exists team_b_id uuid references public.competition_teams(id) on delete set null,
  add column if not exists winner_team_id uuid references public.competition_teams(id) on delete set null,
  add column if not exists next_match_id uuid references public.tournament_matches(id) on delete set null,
  add column if not exists next_slot text check (next_slot is null or next_slot in ('a','b')),
  add column if not exists result_version integer not null default 1;

create table if not exists public.tournament_match_results (
  id uuid primary key default gen_random_uuid(),
  tournament_match_id uuid not null unique references public.tournament_matches(id) on delete cascade,
  participant_a_score numeric(8,2),
  participant_b_score numeric(8,2),
  team_a_score numeric(8,2),
  team_b_score numeric(8,2),
  outcome text not null check (outcome in ('a_wins','b_wins','draw','forfeit_a','forfeit_b','double_forfeit')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reason text,
  result_version integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.competition_disputes (
  id uuid primary key default gen_random_uuid(),
  competition_result_id uuid not null references public.competition_results(id) on delete restrict,
  competition_id uuid not null references public.competitions(id) on delete restrict,
  student_id uuid not null references auth.users(id) on delete restrict,
  reason text not null check (char_length(trim(reason)) between 10 and 3000),
  evidence_url text,
  status text not null default 'pending' check (status in ('pending','under_review','accepted','partially_accepted','rejected','closed_late')),
  reviewer_id uuid references auth.users(id) on delete set null,
  resolution_note text,
  submitted_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (competition_result_id, student_id)
);
create table if not exists public.competition_score_corrections (
  id uuid primary key default gen_random_uuid(),
  competition_result_id uuid not null references public.competition_results(id) on delete restrict,
  dispute_id uuid references public.competition_disputes(id) on delete set null,
  old_score numeric(8,2) not null,
  new_score numeric(8,2) not null,
  old_accuracy numeric(6,2),
  new_accuracy numeric(6,2),
  reason text not null,
  reviewer_id uuid not null references auth.users(id) on delete restrict,
  result_version integer not null,
  created_at timestamptz not null default now()
);

create index if not exists competition_scopes_competition_idx on public.competition_scopes(competition_id);
create index if not exists competition_teams_competition_idx on public.competition_teams(competition_id, status);
create index if not exists competition_team_members_student_idx on public.competition_team_members(student_id, status);
create index if not exists competition_results_rank_idx on public.competition_results(competition_id, published, score desc, accuracy desc);
create index if not exists competition_disputes_status_idx on public.competition_disputes(status, submitted_at);
create index if not exists tournament_matches_schedule_idx on public.tournament_matches(scheduled_at, status);

-- Snapshot only auto-gradeable question types. Correctness data remains in a
-- staff-only table; students only receive prompts/options through the RPC.
create or replace function public.ci_snapshot_competition_question(p_question_id uuid, p_points numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_question public.questions%rowtype; v_options jsonb;
begin
  select * into v_question from public.questions where id = p_question_id and status = 'published';
  if not found then raise exception 'Every competition question must be published'; end if;
  if v_question.question_type = 'structured' then raise exception 'Structured questions require manual-marking support and cannot be published in an auto-graded competition yet'; end if;
  if v_question.question_type in ('short_answer','numerical') and nullif(trim(coalesce(v_question.correct_answer_text,'')),'') is null then raise exception 'Text/numerical questions require a correct answer before publication'; end if;
  if v_question.question_type='numerical' then begin perform trim(v_question.correct_answer_text)::numeric; exception when others then raise exception 'Numerical question correct answer must be numeric'; end; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', qo.id, 'text', qo.option_text, 'is_correct', qo.is_correct) order by qo.display_order, qo.id), '[]'::jsonb)
    into v_options from public.question_options qo where qo.question_id = v_question.id;
  if v_question.question_type in ('multiple_choice','true_false') and (jsonb_array_length(v_options) = 0 or (select count(*) from public.question_options qo where qo.question_id = v_question.id and qo.is_correct) <> 1) then
    raise exception 'Multiple-choice and true/false questions require exactly one correct option';
  end if;
  return jsonb_build_object('id', v_question.id, 'prompt', v_question.prompt, 'question_type', v_question.question_type,
    'correct_answer_text', v_question.correct_answer_text, 'options', v_options, 'points', p_points, 'explanation', v_question.explanation);
end;
$$;

-- Protect competition configuration once published. Admins must use the
-- controlled publication/cancellation path rather than rewriting live rules.
create or replace function public.ci_guard_competition_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status and current_setting('campusiq.competition_transition', true) is distinct from 'on' then
    raise exception 'Competition lifecycle changes must use a validated operation';
  end if;
  if new.published_at is distinct from old.published_at and current_setting('campusiq.competition_transition', true) is distinct from 'on' then
    raise exception 'Competition publication must use the validated publish operation';
  end if;
  if old.published_at is not null then
    if new.title is distinct from old.title or new.description is distinct from old.description
      or new.course_id is distinct from old.course_id or new.topic_id is distinct from old.topic_id
      or new.question_count is distinct from old.question_count or new.time_limit_minutes is distinct from old.time_limit_minutes
      or new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at
      or new.participant_limit is distinct from old.participant_limit or new.xp_reward is distinct from old.xp_reward
      or new.leaderboard_scope is distinct from old.leaderboard_scope or new.competition_type is distinct from old.competition_type
      or new.participation_mode is distinct from old.participation_mode or new.timezone is distinct from old.timezone
      or new.attempt_policy is distinct from old.attempt_policy or new.team_scoring_method is distinct from old.team_scoring_method
      or new.team_top_n is distinct from old.team_top_n or new.scoring_config is distinct from old.scoring_config
      or new.rules_version is distinct from old.rules_version or new.registration_starts_at is distinct from old.registration_starts_at
      or new.registration_ends_at is distinct from old.registration_ends_at or new.dispute_window_hours is distinct from old.dispute_window_hours
      or new.recurrence_series_id is distinct from old.recurrence_series_id or new.tournament_id is distinct from old.tournament_id
      or new.min_team_size is distinct from old.min_team_size or new.max_team_size is distinct from old.max_team_size
      or new.difficulty is distinct from old.difficulty or new.achievement_id is distinct from old.achievement_id then
      raise exception 'Published competition rules are immutable; cancel and replace the competition to change them';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_competition_update on public.competitions;
create trigger guard_competition_update before update on public.competitions for each row execute function public.ci_guard_competition_update();


create or replace function public.ci_guard_published_competition_children()
returns trigger language plpgsql set search_path = '' as $$
declare v_competition_id uuid; v_published_at timestamptz;
begin
  v_competition_id := case when tg_op = 'DELETE' then old.competition_id else new.competition_id end;
  select published_at into v_published_at from public.competitions where id=v_competition_id;
  if v_published_at is not null then
    raise exception 'Published competition rules and question assignments are immutable';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
drop trigger if exists guard_published_competition_questions on public.competition_questions;
create trigger guard_published_competition_questions before insert or update or delete on public.competition_questions
  for each row execute function public.ci_guard_published_competition_children();
drop trigger if exists guard_published_competition_rules on public.competition_rules;
create trigger guard_published_competition_rules before insert or update or delete on public.competition_rules
  for each row execute function public.ci_guard_published_competition_children();

-- Staff publication freezes questions and rules. Competition rows are drafts
-- until this operation succeeds.
create or replace function public.publish_competition(p_competition_id uuid)
returns public.competitions language plpgsql security definer set search_path = '' as $$
declare v_comp public.competitions%rowtype; v_question record; v_count integer;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin permission required'; end if;
  select * into v_comp from public.competitions where id = p_competition_id for update;
  if not found then raise exception 'Competition not found'; end if;
  if v_comp.status <> 'draft' then raise exception 'Only draft competitions can be published'; end if;
  if v_comp.starts_at <= now() or v_comp.ends_at <= v_comp.starts_at then raise exception 'Choose a future live window'; end if;
  if v_comp.registration_starts_at is null or v_comp.registration_ends_at is null
    or v_comp.registration_starts_at >= v_comp.registration_ends_at
    or v_comp.registration_ends_at > v_comp.starts_at then raise exception 'Registration must have a valid window that closes no later than the competition start'; end if;
  select count(*) into v_count from public.competition_questions where competition_id = p_competition_id;
  if not exists(select 1 from public.competition_scopes where competition_id=p_competition_id) then raise exception 'Configure at least one eligibility scope before publication'; end if;
  if v_count = 0 or v_count <> v_comp.question_count then raise exception 'Assigned question count must match the configured question count'; end if;
  if coalesce((v_comp.scoring_config->>'negative_marking')::boolean,false) and coalesce((v_comp.scoring_config->>'negative_mark_value')::numeric,0)<=0 then raise exception 'Negative marking requires a positive negative_mark_value'; end if;
  for v_question in select question_id, points from public.competition_questions where competition_id = p_competition_id for update loop
    update public.competition_questions set question_snapshot = public.ci_snapshot_competition_question(v_question.question_id, v_question.points), snapshot_version = v_comp.rules_version
      where competition_id = p_competition_id and question_id = v_question.question_id;
  end loop;
  perform set_config('campusiq.competition_transition','on',true);
  update public.competitions set status = 'scheduled', published_at = now(), updated_at = now() where id = p_competition_id returning * into v_comp;
  return v_comp;
end;
$$;

create or replace function public.register_for_competition(p_competition_id uuid)
returns public.competition_participants language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_comp public.competitions%rowtype; v_profile public.profiles%rowtype; v_participant public.competition_participants%rowtype; v_snapshot jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not public.has_role('student') then raise exception 'Student role required'; end if;
  select * into v_comp from public.competitions where id = p_competition_id for update;
  if not found or v_comp.status <> 'scheduled' or v_comp.published_at is null then raise exception 'Competition is not open for registration'; end if;
  if now() < v_comp.registration_starts_at or now() >= v_comp.registration_ends_at then raise exception 'Registration is closed'; end if;
  if v_comp.participant_limit is not null and (select count(*) from public.competition_participants cp where cp.competition_id = p_competition_id and cp.registration_status = 'registered') >= v_comp.participant_limit then raise exception 'Competition is full'; end if;
  select * into v_profile from public.profiles where id = v_uid;
  if not found or v_profile.account_status <> 'active' then raise exception 'Active student profile required'; end if;
  if exists (select 1 from public.competition_scopes s where s.competition_id = p_competition_id)
    and not exists (
      select 1 from public.competition_scopes s where s.competition_id = p_competition_id and (
        s.scope_type = 'everyone' or (s.scope_type = 'institution' and s.scope_id = v_profile.institution_id)
        or (s.scope_type = 'faculty' and s.scope_id = v_profile.faculty_id)
        or (s.scope_type = 'department' and s.scope_id = v_profile.department_id)
        or (s.scope_type = 'programme' and s.scope_id = v_profile.programme_id)
        or (s.scope_type = 'level' and s.scope_id = v_profile.level_id)
        or (s.scope_type = 'academic_session' and s.scope_id = v_profile.current_session_id)
        or (s.scope_type = 'semester' and s.scope_id = v_profile.current_semester_id)
        or (s.scope_type = 'course_offering' and exists (select 1 from public.course_enrollments ce where ce.student_id = v_uid and ce.course_offering_id = s.scope_id and ce.status = 'active'))
      )
    ) then raise exception 'Your current academic context is not eligible for this competition'; end if;
  v_snapshot := jsonb_build_object('institution_id',v_profile.institution_id,'faculty_id',v_profile.faculty_id,
    'department_id',v_profile.department_id,'programme_id',v_profile.programme_id,'level_id',v_profile.level_id,
    'session_id',v_profile.current_session_id,'semester_id',v_profile.current_semester_id,'eligible_scopes',(select coalesce(jsonb_agg(jsonb_build_object('scope_type',s.scope_type,'scope_id',s.scope_id)),'[]'::jsonb) from public.competition_scopes s where s.competition_id=p_competition_id),'captured_at',now());
  insert into public.competition_participants(competition_id,student_id,eligibility_snapshot,registration_status)
    values (p_competition_id,v_uid,v_snapshot,'registered') on conflict (competition_id,student_id) do update
      set eligibility_snapshot = case when public.competition_participants.registration_status = 'withdrawn' then excluded.eligibility_snapshot else public.competition_participants.eligibility_snapshot end,
          registration_status = case when public.competition_participants.registration_status = 'withdrawn' then 'registered' else public.competition_participants.registration_status end
    returning * into v_participant;
  if v_participant.registration_status <> 'registered' then raise exception 'Existing registration cannot be reused'; end if;
  return v_participant;
end;
$$;

create or replace function public.start_competition_attempt(p_competition_id uuid)
returns public.competition_attempts language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_comp public.competitions%rowtype; v_attempt public.competition_attempts%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_comp from public.competitions where id = p_competition_id for update;
  if not found or v_comp.published_at is null or v_comp.status not in ('scheduled','live') then raise exception 'Competition not found, unpublished, or unavailable'; end if;
  if now() < v_comp.starts_at or now() >= v_comp.ends_at then raise exception 'The scheduled live window is not active'; end if;
  if not exists (select 1 from public.competition_participants cp where cp.competition_id = p_competition_id and cp.student_id = v_uid and cp.registration_status = 'registered') then raise exception 'Register before starting'; end if;
  select * into v_attempt from public.competition_attempts ca where ca.competition_id = p_competition_id and ca.student_id = v_uid for update;
  if found then
    if v_attempt.status in ('in_progress','submitted','graded') then return v_attempt; end if;
    raise exception 'The official attempt has already been used';
  end if;
  perform set_config('campusiq.competition_transition','on',true);
  update public.competitions set status = 'live', updated_at = now() where id = p_competition_id and status = 'scheduled';
  if v_comp.competition_type='team' then
    perform set_config('campusiq.team_lock','on',true);
    update public.competition_teams set roster_locked_at=coalesce(roster_locked_at,now()) where competition_id=p_competition_id and status='active';
    update public.competition_team_members tm set status='removed' from public.competition_teams t where tm.team_id=t.id and t.competition_id=p_competition_id and tm.status='invited';
  end if;
  insert into public.competition_attempts(competition_id,student_id,status,started_at,rules_version)
    values (p_competition_id,v_uid,'in_progress',now(),v_comp.rules_version) returning * into v_attempt;
  return v_attempt;
end;
$$;

create or replace function public.get_competition_attempt_questions(p_attempt_id uuid)
returns table(question_id uuid, display_order integer, prompt text, question_type public.question_type, points numeric, options jsonb)
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_attempt public.competition_attempts%rowtype; v_comp public.competitions%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_attempt from public.competition_attempts where id = p_attempt_id and student_id = v_uid;
  if not found then raise exception 'Attempt not found'; end if;
  if v_attempt.status <> 'in_progress' then raise exception 'Attempt is no longer active'; end if;
  select * into v_comp from public.competitions where id = v_attempt.competition_id;
  if v_comp.status not in ('scheduled','live') then raise exception 'Competition is no longer live'; end if;
  if now() >= least(v_comp.ends_at, v_attempt.started_at + make_interval(mins => v_comp.time_limit_minutes)) then raise exception 'Attempt deadline has passed'; end if;
  return query select cq.question_id, cq.display_order, cq.question_snapshot->>'prompt', (cq.question_snapshot->>'question_type')::public.question_type,
    (cq.question_snapshot->>'points')::numeric,
    coalesce((select jsonb_agg(jsonb_build_object('id',e.opt->>'id','text',e.opt->>'text') order by e.ordinality) from jsonb_array_elements(cq.question_snapshot->'options') with ordinality as e(opt,ordinality)),'[]'::jsonb)
    from public.competition_questions cq where cq.competition_id = v_attempt.competition_id and cq.question_snapshot is not null order by cq.display_order, cq.question_id;
end;
$$;

create or replace function public.save_competition_answer(p_attempt_id uuid,p_question_id uuid,p_selected_option_id uuid default null,p_answer_text text default null)
returns public.competition_answers language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_attempt public.competition_attempts%rowtype; v_comp public.competitions%rowtype; v_question public.competition_questions%rowtype; v_answer public.competition_answers%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_attempt from public.competition_attempts where id = p_attempt_id and student_id = v_uid for update;
  if not found or v_attempt.status <> 'in_progress' then raise exception 'Active attempt not found'; end if;
  select * into v_comp from public.competitions where id = v_attempt.competition_id;
  if v_comp.status not in ('scheduled','live') then raise exception 'Competition is no longer live'; end if;
  if now() >= least(v_comp.ends_at, v_attempt.started_at + make_interval(mins => v_comp.time_limit_minutes)) then raise exception 'Attempt deadline has passed'; end if;
  select * into v_question from public.competition_questions where competition_id = v_attempt.competition_id and question_id = p_question_id and question_snapshot is not null;
  if not found then raise exception 'Question is not part of this published competition'; end if;
  if v_question.question_snapshot->>'question_type' in ('multiple_choice','true_false') then
    if p_selected_option_id is null or not exists (select 1 from jsonb_array_elements(v_question.question_snapshot->'options') opt where opt->>'id' = p_selected_option_id::text) then raise exception 'Choose a valid option for this question'; end if;
  elsif p_selected_option_id is not null then raise exception 'This question expects a text answer'; end if;
  insert into public.competition_answers(competition_attempt_id,question_id,selected_option_id,selected_option_snapshot_id,answer_text,is_correct,answered_at)
    values (p_attempt_id,p_question_id,p_selected_option_id,p_selected_option_id::text,left(p_answer_text,4000),null,now())
    on conflict (competition_attempt_id,question_id) do update set selected_option_id=excluded.selected_option_id, selected_option_snapshot_id=excluded.selected_option_snapshot_id, answer_text=excluded.answer_text, is_correct=null, answered_at=now()
    returning * into v_answer;
  return v_answer;
end;
$$;

create or replace function public.submit_competition_attempt(p_attempt_id uuid)
returns public.competition_attempts language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_attempt public.competition_attempts%rowtype; v_comp public.competitions%rowtype; v_q record; v_answer public.competition_answers%rowtype; v_score numeric(8,2):=0; v_max numeric(8,2):=0; v_correct integer:=0; v_total integer:=0; v_is_correct boolean; v_accuracy numeric(6,2); v_duration integer;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_attempt from public.competition_attempts where id = p_attempt_id and student_id = v_uid for update;
  if not found then raise exception 'Attempt not found'; end if;
  if v_attempt.status = 'graded' then return v_attempt; end if;
  if v_attempt.status <> 'in_progress' then raise exception 'Attempt cannot be submitted'; end if;
  if exists(select 1 from public.competition_results cr where cr.competition_id=v_attempt.competition_id and cr.student_id=v_uid and cr.published=true) then raise exception 'Results are already published; this attempt can no longer change the official result'; end if;
  if not exists(select 1 from public.competitions c where c.id=v_attempt.competition_id and c.status in ('scheduled','live')) then raise exception 'Competition is no longer live'; end if;
  select * into v_comp from public.competitions where id = v_attempt.competition_id;
  -- Submission is allowed at/after the deadline so the server can finalize
  -- the saved answers; save_competition_answer rejects any late answer writes.
  for v_q in select question_id, question_snapshot from public.competition_questions where competition_id = v_attempt.competition_id and question_snapshot is not null order by display_order, question_id loop
    v_total := v_total + 1; v_max := v_max + coalesce((v_q.question_snapshot->>'points')::numeric,1);
    select * into v_answer from public.competition_answers where competition_attempt_id = p_attempt_id and question_id = v_q.question_id;
    v_is_correct := false;
    if found then
      if v_q.question_snapshot->>'question_type' in ('multiple_choice','true_false') then
        select coalesce((opt->>'is_correct')::boolean,false) into v_is_correct from jsonb_array_elements(v_q.question_snapshot->'options') opt where opt->>'id' = coalesce(v_answer.selected_option_snapshot_id,v_answer.selected_option_id::text) limit 1;
        v_is_correct := coalesce(v_is_correct,false);
      elsif v_q.question_snapshot->>'question_type'='numerical' then
        begin v_is_correct := trim(coalesce(v_answer.answer_text,''))::numeric = trim(coalesce(v_q.question_snapshot->>'correct_answer_text',''))::numeric; exception when others then v_is_correct:=false; end;
      else
        v_is_correct := nullif(regexp_replace(lower(trim(coalesce(v_answer.answer_text,''))), '\s+', ' ', 'g'),'') is not null
          and regexp_replace(lower(trim(coalesce(v_answer.answer_text,''))), '\s+', ' ', 'g') = regexp_replace(lower(trim(coalesce(v_q.question_snapshot->>'correct_answer_text',''))), '\s+', ' ', 'g');
      end if;
      update public.competition_answers set is_correct = v_is_correct where id = v_answer.id;
    end if;
    if coalesce(v_is_correct,false) then v_correct := v_correct + 1; v_score := v_score + coalesce((v_q.question_snapshot->>'points')::numeric,1);
    elsif found and coalesce((v_comp.scoring_config->>'negative_marking')::boolean,false) then v_score := v_score - coalesce((v_comp.scoring_config->>'negative_mark_value')::numeric,0); end if;
  end loop;
  v_score:=greatest(0,v_score);
  v_accuracy := case when v_total > 0 then round((v_correct::numeric / v_total::numeric) * 100,2) else 0 end;
  v_duration := greatest(0,least(2147483647,(extract(epoch from (least(now(),v_comp.ends_at) - v_attempt.started_at))*1000)::bigint))::integer;
  update public.competition_attempts set status='graded',submitted_at=now(),score=v_score,max_score=v_max,accuracy=v_accuracy,response_time_ms=v_duration where id=p_attempt_id returning * into v_attempt;
  insert into public.competition_results(competition_id,student_id,score,accuracy,completion_duration_ms,source_attempt_id,result_version,status,published)
    values (v_attempt.competition_id,v_uid,v_score,v_accuracy,v_duration,p_attempt_id,1,'provisional',false)
    on conflict (competition_id,student_id) do nothing;
  return v_attempt;
end;
$$;

create or replace function public.get_competition_attempt_answers(p_attempt_id uuid)
returns table(question_id uuid, selected_option_id text, answer_text text)
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null or not exists(select 1 from public.competition_attempts where id=p_attempt_id and student_id=v_uid and status='in_progress') then raise exception 'Active attempt not found'; end if;
  return query select ca.question_id,coalesce(ca.selected_option_snapshot_id,ca.selected_option_id::text),ca.answer_text from public.competition_answers ca where ca.competition_attempt_id=p_attempt_id;
end;
$$;

create or replace function public.get_competition_leaderboard(p_competition_id uuid)
returns table(rank bigint, display_name text, score numeric, accuracy numeric, completion_duration_ms integer, status text)
language sql stable security definer set search_path = '' as $$
  select dense_rank() over (order by cr.score desc, cr.accuracy desc nulls last, cr.completion_duration_ms asc nulls last, ca.submitted_at asc nulls last) as rank,
    coalesce(nullif(trim(p.full_name),''),'CampusIQ student') as display_name, cr.score, cr.accuracy, cr.completion_duration_ms, cr.status
  from public.competition_results cr join public.competitions c on c.id=cr.competition_id
  left join public.profiles p on p.id=cr.student_id left join public.competition_attempts ca on ca.id=cr.source_attempt_id
  where cr.competition_id=p_competition_id and cr.published=true and c.published_at is not null
  order by cr.score desc, cr.accuracy desc nulls last, cr.completion_duration_ms asc nulls last, ca.submitted_at asc nulls last
  limit 500;
$$;

create or replace function public.publish_competition_results(p_competition_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin permission required'; end if;
  perform set_config('campusiq.competition_transition','on',true);
  update public.competitions set status='completed', updated_at=now() where id=p_competition_id and status in ('scheduled','live') and ends_at <= now();
  if not found and not exists(select 1 from public.competitions where id=p_competition_id and status='completed' and ends_at <= now()) then raise exception 'Competition must have ended before provisional results can be published'; end if;
  with ranked as (
    select cr.id, dense_rank() over(order by cr.score desc, cr.accuracy desc nulls last, cr.completion_duration_ms asc nulls last, ca.submitted_at asc nulls last) as rank_no
    from public.competition_results cr left join public.competition_attempts ca on ca.id=cr.source_attempt_id
    where cr.competition_id=p_competition_id and cr.status in ('provisional','under_review','corrected')
  ) update public.competition_results cr set rank=ranked.rank_no, published=true,
    provisional_published_at=coalesce(cr.provisional_published_at,now()), dispute_until=coalesce(cr.dispute_until,now()+interval '48 hours'), status=case when cr.status='provisional' then 'provisional' else cr.status end
    from ranked where cr.id=ranked.id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.submit_competition_dispute(p_competition_result_id uuid,p_reason text,p_evidence_url text default null)
returns public.competition_disputes language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_result public.competition_results%rowtype; v_dispute public.competition_disputes%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if char_length(trim(coalesce(p_reason,''))) < 10 or char_length(trim(p_reason)) > 3000 then raise exception 'Provide a reason between 10 and 3000 characters'; end if;
  select * into v_result from public.competition_results where id=p_competition_result_id and student_id=v_uid and published=true;
  if not found then raise exception 'Published result not found'; end if;
  if v_result.status='finalized' or v_result.dispute_until is null or now() > v_result.dispute_until then raise exception 'The dispute window has closed'; end if;
  insert into public.competition_disputes(competition_result_id,competition_id,student_id,reason,evidence_url)
    values(v_result.id,v_result.competition_id,v_uid,trim(p_reason),nullif(trim(p_evidence_url),'')) returning * into v_dispute;
  update public.competition_results set status='under_review' where id=v_result.id;
  return v_dispute;
end;
$$;

create or replace function public.resolve_competition_dispute(p_dispute_id uuid,p_decision text,p_resolution_note text,p_new_score numeric default null,p_new_accuracy numeric default null)
returns public.competition_disputes language plpgsql security definer set search_path = '' as $$
declare v_dispute public.competition_disputes%rowtype; v_result public.competition_results%rowtype; v_old_score numeric(8,2); v_old_accuracy numeric(6,2); v_version integer;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin permission required'; end if;
  if p_decision not in ('accepted','partially_accepted','rejected') then raise exception 'Invalid dispute decision'; end if;
  select * into v_dispute from public.competition_disputes where id=p_dispute_id for update;
  if not found or v_dispute.status not in ('pending','under_review') then raise exception 'Dispute is not open'; end if;
  select * into v_result from public.competition_results where id=v_dispute.competition_result_id for update;
  if v_result.status='finalized' then raise exception 'Finalized result requires a separate audited post-finalization correction process'; end if;
  if p_decision in ('accepted','partially_accepted') then
    if p_new_score is null or p_new_score < 0 or p_new_accuracy is not null and (p_new_accuracy < 0 or p_new_accuracy > 100) or (v_result.source_attempt_id is not null and p_new_score > (select coalesce(max_score,0) from public.competition_attempts where id=v_result.source_attempt_id)) then raise exception 'Corrected score or accuracy is outside the allowed range'; end if;
    v_old_score:=v_result.score; v_old_accuracy:=v_result.accuracy; v_version:=v_result.result_version+1;
    insert into public.competition_score_corrections(competition_result_id,dispute_id,old_score,new_score,old_accuracy,new_accuracy,reason,reviewer_id,result_version)
      values(v_result.id,v_dispute.id,v_old_score,p_new_score,v_old_accuracy,p_new_accuracy,trim(coalesce(p_resolution_note,'Approved score correction')),auth.uid(),v_version);
    update public.competition_results set score=p_new_score,accuracy=p_new_accuracy,result_version=v_version,status='corrected',rank=null where id=v_result.id;
  else
    update public.competition_results set status='provisional' where id=v_result.id;
  end if;
  update public.competition_disputes set status=p_decision,reviewer_id=auth.uid(),resolution_note=left(trim(coalesce(p_resolution_note,'')),3000),resolved_at=now() where id=p_dispute_id returning * into v_dispute;
  -- Rerank every currently published result in the competition after a correction.
  with ranked as (select cr.id,dense_rank() over(order by cr.score desc,cr.accuracy desc nulls last,cr.completion_duration_ms asc nulls last,ca.submitted_at asc nulls last) as rank_no from public.competition_results cr left join public.competition_attempts ca on ca.id=cr.source_attempt_id where cr.competition_id=v_result.competition_id and cr.published=true)
    update public.competition_results cr set rank=r.rank_no from ranked r where cr.id=r.id;
  return v_dispute;
end;
$$;

create or replace function public.finalize_competition_results(p_competition_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_comp public.competitions%rowtype; v_result public.competition_results%rowtype; v_count integer:=0;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin permission required'; end if;
  select * into v_comp from public.competitions where id=p_competition_id for update;
  if not found or v_comp.status <> 'completed' then raise exception 'Competition must be completed first'; end if;
  if exists(select 1 from public.competition_results where competition_id=p_competition_id and published=true and dispute_until > now()) then raise exception 'The 48-hour dispute window is still open'; end if;
  if exists(select 1 from public.competition_disputes where competition_id=p_competition_id and status in ('pending','under_review')) then raise exception 'Resolve all open disputes before finalizing'; end if;
  for v_result in select * from public.competition_results where competition_id=p_competition_id and published=true and status <> 'finalized' for update loop
    update public.competition_results set status='finalized',finalized_at=now() where id=v_result.id;
    if v_comp.xp_reward > 0 then
      perform public.ci_award_xp(v_result.student_id,v_comp.xp_reward,'competition',v_result.id,'Finalized competition reward: '||v_comp.title);
      update public.competition_results set xp_awarded=v_comp.xp_reward where id=v_result.id;
    end if;
    if v_comp.achievement_id is not null then perform public.ci_unlock_achievement(v_result.student_id,(select code from public.achievements where id=v_comp.achievement_id)); end if;
    v_count:=v_count+1;
  end loop;
  update public.competitions set finalized_at=now() where id=p_competition_id;
  return v_count;
end;
$$;

-- Secure RPC-only student mutations. Admins still manage drafts through RLS;
-- all lifecycle-sensitive student writes go through validated functions.
drop policy if exists "student registers for competition" on public.competition_participants;
drop policy if exists "student starts competition_attempt" on public.competition_attempts;
drop policy if exists "student submits competition_attempt" on public.competition_attempts;
drop policy if exists "student answers own competition" on public.competition_answers;
drop policy if exists "staff updates competition_results" on public.competition_results;
create policy "admins update competition_results" on public.competition_results for update using (public.is_admin()) with check (public.is_admin());

-- Scope and team records are not directly writable by students. Registration,
-- roster locking, score calculation and corrections must use validated RPCs.
alter table public.competition_scopes enable row level security;
alter table public.weekly_challenge_series enable row level security;
alter table public.weekly_challenge_instances enable row level security;
alter table public.competition_teams enable row level security;
alter table public.competition_team_members enable row level security;
alter table public.competition_team_results enable row level security;
alter table public.department_competition_results enable row level security;
alter table public.tournament_match_results enable row level security;
alter table public.competition_disputes enable row level security;
alter table public.competition_score_corrections enable row level security;

create policy "read competition scopes for visible competitions" on public.competition_scopes for select to authenticated using (exists(select 1 from public.competitions c where c.id=competition_id and (c.status <> 'draft' or public.is_staff())));
create policy "admins manage competition scopes" on public.competition_scopes for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "staff manage weekly challenge series" on public.weekly_challenge_series for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read weekly challenge instances" on public.weekly_challenge_instances for select to authenticated using (exists(select 1 from public.competitions c where c.id=competition_id and c.status <> 'draft'));
create policy "staff manage weekly challenge instances" on public.weekly_challenge_instances for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read teams for visible competitions" on public.competition_teams for select to authenticated using (exists(select 1 from public.competition_participants cp where cp.competition_id=competition_teams.competition_id and cp.student_id=auth.uid()) or public.is_staff());
create policy "read team memberships" on public.competition_team_members for select to authenticated using (student_id=auth.uid() or exists(select 1 from public.competition_teams t join public.competition_participants cp on cp.competition_id=t.competition_id where t.id=team_id and cp.student_id=auth.uid()) or public.is_staff());
create policy "admins manage teams" on public.competition_teams for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage team memberships" on public.competition_team_members for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read published team results" on public.competition_team_results for select to authenticated using (status='finalized' or public.is_staff());
create policy "admins manage team results" on public.competition_team_results for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read finalized department results" on public.department_competition_results for select to authenticated using (finalized_at is not null or public.is_staff());
create policy "admins manage department results" on public.department_competition_results for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read match results for visible tournaments" on public.tournament_match_results for select to authenticated using (exists(select 1 from public.tournament_matches tm join public.tournament_rounds tr on tr.id=tm.tournament_round_id join public.tournaments t on t.id=tr.tournament_id where tm.id=tournament_match_id and t.status <> 'draft'));
create policy "admins manage match results" on public.tournament_match_results for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read own competition disputes" on public.competition_disputes for select to authenticated using (student_id=auth.uid() or public.is_admin());
create policy "admins manage competition disputes" on public.competition_disputes for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins read score corrections" on public.competition_score_corrections for select to authenticated using (public.is_admin());

-- Restrict RPC execution explicitly. Functions validate auth and ownership;
-- the empty search_path prevents object-shadowing attacks.
revoke all on function public.ci_snapshot_competition_question(uuid,numeric) from public, anon, authenticated;
revoke all on function public.publish_competition(uuid) from public, anon;
revoke all on function public.register_for_competition(uuid) from public, anon;
revoke all on function public.start_competition_attempt(uuid) from public, anon;
revoke all on function public.get_competition_attempt_questions(uuid) from public, anon;
revoke all on function public.get_competition_attempt_answers(uuid) from public, anon;
revoke all on function public.save_competition_answer(uuid,uuid,uuid,text) from public, anon;
revoke all on function public.submit_competition_attempt(uuid) from public, anon;
revoke all on function public.get_competition_leaderboard(uuid) from public, anon;
revoke all on function public.publish_competition_results(uuid) from public, anon;
revoke all on function public.submit_competition_dispute(uuid,text,text) from public, anon;
revoke all on function public.resolve_competition_dispute(uuid,text,text,numeric,numeric) from public, anon;
revoke all on function public.finalize_competition_results(uuid) from public, anon;
grant execute on function public.publish_competition(uuid) to authenticated;
grant execute on function public.register_for_competition(uuid) to authenticated;
grant execute on function public.start_competition_attempt(uuid) to authenticated;
grant execute on function public.get_competition_attempt_questions(uuid) to authenticated;
grant execute on function public.get_competition_attempt_answers(uuid) to authenticated;
grant execute on function public.save_competition_answer(uuid,uuid,uuid,text) to authenticated;
grant execute on function public.submit_competition_attempt(uuid) to authenticated;
grant execute on function public.get_competition_leaderboard(uuid) to authenticated;
grant execute on function public.publish_competition_results(uuid) to authenticated;
grant execute on function public.submit_competition_dispute(uuid,text,text) to authenticated;
grant execute on function public.resolve_competition_dispute(uuid,text,text,numeric,numeric) to authenticated;
grant execute on function public.finalize_competition_results(uuid) to authenticated;

