-- CampusIQ Phase 6: secure gamification engine
-- Activity is verified against authoritative records before XP, streaks,
-- quest progress, or achievements can change. Browser-supplied amounts are never accepted.

create table if not exists public.gamification_events (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  activity_type text not null check (activity_type in ('lesson_completion','practice_session','mock_exam')),
  source_id uuid not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (student_id, activity_type, source_id)
);

create index if not exists idx_xp_transactions_student_created
  on public.xp_transactions(student_id, created_at desc);
create unique index if not exists uq_xp_source_event
  on public.xp_transactions(student_id, source, source_id)
  where source_id is not null;
create index if not exists idx_quest_progress_student_period
  on public.quest_progress(student_id, period_start desc);

alter table public.quests drop constraint if exists quests_target_type_supported;
alter table public.quests add constraint quests_target_type_supported
  check (target_type in ('lessons_completed','practice_sessions','questions_answered','exams_completed'));

-- Admin-configurable achievement conditions, while keeping reward issuance server-side.
alter table public.achievements add column if not exists condition_type text not null default 'manual';
alter table public.achievements add column if not exists condition_target integer not null default 1 check (condition_target > 0);
alter table public.achievements drop constraint if exists achievements_condition_type_supported;
alter table public.achievements add constraint achievements_condition_type_supported
  check (condition_type in ('manual','lessons_completed','practice_sessions','questions_answered','exams_completed','perfect_exam','streak_days'));
update public.achievements set condition_type = case code
  when 'first_lesson' then 'lessons_completed'
  when 'ten_lessons' then 'lessons_completed'
  when 'first_exam' then 'exams_completed'
  when 'hundred_questions' then 'questions_answered'
  when 'perfect_score' then 'perfect_exam'
  when 'seven_day_streak' then 'streak_days'
  else 'manual' end,
  condition_target = case code when 'ten_lessons' then 10 when 'hundred_questions' then 100 when 'seven_day_streak' then 7 else 1 end;
update public.achievements set description = 'Answer 100 practice questions.' where code = 'hundred_questions';


alter table public.gamification_events enable row level security;
create policy "read own gamification events" on public.gamification_events
  for select using (student_id = auth.uid() or public.is_staff());
-- No client INSERT/UPDATE/DELETE policy: only SECURITY DEFINER functions may write events.

-- The existing guard normally prevents students changing xp_awarded. The
-- narrowly-scoped transaction-local flag is set only by the verified RPC above.
create or replace function public.protect_lesson_progress_xp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() and current_setting('campusiq.award_lesson_xp', true) is distinct from 'on' then
    new.xp_awarded := old.xp_awarded;
  end if;
  return new;
end;
$$;

-- Students may no longer manufacture completion timestamps via direct table writes.
drop policy if exists "student writes own lesson_progress" on public.lesson_progress;
drop policy if exists "student updates own lesson_progress" on public.lesson_progress;
create policy "staff writes lesson_progress" on public.lesson_progress for insert with check (public.is_staff());
create policy "staff updates lesson_progress" on public.lesson_progress for update using (public.is_staff()) with check (public.is_staff());

create or replace function public.complete_lesson(p_lesson_id uuid)
returns public.lesson_progress
language plpgsql security definer set search_path = public as $$
declare v_student uuid := auth.uid(); v_progress public.lesson_progress%rowtype; v_course_id uuid;
begin
  if v_student is null then raise exception 'Authentication required'; end if;
  select ct.course_id into v_course_id
    from public.lessons l join public.course_topics ct on ct.id = l.topic_id
    where l.id = p_lesson_id and l.status = 'published' and ct.status = 'published';
  if v_course_id is null then raise exception 'Published lesson not found'; end if;
  if not exists (
    select 1 from public.course_enrollments ce join public.course_offerings co on co.id = ce.course_offering_id
    where ce.student_id = v_student and ce.status = 'active' and co.status = 'published' and co.course_id = v_course_id
  ) and not public.is_staff() then raise exception 'Active course enrollment required'; end if;
  insert into public.lesson_progress(student_id, lesson_id, completed_at, xp_awarded)
    values (v_student, p_lesson_id, now(), false)
    on conflict (student_id, lesson_id) do update set completed_at = coalesce(public.lesson_progress.completed_at, now())
    returning * into v_progress;
  return v_progress;
end;
$$;
revoke all on function public.complete_lesson(uuid) from public, anon;
grant execute on function public.complete_lesson(uuid) to authenticated;

create or replace function public.ci_level_for_xp(p_total bigint)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(max(level), 1) from public.level_config where xp_required <= greatest(p_total, 0);
$$;

create or replace function public.ci_validate_level_config()
returns trigger language plpgsql set search_path = public as $$
declare v_previous bigint; v_next bigint;
begin
  if new.level = 1 and new.xp_required <> 0 then raise exception 'Level 1 must start at 0 XP'; end if;
  if new.level > 1 then
    select xp_required into v_previous from public.level_config where level = new.level - 1;
    if v_previous is not null and new.xp_required <= v_previous then raise exception 'Each level must require more XP than the previous level'; end if;
  end if;
  select xp_required into v_next from public.level_config where level = new.level + 1;
  if v_next is not null and new.xp_required >= v_next then raise exception 'A level threshold must be below the next level threshold'; end if;
  return new;
end;
$$;
create trigger validate_level_config_before_write before insert or update on public.level_config
  for each row execute function public.ci_validate_level_config();
create or replace function public.ci_prevent_level_config_delete() returns trigger language plpgsql as $$
begin raise exception 'Level configurations cannot be deleted; edit thresholds instead'; end; $$;
create trigger prevent_level_config_delete before delete on public.level_config
  for each row execute function public.ci_prevent_level_config_delete();

create or replace function public.ci_refresh_user_levels()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.user_xp ux set campusiq_level = public.ci_level_for_xp(ux.total_xp), updated_at = now();
  return null;
end;
$$;
create trigger refresh_user_levels_after_config after insert or update or delete on public.level_config
  for each statement execute function public.ci_refresh_user_levels();

create or replace function public.ci_award_xp(
  p_student_id uuid, p_amount integer, p_source public.xp_source,
  p_source_id uuid, p_note text default null
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_amount <= 0 or p_student_id is null then return false; end if;
  insert into public.xp_transactions(student_id, amount, source, source_id, note)
  values (p_student_id, p_amount, p_source, p_source_id, left(p_note, 240))
  on conflict (student_id, source, source_id) where source_id is not null do nothing;
  return found;
end;
$$;

create or replace function public.ci_unlock_achievement(p_student_id uuid, p_code text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_achievement public.achievements%rowtype; v_user_achievement uuid;
begin
  select * into v_achievement from public.achievements where code = p_code and is_active;
  if not found then return false; end if;
  insert into public.user_achievements(student_id, achievement_id)
  values (p_student_id, v_achievement.id)
  on conflict (student_id, achievement_id) do nothing
  returning id into v_user_achievement;
  if v_user_achievement is null then return false; end if;
  if v_achievement.xp_reward > 0 then
    perform public.ci_award_xp(p_student_id, v_achievement.xp_reward, 'achievement', v_user_achievement, 'Achievement: ' || v_achievement.title);
  end if;
  return true;
end;
$$;

create or replace function public.ci_evaluate_achievements(p_student_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_achievement public.achievements%rowtype; v_met boolean;
begin
  for v_achievement in select * from public.achievements where is_active and condition_type <> 'manual' loop
    v_met := false;
    if v_achievement.condition_type = 'lessons_completed' then
      select count(*) >= v_achievement.condition_target into v_met from public.lesson_progress where student_id = p_student_id and completed_at is not null;
    elsif v_achievement.condition_type = 'practice_sessions' then
      select count(*) >= v_achievement.condition_target into v_met from public.practice_sessions where student_id = p_student_id and ended_at is not null and question_count > 0;
    elsif v_achievement.condition_type = 'questions_answered' then
      select count(*) >= v_achievement.condition_target into v_met from public.practice_answers pa join public.practice_sessions ps on ps.id = pa.practice_session_id where ps.student_id = p_student_id and pa.is_correct is not null;
    elsif v_achievement.condition_type = 'exams_completed' then
      select count(*) >= v_achievement.condition_target into v_met from public.exam_attempts where student_id = p_student_id and status = 'graded';
    elsif v_achievement.condition_type = 'perfect_exam' then
      select count(*) >= v_achievement.condition_target into v_met from public.exam_attempts where student_id = p_student_id and status = 'graded' and score is not null and max_score > 0 and score >= max_score;
    elsif v_achievement.condition_type = 'streak_days' then
      select coalesce(current_streak, 0) >= v_achievement.condition_target into v_met from public.streaks where student_id = p_student_id;
    end if;
    if coalesce(v_met, false) then perform public.ci_unlock_achievement(p_student_id, v_achievement.code); end if;
  end loop;
end;
$$;

create or replace function public.ci_update_streak(p_student_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_today date := (now() at time zone 'UTC')::date; v_last date; v_current int; v_longest int;
begin
  insert into public.streaks(student_id, current_streak, longest_streak, last_activity_date)
  values (p_student_id, 0, 0, null) on conflict (student_id) do nothing;
  select last_activity_date, current_streak, longest_streak
    into v_last, v_current, v_longest from public.streaks where student_id = p_student_id for update;
  if v_last = v_today then return v_current; end if;
  if v_last = v_today - 1 then v_current := v_current + 1;
  else v_current := 1; end if;
  v_longest := greatest(v_longest, v_current);
  update public.streaks set current_streak = v_current, longest_streak = v_longest,
    last_activity_date = v_today, updated_at = now() where student_id = p_student_id;
  if v_current = 7 then
    perform public.ci_award_xp(p_student_id, coalesce((select (ps.value #>> '{}')::int from public.platform_settings ps where ps.key = 'streak_bonus_xp'), 15), 'streak_bonus',
      (select id from public.gamification_events where student_id = p_student_id order by created_at desc limit 1),
      'Seven-day learning streak');
    perform public.ci_unlock_achievement(p_student_id, 'seven_day_streak');
  end if;
  return v_current;
end;
$$;

create or replace function public.ci_update_quest_progress(
  p_student_id uuid, p_activity_type text, p_increment integer
) returns void
language plpgsql security definer set search_path = public as $$
declare v_quest public.quests%rowtype; v_period_start date; v_progress public.quest_progress%rowtype; v_add integer;
begin
  if p_increment <= 0 then return; end if;
  for v_quest in
    select * from public.quests q where q.is_active and
      ((p_activity_type = 'lesson_completion' and q.target_type = 'lessons_completed') or
       (p_activity_type = 'practice_session' and q.target_type in ('practice_sessions','questions_answered')) or
       (p_activity_type = 'mock_exam' and q.target_type = 'exams_completed'))
  loop
    v_add := p_increment;
    if p_activity_type = 'practice_session' and v_quest.target_type = 'practice_sessions' then v_add := 1; end if;
    if v_quest.period = 'daily' then v_period_start := (now() at time zone 'UTC')::date;
    else v_period_start := date_trunc('week', now() at time zone 'UTC')::date; end if;
    insert into public.quest_progress(student_id, quest_id, period_start, current_count)
      values (p_student_id, v_quest.id, v_period_start, 0)
      on conflict (student_id, quest_id, period_start) do nothing;
    select * into v_progress from public.quest_progress qp
      where qp.student_id = p_student_id and qp.quest_id = v_quest.id and qp.period_start = v_period_start for update;
    if v_progress.is_completed then continue; end if;
    update public.quest_progress set
      current_count = least(v_quest.target_count, current_count + v_add),
      is_completed = (current_count + v_add >= v_quest.target_count),
      completed_at = case when current_count + v_add >= v_quest.target_count then now() else null end
      where id = v_progress.id returning * into v_progress;
    if v_progress.is_completed and not v_progress.xp_awarded then
      update public.quest_progress set xp_awarded = true where id = v_progress.id;
      perform public.ci_award_xp(p_student_id, v_quest.xp_reward, 'quest', v_progress.id, 'Quest: ' || v_quest.title);
    end if;
  end loop;
end;
$$;

create or replace function public.record_gamification_activity(
  p_activity_type text, p_source_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := auth.uid(); v_valid boolean := false; v_increment int := 1;
  v_xp int := 0; v_streak int := 0; v_new_event uuid; v_before bigint := 0; v_after bigint := 0; v_marked boolean := false;
begin
  if v_student is null then raise exception 'Authentication required'; end if;
  if p_source_id is null then raise exception 'Activity source is required'; end if;
  if p_activity_type = 'lesson_completion' then
    select exists(select 1 from public.lesson_progress lp join public.lessons l on l.id = lp.lesson_id
      join public.course_topics ct on ct.id = l.topic_id
      where lp.student_id = v_student and lp.lesson_id = p_source_id and lp.completed_at is not null
        and l.status = 'published' and ct.status = 'published'
        and exists (select 1 from public.course_enrollments ce join public.course_offerings co on co.id = ce.course_offering_id
          where ce.student_id = v_student and ce.status = 'active' and co.status = 'published' and co.course_id = ct.course_id)) into v_valid;
    if not v_valid then raise exception 'Lesson completion could not be verified'; end if;
    perform set_config('campusiq.award_lesson_xp', 'on', true);
    update public.lesson_progress set xp_awarded = true
      where student_id = v_student and lesson_id = p_source_id and xp_awarded = false;
    v_marked := found;
    perform set_config('campusiq.award_lesson_xp', 'off', true);
    if not v_marked then
      if exists(select 1 from public.gamification_events where student_id=v_student and activity_type=p_activity_type and source_id=p_source_id) then
        return jsonb_build_object('awarded', false, 'reason', 'already_recorded');
      end if;
    end if;
    v_xp := coalesce((select (ps.value #>> '{}')::int from public.platform_settings ps where ps.key = 'default_lesson_xp'), 10);
  elsif p_activity_type = 'practice_session' then
    select coalesce(question_count, 0) into v_increment from public.practice_sessions
      where id = p_source_id and student_id = v_student and ended_at is not null;
    v_valid := found and v_increment > 0;
    if not v_valid then raise exception 'Completed practice session could not be verified'; end if;
    v_xp := least(v_increment * coalesce((select (ps.value #>> '{}')::int from public.platform_settings ps where ps.key = 'default_question_xp'), 5), 20);
  elsif p_activity_type = 'mock_exam' then
    select exists(select 1 from public.exam_attempts ea where ea.id = p_source_id and ea.student_id = v_student and ea.status = 'graded') into v_valid;
    if not v_valid then raise exception 'Graded exam attempt could not be verified'; end if;
    v_increment := 1; v_xp := coalesce((select (ps.value #>> '{}')::int from public.platform_settings ps where ps.key = 'default_exam_xp'), 20);
  else
    raise exception 'Unsupported activity type';
  end if;

  select total_xp into v_before from public.user_xp where student_id = v_student;
  v_before := coalesce(v_before, 0);
  insert into public.gamification_events(student_id, activity_type, source_id)
    values (v_student, p_activity_type, p_source_id)
    on conflict (student_id, activity_type, source_id) do nothing returning id into v_new_event;
  if v_new_event is null then return jsonb_build_object('awarded', false, 'reason', 'already_recorded'); end if;

  if p_activity_type = 'lesson_completion' then
    perform public.ci_award_xp(v_student, v_xp, 'lesson_completion', p_source_id, 'First completion of lesson');
    perform public.ci_update_quest_progress(v_student, p_activity_type, 1);
    perform public.ci_unlock_achievement(v_student, 'first_lesson');
    if (select count(*) from public.lesson_progress where student_id = v_student and completed_at is not null) >= 10 then
      perform public.ci_unlock_achievement(v_student, 'ten_lessons');
    end if;
  elsif p_activity_type = 'practice_session' then
    if public.ci_award_xp(v_student, v_xp, 'practice_session', p_source_id, 'Completed practice session') then
      update public.practice_sessions set xp_awarded = v_xp where id = p_source_id and student_id = v_student;
    end if;
    perform public.ci_update_quest_progress(v_student, p_activity_type, v_increment);
    if (select count(*) from public.practice_answers pa join public.practice_sessions ps on ps.id = pa.practice_session_id where ps.student_id = v_student and pa.is_correct is not null) >= 100 then
      perform public.ci_unlock_achievement(v_student, 'hundred_questions');
    end if;
  else
    if public.ci_award_xp(v_student, v_xp, 'mock_exam', p_source_id, 'Graded exam attempt') then
      update public.exam_attempts set xp_awarded = v_xp where id = p_source_id and student_id = v_student;
    end if;
    perform public.ci_update_quest_progress(v_student, p_activity_type, 1);
    perform public.ci_unlock_achievement(v_student, 'first_exam');
    if exists(select 1 from public.exam_attempts ea where ea.id = p_source_id and ea.score is not null and ea.max_score > 0 and ea.score >= ea.max_score) then
      perform public.ci_unlock_achievement(v_student, 'perfect_score');
    end if;
  end if;

  v_streak := public.ci_update_streak(v_student);
  perform public.ci_evaluate_achievements(v_student);
  select total_xp into v_after from public.user_xp where student_id = v_student;
  return jsonb_build_object('awarded', true, 'xp_awarded', v_xp, 'total_xp', coalesce(v_after, v_before),
    'level', public.ci_level_for_xp(coalesce(v_after, v_before)), 'current_streak', v_streak);
end;
$$;

-- Only authenticated users may invoke the activity endpoint; identity is taken from auth.uid().
revoke all on function public.record_gamification_activity(text, uuid) from public, anon;
grant execute on function public.record_gamification_activity(text, uuid) to authenticated;
revoke all on function public.ci_level_for_xp(bigint) from public, anon, authenticated;
revoke all on function public.ci_award_xp(uuid, integer, public.xp_source, uuid, text) from public, anon, authenticated;
revoke all on function public.ci_unlock_achievement(uuid, text) from public, anon, authenticated;
revoke all on function public.ci_evaluate_achievements(uuid) from public, anon, authenticated;
revoke all on function public.ci_update_streak(uuid) from public, anon, authenticated;
revoke all on function public.ci_update_quest_progress(uuid, text, integer) from public, anon, authenticated;

-- Activity rewards are platform-configurable and read by the server-side award engine.
insert into public.platform_settings(key, value, description) values
  ('default_exam_xp', '20'::jsonb, 'XP for a first-time graded exam attempt'),
  ('streak_bonus_xp', '15'::jsonb, 'Bonus XP when a student reaches a seven-day streak')
on conflict (key) do nothing;

-- Defaults are editable by Admin later through the CMS. Do not overwrite custom rows.
insert into public.quests(title, description, period, target_type, target_count, xp_reward, is_active)
values
  ('Daily learner', 'Complete one lesson today.', 'daily', 'lessons_completed', 1, 10, true),
  ('Practice makes progress', 'Finish one practice session today.', 'daily', 'practice_sessions', 1, 10, true),
  ('Question hunter', 'Answer 10 practice questions today.', 'daily', 'questions_answered', 10, 15, true),
  ('Weekly scholar', 'Complete five lessons this week.', 'weekly', 'lessons_completed', 5, 40, true),
  ('Exam ready', 'Complete two graded exams this week.', 'weekly', 'exams_completed', 2, 50, true)
on conflict do nothing;
