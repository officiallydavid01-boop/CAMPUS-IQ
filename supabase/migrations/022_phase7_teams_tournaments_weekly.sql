-- CampusIQ Phase 7: team lifecycle, weekly occurrence generation and tournament operations.
alter table public.tournaments add column if not exists tournament_published_at timestamptz;
alter table public.competitions add column if not exists min_team_size integer not null default 2 check (min_team_size > 0);
alter table public.competitions add column if not exists max_team_size integer not null default 5 check (max_team_size >= min_team_size);
alter table public.tournaments add column if not exists registration_starts_at timestamptz;
alter table public.tournaments add column if not exists registration_ends_at timestamptz;
alter table public.tournament_participants add column if not exists group_key text;
alter table public.tournament_participants add column if not exists registration_status text not null default 'registered' check (registration_status in ('registered','withdrawn','disqualified'));
alter table public.tournament_participants add column if not exists eligibility_snapshot jsonb not null default '{}'::jsonb;

alter table public.tournament_match_questions add column if not exists points numeric(6,2) not null default 1 check (points > 0);
alter table public.tournament_match_questions add column if not exists question_snapshot jsonb;
alter table public.tournament_match_questions add column if not exists snapshot_version integer not null default 0;
alter table public.tournament_match_questions drop constraint if exists tournament_match_questions_question_id_fkey;
alter table public.tournament_match_questions add constraint tournament_match_questions_question_id_fkey foreign key (question_id) references public.questions(id) on delete restrict;
create table if not exists public.tournament_questions (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete restrict,
  display_order integer not null default 0,
  points numeric(6,2) not null default 1 check (points > 0),
  question_snapshot jsonb,
  snapshot_version integer not null default 0,
  primary key(tournament_id,question_id)
);
alter table public.tournament_questions enable row level security;
create policy "staff manage tournament question sets" on public.tournament_questions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create or replace function public.ci_guard_published_tournament_questions()
returns trigger language plpgsql set search_path = '' as $$
declare v_id uuid; v_published timestamptz;
begin
  v_id:=case when tg_op='DELETE' then old.tournament_id else new.tournament_id end;
  select tournament_published_at into v_published from public.tournaments where id=v_id;
  if v_published is not null then raise exception 'Published tournament questions are immutable'; end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
create trigger guard_published_tournament_questions before insert or update or delete on public.tournament_questions for each row execute function public.ci_guard_published_tournament_questions();

create or replace function public.create_competition_team(p_competition_id uuid,p_name text,p_department_id uuid default null)
returns public.competition_teams language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_comp public.competitions%rowtype; v_profile public.profiles%rowtype; v_team public.competition_teams%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if char_length(trim(coalesce(p_name,''))) not between 2 and 48 then raise exception 'Team name must be between 2 and 48 characters'; end if;
  select * into v_comp from public.competitions where id=p_competition_id for update;
  if not found or v_comp.competition_type <> 'team' or v_comp.status <> 'scheduled' or now() >= v_comp.starts_at then raise exception 'Team creation is not available for this competition'; end if;
  if not exists(select 1 from public.competition_participants cp where cp.competition_id=p_competition_id and cp.student_id=v_uid and cp.registration_status='registered') then raise exception 'Register for the competition before creating a team'; end if;
  if exists(select 1 from public.competition_team_members tm join public.competition_teams t on t.id=tm.team_id where t.competition_id=p_competition_id and tm.student_id=v_uid and tm.status='active') then raise exception 'You are already an active member of a team in this competition'; end if;
  select * into v_profile from public.profiles where id=v_uid;
  if p_department_id is not null and p_department_id is distinct from v_profile.department_id then raise exception 'A team captain can only use their verified department'; end if;
  insert into public.competition_teams(competition_id,name,captain_id,department_id) values(p_competition_id,trim(p_name),v_uid,coalesce(p_department_id,v_profile.department_id)) returning * into v_team;
  insert into public.competition_team_members(team_id,student_id,role,status,joined_at) values(v_team.id,v_uid,'captain','active',now());
  return v_team;
end;
$$;

create or replace function public.invite_competition_team_member(p_team_id uuid,p_student_id uuid)
returns public.competition_team_members language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_team public.competition_teams%rowtype; v_comp public.competitions%rowtype; v_profile public.profiles%rowtype; v_member public.competition_team_members%rowtype; v_size integer;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_team from public.competition_teams where id=p_team_id for update;
  if not found or v_team.captain_id<>v_uid then raise exception 'Only the team captain can invite members'; end if;
  select * into v_comp from public.competitions where id=v_team.competition_id;
  if v_comp.status<>'scheduled' or now()>=v_comp.starts_at or v_team.roster_locked_at is not null then raise exception 'Team roster is locked'; end if;
  if not exists(select 1 from public.competition_participants cp where cp.competition_id=v_comp.id and cp.student_id=p_student_id and cp.registration_status='registered') then raise exception 'Invitee must register for this competition first'; end if;
  select * into v_profile from public.profiles where id=p_student_id and account_status='active';
  if not found then raise exception 'Active student profile required'; end if;
  if v_team.department_id is not null and v_profile.department_id is distinct from v_team.department_id then raise exception 'Invitee must belong to the team department'; end if;
  if exists(select 1 from public.competition_team_members tm join public.competition_teams t on t.id=tm.team_id where t.competition_id=v_comp.id and tm.student_id=p_student_id and tm.status='active') then raise exception 'Student is already on another team in this competition'; end if;
  select count(*) into v_size from public.competition_team_members where team_id=p_team_id and status in ('active','invited');
  if v_size>=v_comp.max_team_size then raise exception 'Team has reached its maximum roster size'; end if;
  insert into public.competition_team_members(team_id,student_id,role,status) values(p_team_id,p_student_id,'member','invited')
    on conflict(team_id,student_id) do update set status='invited' where public.competition_team_members.status in ('declined','removed') returning * into v_member;
  if v_member.id is null then raise exception 'An invitation already exists'; end if;
  return v_member;
end;
$$;

create or replace function public.respond_competition_team_invite(p_team_id uuid,p_accept boolean)
returns public.competition_team_members language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_team public.competition_teams%rowtype; v_comp public.competitions%rowtype; v_member public.competition_team_members%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_team from public.competition_teams where id=p_team_id;
  if not found then raise exception 'Team not found'; end if;
  select * into v_comp from public.competitions where id=v_team.competition_id;
  if v_comp.status<>'scheduled' or now()>=v_comp.starts_at or v_team.roster_locked_at is not null then raise exception 'Team roster is locked'; end if;
  select * into v_member from public.competition_team_members where team_id=p_team_id and student_id=v_uid and status='invited' for update;
  if not found then raise exception 'Invitation not found'; end if;
  if p_accept and exists(select 1 from public.competition_team_members tm join public.competition_teams t on t.id=tm.team_id where t.competition_id=v_comp.id and tm.student_id=v_uid and tm.status='active') then raise exception 'You are already on another team in this competition'; end if;
  update public.competition_team_members set status=case when p_accept then 'active' else 'declined' end,joined_at=case when p_accept then now() else null end where id=v_member.id returning * into v_member;
  return v_member;
end;
$$;

create or replace function public.lock_competition_team_rosters(p_competition_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_comp public.competitions%rowtype; v_count integer;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin permission required'; end if;
  select * into v_comp from public.competitions where id=p_competition_id for update;
  if not found or v_comp.competition_type<>'team' then raise exception 'Team competition not found'; end if;
  perform set_config('campusiq.team_lock','on',true);
  update public.competition_teams set roster_locked_at=coalesce(roster_locked_at,now()) where competition_id=p_competition_id and status='active';
  get diagnostics v_count=row_count;
  update public.competition_team_members tm set status='removed' from public.competition_teams t where tm.team_id=t.id and t.competition_id=p_competition_id and tm.status='invited';
  return v_count;
end;
$$;

create or replace function public.rebuild_competition_team_results(p_competition_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_comp public.competitions%rowtype; v_team record; v_count integer:=0; v_score numeric(8,2); v_scores jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin permission required'; end if;
  select * into v_comp from public.competitions where id=p_competition_id;
  if not found or v_comp.competition_type<>'team' then raise exception 'Team competition not found'; end if;
  for v_team in select * from public.competition_teams where competition_id=p_competition_id and status='active' loop
    select coalesce(sum(x.score),0),coalesce(jsonb_agg(jsonb_build_object('student_id',x.student_id,'score',x.score) order by x.score desc),'[]'::jsonb)
      into v_score,v_scores from (
        select cr.student_id,cr.score from public.competition_team_members tm
        join public.competition_results cr on cr.student_id=tm.student_id and cr.competition_id=p_competition_id and cr.published=true and cr.status<>'disqualified'
        where tm.team_id=v_team.id and tm.status='active'
        order by cr.score desc limit case when v_comp.team_scoring_method='top_n_aggregate' then v_comp.team_top_n else 100000 end
      ) x;
    if v_comp.team_scoring_method='average' then
      select coalesce(avg(cr.score),0) into v_score from public.competition_team_members tm join public.competition_results cr on cr.student_id=tm.student_id and cr.competition_id=p_competition_id and cr.published=true where tm.team_id=v_team.id and tm.status='active';
    elsif v_comp.team_scoring_method='match_based' then
      select coalesce(sum(case when winner_team_id=v_team.id then 3 else 0 end),0) into v_score from public.tournament_match_results where team_a_score is not null or team_b_score is not null;
    end if;
    insert into public.competition_team_results(competition_id,team_id,score,contributing_scores,status)
      values(p_competition_id,v_team.id,v_score,v_scores,'provisional') on conflict(competition_id,team_id) do update set score=excluded.score,contributing_scores=excluded.contributing_scores,result_version=public.competition_team_results.result_version+1,status='corrected';
    v_count:=v_count+1;
  end loop;
  with ranked as(select id,dense_rank() over(order by score desc) as r from public.competition_team_results where competition_id=p_competition_id)
    update public.competition_team_results tr set rank=ranked.r from ranked where tr.id=ranked.id;
  return v_count;
end;
$$;

create or replace function public.rebuild_department_competition_results(p_competition_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin permission required'; end if;
  insert into public.department_competition_results(competition_id,department_id,score,contributing_result_count,finalized_at)
  select p_competition_id,(cp.eligibility_snapshot->>'department_id')::uuid,sum(cr.score),count(*),null
  from public.competition_results cr join public.competition_participants cp on cp.competition_id=cr.competition_id and cp.student_id=cr.student_id
  where cr.competition_id=p_competition_id and cr.published=true and cr.status<>'disqualified' and nullif(cp.eligibility_snapshot->>'department_id','') is not null
  group by (cp.eligibility_snapshot->>'department_id')::uuid
  on conflict(competition_id,department_id) do update set score=excluded.score,contributing_result_count=excluded.contributing_result_count,result_version=public.department_competition_results.result_version+1;
  with ranked as(select id,dense_rank() over(order by score desc) as r from public.department_competition_results where competition_id=p_competition_id)
    update public.department_competition_results dr set rank=ranked.r from ranked where dr.id=ranked.id;
  select count(*) into v_count from public.department_competition_results where competition_id=p_competition_id;
  return v_count;
end;
$$;

create or replace function public.generate_weekly_challenge_instance(p_series_id uuid,p_scheduled_start timestamptz,p_occurrence_key text)
returns public.weekly_challenge_instances language plpgsql security definer set search_path = '' as $$
declare v_series public.weekly_challenge_series%rowtype; v_template public.competitions%rowtype; v_comp public.competitions%rowtype; v_instance public.weekly_challenge_instances%rowtype; v_end timestamptz; v_registration_start timestamptz; v_registration_end timestamptz;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin permission required'; end if;
  if p_scheduled_start<=now() or char_length(trim(p_occurrence_key)) not between 1 and 80 then raise exception 'A future occurrence and valid occurrence key are required'; end if;
  select * into v_instance from public.weekly_challenge_instances where series_id=p_series_id and occurrence_key=p_occurrence_key;
  if found then return v_instance; end if;
  select * into v_series from public.weekly_challenge_series where id=p_series_id and is_active for update;
  if not found then raise exception 'Active weekly series not found'; end if;
  select * into v_template from public.competitions where id=v_series.template_competition_id and published_at is not null;
  if not found then raise exception 'Series template must be a published competition'; end if;
  v_end:=p_scheduled_start+make_interval(mins=>v_series.duration_minutes);
  v_registration_start:=p_scheduled_start-make_interval(mins=>v_series.registration_lead_minutes);
  v_registration_end:=p_scheduled_start-interval '1 minute';
  insert into public.competitions(title,description,course_id,topic_id,difficulty,question_count,time_limit_minutes,starts_at,ends_at,participant_limit,xp_reward,achievement_id,leaderboard_scope,status,created_by,competition_type,participation_mode,registration_starts_at,registration_ends_at,timezone,team_scoring_method,team_top_n,scoring_config,dispute_window_hours,recurrence_series_id)
  values(v_series.title||' · '||p_occurrence_key,v_template.description,v_template.course_id,v_template.topic_id,v_template.difficulty,v_template.question_count,v_series.duration_minutes,p_scheduled_start,v_end,v_template.participant_limit,v_template.xp_reward,v_template.achievement_id,v_template.leaderboard_scope,'draft',auth.uid(),'weekly','scheduled_live',greatest(v_registration_start,now()),v_registration_end,v_series.timezone,v_template.team_scoring_method,v_template.team_top_n,v_template.scoring_config,48,v_series.id) returning * into v_comp;
  insert into public.competition_questions(competition_id,question_id,display_order,points) select v_comp.id,question_id,display_order,points from public.competition_questions where competition_id=v_template.id;
  insert into public.competition_scopes(competition_id,scope_type,scope_id) select v_comp.id,scope_type,scope_id from public.competition_scopes where competition_id=v_template.id;
  perform public.publish_competition(v_comp.id);
  insert into public.weekly_challenge_instances(series_id,competition_id,occurrence_key,scheduled_start_at,scheduled_end_at) values(p_series_id,v_comp.id,p_occurrence_key,p_scheduled_start,v_end) returning * into v_instance;
  return v_instance;
end;
$$;


create or replace function public.ci_guard_published_match_questions()
returns trigger language plpgsql set search_path = '' as $$
declare v_match_id uuid; v_published timestamptz;
begin
  v_match_id:=case when tg_op='DELETE' then old.tournament_match_id else new.tournament_match_id end;
  select t.tournament_published_at into v_published from public.tournament_matches tm join public.tournament_rounds tr on tr.id=tm.tournament_round_id join public.tournaments t on t.id=tr.tournament_id where tm.id=v_match_id;
  if v_published is not null and current_setting('campusiq.generate_matches',true) is distinct from 'on' then raise exception 'Published tournament match question sets are immutable'; end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
create trigger guard_published_match_questions before insert or update or delete on public.tournament_match_questions for each row execute function public.ci_guard_published_match_questions();

create or replace function public.publish_tournament(p_tournament_id uuid)
returns public.tournaments language plpgsql security definer set search_path = '' as $$
declare v_t public.tournaments%rowtype; v_round integer;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin permission required'; end if;
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found or v_t.status<>'draft' then raise exception 'Only tournament drafts can be published'; end if;
  if v_t.starts_at<=now() or v_t.ends_at<=v_t.starts_at then raise exception 'Tournament must have a valid future schedule'; end if;
  if v_t.registration_starts_at is null or v_t.registration_ends_at is null or v_t.registration_starts_at>=v_t.registration_ends_at or v_t.registration_ends_at>v_t.starts_at then raise exception 'Registration window must close before the tournament starts'; end if;
  if v_t.format in ('single_elimination','knockout') and v_t.round_count<1 then raise exception 'Single elimination requires at least one round'; end if;
  for v_round in 1..v_t.round_count loop
    insert into public.tournament_rounds(tournament_id,round_number,title,status) values(p_tournament_id,v_round,'Round '||v_round,'scheduled') on conflict(tournament_id,round_number) do nothing;
  end loop;
  update public.tournaments set status='scheduled',published_at=now(),tournament_published_at=now(),updated_at=now() where id=p_tournament_id returning * into v_t;
  return v_t;
end;
$$;

create or replace function public.register_for_tournament(p_tournament_id uuid)
returns public.tournament_participants language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_t public.tournaments%rowtype; v_profile public.profiles%rowtype; v_participant public.tournament_participants%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found or v_t.tournament_published_at is null or v_t.status not in ('scheduled','registration_open') then raise exception 'Tournament is not open for registration'; end if;
  if now()<v_t.registration_starts_at or now()>=v_t.registration_ends_at then raise exception 'Tournament registration is closed'; end if;
  if v_t.participant_limit is not null and (select count(*) from public.tournament_participants where tournament_id=p_tournament_id and registration_status='registered')>=v_t.participant_limit then raise exception 'Tournament is full'; end if;
  select * into v_profile from public.profiles where id=v_uid and account_status='active';
  if not found then raise exception 'Active student profile required'; end if;
  if (v_t.institution_id is not null and v_profile.institution_id is distinct from v_t.institution_id)
    or (v_t.faculty_id is not null and v_profile.faculty_id is distinct from v_t.faculty_id)
    or (v_t.department_id is not null and v_profile.department_id is distinct from v_t.department_id)
    or (v_t.programme_id is not null and v_profile.programme_id is distinct from v_t.programme_id)
    or (v_t.level_id is not null and v_profile.level_id is distinct from v_t.level_id) then raise exception 'Your academic context is not eligible for this tournament'; end if;
  insert into public.tournament_participants(tournament_id,student_id,registration_status) values(p_tournament_id,v_uid,'registered')
    on conflict(tournament_id,student_id) do update set registration_status='registered' where public.tournament_participants.registration_status='withdrawn' returning * into v_participant;
  if v_participant.id is null then select * into v_participant from public.tournament_participants where tournament_id=p_tournament_id and student_id=v_uid; end if;
  return v_participant;
end;
$$;

create or replace function public.generate_tournament_matches(p_tournament_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_t public.tournaments%rowtype; v_round public.tournament_rounds%rowtype; v_prev_ids uuid[]; v_current_ids uuid[]; v_participant_ids uuid[]; v_i integer; v_j integer; v_match_id uuid; v_next uuid; v_slot text; v_count integer:=0; v_n integer;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin permission required'; end if;
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found or v_t.tournament_published_at is null then raise exception 'Publish tournament before generating its schedule'; end if;
  if exists(select 1 from public.tournament_matches tm join public.tournament_rounds tr on tr.id=tm.tournament_round_id where tr.tournament_id=p_tournament_id) then raise exception 'Matches already exist; use the controlled reschedule/correction workflow'; end if;
  select array_agg(id order by coalesce(seed,2147483647),registered_at,id) into v_participant_ids from public.tournament_participants where tournament_id=p_tournament_id and registration_status='registered';
  v_n:=coalesce(array_length(v_participant_ids,1),0);
  if v_n<2 then raise exception 'At least two registered participants are required'; end if;
  if v_t.format in ('round_robin','leaderboard_challenge') then
    select * into v_round from public.tournament_rounds where tournament_id=p_tournament_id order by round_number limit 1;
    for v_i in 1..v_n loop for v_j in (v_i+1)..v_n loop
      insert into public.tournament_matches(tournament_round_id,participant_a_id,participant_b_id,status,scheduled_at)
        values(v_round.id,v_participant_ids[v_i],v_participant_ids[v_j],'scheduled',v_t.starts_at+make_interval(mins=>((v_count)*coalesce(v_t.match_duration_minutes,30)))) returning id into v_match_id;
      v_count:=v_count+1;
    end loop; end loop;
    insert into public.tournament_match_questions(tournament_match_id,question_id,display_order,points,question_snapshot,snapshot_version)
      select tm.id,tq.question_id,row_number() over(partition by tm.id order by tq.display_order,tq.question_id)::integer,tq.points,tq.question_snapshot,tq.snapshot_version
      from public.tournament_matches tm join public.tournament_rounds tr on tr.id=tm.tournament_round_id cross join public.tournament_questions tq
      where tr.tournament_id=p_tournament_id and tq.tournament_id=p_tournament_id;
    return v_count;
  end if;
  if v_t.format not in ('single_elimination','knockout','group_stage_knockout') then raise exception 'Unsupported tournament format'; end if;
  -- The first round is seeded deterministically; later-round slots are linked
  -- before results exist so advancement remains explicit and idempotent.
  v_prev_ids:=array[]::uuid[];
  for v_i in 1..v_t.round_count loop
    select * into v_round from public.tournament_rounds where tournament_id=p_tournament_id and round_number=v_i;
    v_current_ids:=array[]::uuid[];
    if v_i=1 then
      for v_j in 1..ceil(v_n::numeric/2)::integer loop
        insert into public.tournament_matches(tournament_round_id,participant_a_id,participant_b_id,status,scheduled_at)
          values(v_round.id,v_participant_ids[(v_j*2)-1],case when (v_j*2)<=v_n then v_participant_ids[v_j*2] else null end,'scheduled',v_t.starts_at+make_interval(mins=>((v_j-1)*coalesce(v_t.match_duration_minutes,30)))) returning id into v_match_id;
        v_current_ids:=array_append(v_current_ids,v_match_id); v_count:=v_count+1;
      end loop;
    else
      for v_j in 1..ceil(coalesce(array_length(v_prev_ids,1),1)::numeric/2)::integer loop
        insert into public.tournament_matches(tournament_round_id,status,scheduled_at) values(v_round.id,'scheduled',v_t.starts_at+make_interval(mins=>((v_i-1)*60+(v_j-1)*coalesce(v_t.match_duration_minutes,30)))) returning id into v_match_id;
        v_current_ids:=array_append(v_current_ids,v_match_id); v_count:=v_count+1;
      end loop;
      for v_j in 1..coalesce(array_length(v_prev_ids,1),0) loop
        v_next:=v_current_ids[ceil(v_j::numeric/2)::integer]; v_slot:=case when v_j%2=1 then 'a' else 'b' end;
        update public.tournament_matches set next_match_id=v_next,next_slot=v_slot where id=v_prev_ids[v_j];
      end loop;
    end if;
    v_prev_ids:=v_current_ids;
  end loop;
  -- Explicitly mark first-round byes as walkovers and advance them once.
  for v_i in select tm.id from public.tournament_matches tm join public.tournament_rounds tr on tr.id=tm.tournament_round_id where tr.tournament_id=p_tournament_id and tr.round_number=1 and tm.participant_a_id is not null and tm.participant_b_id is null loop
    update public.tournament_matches set status='walkover',winner_participant_id=participant_a_id,completed_at=now() where id=v_i.id;
    select next_match_id,next_slot into v_next,v_slot from public.tournament_matches where id=v_i.id;
    if v_next is not null then
      if v_slot='a' then update public.tournament_matches set participant_a_id=(select winner_participant_id from public.tournament_matches where id=v_i.id) where id=v_next;
      else update public.tournament_matches set participant_b_id=(select winner_participant_id from public.tournament_matches where id=v_i.id) where id=v_next; end if;
    end if;
  end loop;
  insert into public.tournament_match_questions(tournament_match_id,question_id,display_order,points,question_snapshot,snapshot_version)
    select tm.id,tq.question_id,row_number() over(partition by tm.id order by tq.display_order,tq.question_id)::integer,tq.points,tq.question_snapshot,tq.snapshot_version
    from public.tournament_matches tm join public.tournament_rounds tr on tr.id=tm.tournament_round_id cross join public.tournament_questions tq
    where tr.tournament_id=p_tournament_id and tq.tournament_id=p_tournament_id;
  return v_count;
end;
$$;

create or replace function public.record_tournament_match_result(p_match_id uuid,p_outcome text,p_a_score numeric default null,p_b_score numeric default null,p_reason text default null)
returns public.tournament_match_results language plpgsql security definer set search_path = '' as $$
declare v_match public.tournament_matches%rowtype; v_round public.tournament_rounds%rowtype; v_t public.tournaments%rowtype; v_result public.tournament_match_results%rowtype; v_winner uuid; v_winner_team uuid; v_next uuid; v_slot text;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin permission required'; end if;
  if p_outcome not in ('a_wins','b_wins','draw','forfeit_a','forfeit_b','double_forfeit') then raise exception 'Invalid match outcome'; end if;
  select * into v_match from public.tournament_matches where id=p_match_id for update;
  if not found or v_match.status in ('completed','walkover','cancelled') then raise exception 'Match is not available for result entry'; end if;
  select * into v_round from public.tournament_rounds where id=v_match.tournament_round_id;
  select * into v_t from public.tournaments where id=v_round.tournament_id;
  if p_outcome='draw' and v_t.format in ('single_elimination','knockout','group_stage_knockout') then raise exception 'Knockout matches cannot end in a draw'; end if;
  if p_outcome in ('a_wins','forfeit_b') then v_winner:=v_match.participant_a_id; v_winner_team:=v_match.team_a_id;
  elsif p_outcome in ('b_wins','forfeit_a') then v_winner:=v_match.participant_b_id; v_winner_team:=v_match.team_b_id; end if;
  insert into public.tournament_match_results(tournament_match_id,participant_a_score,participant_b_score,team_a_score,team_b_score,outcome,reviewed_by,reason,result_version)
    values(p_match_id,p_a_score,p_b_score,null,null,p_outcome,auth.uid(),left(trim(coalesce(p_reason,'')),2000),v_match.result_version)
    returning * into v_result;
  update public.tournament_matches set winner_participant_id=v_winner,winner_team_id=v_winner_team,status='completed',completed_at=now(),result_version=result_version+1 where id=p_match_id;
  select next_match_id,next_slot into v_next,v_slot from public.tournament_matches where id=p_match_id;
  if v_next is not null and (v_winner is not null or v_winner_team is not null) then
    if v_slot='a' then update public.tournament_matches set participant_a_id=v_winner,team_a_id=v_winner_team where id=v_next and status='scheduled' and participant_a_id is null and team_a_id is null;
    else update public.tournament_matches set participant_b_id=v_winner,team_b_id=v_winner_team where id=v_next and status='scheduled' and participant_b_id is null and team_b_id is null; end if;
  end if;
  return v_result;
end;
$$;

-- Competition finalization also refreshes verified team/department aggregates.
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
    if v_comp.xp_reward > 0 then perform public.ci_award_xp(v_result.student_id,v_comp.xp_reward,'competition',v_result.id,'Finalized competition reward: '||v_comp.title); end if;
    if v_comp.achievement_id is not null then perform public.ci_unlock_achievement(v_result.student_id,(select code from public.achievements where id=v_comp.achievement_id)); end if;
    v_count:=v_count+1;
  end loop;
  if v_comp.competition_type='team' then perform set_config('campusiq.competition_finalize','on',true); perform public.rebuild_competition_team_results(p_competition_id); end if;
  if v_comp.competition_type='department' then perform public.rebuild_department_competition_results(p_competition_id); update public.department_competition_results set finalized_at=now() where competition_id=p_competition_id; end if;
  update public.competitions set finalized_at=now() where id=p_competition_id;
  return v_count;
end;
$$;

-- Student attempts, registrations and disputes are RPC-only; no direct client
-- writes to authoritative competition or tournament rows.
drop policy if exists "student registers for tournament" on public.tournament_participants;
drop policy if exists "student withdraws from tournament" on public.tournament_participants;
create policy "read own tournament registrations" on public.tournament_participants for select to authenticated using (student_id=auth.uid() or public.is_staff());
create policy "read tournament rounds scoped" on public.tournament_rounds for select to authenticated using (exists(select 1 from public.tournaments t where t.id=tournament_id and (t.status<>'draft' or public.is_staff())));
drop policy if exists "read tournament_rounds" on public.tournament_rounds;
drop policy if exists "read tournament_matches" on public.tournament_matches;
create policy "read tournament matches scoped" on public.tournament_matches for select to authenticated using (exists(select 1 from public.tournament_rounds tr join public.tournaments t on t.id=tr.tournament_id where tr.id=tournament_round_id and (t.status<>'draft' or public.is_staff())));

revoke all on function public.create_competition_team(uuid,text,uuid) from public,anon;
revoke all on function public.invite_competition_team_member(uuid,uuid) from public,anon;
revoke all on function public.respond_competition_team_invite(uuid,boolean) from public,anon;
revoke all on function public.lock_competition_team_rosters(uuid) from public,anon;
revoke all on function public.rebuild_competition_team_results(uuid) from public,anon;
revoke all on function public.rebuild_department_competition_results(uuid) from public,anon;
revoke all on function public.generate_weekly_challenge_instance(uuid,timestamptz,text) from public,anon;
revoke all on function public.publish_tournament(uuid) from public,anon;
revoke all on function public.register_for_tournament(uuid) from public,anon;
revoke all on function public.generate_tournament_matches(uuid) from public,anon;
revoke all on function public.record_tournament_match_result(uuid,text,numeric,numeric,text) from public,anon;
grant execute on function public.create_competition_team(uuid,text,uuid) to authenticated;
grant execute on function public.invite_competition_team_member(uuid,uuid) to authenticated;
grant execute on function public.respond_competition_team_invite(uuid,boolean) to authenticated;
grant execute on function public.lock_competition_team_rosters(uuid) to authenticated;
grant execute on function public.rebuild_competition_team_results(uuid) to authenticated;
grant execute on function public.rebuild_department_competition_results(uuid) to authenticated;
grant execute on function public.generate_weekly_challenge_instance(uuid,timestamptz,text) to authenticated;
grant execute on function public.publish_tournament(uuid) to authenticated;
grant execute on function public.register_for_tournament(uuid) to authenticated;
grant execute on function public.generate_tournament_matches(uuid) to authenticated;
grant execute on function public.record_tournament_match_result(uuid,text,numeric,numeric,text) to authenticated;

-- Freeze scope and team roster after publication/lock, and keep official match
-- results writable only through the validated result RPC.
alter table public.competitions add column if not exists tournament_id uuid references public.tournaments(id) on delete set null;
create or replace function public.ci_guard_published_competition_scope()
returns trigger language plpgsql set search_path = '' as $$
declare v_id uuid; v_published timestamptz;
begin
  v_id:=case when tg_op='DELETE' then old.competition_id else new.competition_id end;
  select published_at into v_published from public.competitions where id=v_id;
  if v_published is not null then raise exception 'Competition eligibility scope is frozen after publication'; end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
create trigger guard_published_competition_scope before insert or update or delete on public.competition_scopes for each row execute function public.ci_guard_published_competition_scope();

create or replace function public.ci_guard_tournament_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.tournament_published_at is not null then
    if new.title is distinct from old.title or new.description is distinct from old.description or new.format is distinct from old.format
      or new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or new.round_count is distinct from old.round_count
      or new.question_count is distinct from old.question_count or new.tie_breaker is distinct from old.tie_breaker or new.scoring_config is distinct from old.scoring_config
      or new.timezone is distinct from old.timezone or new.participant_limit is distinct from old.participant_limit then
      raise exception 'Published tournament rules are immutable; cancel and replace the tournament to change them';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_tournament_update on public.tournaments;
create trigger guard_tournament_update before update on public.tournaments for each row execute function public.ci_guard_tournament_update();

create or replace function public.ci_guard_locked_team_membership()
returns trigger language plpgsql set search_path = '' as $$
declare v_team_id uuid; v_locked timestamptz;
begin
  v_team_id:=case when tg_op='DELETE' then old.team_id else new.team_id end;
  select roster_locked_at into v_locked from public.competition_teams where id=v_team_id;
  if v_locked is not null and current_setting('campusiq.team_lock',true) is distinct from 'on' then raise exception 'Team roster is locked'; end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
create trigger guard_locked_team_membership before insert or update or delete on public.competition_team_members for each row execute function public.ci_guard_locked_team_membership();
create or replace function public.ci_guard_locked_team_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.roster_locked_at is not null and (new.name is distinct from old.name or new.captain_id is distinct from old.captain_id or new.department_id is distinct from old.department_id or new.competition_id is distinct from old.competition_id) then
    raise exception 'Team identity is frozen after the roster locks';
  end if;
  return new;
end;
$$;
create trigger guard_locked_team_identity before update on public.competition_teams for each row execute function public.ci_guard_locked_team_identity();


-- Prevent direct Admin writes from bypassing match result validation/advancement.
drop policy if exists "admins manage match results" on public.tournament_match_results;
create policy "admins read match results" on public.tournament_match_results for select to authenticated using (public.is_admin());
drop policy if exists "staff updates tournament_matches" on public.tournament_matches;

-- A tournament result must be entered through record_tournament_match_result.
-- Round/match creation remains Admin-only; winner changes are RPC-only.

create or replace function public.rebuild_competition_team_results(p_competition_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_comp public.competitions%rowtype; v_team record; v_count integer:=0; v_score numeric(8,2); v_scores jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin permission required'; end if;
  select * into v_comp from public.competitions where id=p_competition_id;
  if not found or v_comp.competition_type<>'team' then raise exception 'Team competition not found'; end if;
  for v_team in select * from public.competition_teams where competition_id=p_competition_id and status='active' loop
    if v_comp.team_scoring_method='match_based' then
      if v_comp.tournament_id is null then raise exception 'Match-based team scoring requires a linked tournament'; end if;
      select coalesce(sum(case when tm.winner_team_id=v_team.id then 3 else 0 end),0) into v_score
      from public.tournament_match_results mr join public.tournament_matches tm on tm.id=mr.tournament_match_id
      join public.tournament_rounds tr on tr.id=tm.tournament_round_id where tr.tournament_id=v_comp.tournament_id;
      v_scores:='[]'::jsonb;
    else
      select coalesce(sum(x.score),0),coalesce(jsonb_agg(jsonb_build_object('student_id',x.student_id,'score',x.score) order by x.score desc),'[]'::jsonb)
        into v_score,v_scores from (
          select cr.student_id,cr.score from public.competition_team_members tm
          join public.competition_results cr on cr.student_id=tm.student_id and cr.competition_id=p_competition_id and cr.published=true and cr.status<>'disqualified'
          where tm.team_id=v_team.id and tm.status='active'
          order by cr.score desc limit case when v_comp.team_scoring_method='top_n_aggregate' then v_comp.team_top_n else 100000 end
        ) x;
      if v_comp.team_scoring_method='average' then
        select coalesce(avg(cr.score),0) into v_score from public.competition_team_members tm join public.competition_results cr on cr.student_id=tm.student_id and cr.competition_id=p_competition_id and cr.published=true where tm.team_id=v_team.id and tm.status='active';
      end if;
    end if;
    insert into public.competition_team_results(competition_id,team_id,score,contributing_scores,status,finalized_at)
      values(p_competition_id,v_team.id,v_score,v_scores,case when v_comp.finalized_at is not null or current_setting('campusiq.competition_finalize',true)='on' then 'finalized' else 'provisional' end,case when v_comp.finalized_at is not null or current_setting('campusiq.competition_finalize',true)='on' then now() else null end)
      on conflict(competition_id,team_id) do update set score=excluded.score,contributing_scores=excluded.contributing_scores,result_version=public.competition_team_results.result_version+1,status=excluded.status,finalized_at=excluded.finalized_at;
    v_count:=v_count+1;
  end loop;
  with ranked as(select id,dense_rank() over(order by score desc) as r from public.competition_team_results where competition_id=p_competition_id)
    update public.competition_team_results tr set rank=ranked.r from ranked where tr.id=ranked.id;
  return v_count;
end;
$$;

-- Correct the weekly-instance generator to copy the template's frozen question
-- snapshots rather than reading potentially edited source-bank questions.
create or replace function public.generate_weekly_challenge_instance(p_series_id uuid,p_scheduled_start timestamptz,p_occurrence_key text)
returns public.weekly_challenge_instances language plpgsql security definer set search_path = '' as $$
declare v_series public.weekly_challenge_series%rowtype; v_template public.competitions%rowtype; v_comp public.competitions%rowtype; v_instance public.weekly_challenge_instances%rowtype; v_end timestamptz; v_registration_start timestamptz; v_registration_end timestamptz;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin permission required'; end if;
  if p_scheduled_start<=now()+interval '1 minute' or char_length(trim(p_occurrence_key)) not between 1 and 80 then raise exception 'A future occurrence and valid occurrence key are required'; end if;
  select * into v_instance from public.weekly_challenge_instances where series_id=p_series_id and occurrence_key=p_occurrence_key;
  if found then return v_instance; end if;
  select * into v_series from public.weekly_challenge_series where id=p_series_id and is_active for update;
  if not found then raise exception 'Active weekly series not found'; end if;
  select * into v_template from public.competitions where id=v_series.template_competition_id and published_at is not null;
  if not found then raise exception 'Series template must be a published competition'; end if;
  v_end:=p_scheduled_start+make_interval(mins=>v_series.duration_minutes);
  v_registration_start:=greatest(p_scheduled_start-make_interval(mins=>v_series.registration_lead_minutes),now());
  v_registration_end:=p_scheduled_start-interval '1 minute';
  insert into public.competitions(title,description,course_id,topic_id,difficulty,question_count,time_limit_minutes,starts_at,ends_at,participant_limit,xp_reward,achievement_id,leaderboard_scope,status,created_by,competition_type,participation_mode,registration_starts_at,registration_ends_at,timezone,team_scoring_method,team_top_n,scoring_config,dispute_window_hours,recurrence_series_id,attempt_policy,tie_breaker,rules_version,min_team_size,max_team_size)
  values(v_series.title||' · '||p_occurrence_key,v_template.description,v_template.course_id,v_template.topic_id,v_template.difficulty,v_template.question_count,v_series.duration_minutes,p_scheduled_start,v_end,v_template.participant_limit,v_template.xp_reward,v_template.achievement_id,v_template.leaderboard_scope,'draft',auth.uid(),'weekly','scheduled_live',v_registration_start,v_registration_end,v_series.timezone,v_template.team_scoring_method,v_template.team_top_n,v_template.scoring_config,48,v_series.id,v_template.attempt_policy,v_template.tie_breaker,v_template.rules_version,v_template.min_team_size,v_template.max_team_size) returning * into v_comp;
  insert into public.competition_questions(competition_id,question_id,display_order,points,question_snapshot,snapshot_version)
    select v_comp.id,question_id,display_order,points,question_snapshot,snapshot_version from public.competition_questions where competition_id=v_template.id;
  insert into public.competition_scopes(competition_id,scope_type,scope_id) select v_comp.id,scope_type,scope_id from public.competition_scopes where competition_id=v_template.id;
  perform set_config('campusiq.competition_transition','on',true);
  update public.competitions set status='scheduled',published_at=now(),updated_at=now() where id=v_comp.id returning * into v_comp;
  insert into public.weekly_challenge_instances(series_id,competition_id,occurrence_key,scheduled_start_at,scheduled_end_at) values(p_series_id,v_comp.id,p_occurrence_key,p_scheduled_start,v_end) returning * into v_instance;
  return v_instance;
end;
$$;

-- Student withdrawal is only possible before the competition starts.
create or replace function public.withdraw_from_competition(p_competition_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_comp public.competitions%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_comp from public.competitions where id=p_competition_id;
  if not found or v_comp.published_at is null or now()>=v_comp.starts_at then raise exception 'Registration can no longer be withdrawn'; end if;
  update public.competition_participants set registration_status='withdrawn' where competition_id=p_competition_id and student_id=v_uid and registration_status='registered';
  return found;
end;
$$;
drop policy if exists "student withdraws from competition" on public.competition_participants;
revoke all on function public.withdraw_from_competition(uuid) from public,anon;
grant execute on function public.withdraw_from_competition(uuid) to authenticated;

revoke all on function public.publish_tournament(uuid) from public,anon;
revoke all on function public.register_for_tournament(uuid) from public,anon;
revoke all on function public.generate_tournament_matches(uuid) from public,anon;
revoke all on function public.record_tournament_match_result(uuid,text,numeric,numeric,text) from public,anon;
revoke all on function public.finalize_competition_results(uuid) from public,anon;
grant execute on function public.publish_tournament(uuid) to authenticated;
grant execute on function public.register_for_tournament(uuid) to authenticated;
grant execute on function public.generate_tournament_matches(uuid) to authenticated;
grant execute on function public.record_tournament_match_result(uuid,text,numeric,numeric,text) to authenticated;
grant execute on function public.finalize_competition_results(uuid) to authenticated;
