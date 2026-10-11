-- Phase 5 completion: transactional Admin exam creation and editing.
-- Exam configuration cannot be changed after attempts exist because doing so
-- would rewrite the meaning of historical scores.

create or replace function public.admin_create_exam(
  p_course_offering_id uuid,
  p_title text,
  p_description text,
  p_exam_type public.exam_type,
  p_duration_minutes integer,
  p_question_ids uuid[],
  p_difficulty public.difficulty_level default 'medium',
  p_attempt_limit integer default 3,
  p_available_from timestamptz default null,
  p_available_until timestamptz default null
)
returns public.exams
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_offering public.course_offerings;
  v_exam public.exams;
  v_question_count integer;
begin
  if v_user is null or not public.is_staff() then raise exception 'Staff access required'; end if;
  if nullif(trim(p_title), '') is null then raise exception 'Exam title is required'; end if;
  if p_duration_minutes is null or p_duration_minutes < 1 then raise exception 'Duration must be at least one minute'; end if;
  if p_attempt_limit is not null and p_attempt_limit < 1 then raise exception 'Attempt limit must be positive or unlimited'; end if;
  if p_available_from is not null and p_available_until is not null and p_available_until <= p_available_from then
    raise exception 'Availability end must be after availability start';
  end if;
  select * into v_offering from public.course_offerings where id = p_course_offering_id for share;
  if not found then raise exception 'Course offering not found'; end if;
  if coalesce(cardinality(p_question_ids), 0) = 0 then raise exception 'At least one question is required'; end if;
  select count(distinct q.id) into v_question_count
  from public.questions q
  where q.id = any(p_question_ids) and q.course_id = v_offering.course_id and q.status = 'published';
  if v_question_count <> cardinality(p_question_ids) then
    raise exception 'Every selected question must be published, unique, and belong to this course';
  end if;

  insert into public.exams (
    course_offering_id, title, description, exam_type, duration_minutes,
    question_count, difficulty, attempt_limit, available_from, available_until,
    status, created_by
  ) values (
    p_course_offering_id, trim(p_title), nullif(trim(coalesce(p_description, '')), ''), p_exam_type,
    p_duration_minutes, v_question_count, coalesce(p_difficulty, 'medium'), p_attempt_limit,
    p_available_from, p_available_until, 'draft', v_user
  ) returning * into v_exam;

  insert into public.exam_questions (exam_id, question_id, display_order)
  select v_exam.id, selected.question_id, selected.ordinality - 1
  from unnest(p_question_ids) with ordinality as selected(question_id, ordinality);

  return v_exam;
end;
$$;

create or replace function public.admin_update_exam(
  p_exam_id uuid,
  p_title text,
  p_description text,
  p_exam_type public.exam_type,
  p_duration_minutes integer,
  p_question_ids uuid[],
  p_difficulty public.difficulty_level default 'medium',
  p_attempt_limit integer default 3,
  p_available_from timestamptz default null,
  p_available_until timestamptz default null
)
returns public.exams
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_exam public.exams;
  v_offering public.course_offerings;
  v_question_count integer;
begin
  if v_user is null or not public.is_staff() then raise exception 'Staff access required'; end if;
  select * into v_exam from public.exams where id = p_exam_id for update;
  if not found then raise exception 'Exam not found'; end if;
  if exists (select 1 from public.exam_attempts where exam_id = p_exam_id) then
    raise exception 'Exam configuration cannot be edited after student attempts exist. Archive it and create a new version instead.';
  end if;
  if nullif(trim(p_title), '') is null then raise exception 'Exam title is required'; end if;
  if p_duration_minutes is null or p_duration_minutes < 1 then raise exception 'Duration must be at least one minute'; end if;
  if p_attempt_limit is not null and p_attempt_limit < 1 then raise exception 'Attempt limit must be positive or unlimited'; end if;
  if p_available_from is not null and p_available_until is not null and p_available_until <= p_available_from then
    raise exception 'Availability end must be after availability start';
  end if;
  select * into v_offering from public.course_offerings where id = v_exam.course_offering_id;
  if coalesce(cardinality(p_question_ids), 0) = 0 then raise exception 'At least one question is required'; end if;
  select count(distinct q.id) into v_question_count
  from public.questions q
  where q.id = any(p_question_ids) and q.course_id = v_offering.course_id and q.status = 'published';
  if v_question_count <> cardinality(p_question_ids) then
    raise exception 'Every selected question must be published, unique, and belong to this course';
  end if;

  update public.exams set
    title = trim(p_title),
    description = nullif(trim(coalesce(p_description, '')), ''),
    exam_type = p_exam_type,
    duration_minutes = p_duration_minutes,
    question_count = v_question_count,
    difficulty = coalesce(p_difficulty, 'medium'),
    attempt_limit = p_attempt_limit,
    available_from = p_available_from,
    available_until = p_available_until
  where id = p_exam_id returning * into v_exam;

  delete from public.exam_questions where exam_id = p_exam_id;
  insert into public.exam_questions (exam_id, question_id, display_order)
  select p_exam_id, selected.question_id, selected.ordinality - 1
  from unnest(p_question_ids) with ordinality as selected(question_id, ordinality);
  return v_exam;
end;
$$;

revoke all on function public.admin_create_exam(uuid, text, text, public.exam_type, integer, uuid[], public.difficulty_level, integer, timestamptz, timestamptz) from public, anon;
revoke all on function public.admin_update_exam(uuid, text, text, public.exam_type, integer, uuid[], public.difficulty_level, integer, timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_create_exam(uuid, text, text, public.exam_type, integer, uuid[], public.difficulty_level, integer, timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_update_exam(uuid, text, text, public.exam_type, integer, uuid[], public.difficulty_level, integer, timestamptz, timestamptz) to authenticated;
