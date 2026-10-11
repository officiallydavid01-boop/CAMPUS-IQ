-- CampusIQ Phase 7 completion batch: student-facing team tournament participation
-- and server-generated in-app event notifications. Apply after migrations 001-026.

alter table public.tournaments
  add column if not exists team_competition_id uuid references public.competitions(id) on delete set null,
  add column if not exists participant_mode text not null default 'individual'
    check (participant_mode in ('individual','team')),
  add column if not exists team_top_n integer not null default 3 check (team_top_n > 0);

create table if not exists public.tournament_team_participants (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  team_id uuid not null references public.competition_teams(id) on delete restrict,
  seed integer,
  group_key text,
  registration_status text not null default 'registered'
    check (registration_status in ('registered','withdrawn','disqualified')),
  registered_at timestamptz not null default now(),
  unique(tournament_id, team_id)
);
create index if not exists tournament_team_participants_tournament_idx
  on public.tournament_team_participants(tournament_id, registration_status, group_key);

create table if not exists public.tournament_team_match_attempts (
  id uuid primary key default gen_random_uuid(),
  tournament_match_id uuid not null references public.tournament_matches(id) on delete cascade,
  team_id uuid not null references public.competition_teams(id) on delete restrict,
  student_id uuid not null references auth.users(id) on delete cascade,
  status public.attempt_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  score numeric(8,2),
  max_score numeric(8,2),
  accuracy numeric(6,2),
  response_time_ms integer,
  unique(tournament_match_id, student_id)
);
create table if not exists public.tournament_team_match_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.tournament_team_match_attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete restrict,
  selected_option_id uuid references public.question_options(id) on delete set null,
  selected_option_snapshot_id text,
  answer_text text,
  is_correct boolean,
  answered_at timestamptz not null default now(),
  unique(attempt_id, question_id)
);

alter table public.tournament_team_participants enable row level security;
alter table public.tournament_team_match_attempts enable row level security;
alter table public.tournament_team_match_answers enable row level security;

drop policy if exists "read own team tournament registrations" on public.tournament_team_participants;
create policy "read own team tournament registrations" on public.tournament_team_participants
  for select to authenticated using (
    public.is_staff() or exists(
      select 1 from public.competition_team_members m
      where m.team_id=tournament_team_participants.team_id and m.student_id=auth.uid() and m.status='active'
    )
  );
drop policy if exists "read own team match attempts" on public.tournament_team_match_attempts;
create policy "read own team match attempts" on public.tournament_team_match_attempts
  for select to authenticated using (student_id=auth.uid() or public.is_staff());
drop policy if exists "read own team match answers" on public.tournament_team_match_answers;
create policy "read own team match answers" on public.tournament_team_match_answers
  for select to authenticated using (exists(
    select 1 from public.tournament_team_match_attempts a
    where a.id=attempt_id and (a.student_id=auth.uid() or public.is_staff())
  ));

create or replace function public.register_team_for_tournament(p_tournament_id uuid,p_team_id uuid)
returns public.tournament_team_participants language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_t public.tournaments%rowtype; v_team public.competition_teams%rowtype; v_comp public.competitions%rowtype; v_count integer; v_row public.tournament_team_participants%rowtype;
begin
  if v_uid is null or not public.has_role('student') then raise exception 'Student authentication required'; end if;
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found or v_t.participant_mode<>'team' or v_t.tournament_published_at is null or v_t.status not in ('scheduled','registration_open') then raise exception 'Team tournament is not open for registration'; end if;
  if now()<v_t.registration_starts_at or now()>=v_t.registration_ends_at then raise exception 'Tournament registration is closed'; end if;
  select * into v_team from public.competition_teams where id=p_team_id and status='active';
  if not found then raise exception 'Active team not found'; end if;
  select * into v_comp from public.competitions where id=v_t.team_competition_id and id=v_team.competition_id;
  if not found then raise exception 'Team does not belong to the competition linked to this tournament'; end if;
  if not exists(select 1 from public.competition_team_members where team_id=p_team_id and student_id=v_uid and status='active') then raise exception 'Only active team members can register their team'; end if;
  if exists(select 1 from public.competition_team_members mine join public.competition_team_members other on other.student_id=mine.student_id and other.status='active' and other.team_id<>mine.team_id join public.tournament_team_participants tp on tp.team_id=other.team_id and tp.tournament_id=p_tournament_id and tp.registration_status='registered' where mine.team_id=p_team_id and mine.status='active') then raise exception 'A student may represent only one team in this tournament'; end if;
  if v_team.roster_locked_at is null then raise exception 'The team roster must be locked before tournament registration'; end if;
  if (select count(*) from public.competition_team_members where team_id=p_team_id and status='active') < v_comp.min_team_size then raise exception 'Team does not meet the minimum roster size'; end if;
  if v_t.department_id is not null and v_team.department_id is distinct from v_t.department_id then raise exception 'Team is outside the tournament department scope'; end if;
  if exists(select 1 from public.competition_team_members m join public.profiles p on p.id=m.student_id where m.team_id=p_team_id and m.status='active' and (
    (v_t.institution_id is not null and p.institution_id is distinct from v_t.institution_id) or
    (v_t.faculty_id is not null and p.faculty_id is distinct from v_t.faculty_id) or
    (v_t.department_id is not null and p.department_id is distinct from v_t.department_id) or
    (v_t.programme_id is not null and p.programme_id is distinct from v_t.programme_id) or
    (v_t.level_id is not null and p.level_id is distinct from v_t.level_id))) then raise exception 'Every active team member must meet the tournament academic scope'; end if;
  select count(*) into v_count from public.tournament_team_participants where tournament_id=p_tournament_id and registration_status='registered';
  if v_t.participant_limit is not null and v_count>=v_t.participant_limit and not exists(select 1 from public.tournament_team_participants where tournament_id=p_tournament_id and team_id=p_team_id and registration_status='withdrawn') then raise exception 'Tournament is full'; end if;
  insert into public.tournament_team_participants(tournament_id,team_id,registration_status)
    values(p_tournament_id,p_team_id,'registered')
    on conflict(tournament_id,team_id) do update set registration_status='registered',registered_at=now()
    where public.tournament_team_participants.registration_status='withdrawn'
    returning * into v_row;
  if v_row.id is null then select * into v_row from public.tournament_team_participants where tournament_id=p_tournament_id and team_id=p_team_id; end if;
  return v_row;
end;
$$;

create or replace function public.list_my_tournament_teams(p_tournament_id uuid)
returns table(team_id uuid,team_name text,competition_id uuid,roster_locked_at timestamptz,registered boolean)
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  return query select t.id,t.name,t.competition_id,t.roster_locked_at,
    exists(select 1 from public.tournament_team_participants tp where tp.tournament_id=p_tournament_id and tp.team_id=t.id and tp.registration_status='registered')
  from public.competition_teams t
  join public.competitions c on c.id=t.competition_id
  join public.tournaments tournament on tournament.id=p_tournament_id and tournament.team_competition_id=c.id and tournament.participant_mode='team'
  join public.competition_team_members m on m.team_id=t.id and m.student_id=v_uid and m.status='active'
  where t.status='active' order by t.created_at;
end;
$$;

-- Generates the schedule from registered teams, never from a client-supplied roster.
-- Group-stage qualification uses match points, score difference, then score-for.
create or replace function public.generate_tournament_team_matches(p_tournament_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_t public.tournaments%rowtype; v_round public.tournament_rounds%rowtype;
  v_ids uuid[]; v_match uuid; v_next uuid; v_slot text; v_n integer;
  v_i integer; v_j integer; v_group_count integer; v_count integer:=0; v_round_no integer; v_required_rounds integer;
  v_team_a uuid; v_team_b uuid; v_match_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin permission required'; end if;
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found or v_t.participant_mode<>'team' or v_t.tournament_published_at is null then raise exception 'Published team tournament required'; end if;
  if now()<v_t.registration_ends_at then raise exception 'Close registration before generating matches'; end if;
  if exists(select 1 from public.tournament_matches tm join public.tournament_rounds tr on tr.id=tm.tournament_round_id where tr.tournament_id=p_tournament_id) then raise exception 'Matches already exist'; end if;
  select array_agg(team_id order by coalesce(seed,2147483647),registered_at,team_id) into v_ids from public.tournament_team_participants where tournament_id=p_tournament_id and registration_status='registered';
  v_n:=coalesce(array_length(v_ids,1),0);
  if v_n<2 then raise exception 'At least two registered teams are required'; end if;
  if v_t.format in ('round_robin','leaderboard_challenge') then
    select * into v_round from public.tournament_rounds where tournament_id=p_tournament_id order by round_number limit 1;
    for v_i in 1..v_n loop
      for v_j in (v_i+1)..v_n loop
        insert into public.tournament_matches(tournament_round_id,team_a_id,team_b_id,status,scheduled_at)
          values(v_round.id,v_ids[v_i],v_ids[v_j],'scheduled',v_t.starts_at+make_interval(mins=>v_count*coalesce(v_t.match_duration_minutes,30))) returning id into v_match;
        v_count:=v_count+1;
      end loop;
    end loop;
    update public.tournament_rounds set status='cancelled' where tournament_id=p_tournament_id and round_number>1;
  elsif v_t.format in ('single_elimination','knockout') then
    v_required_rounds:=greatest(1,ceil(log(2,v_n::numeric))::integer);
    if v_t.round_count<v_required_rounds then raise exception 'Tournament needs at least % rounds for % teams',v_required_rounds,v_n; end if;
    update public.tournament_rounds set status='cancelled' where tournament_id=p_tournament_id and round_number>v_required_rounds;
    for v_round_no in 1..v_required_rounds loop
      select * into v_round from public.tournament_rounds where tournament_id=p_tournament_id and round_number=v_round_no;
      if v_round_no=1 then
        for v_i in 1..ceil(v_n::numeric/2)::integer loop
          insert into public.tournament_matches(tournament_round_id,team_a_id,team_b_id,status,scheduled_at)
            values(v_round.id,v_ids[(v_i*2)-1],case when v_i*2<=v_n then v_ids[v_i*2] else null end,'scheduled',v_t.starts_at+make_interval(mins=>(v_i-1)*coalesce(v_t.match_duration_minutes,30))) returning id into v_match;
          v_count:=v_count+1;
        end loop;
      else
        for v_i in 1..greatest(1,ceil(v_n::numeric/(2^v_round_no))::integer) loop
          insert into public.tournament_matches(tournament_round_id,status,scheduled_at)
            values(v_round.id,'scheduled',v_t.starts_at+make_interval(mins=>((v_round_no-1)*60+(v_i-1)*coalesce(v_t.match_duration_minutes,30)))) returning id into v_match;
          v_count:=v_count+1;
        end loop;
      end if;
    end loop;
    -- Link each match to the correct next-round slot in deterministic creation order.
    for v_round_no in 1..v_required_rounds-1 loop
      with source_rows as (
        select tm.id,row_number() over(order by tm.created_at,tm.id) rn
        from public.tournament_matches tm join public.tournament_rounds tr on tr.id=tm.tournament_round_id
        where tr.tournament_id=p_tournament_id and tr.round_number=v_round_no
      ), target_rows as (
        select tm.id,row_number() over(order by tm.created_at,tm.id) rn
        from public.tournament_matches tm join public.tournament_rounds tr on tr.id=tm.tournament_round_id
        where tr.tournament_id=p_tournament_id and tr.round_number=v_round_no+1
      )
      update public.tournament_matches src set next_match_id=tgt.id,next_slot=case when s.rn%2=1 then 'a' else 'b' end
      from source_rows s join target_rows tgt on tgt.rn=ceil(s.rn::numeric/2)
      where src.id=s.id;
    end loop;
    for v_round_no in 1..v_required_rounds loop
      for v_match in select tm.id from public.tournament_matches tm join public.tournament_rounds tr on tr.id=tm.tournament_round_id where tr.tournament_id=p_tournament_id and tr.round_number=v_round_no and tm.status='scheduled' and ((tm.team_a_id is not null and tm.team_b_id is null) or (tm.team_a_id is null and tm.team_b_id is not null)) order by tm.created_at,tm.id loop
        update public.tournament_matches set status='walkover',winner_team_id=coalesce(team_a_id,team_b_id),completed_at=now() where id=v_match;
        select next_match_id,next_slot into v_next,v_slot from public.tournament_matches where id=v_match;
        if v_next is not null then
          if v_slot='a' then update public.tournament_matches set team_a_id=(select winner_team_id from public.tournament_matches where id=v_match) where id=v_next and team_a_id is null;
          else update public.tournament_matches set team_b_id=(select winner_team_id from public.tournament_matches where id=v_match) where id=v_next and team_b_id is null; end if;
        end if;
      end loop;
    end loop;
  elsif v_t.format='group_stage_knockout' then
    if v_n<4 then raise exception 'Group stage + knockout needs at least four teams'; end if;
    v_group_count:=case when v_n<=8 then 2 else 4 end;
    v_required_rounds:=case when v_group_count=2 then 3 else 4 end;
    if v_t.round_count<v_required_rounds then raise exception 'Group stage + knockout needs at least % rounds for this team count',v_required_rounds; end if;
    update public.tournament_rounds set status='cancelled' where tournament_id=p_tournament_id and round_number>v_required_rounds;
    with ranked as(select team_id,row_number() over(order by coalesce(seed,2147483647),registered_at,team_id) rn from public.tournament_team_participants where tournament_id=p_tournament_id and registration_status='registered')
      update public.tournament_team_participants tp set group_key='Group '||chr(65+mod(r.rn-1,v_group_count)) from ranked r where tp.tournament_id=p_tournament_id and tp.team_id=r.team_id;
    select * into v_round from public.tournament_rounds where tournament_id=p_tournament_id and round_number=1;
    for v_i in 1..v_group_count loop
      for v_team_a in select a.team_id from public.tournament_team_participants a where a.tournament_id=p_tournament_id and a.registration_status='registered' and a.group_key='Group '||chr(65+v_i-1) order by a.registered_at,a.team_id loop
        for v_team_b in select b.team_id from public.tournament_team_participants b where b.tournament_id=p_tournament_id and b.registration_status='registered' and b.group_key='Group '||chr(65+v_i-1) and b.team_id>v_team_a order by b.team_id loop
          insert into public.tournament_matches(tournament_round_id,team_a_id,team_b_id,status,scheduled_at)
            values(v_round.id,v_team_a,v_team_b,'scheduled',v_t.starts_at+make_interval(mins=>v_count*coalesce(v_t.match_duration_minutes,30))) returning id into v_match_id;
          v_count:=v_count+1;
        end loop;
      end loop;
    end loop;
    for v_round_no in 2..v_required_rounds loop
      select * into v_round from public.tournament_rounds where tournament_id=p_tournament_id and round_number=v_round_no;
      for v_i in 1..greatest(1,ceil((v_group_count*2)::numeric/(2^(v_round_no-1)))::integer) loop
        insert into public.tournament_matches(tournament_round_id,status,scheduled_at)
          values(v_round.id,'scheduled',v_t.starts_at+make_interval(mins=>((v_round_no-1)*60+(v_i-1)*coalesce(v_t.match_duration_minutes,30)))) returning id into v_match;
        v_count:=v_count+1;
      end loop;
    end loop;
    for v_round_no in 2..v_required_rounds-1 loop
      with source_rows as (
        select tm.id,row_number() over(order by tm.created_at,tm.id) rn from public.tournament_matches tm join public.tournament_rounds tr on tr.id=tm.tournament_round_id where tr.tournament_id=p_tournament_id and tr.round_number=v_round_no
      ), target_rows as (
        select tm.id,row_number() over(order by tm.created_at,tm.id) rn from public.tournament_matches tm join public.tournament_rounds tr on tr.id=tm.tournament_round_id where tr.tournament_id=p_tournament_id and tr.round_number=v_round_no+1
      )
      update public.tournament_matches src set next_match_id=tgt.id,next_slot=case when s.rn%2=1 then 'a' else 'b' end from source_rows s join target_rows tgt on tgt.rn=ceil(s.rn::numeric/2) where src.id=s.id;
    end loop;
  else raise exception 'Unsupported team tournament format'; end if;
  if exists(select 1 from public.tournament_matches tm join public.tournament_rounds tr on tr.id=tm.tournament_round_id where tr.tournament_id=p_tournament_id and tm.scheduled_at>=v_t.ends_at and tm.status<>'cancelled') then raise exception 'Generated match schedule exceeds the tournament end time'; end if;
  perform set_config('campusiq.generate_matches','on',true);
  insert into public.tournament_match_questions(tournament_match_id,question_id,display_order,points,question_snapshot,snapshot_version)
    select tm.id,tq.question_id,row_number() over(partition by tm.id order by tq.display_order,tq.question_id)::integer,tq.points,tq.question_snapshot,tq.snapshot_version
    from public.tournament_matches tm join public.tournament_rounds tr on tr.id=tm.tournament_round_id cross join public.tournament_questions tq
    where tr.tournament_id=p_tournament_id and tq.tournament_id=p_tournament_id and (tm.team_a_id is not null or tm.team_b_id is not null or tm.status='scheduled');
  return v_count;
end;
$$;

create or replace function public.start_tournament_team_match_attempt(p_match_id uuid)
returns public.tournament_team_match_attempts language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_match public.tournament_matches%rowtype; v_round public.tournament_rounds%rowtype; v_t public.tournaments%rowtype; v_team uuid; v_attempt public.tournament_team_match_attempts%rowtype;
begin
  if v_uid is null or not public.has_role('student') then raise exception 'Student authentication required'; end if;
  select * into v_match from public.tournament_matches where id=p_match_id for update;
  if not found or (v_match.team_a_id is null and v_match.team_b_id is null) then raise exception 'Team match not found'; end if;
  if v_match.status not in ('scheduled','in_progress') then raise exception 'Match is not accepting attempts'; end if;
  select * into v_round from public.tournament_rounds where id=v_match.tournament_round_id;
  select * into v_t from public.tournaments where id=v_round.tournament_id;
  if v_t.participant_mode<>'team' or v_t.status<>'live' then raise exception 'Team tournament is not live'; end if;
  if v_match.scheduled_at is null or now()<v_match.scheduled_at or now()>=least(v_t.ends_at,v_match.scheduled_at+make_interval(mins=>coalesce(v_t.match_duration_minutes,30))) then raise exception 'Match is outside its scheduled live window'; end if;
  select m.team_id into v_team from public.competition_team_members m where m.student_id=v_uid and m.status='active' and m.team_id in (v_match.team_a_id,v_match.team_b_id) limit 1;
  if v_team is null then raise exception 'Only active members of either match team may participate'; end if;
  select * into v_attempt from public.tournament_team_match_attempts where tournament_match_id=p_match_id and student_id=v_uid for update;
  if found then return v_attempt; end if;
  update public.tournament_matches set status='in_progress',started_at=coalesce(started_at,now()) where id=p_match_id and status='scheduled';
  insert into public.tournament_team_match_attempts(tournament_match_id,team_id,student_id,status) values(p_match_id,v_team,v_uid,'in_progress') returning * into v_attempt;
  return v_attempt;
end;
$$;

create or replace function public.get_tournament_team_match_attempt_questions(p_attempt_id uuid)
returns table(question_id uuid,display_order integer,prompt text,question_type public.question_type,points numeric,options jsonb)
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_attempt public.tournament_team_match_attempts%rowtype; v_match public.tournament_matches%rowtype; v_round public.tournament_rounds%rowtype; v_t public.tournaments%rowtype;
begin
  select * into v_attempt from public.tournament_team_match_attempts where id=p_attempt_id and student_id=v_uid and status='in_progress';
  if v_uid is null or not found then raise exception 'Active team attempt not found'; end if;
  select * into v_match from public.tournament_matches where id=v_attempt.tournament_match_id;
  select * into v_round from public.tournament_rounds where id=v_match.tournament_round_id;
  select * into v_t from public.tournaments where id=v_round.tournament_id;
  if v_t.status<>'live' or now()>=least(v_t.ends_at,v_match.scheduled_at+make_interval(mins=>coalesce(v_t.match_duration_minutes,30))) then raise exception 'Match deadline passed'; end if;
  return query select q.question_id,q.display_order,q.question_snapshot->>'prompt',(q.question_snapshot->>'question_type')::public.question_type,q.points,
    coalesce((select jsonb_agg(jsonb_build_object('id',o->>'id','text',o->>'text') order by o->>'id') from jsonb_array_elements(q.question_snapshot->'options') o),'[]'::jsonb)
    from public.tournament_match_questions q where q.tournament_match_id=v_match.id and q.question_snapshot is not null order by q.display_order;
end;
$$;

create or replace function public.get_tournament_team_match_attempt_answers(p_attempt_id uuid)
returns table(question_id uuid,selected_option_id text,answer_text text)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.tournament_team_match_attempts where id=p_attempt_id and student_id=auth.uid() and status='in_progress') then raise exception 'Active team attempt not found'; end if;
  return query select a.question_id,coalesce(a.selected_option_snapshot_id,a.selected_option_id::text),a.answer_text from public.tournament_team_match_answers a where a.attempt_id=p_attempt_id;
end;
$$;

create or replace function public.save_tournament_team_match_answer(p_attempt_id uuid,p_question_id uuid,p_selected_option_id uuid default null,p_answer_text text default null)
returns public.tournament_team_match_answers language plpgsql security definer set search_path = '' as $$
declare v_attempt public.tournament_team_match_attempts%rowtype; v_match public.tournament_matches%rowtype; v_round public.tournament_rounds%rowtype; v_t public.tournaments%rowtype; v_question public.tournament_match_questions%rowtype; v_answer public.tournament_team_match_answers%rowtype;
begin
  select * into v_attempt from public.tournament_team_match_attempts where id=p_attempt_id and student_id=auth.uid() for update;
  if auth.uid() is null or not found or v_attempt.status<>'in_progress' then raise exception 'Active team attempt not found'; end if;
  select * into v_match from public.tournament_matches where id=v_attempt.tournament_match_id;
  select * into v_round from public.tournament_rounds where id=v_match.tournament_round_id;
  select * into v_t from public.tournaments where id=v_round.tournament_id;
  if v_t.status<>'live' or now()>=least(v_t.ends_at,v_match.scheduled_at+make_interval(mins=>coalesce(v_t.match_duration_minutes,30))) then raise exception 'Match deadline passed'; end if;
  select * into v_question from public.tournament_match_questions where tournament_match_id=v_match.id and question_id=p_question_id and question_snapshot is not null;
  if not found then raise exception 'Question is not part of this frozen match'; end if;
  if v_question.question_snapshot->>'question_type' in ('multiple_choice','true_false') then
    if p_selected_option_id is null or not exists(select 1 from jsonb_array_elements(v_question.question_snapshot->'options') o where o->>'id'=p_selected_option_id::text) then raise exception 'Choose a valid option'; end if;
  elsif p_selected_option_id is not null then raise exception 'This question expects a text answer'; end if;
  insert into public.tournament_team_match_answers(attempt_id,question_id,selected_option_id,selected_option_snapshot_id,answer_text)
  values(p_attempt_id,p_question_id,p_selected_option_id,p_selected_option_id::text,left(p_answer_text,4000))
  on conflict(attempt_id,question_id) do update set selected_option_id=excluded.selected_option_id,selected_option_snapshot_id=excluded.selected_option_snapshot_id,answer_text=excluded.answer_text,is_correct=null,answered_at=now()
  returning * into v_answer;
  return v_answer;
end;
$$;

create or replace function public.ci_complete_tournament_team_match(p_match_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_match public.tournament_matches%rowtype; v_round public.tournament_rounds%rowtype; v_t public.tournaments%rowtype; v_a numeric(8,2); v_b numeric(8,2); v_max_a numeric(8,2); v_max_b numeric(8,2); v_winner uuid; v_next uuid; v_slot text; v_top integer; v_member record;
begin
  select * into v_match from public.tournament_matches where id=p_match_id for update;
  if not found or v_match.team_a_id is null or v_match.team_b_id is null then return false; end if;
  select * into v_round from public.tournament_rounds where id=v_match.tournament_round_id;
  select * into v_t from public.tournaments where id=v_round.tournament_id;
  if exists(select 1 from public.competition_team_members m where m.status='active' and m.team_id in (v_match.team_a_id,v_match.team_b_id)
    and not exists(select 1 from public.tournament_team_match_attempts a where a.tournament_match_id=p_match_id and a.student_id=m.student_id and a.status='graded')) then return false; end if;
  v_top:=greatest(1,coalesce(v_t.team_top_n,3));
  select coalesce(sum(score),0),coalesce(sum(max_score),0) into v_a,v_max_a from (select a.score,a.max_score from public.tournament_team_match_attempts a where a.tournament_match_id=p_match_id and a.team_id=v_match.team_a_id and a.status='graded' order by a.score desc,a.response_time_ms asc limit v_top) s;
  select coalesce(sum(score),0),coalesce(sum(max_score),0) into v_b,v_max_b from (select a.score,a.max_score from public.tournament_team_match_attempts a where a.tournament_match_id=p_match_id and a.team_id=v_match.team_b_id and a.status='graded' order by a.score desc,a.response_time_ms asc limit v_top) s;
  if v_a=v_b and not (v_t.format in ('round_robin','leaderboard_challenge') or (v_t.format='group_stage_knockout' and v_round.round_number=1)) then return false; end if;
  v_winner:=case when v_a>v_b then v_match.team_a_id when v_b>v_a then v_match.team_b_id else null end;
  insert into public.tournament_match_results(tournament_match_id,team_a_score,team_b_score,outcome,reason,result_version)
    values(p_match_id,v_a,v_b,case when v_a>v_b then 'a_wins' when v_b>v_a then 'b_wins' else 'draw' end,'Server-scored from team members; sum of top '||v_top||' individual scores',v_match.result_version)
    on conflict(tournament_match_id) do update set team_a_score=excluded.team_a_score,team_b_score=excluded.team_b_score,outcome=excluded.outcome,reason=excluded.reason,result_version=excluded.result_version;
  update public.tournament_matches set status='completed',completed_at=now(),winner_team_id=v_winner,result_version=result_version+1 where id=p_match_id;
  select next_match_id,next_slot into v_next,v_slot from public.tournament_matches where id=p_match_id;
  if v_next is not null and v_winner is not null then
    if v_slot='a' then update public.tournament_matches set team_a_id=v_winner where id=v_next and team_a_id is null and status='scheduled';
    else update public.tournament_matches set team_b_id=v_winner where id=v_next and team_b_id is null and status='scheduled'; end if;
  end if;
  for v_member in select m.student_id from public.competition_team_members m where m.team_id in (v_match.team_a_id,v_match.team_b_id) and m.status='active' loop
    perform public.ci_notify_student(v_member.student_id,'tournament_update','Team match completed','Your team match result is available.','tournament_match',p_match_id);
  end loop;
  return true;
end;
$$;

create or replace function public.submit_tournament_team_match_attempt(p_attempt_id uuid)
returns public.tournament_team_match_attempts language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_attempt public.tournament_team_match_attempts%rowtype; v_match public.tournament_matches%rowtype; v_round public.tournament_rounds%rowtype; v_t public.tournaments%rowtype; q record; a public.tournament_team_match_answers%rowtype; v_score numeric(8,2):=0; v_max numeric(8,2):=0; v_correct integer:=0; v_total integer:=0; v_ok boolean;
begin
  select * into v_attempt from public.tournament_team_match_attempts where id=p_attempt_id and student_id=v_uid for update;
  if v_uid is null or not found then raise exception 'Team match attempt not found'; end if;
  if v_attempt.status='graded' then return v_attempt; end if;
  if v_attempt.status<>'in_progress' then raise exception 'Attempt cannot be submitted'; end if;
  select * into v_match from public.tournament_matches where id=v_attempt.tournament_match_id;
  select * into v_round from public.tournament_rounds where id=v_match.tournament_round_id;
  select * into v_t from public.tournaments where id=v_round.tournament_id;
  if v_t.status<>'live' or v_match.status not in ('scheduled','in_progress') then raise exception 'Match is no longer live'; end if;
  for q in select question_id,question_snapshot,points from public.tournament_match_questions where tournament_match_id=v_match.id and question_snapshot is not null order by display_order loop
    v_total:=v_total+1; v_max:=v_max+q.points; v_ok:=false;
    select * into a from public.tournament_team_match_answers where attempt_id=p_attempt_id and question_id=q.question_id;
    if found then
      if q.question_snapshot->>'question_type' in ('multiple_choice','true_false') then
        select coalesce((o->>'is_correct')::boolean,false) into v_ok from jsonb_array_elements(q.question_snapshot->'options') o where o->>'id'=coalesce(a.selected_option_snapshot_id,a.selected_option_id::text) limit 1;
      elsif q.question_snapshot->>'question_type'='numerical' then
        begin v_ok:=trim(coalesce(a.answer_text,''))::numeric=trim(coalesce(q.question_snapshot->>'correct_answer_text',''))::numeric; exception when others then v_ok:=false; end;
      else v_ok:=regexp_replace(lower(trim(coalesce(a.answer_text,''))), '\s+', ' ', 'g')=regexp_replace(lower(trim(coalesce(q.question_snapshot->>'correct_answer_text',''))), '\s+', ' ', 'g') and trim(coalesce(a.answer_text,''))<>''; end if;
      update public.tournament_team_match_answers set is_correct=coalesce(v_ok,false) where id=a.id;
    end if;
    if coalesce(v_ok,false) then v_correct:=v_correct+1; v_score:=v_score+q.points; end if;
  end loop;
  update public.tournament_team_match_attempts set status='graded',submitted_at=now(),score=v_score,max_score=v_max,accuracy=case when v_total>0 then round(v_correct::numeric/v_total*100,2) else 0 end,response_time_ms=greatest(0,least(2147483647,(extract(epoch from (now()-started_at)*1000)::bigint)))::integer where id=p_attempt_id returning * into v_attempt;
  perform public.ci_complete_tournament_team_match(v_attempt.tournament_match_id);
  return v_attempt;
end;
$$;

-- Qualify top two teams per group using verified server-recorded team results.
create or replace function public.advance_team_group_stage_to_knockout(p_tournament_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_t public.tournaments%rowtype; v_teams uuid[]; v_matches uuid[]; i integer; v_count integer:=0; v_group_count integer;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin permission required'; end if;
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found or v_t.participant_mode<>'team' or v_t.format<>'group_stage_knockout' then raise exception 'Team group-stage tournament required'; end if;
  if exists(select 1 from public.tournament_matches tm join public.tournament_rounds tr on tr.id=tm.tournament_round_id where tr.tournament_id=p_tournament_id and tr.round_number=1 and tm.status not in ('completed','walkover')) then raise exception 'Complete every group-stage match first'; end if;
  with points as (
    select tm.team_a_id team_id,tp.group_key,case when mr.outcome='a_wins' then 3 when mr.outcome='draw' then 1 else 0 end pts,coalesce(mr.team_a_score,0) sf,coalesce(mr.team_b_score,0) sa
    from public.tournament_matches tm join public.tournament_rounds tr on tr.id=tm.tournament_round_id join public.tournament_match_results mr on mr.tournament_match_id=tm.id join public.tournament_team_participants tp on tp.tournament_id=p_tournament_id and tp.team_id=tm.team_a_id where tr.tournament_id=p_tournament_id and tr.round_number=1
    union all
    select tm.team_b_id,tp.group_key,case when mr.outcome='b_wins' then 3 when mr.outcome='draw' then 1 else 0 end,coalesce(mr.team_b_score,0),coalesce(mr.team_a_score,0)
    from public.tournament_matches tm join public.tournament_rounds tr on tr.id=tm.tournament_round_id join public.tournament_match_results mr on mr.tournament_match_id=tm.id join public.tournament_team_participants tp on tp.tournament_id=p_tournament_id and tp.team_id=tm.team_b_id where tr.tournament_id=p_tournament_id and tr.round_number=1
  ), totals as(select team_id,group_key,sum(pts) pts,sum(sf-sa) diff,sum(sf) sf from points group by team_id,group_key), ranked as(select team_id,group_key,row_number() over(partition by group_key order by pts desc,diff desc,sf desc,team_id) rn from totals)
  update public.tournament_team_participants tp set seed=ranked.rn from ranked where tp.tournament_id=p_tournament_id and tp.team_id=ranked.team_id;
  select array_agg(team_id order by group_key,seed,team_id) into v_teams from public.tournament_team_participants where tournament_id=p_tournament_id and registration_status='registered' and seed<=2;
  if coalesce(array_length(v_teams,1),0)<4 or array_length(v_teams,1)%2<>0 then raise exception 'Each group must produce two valid qualifiers'; end if;
  select array_agg(tm.id order by tm.created_at,tm.id) into v_matches from public.tournament_matches tm join public.tournament_rounds tr on tr.id=tm.tournament_round_id where tr.tournament_id=p_tournament_id and tr.round_number=2;
  if coalesce(array_length(v_matches,1),0)<>array_length(v_teams,1)/2 then raise exception 'Knockout bracket slots do not match qualifier count'; end if;
  for i in 1..array_length(v_matches,1) loop update public.tournament_matches set team_a_id=v_teams[i*2-1],team_b_id=v_teams[i*2] where id=v_matches[i] and status='scheduled' and team_a_id is null and team_b_id is null; v_count:=v_count+1; end loop;
  return v_count*2;
end;
$$;

-- Notification preferences are respected. These are in-app notifications only;
-- email, web push and WhatsApp delivery require separate providers and setup.
create or replace function public.ci_notify_student(p_student_id uuid,p_type public.notification_type,p_title text,p_body text,p_related_type text default null,p_related_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_pref public.notification_preferences%rowtype; v_enabled boolean:=true;
begin
  if p_student_id is null then return; end if;
  select * into v_pref from public.notification_preferences where student_id=p_student_id;
  if found then
    v_enabled:=case p_type
      when 'competition_start' then v_pref.competition_updates
      when 'tournament_update' then v_pref.tournament_updates
      when 'achievement' then v_pref.achievement_alerts
      when 'streak' then v_pref.streak_alerts
      when 'deadline' then v_pref.deadlines
      when 'announcement' then v_pref.announcements
      when 'exam_reminder' then v_pref.exam_reminders
      when 'course_update' then v_pref.course_updates
      when 'lesson_published' then v_pref.course_updates
      else true end;
  end if;
  if v_enabled then insert into public.notifications(student_id,type,title,body,related_type,related_id) values(p_student_id,p_type,left(p_title,160),left(coalesce(p_body,''),1000),p_related_type,p_related_id); end if;
end;
$$;

create or replace function public.ci_notify_tournament_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_part record;
begin
  if new.status is distinct from old.status then
    for v_part in
      select tp.student_id from public.tournament_participants tp where tp.tournament_id=new.id and tp.registration_status='registered'
      union
      select m.student_id from public.tournament_team_participants tp join public.competition_team_members m on m.team_id=tp.team_id and m.status='active' where tp.tournament_id=new.id and tp.registration_status='registered'
    loop perform public.ci_notify_student(v_part.student_id,'tournament_update','Tournament update',new.title||' is now '||replace(new.status::text,'_',' ')||'.','tournament',new.id); end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists notify_tournament_status_change on public.tournaments;
create trigger notify_tournament_status_change after update of status on public.tournaments for each row execute function public.ci_notify_tournament_status();

create or replace function public.ci_notify_competition_result()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.published=true then
    if tg_op='INSERT' then
      perform public.ci_notify_student(new.student_id,'result','Competition result available','Your competition result is available to review.','competition_result',new.id);
    elsif old.published is distinct from new.published or old.result_version is distinct from new.result_version then
      perform public.ci_notify_student(new.student_id,'result','Competition result updated','Your competition result has been updated.','competition_result',new.id);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists notify_competition_result on public.competition_results;
create trigger notify_competition_result after insert or update of published,result_version on public.competition_results for each row execute function public.ci_notify_competition_result();

-- Do not let authenticated clients call internal scoring/notification helpers.
revoke all on function public.ci_complete_tournament_team_match(uuid) from public,anon,authenticated;
revoke all on function public.ci_notify_student(uuid,public.notification_type,text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.ci_notify_tournament_status() from public,anon,authenticated;
revoke all on function public.ci_notify_competition_result() from public,anon,authenticated;
revoke all on function public.register_team_for_tournament(uuid,uuid) from public,anon;
revoke all on function public.list_my_tournament_teams(uuid) from public,anon;
revoke all on function public.generate_tournament_team_matches(uuid) from public,anon;
revoke all on function public.start_tournament_team_match_attempt(uuid) from public,anon;
revoke all on function public.get_tournament_team_match_attempt_questions(uuid) from public,anon;
revoke all on function public.get_tournament_team_match_attempt_answers(uuid) from public,anon;
revoke all on function public.save_tournament_team_match_answer(uuid,uuid,uuid,text) from public,anon;
revoke all on function public.submit_tournament_team_match_attempt(uuid) from public,anon;
revoke all on function public.advance_team_group_stage_to_knockout(uuid) from public,anon;
grant execute on function public.register_team_for_tournament(uuid,uuid) to authenticated;
grant execute on function public.list_my_tournament_teams(uuid) to authenticated;
grant execute on function public.generate_tournament_team_matches(uuid) to authenticated;
grant execute on function public.start_tournament_team_match_attempt(uuid) to authenticated;
grant execute on function public.get_tournament_team_match_attempt_questions(uuid) to authenticated;
grant execute on function public.get_tournament_team_match_attempt_answers(uuid) to authenticated;
grant execute on function public.save_tournament_team_match_answer(uuid,uuid,uuid,text) to authenticated;
grant execute on function public.submit_tournament_team_match_attempt(uuid) to authenticated;
grant execute on function public.advance_team_group_stage_to_knockout(uuid) to authenticated;

-- Cross-check participant mode at the database boundary, not just in the UI.
create or replace function public.ci_guard_tournament_participant_mode()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_mode text;
begin
  select participant_mode into v_mode from public.tournaments where id=new.tournament_id;
  if v_mode='team' then raise exception 'This tournament accepts team registrations, not individual registrations'; end if;
  return new;
end;
$$;
drop trigger if exists guard_tournament_participant_mode on public.tournament_participants;
create trigger guard_tournament_participant_mode before insert or update of tournament_id on public.tournament_participants for each row execute function public.ci_guard_tournament_participant_mode();

create or replace function public.ci_guard_tournament_team_participant_mode()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_mode text;
begin
  select participant_mode into v_mode from public.tournaments where id=new.tournament_id;
  if v_mode is distinct from 'team' then raise exception 'This tournament accepts individual registrations, not team registrations'; end if;
  return new;
end;
$$;
drop trigger if exists guard_tournament_team_participant_mode on public.tournament_team_participants;
create trigger guard_tournament_team_participant_mode before insert or update of tournament_id on public.tournament_team_participants for each row execute function public.ci_guard_tournament_team_participant_mode();

create or replace function public.ci_guard_tournament_match_mode()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_mode text;
begin
  select t.participant_mode into v_mode from public.tournament_rounds r join public.tournaments t on t.id=r.tournament_id where r.id=new.tournament_round_id;
  if v_mode='team' and (new.participant_a_id is not null or new.participant_b_id is not null) then raise exception 'Team tournaments cannot contain individual participant slots'; end if;
  if v_mode='individual' and (new.team_a_id is not null or new.team_b_id is not null) then raise exception 'Individual tournaments cannot contain team slots'; end if;
  return new;
end;
$$;
drop trigger if exists guard_tournament_match_mode on public.tournament_matches;
create trigger guard_tournament_match_mode before insert or update of participant_a_id,participant_b_id,team_a_id,team_b_id,tournament_round_id on public.tournament_matches for each row execute function public.ci_guard_tournament_match_mode();

revoke all on function public.ci_guard_tournament_participant_mode() from public,anon,authenticated;
revoke all on function public.ci_guard_tournament_team_participant_mode() from public,anon,authenticated;
revoke all on function public.ci_guard_tournament_match_mode() from public,anon,authenticated;

create or replace function public.finalize_team_tournament_standings(p_tournament_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_t public.tournaments%rowtype; v_count integer; v_row record; v_reward integer;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin permission required'; end if;
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found or v_t.participant_mode<>'team' or v_t.status<>'completed' then raise exception 'Completed team tournament required'; end if;
  if exists(select 1 from public.tournament_matches tm join public.tournament_rounds tr on tr.id=tm.tournament_round_id where tr.tournament_id=p_tournament_id and tm.status not in ('completed','walkover','cancelled')) then raise exception 'All scheduled matches must be resolved'; end if;
  with match_points as (
    select tm.team_a_id team_id,case when mr.outcome in ('a_wins','forfeit_b') then 3 when mr.outcome='draw' then 1 else 0 end pts,coalesce(mr.team_a_score,0) sf,coalesce(mr.team_b_score,0) sa,tr.round_number
    from public.tournament_matches tm join public.tournament_rounds tr on tr.id=tm.tournament_round_id join public.tournament_match_results mr on mr.tournament_match_id=tm.id where tr.tournament_id=p_tournament_id and tm.team_a_id is not null
    union all
    select tm.team_b_id,case when mr.outcome in ('b_wins','forfeit_a') then 3 when mr.outcome='draw' then 1 else 0 end,coalesce(mr.team_b_score,0),coalesce(mr.team_a_score,0),tr.round_number
    from public.tournament_matches tm join public.tournament_rounds tr on tr.id=tm.tournament_round_id join public.tournament_match_results mr on mr.tournament_match_id=tm.id where tr.tournament_id=p_tournament_id and tm.team_b_id is not null
  ), totals as(select team_id,sum(pts) pts,sum(sf) sf,sum(sa) sa,max(round_number) max_round from match_points group by team_id), ranked as(
    select tp.team_id,row_number() over(order by coalesce(t.pts,0) desc,coalesce(t.max_round,0) desc,(coalesce(t.sf,0)-coalesce(t.sa,0)) desc,coalesce(t.sf,0) desc,tp.team_id) final_rank,coalesce(t.sf,0)-coalesce(t.sa,0) score
    from public.tournament_team_participants tp left join totals t on t.team_id=tp.team_id where tp.tournament_id=p_tournament_id and tp.registration_status='registered'
  )
  insert into public.tournament_results(tournament_id,student_id,final_rank,score,xp_awarded,published)
  select p_tournament_id,m.student_id,r.final_rank,r.score,0,true
  from ranked r join public.competition_team_members m on m.team_id=r.team_id and m.status='active'
  on conflict(tournament_id,student_id) do update set final_rank=excluded.final_rank,score=excluded.score,published=true;
  for v_row in
    select tr.id,tr.student_id,tp.id team_participant_id from public.tournament_results tr
    join public.competition_team_members m on m.student_id=tr.student_id and m.status='active'
    join public.tournament_team_participants tp on tp.team_id=m.team_id and tp.tournament_id=tr.tournament_id and tp.registration_status='registered'
    where tr.tournament_id=p_tournament_id and tr.published=true
  loop
    if v_t.xp_reward>0 then
      perform public.ci_award_xp(v_row.student_id,v_t.xp_reward,'tournament',v_row.team_participant_id,'Finalized team tournament reward: '||v_t.title);
      update public.tournament_results set xp_awarded=v_t.xp_reward where id=v_row.id;
    end if;
    if v_t.achievement_id is not null then perform public.ci_unlock_achievement(v_row.student_id,(select code from public.achievements where id=v_t.achievement_id)); end if;
  end loop;
  select count(*) into v_count from public.tournament_results where tournament_id=p_tournament_id and published=true;
  return v_count;
end;
$$;

create or replace function public.ci_notify_competition_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_row record; v_type public.notification_type;
begin
  if new.status is distinct from old.status then
    v_type:=case when new.status::text='live' then 'competition_start'::public.notification_type else 'tournament_update'::public.notification_type end;
    for v_row in
      select cp.student_id from public.competition_participants cp where cp.competition_id=new.id and cp.registration_status='registered'
      union
      select m.student_id from public.competition_teams t join public.competition_team_members m on m.team_id=t.id and m.status='active' where t.competition_id=new.id and t.status='active'
    loop perform public.ci_notify_student(v_row.student_id,v_type,'Competition update',new.title||' is now '||replace(new.status::text,'_',' ')||'.','competition',new.id); end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists notify_competition_status_change on public.competitions;
create trigger notify_competition_status_change after update of status on public.competitions for each row execute function public.ci_notify_competition_status();

create or replace function public.ci_notify_team_invitation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_team public.competition_teams%rowtype;
begin
  if new.status='invited' then
    if tg_op='INSERT' then
      select * into v_team from public.competition_teams where id=new.team_id;
      perform public.ci_notify_student(new.student_id,'competition_start','Team invitation', 'You have been invited to join '||v_team.name||'.','competition_team',v_team.id);
    elsif old.status is distinct from new.status then
      select * into v_team from public.competition_teams where id=new.team_id;
      perform public.ci_notify_student(new.student_id,'competition_start','Team invitation', 'You have been invited to join '||v_team.name||'.','competition_team',v_team.id);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists notify_competition_team_invitation on public.competition_team_members;
create trigger notify_competition_team_invitation after insert or update of status on public.competition_team_members for each row execute function public.ci_notify_team_invitation();

create or replace function public.ci_notify_achievement_unlocked()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_title text;
begin
  select title into v_title from public.achievements where id=new.achievement_id;
  perform public.ci_notify_student(new.student_id,'achievement','Achievement unlocked',coalesce(v_title,'A new achievement is yours.'),'achievement',new.achievement_id);
  return new;
end;
$$;
drop trigger if exists notify_achievement_unlocked on public.user_achievements;
create trigger notify_achievement_unlocked after insert on public.user_achievements for each row execute function public.ci_notify_achievement_unlocked();

revoke all on function public.finalize_team_tournament_standings(uuid) from public,anon;
revoke all on function public.ci_notify_competition_status() from public,anon,authenticated;
revoke all on function public.ci_notify_team_invitation() from public,anon,authenticated;
revoke all on function public.ci_notify_achievement_unlocked() from public,anon,authenticated;
grant execute on function public.finalize_team_tournament_standings(uuid) to authenticated;

create or replace function public.ci_guard_tournament_mode_config()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_comp_type text;
begin
  if new.participant_mode='team' then
    if new.team_competition_id is null then raise exception 'Team tournaments require a linked team competition'; end if;
    select competition_type::text into v_comp_type from public.competitions where id=new.team_competition_id;
    if v_comp_type is distinct from 'team' then raise exception 'Linked competition must use team participation'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_tournament_mode_config on public.tournaments;
create trigger guard_tournament_mode_config before insert or update of participant_mode,team_competition_id on public.tournaments for each row execute function public.ci_guard_tournament_mode_config();
revoke all on function public.ci_guard_tournament_mode_config() from public,anon,authenticated;
