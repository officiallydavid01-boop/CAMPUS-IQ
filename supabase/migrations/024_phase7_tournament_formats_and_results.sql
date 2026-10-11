-- Phase 7: deterministic tournament generation, group qualification, match
-- outcomes, final standings and result/reward reconciliation.
alter table public.tournament_participants add column if not exists group_rank integer;
alter table public.tournament_participants add column if not exists qualified_for_knockout boolean not null default false;
alter table public.tournament_participants add column if not exists eliminated_round integer;

create or replace function public.register_for_tournament(p_tournament_id uuid)
returns public.tournament_participants language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_t public.tournaments%rowtype; v_profile public.profiles%rowtype; v_participant public.tournament_participants%rowtype; v_n integer; v_group_count integer;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not public.has_role('student') then raise exception 'Student role required'; end if;
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
  insert into public.tournament_participants(tournament_id,student_id,registration_status,eligibility_snapshot) values(p_tournament_id,v_uid,'registered',jsonb_build_object('institution_id',v_profile.institution_id,'faculty_id',v_profile.faculty_id,'department_id',v_profile.department_id,'programme_id',v_profile.programme_id,'level_id',v_profile.level_id,'session_id',v_profile.current_session_id,'semester_id',v_profile.current_semester_id,'scope',jsonb_build_object('institution_id',v_t.institution_id,'faculty_id',v_t.faculty_id,'department_id',v_t.department_id,'programme_id',v_t.programme_id,'level_id',v_t.level_id),'captured_at',now()))
    on conflict(tournament_id,student_id) do update set registration_status='registered',eligibility_snapshot=excluded.eligibility_snapshot where public.tournament_participants.registration_status='withdrawn' returning * into v_participant;
  if v_participant.id is null then select * into v_participant from public.tournament_participants where tournament_id=p_tournament_id and student_id=v_uid; end if;
  if v_t.format='group_stage_knockout' then
    select count(*) into v_n from public.tournament_participants where tournament_id=p_tournament_id and registration_status='registered';
    if v_n<=8 then v_group_count:=2; else v_group_count:=4; end if;
    -- Registration is still open and matches do not exist yet, so rebalance all
    -- group assignments deterministically whenever the roster changes.
    with seeded as(select id,row_number() over(order by coalesce(seed,2147483647),registered_at,id) as rn from public.tournament_participants where tournament_id=p_tournament_id and registration_status='registered')
      update public.tournament_participants tp set group_key='Group '||chr(65+mod(seeded.rn-1,v_group_count)) from seeded where tp.id=seeded.id;
    select * into v_participant from public.tournament_participants where id=v_participant.id;
  end if;
  return v_participant;
end;
$$;

create or replace function public.generate_tournament_matches(p_tournament_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_t public.tournaments%rowtype; v_round public.tournament_rounds%rowtype; v_pair record;
  v_prev_ids uuid[]; v_current_ids uuid[]; v_participant_ids uuid[]; v_qualifiers uuid[];
  v_i integer; v_j integer; v_match_id uuid; v_next uuid; v_slot text; v_count integer:=0;
  v_n integer; v_prev_count integer; v_current_count integer; v_group_count integer; v_required_rounds integer;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin permission required'; end if;
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found or v_t.tournament_published_at is null then raise exception 'Publish tournament before generating its schedule'; end if;
  if now()<v_t.registration_ends_at then raise exception 'Close registration before generating the official match schedule'; end if;
  if exists(select 1 from public.tournament_matches tm join public.tournament_rounds tr on tr.id=tm.tournament_round_id where tr.tournament_id=p_tournament_id) then raise exception 'Matches already exist; use the controlled reschedule/correction workflow'; end if;
  select array_agg(id order by coalesce(seed,2147483647),registered_at,id) into v_participant_ids from public.tournament_participants where tournament_id=p_tournament_id and registration_status='registered';
  v_n:=coalesce(array_length(v_participant_ids,1),0);
  if v_n<2 then raise exception 'At least two registered participants are required'; end if;
  if v_t.format in ('round_robin','leaderboard_challenge') then
    select * into v_round from public.tournament_rounds where tournament_id=p_tournament_id order by round_number limit 1;
    for v_i in 1..v_n loop
      for v_j in (v_i+1)..v_n loop
        insert into public.tournament_matches(tournament_round_id,participant_a_id,participant_b_id,status,scheduled_at)
          values(v_round.id,v_participant_ids[v_i],v_participant_ids[v_j],'scheduled',v_t.starts_at+make_interval(mins=>v_count*coalesce(v_t.match_duration_minutes,30))) returning id into v_match_id;
        v_count:=v_count+1;
      end loop;
    end loop;
    update public.tournament_rounds set status='cancelled' where tournament_id=p_tournament_id and round_number>1;
  elsif v_t.format='group_stage_knockout' then
    if v_n<4 then raise exception 'Group stage plus knockout requires at least four registered participants'; end if;
    select count(distinct group_key) into v_group_count from public.tournament_participants where tournament_id=p_tournament_id and registration_status='registered' and group_key is not null;
    if v_group_count not in (2,4) then raise exception 'Group assignments must form two or four groups'; end if;
    if exists(select 1 from public.tournament_participants where tournament_id=p_tournament_id and registration_status='registered' group by group_key having count(*)<2) then raise exception 'Each group needs at least two registered participants'; end if;
    v_required_rounds:=1+ceil(ln((2*v_group_count)::numeric)/ln(2))::integer;
    if v_t.round_count < v_required_rounds then raise exception 'Add enough rounds for the group stage and knockout bracket'; end if;
    select * into v_round from public.tournament_rounds where tournament_id=p_tournament_id and round_number=1;
    for v_pair in
      select a.id as a_id,b.id as b_id from public.tournament_participants a join public.tournament_participants b
        on a.tournament_id=b.tournament_id and a.group_key=b.group_key and a.id<b.id
      where a.tournament_id=p_tournament_id and a.registration_status='registered' and b.registration_status='registered'
      order by a.group_key,coalesce(a.seed,2147483647),a.registered_at,coalesce(b.seed,2147483647),b.registered_at
    loop
      insert into public.tournament_matches(tournament_round_id,participant_a_id,participant_b_id,status,scheduled_at)
        values(v_round.id,v_pair.a_id,v_pair.b_id,'scheduled',v_t.starts_at+make_interval(mins=>v_count*coalesce(v_t.match_duration_minutes,30))) returning id into v_match_id;
      v_count:=v_count+1;
    end loop;
    v_prev_count:=v_group_count;
    for v_i in 2..v_required_rounds loop
      select * into v_round from public.tournament_rounds where tournament_id=p_tournament_id and round_number=v_i;
      v_current_count:=ceil(v_prev_count::numeric/2)::integer;
      v_current_ids:=array[]::uuid[];
      for v_j in 1..v_current_count loop
        insert into public.tournament_matches(tournament_round_id,status,scheduled_at)
          values(v_round.id,'scheduled',v_t.starts_at+make_interval(mins=>((v_i*60)+(v_j-1)*coalesce(v_t.match_duration_minutes,30)))) returning id into v_match_id;
        v_current_ids:=array_append(v_current_ids,v_match_id); v_count:=v_count+1;
      end loop;
      if v_i>2 then
        for v_j in 1..coalesce(array_length(v_prev_ids,1),0) loop
          v_next:=v_current_ids[ceil(v_j::numeric/2)::integer]; v_slot:=case when v_j%2=1 then 'a' else 'b' end;
          update public.tournament_matches set next_match_id=v_next,next_slot=v_slot where id=v_prev_ids[v_j];
        end loop;
      end if;
      v_prev_ids:=v_current_ids; v_prev_count:=v_current_count;
    end loop;
    update public.tournament_rounds set status='cancelled' where tournament_id=p_tournament_id and round_number>v_required_rounds;
  elsif v_t.format in ('single_elimination','knockout') then
    v_required_rounds:=ceil(ln(v_n::numeric)/ln(2))::integer;
    if v_t.round_count < v_required_rounds then raise exception 'Add enough rounds for the number of registered participants'; end if;
    v_prev_ids:=array[]::uuid[];
    for v_i in 1..v_required_rounds loop
      select * into v_round from public.tournament_rounds where tournament_id=p_tournament_id and round_number=v_i;
      v_current_ids:=array[]::uuid[];
      if v_i=1 then
        for v_j in 1..ceil(v_n::numeric/2)::integer loop
          insert into public.tournament_matches(tournament_round_id,participant_a_id,participant_b_id,status,scheduled_at)
            values(v_round.id,v_participant_ids[(v_j*2)-1],case when (v_j*2)<=v_n then v_participant_ids[v_j*2] else null end,'scheduled',v_t.starts_at+make_interval(mins=>(v_j-1)*coalesce(v_t.match_duration_minutes,30))) returning id into v_match_id;
          v_current_ids:=array_append(v_current_ids,v_match_id); v_count:=v_count+1;
        end loop;
      else
        v_current_count:=ceil(coalesce(array_length(v_prev_ids,1),1)::numeric/2)::integer;
        for v_j in 1..v_current_count loop
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
    update public.tournament_rounds set status='cancelled' where tournament_id=p_tournament_id and round_number>v_required_rounds;
    for v_pair in select tm.id,tm.participant_a_id from public.tournament_matches tm join public.tournament_rounds tr on tr.id=tm.tournament_round_id where tr.tournament_id=p_tournament_id and tr.round_number=1 and tm.participant_a_id is not null and tm.participant_b_id is null loop
      update public.tournament_matches set status='walkover',winner_participant_id=v_pair.participant_a_id,completed_at=now() where id=v_pair.id;
      select next_match_id,next_slot into v_next,v_slot from public.tournament_matches where id=v_pair.id;
      if v_next is not null then
        if v_slot='a' then update public.tournament_matches set participant_a_id=v_pair.participant_a_id where id=v_next;
        else update public.tournament_matches set participant_b_id=v_pair.participant_a_id where id=v_next; end if;
      end if;
    end loop;
  else raise exception 'Unsupported tournament format'; end if;
  if exists(select 1 from public.tournament_matches tm join public.tournament_rounds tr on tr.id=tm.tournament_round_id where tr.tournament_id=p_tournament_id and tm.scheduled_at>=v_t.ends_at) then raise exception 'Match schedule exceeds the tournament end time; increase the tournament window or reduce match duration'; end if;
  perform set_config('campusiq.generate_matches','on',true);
  insert into public.tournament_match_questions(tournament_match_id,question_id,display_order,points,question_snapshot,snapshot_version)
    select tm.id,tq.question_id,row_number() over(partition by tm.id order by tq.display_order,tq.question_id)::integer,tq.points,tq.question_snapshot,tq.snapshot_version
    from public.tournament_matches tm join public.tournament_rounds tr on tr.id=tm.tournament_round_id cross join public.tournament_questions tq
    where tr.tournament_id=p_tournament_id and tq.tournament_id=p_tournament_id;
  return v_count;
end;
$$;

create or replace function public.advance_group_stage_to_knockout(p_tournament_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_t public.tournaments%rowtype; v_qualifiers uuid[]; v_match_ids uuid[]; v_i integer; v_count integer;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin permission required'; end if;
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found or v_t.format<>'group_stage_knockout' then raise exception 'Group-stage knockout tournament not found'; end if;
  if exists(select 1 from public.tournament_matches tm join public.tournament_rounds tr on tr.id=tm.tournament_round_id where tr.tournament_id=p_tournament_id and tr.round_number=1 and tm.status not in ('completed','walkover')) then raise exception 'All group-stage matches must be completed before qualification'; end if;
  with match_points as (
    select tm.participant_a_id as participant_id,coalesce(tp.group_key,'') as group_key,
      case when mr.outcome in ('a_wins','forfeit_b') then 3 when mr.outcome='draw' then 1 else 0 end as points,
      coalesce(mr.participant_a_score,0) as score_for,coalesce(mr.participant_b_score,0) as score_against
    from public.tournament_matches tm join public.tournament_rounds tr on tr.id=tm.tournament_round_id
    join public.tournament_match_results mr on mr.tournament_match_id=tm.id join public.tournament_participants tp on tp.id=tm.participant_a_id
    where tr.tournament_id=p_tournament_id and tr.round_number=1
    union all
    select tm.participant_b_id,coalesce(tp.group_key,''),case when mr.outcome in ('b_wins','forfeit_a') then 3 when mr.outcome='draw' then 1 else 0 end,
      coalesce(mr.participant_b_score,0),coalesce(mr.participant_a_score,0)
    from public.tournament_matches tm join public.tournament_rounds tr on tr.id=tm.tournament_round_id
    join public.tournament_match_results mr on mr.tournament_match_id=tm.id join public.tournament_participants tp on tp.id=tm.participant_b_id
    where tr.tournament_id=p_tournament_id and tr.round_number=1
  ), totals as (
    select participant_id,group_key,sum(points) as points,sum(score_for) as score_for,sum(score_against) as score_against from match_points group by participant_id,group_key
  ), ranked as (
    select participant_id,row_number() over(partition by group_key order by points desc,(score_for-score_against) desc,score_for desc,participant_id) as group_rank from totals
  ) update public.tournament_participants tp set group_rank=ranked.group_rank,qualified_for_knockout=(ranked.group_rank<=2)
    from ranked where tp.id=ranked.participant_id;
  update public.tournament_participants set is_eliminated=not qualified_for_knockout,eliminated_at=case when qualified_for_knockout then null else now() end,eliminated_round=case when qualified_for_knockout then null else 1 end where tournament_id=p_tournament_id and registration_status='registered';
  select array_agg(id order by case when group_rank=1 then 0 else 1 end,case when group_rank=1 then group_key end asc,case when group_rank=2 then group_key end desc)
    into v_qualifiers from public.tournament_participants where tournament_id=p_tournament_id and qualified_for_knockout=true and registration_status='registered';
  if coalesce(array_length(v_qualifiers,1),0)<4 or array_length(v_qualifiers,1)%2<>0 then raise exception 'Each group must contribute two eligible qualifiers'; end if;
  select array_agg(tm.id order by tm.created_at,tm.id) into v_match_ids from public.tournament_matches tm join public.tournament_rounds tr on tr.id=tm.tournament_round_id where tr.tournament_id=p_tournament_id and tr.round_number=2;
  if coalesce(array_length(v_match_ids,1),0)<>array_length(v_qualifiers,1)/2 then raise exception 'Knockout bracket slots do not match the qualified participant count'; end if;
  for v_i in 1..array_length(v_match_ids,1) loop
    update public.tournament_matches set participant_a_id=v_qualifiers[(v_i*2)-1],participant_b_id=v_qualifiers[v_i*2] where id=v_match_ids[v_i] and status='scheduled' and participant_a_id is null and participant_b_id is null;
  end loop;
  get diagnostics v_count=row_count;
  return array_length(v_qualifiers,1);
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
    if exists(select 1 from public.tournament_matches tm join public.tournament_rounds tr on tr.id=tm.tournament_round_id where tr.tournament_id=p_tournament_id and tm.status not in ('completed','walkover','cancelled')) then raise exception 'Resolve all scheduled matches before completing the tournament'; end if;
    if v_t.format='group_stage_knockout' and exists(select 1 from public.tournament_matches tm join public.tournament_rounds tr on tr.id=tm.tournament_round_id where tr.tournament_id=p_tournament_id and tr.round_number>1 and tm.participant_a_id is null) then raise exception 'Complete group qualification and populate the knockout bracket first'; end if;
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

create or replace function public.record_tournament_match_result(p_match_id uuid,p_outcome text,p_a_score numeric default null,p_b_score numeric default null,p_reason text default null)
returns public.tournament_match_results language plpgsql security definer set search_path = '' as $$
declare v_match public.tournament_matches%rowtype; v_round public.tournament_rounds%rowtype; v_t public.tournaments%rowtype; v_result public.tournament_match_results%rowtype; v_winner uuid; v_winner_team uuid; v_next uuid; v_slot text; v_loser uuid;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin permission required'; end if;
  if p_outcome not in ('a_wins','b_wins','draw','forfeit_a','forfeit_b','double_forfeit') then raise exception 'Invalid match outcome'; end if;
  select * into v_match from public.tournament_matches where id=p_match_id for update;
  if not found or v_match.status in ('completed','walkover','cancelled') then raise exception 'Match is not available for result entry'; end if;
  select * into v_round from public.tournament_rounds where id=v_match.tournament_round_id;
  select * into v_t from public.tournaments where id=v_round.tournament_id;
  if v_t.status<>'live' or v_match.scheduled_at is null or now()<v_match.scheduled_at then raise exception 'Match results can be recorded only after the scheduled match starts'; end if;
  if p_outcome='draw' and v_t.format in ('single_elimination','knockout','group_stage_knockout') and v_round.round_number>1 then raise exception 'Knockout matches cannot end in a draw'; end if;
  if p_outcome in ('a_wins','forfeit_b') then v_winner:=v_match.participant_a_id; v_winner_team:=v_match.team_a_id; v_loser:=v_match.participant_b_id;
  elsif p_outcome in ('b_wins','forfeit_a') then v_winner:=v_match.participant_b_id; v_winner_team:=v_match.team_b_id; v_loser:=v_match.participant_a_id; end if;
  insert into public.tournament_match_results(tournament_match_id,participant_a_score,participant_b_score,team_a_score,team_b_score,outcome,reviewed_by,reason,result_version)
    values(p_match_id,case when v_match.team_a_id is null then p_a_score else null end,case when v_match.team_b_id is null then p_b_score else null end,case when v_match.team_a_id is not null then p_a_score else null end,case when v_match.team_b_id is not null then p_b_score else null end,p_outcome,auth.uid(),left(trim(coalesce(p_reason,'')),2000),v_match.result_version) returning * into v_result;
  update public.tournament_matches set winner_participant_id=v_winner,winner_team_id=v_winner_team,status='completed',completed_at=now(),result_version=result_version+1 where id=p_match_id;
  if v_t.format in ('single_elimination','knockout','group_stage_knockout') and (v_t.format<>'group_stage_knockout' or v_round.round_number>1) then
    if v_loser is not null then update public.tournament_participants set is_eliminated=true,eliminated_at=now(),eliminated_round=v_round.round_number where id=v_loser; end if;
    if p_outcome='double_forfeit' then update public.tournament_participants set is_eliminated=true,eliminated_at=now(),eliminated_round=v_round.round_number where id in (v_match.participant_a_id,v_match.participant_b_id); end if;
  end if;
  select next_match_id,next_slot into v_next,v_slot from public.tournament_matches where id=p_match_id;
  if v_next is not null and (v_winner is not null or v_winner_team is not null) then
    if v_slot='a' then update public.tournament_matches set participant_a_id=v_winner,team_a_id=v_winner_team where id=v_next and status='scheduled' and participant_a_id is null and team_a_id is null;
    else update public.tournament_matches set participant_b_id=v_winner,team_b_id=v_winner_team where id=v_next and status='scheduled' and participant_b_id is null and team_b_id is null; end if;
  end if;
  insert into public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'tournament.match.result_recorded','tournament_match',p_match_id,jsonb_build_object('outcome',p_outcome,'score_a',p_a_score,'score_b',p_b_score,'reason',left(trim(coalesce(p_reason,'')),2000)));
  return v_result;
end;
$$;

create or replace function public.finalize_tournament_standings(p_tournament_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_t public.tournaments%rowtype; v_count integer; v_p record;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin permission required'; end if;
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found or v_t.status<>'completed' then raise exception 'Tournament must be completed before final standings are published'; end if;
  if exists(select 1 from public.tournament_matches tm join public.tournament_rounds tr on tr.id=tm.tournament_round_id where tr.tournament_id=p_tournament_id and tm.status not in ('completed','walkover','cancelled')) then raise exception 'All scheduled matches must be resolved'; end if;
  if v_t.format in ('round_robin','leaderboard_challenge') then
    with points as (
      select tm.participant_a_id participant_id,case when mr.outcome in ('a_wins','forfeit_b') then 3 when mr.outcome='draw' then 1 else 0 end pts,coalesce(mr.participant_a_score,0) sf,coalesce(mr.participant_b_score,0) sa
      from public.tournament_matches tm join public.tournament_rounds tr on tr.id=tm.tournament_round_id join public.tournament_match_results mr on mr.tournament_match_id=tm.id where tr.tournament_id=p_tournament_id
      union all
      select tm.participant_b_id,case when mr.outcome in ('b_wins','forfeit_a') then 3 when mr.outcome='draw' then 1 else 0 end,coalesce(mr.participant_b_score,0),coalesce(mr.participant_a_score,0)
      from public.tournament_matches tm join public.tournament_rounds tr on tr.id=tm.tournament_round_id join public.tournament_match_results mr on mr.tournament_match_id=tm.id where tr.tournament_id=p_tournament_id
    ), totals as(select participant_id,sum(pts) pts,sum(sf) sf,sum(sa) sa from points group by participant_id), ranked as(select participant_id,row_number() over(order by pts desc,(sf-sa) desc,sf desc,participant_id) r,(sf-sa) score from totals)
    insert into public.tournament_results(tournament_id,student_id,final_rank,score,xp_awarded,published)
      select p_tournament_id,tp.student_id,r.r,r.score,0,true from ranked r join public.tournament_participants tp on tp.id=r.participant_id
      on conflict(tournament_id,student_id) do update set final_rank=excluded.final_rank,score=excluded.score,published=true;
  else
    with ranked as(select id,row_number() over(order by is_eliminated asc,eliminated_round desc nulls last,coalesce(seed,2147483647),registered_at) r from public.tournament_participants where tournament_id=p_tournament_id and registration_status='registered')
    insert into public.tournament_results(tournament_id,student_id,final_rank,score,xp_awarded,published)
      select p_tournament_id,tp.student_id,r.r,coalesce(tp.eliminated_round,v_t.round_count+1),0,true from ranked r join public.tournament_participants tp on tp.id=r.id
      on conflict(tournament_id,student_id) do update set final_rank=excluded.final_rank,score=excluded.score,published=true;
  end if;
  for v_p in select * from public.tournament_results where tournament_id=p_tournament_id and published=true loop
    if v_t.xp_reward>0 then perform public.ci_award_xp(v_p.student_id,v_t.xp_reward,'tournament',(select id from public.tournament_participants where tournament_id=p_tournament_id and student_id=v_p.student_id),'Finalized tournament reward: '||v_t.title); update public.tournament_results set xp_awarded=v_t.xp_reward where id=v_p.id; end if;
    if v_t.achievement_id is not null then perform public.ci_unlock_achievement(v_p.student_id,(select code from public.achievements where id=v_t.achievement_id)); end if;
  end loop;
  select count(*) into v_count from public.tournament_results where tournament_id=p_tournament_id and published=true;
  return v_count;
end;
$$;

revoke all on function public.advance_group_stage_to_knockout(uuid) from public,anon;
revoke all on function public.transition_tournament_status(uuid,public.tournament_status) from public,anon;
revoke all on function public.finalize_tournament_standings(uuid) from public,anon;
grant execute on function public.advance_group_stage_to_knockout(uuid) to authenticated;
grant execute on function public.transition_tournament_status(uuid,public.tournament_status) to authenticated;
grant execute on function public.finalize_tournament_standings(uuid) to authenticated;
