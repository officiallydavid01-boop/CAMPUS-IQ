-- CampusIQ Phase 5 hardening: secure exam lifecycle, timer enforcement, and grading.
-- Apply AFTER 016_grading_functions.sql. No existing academic history is deleted.

-- The evaluator contains the answer key logic. It must never be directly callable
-- by browser users; SECURITY DEFINER callers below use it internally.
revoke all on function public.evaluate_answer(uuid, uuid, text) from public;
revoke all on function public.evaluate_answer(uuid, uuid, text) from anon;
revoke all on function public.evaluate_answer(uuid, uuid, text) from authenticated;

-- A chosen option must belong to the question being graded. Without this check,
-- a correct option from a different question could be submitted for this question.
create or replace function public.evaluate_answer(
  p_question_id uuid,
  p_selected_option_id uuid,
  p_answer_text text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_question public.questions;
  v_option_correct boolean;
begin
  select * into v_question from public.questions where id = p_question_id;
  if not found then return null; end if;

  if v_question.question_type in ('multiple_choice', 'true_false') then
    if p_selected_option_id is null then return false; end if;
    select qo.is_correct into v_option_correct
    from public.question_options qo
    where qo.id = p_selected_option_id and qo.question_id = p_question_id;
    return coalesce(v_option_correct, false);
  elsif v_question.question_type in ('numerical', 'short_answer') then
    if v_question.correct_answer_text is null or p_answer_text is null then return false; end if;
    return lower(trim(p_answer_text)) = lower(trim(v_question.correct_answer_text));
  end if;
  return null; -- structured answers await manual marking
end;
$$;

-- Students must be able to read the question links for a published exam, but
-- draft/unpublished exam composition remains staff-only.
create policy "students read published exam question links"
on public.exam_questions for select
using (
  exists (
    select 1 from public.exams e
    where e.id = exam_questions.exam_id and e.status = 'published'
  )
);

-- Server-authoritative attempt creation. The exam row lock serializes concurrent
-- starts so two parallel requests cannot exceed attempt_limit.
create or replace function public.start_exam_attempt(p_exam_id uuid)
returns public.exam_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_exam public.exams;
  v_attempt public.exam_attempts;
  v_attempt_count integer;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_exam from public.exams where id = p_exam_id for update;
  if not found or v_exam.status <> 'published' then raise exception 'Exam is unavailable'; end if;
  if v_exam.available_from is not null and now() < v_exam.available_from then raise exception 'Exam is not open yet'; end if;
  if v_exam.available_until is not null and now() > v_exam.available_until then raise exception 'Exam availability has ended'; end if;

  if not exists (
    select 1 from public.course_enrollments ce
    where ce.student_id = v_user
      and ce.course_offering_id = v_exam.course_offering_id
      and ce.status = 'active'
  ) then
    raise exception 'An active enrollment is required to start this exam';
  end if;

  select * into v_attempt from public.exam_attempts
  where exam_id = p_exam_id and student_id = v_user and status = 'in_progress'
  order by started_at desc limit 1;
  if found then return v_attempt; end if;

  select count(*) into v_attempt_count
  from public.exam_attempts where exam_id = p_exam_id and student_id = v_user;
  if v_exam.attempt_limit is not null and v_attempt_count >= v_exam.attempt_limit then
    raise exception 'Exam attempt limit reached';
  end if;

  insert into public.exam_attempts (exam_id, student_id, status)
  values (p_exam_id, v_user, 'in_progress') returning * into v_attempt;
  return v_attempt;
end;
$$;

-- Atomic answer upsert. Validates ownership, exam membership, option/question
-- relationship, and server time. Browser code cannot insert after the deadline.
create or replace function public.save_exam_answer(
  p_attempt_id uuid,
  p_question_id uuid,
  p_selected_option_id uuid default null,
  p_answer_text text default null,
  p_response_time_ms integer default null
)
returns public.exam_answers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_attempt public.exam_attempts;
  v_exam public.exams;
  v_answer public.exam_answers;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_attempt from public.exam_attempts where id = p_attempt_id for update;
  if not found or v_attempt.student_id <> v_user then raise exception 'Attempt not found'; end if;
  if v_attempt.status <> 'in_progress' then raise exception 'This attempt is no longer accepting answers'; end if;
  select * into v_exam from public.exams where id = v_attempt.exam_id;
  if now() > v_attempt.started_at + make_interval(mins => v_exam.duration_minutes) then
    raise exception 'Exam time has expired. Submit the attempt to see your result.';
  end if;
  if not exists (
    select 1 from public.exam_questions eq
    join public.questions q on q.id = eq.question_id
    where eq.exam_id = v_attempt.exam_id and eq.question_id = p_question_id and q.status = 'published'
  ) then raise exception 'Question does not belong to this exam'; end if;
  if p_selected_option_id is not null and not exists (
    select 1 from public.question_options qo
    where qo.id = p_selected_option_id and qo.question_id = p_question_id
  ) then raise exception 'Selected option does not belong to this question'; end if;
  if p_response_time_ms is not null and p_response_time_ms < 0 then raise exception 'Invalid response time'; end if;

  insert into public.exam_answers (exam_attempt_id, question_id, selected_option_id, answer_text, response_time_ms, is_correct)
  values (p_attempt_id, p_question_id, p_selected_option_id, p_answer_text, p_response_time_ms, null)
  on conflict (exam_attempt_id, question_id) do update
    set selected_option_id = excluded.selected_option_id,
        answer_text = excluded.answer_text,
        response_time_ms = excluded.response_time_ms,
        answered_at = now()
  returning * into v_answer;
  return v_answer;
end;
$$;

-- Regrade submitted attempts with a denominator based on the exam blueprint,
-- not the number of answers the student happened to save. Unanswered questions
-- count as incorrect; non-empty structured responses wait for staff review.
create or replace function public.grade_exam_attempt(p_attempt_id uuid)
returns public.exam_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.exam_attempts;
  v_correct_count integer;
  v_total_count integer;
  v_pending_count integer;
begin
  select * into v_attempt from public.exam_attempts where id = p_attempt_id for update;
  if not found then raise exception 'Exam attempt not found'; end if;
  if v_attempt.student_id <> auth.uid() and not public.is_staff() then raise exception 'Not authorized to grade this attempt'; end if;
  if v_attempt.status not in ('submitted', 'graded') then raise exception 'Attempt must be submitted before grading'; end if;

  update public.exam_answers ea
  set is_correct = case
    when q.question_type = 'structured' and nullif(trim(coalesce(ea.answer_text, '')), '') is not null then null
    else coalesce(public.evaluate_answer(ea.question_id, ea.selected_option_id, ea.answer_text), false)
  end
  from public.questions q
  where q.id = ea.question_id and ea.exam_attempt_id = p_attempt_id;

  -- Missing responses are explicitly represented as incorrect so they cannot
  -- accidentally disappear from the denominator or result review.
  insert into public.exam_answers (exam_attempt_id, question_id, is_correct)
  select p_attempt_id, eq.question_id, false
  from public.exam_questions eq
  where eq.exam_id = v_attempt.exam_id
    and not exists (
      select 1 from public.exam_answers ea
      where ea.exam_attempt_id = p_attempt_id and ea.question_id = eq.question_id
    );

  select count(*) filter (where ea.is_correct is true),
         count(*) filter (where ea.is_correct is null)
    into v_correct_count, v_pending_count
  from public.exam_answers ea
  join public.exam_questions eq on eq.question_id = ea.question_id and eq.exam_id = v_attempt.exam_id
  where ea.exam_attempt_id = p_attempt_id;

  select count(*) into v_total_count from public.exam_questions where exam_id = v_attempt.exam_id;

  update public.exam_attempts
  set status = case when v_pending_count > 0 then 'submitted'::public.attempt_status else 'graded'::public.attempt_status end,
      score = v_correct_count,
      max_score = v_total_count,
      submitted_at = coalesce(submitted_at, now())
  where id = p_attempt_id
  returning * into v_attempt;
  return v_attempt;
end;
$$;

-- Staff review for structured responses. Finalizes the attempt once every
-- response has a grade, while preserving the complete question denominator.
create or replace function public.mark_structured_exam_answer(p_answer_id uuid, p_is_correct boolean)
returns public.exam_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_answer public.exam_answers;
  v_attempt public.exam_attempts;
  v_correct_count integer;
  v_total_count integer;
  v_pending_count integer;
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Staff access required'; end if;
  select * into v_answer from public.exam_answers where id = p_answer_id for update;
  if not found then raise exception 'Answer not found'; end if;
  if p_is_correct is null then raise exception 'A manual grade must be correct or incorrect'; end if;
  select * into v_attempt from public.exam_attempts where id = v_answer.exam_attempt_id for update;
  if v_attempt.status not in ('submitted', 'graded') then raise exception 'Attempt must be submitted'; end if;
  if not exists (select 1 from public.questions q where q.id = v_answer.question_id and q.question_type = 'structured') then
    raise exception 'Only structured answers can be manually marked';
  end if;

  update public.exam_answers set is_correct = p_is_correct where id = p_answer_id;
  select count(*) filter (where ea.is_correct is true), count(*) filter (where ea.is_correct is null)
    into v_correct_count, v_pending_count
  from public.exam_answers ea
  join public.exam_questions eq on eq.question_id = ea.question_id and eq.exam_id = v_attempt.exam_id
  where ea.exam_attempt_id = v_attempt.id;
  select count(*) into v_total_count from public.exam_questions where exam_id = v_attempt.exam_id;
  update public.exam_attempts
    set score = v_correct_count,
        max_score = v_total_count,
        status = case when v_pending_count = 0 then 'graded'::public.attempt_status else 'submitted'::public.attempt_status end
    where id = v_attempt.id returning * into v_attempt;

  insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'exam.structured_answer_marked',
    'exam_answer',
    p_answer_id,
    jsonb_build_object('attempt_id', v_attempt.id, 'question_id', v_answer.question_id, 'is_correct', p_is_correct)
  );
  return v_attempt;
end;
$$;

-- One atomic submit-and-grade entry point. A repeated call after grading returns
-- the existing result, allowing safe retry if the client lost the first response.
create or replace function public.submit_exam_attempt(p_attempt_id uuid)
returns public.exam_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_attempt public.exam_attempts;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_attempt from public.exam_attempts where id = p_attempt_id for update;
  if not found or (v_attempt.student_id <> v_user and not public.is_staff()) then
    raise exception 'Attempt not found or not authorized';
  end if;
  if v_attempt.status = 'graded' then return v_attempt; end if;
  -- A submitted attempt with a score/max_score has already had its automatic
  -- grading pass. Do not rerun it while structured responses await staff marks,
  -- because that would reset those manual marks back to NULL.
  if v_attempt.status = 'submitted' and v_attempt.score is not null and v_attempt.max_score is not null then
    return v_attempt;
  end if;
  if v_attempt.status not in ('in_progress', 'submitted') then
    raise exception 'This attempt cannot be submitted';
  end if;
  if v_attempt.status = 'in_progress' then
    update public.exam_attempts
      set status = 'submitted', submitted_at = now()
      where id = p_attempt_id;
  end if;
  return public.grade_exam_attempt(p_attempt_id);
end;
$$;

-- Prevent browser callers from bypassing the atomic submission entry point.
revoke all on function public.grade_exam_attempt(uuid) from public;
revoke all on function public.grade_exam_attempt(uuid) from anon;
revoke all on function public.grade_exam_attempt(uuid) from authenticated;
revoke all on function public.mark_structured_exam_answer(uuid, boolean) from public;
revoke all on function public.mark_structured_exam_answer(uuid, boolean) from anon;
revoke all on function public.start_exam_attempt(uuid) from public;
revoke all on function public.start_exam_attempt(uuid) from anon;
revoke all on function public.save_exam_answer(uuid, uuid, uuid, text, integer) from public;
revoke all on function public.save_exam_answer(uuid, uuid, uuid, text, integer) from anon;
revoke all on function public.submit_exam_attempt(uuid) from public;
revoke all on function public.submit_exam_attempt(uuid) from anon;
grant execute on function public.mark_structured_exam_answer(uuid, boolean) to authenticated;
grant execute on function public.start_exam_attempt(uuid) to authenticated;
grant execute on function public.save_exam_answer(uuid, uuid, uuid, text, integer) to authenticated;
grant execute on function public.submit_exam_attempt(uuid) to authenticated;

comment on function public.start_exam_attempt(uuid) is 'Creates or resumes an eligible student attempt and enforces the attempt limit server-side.';
comment on function public.save_exam_answer(uuid, uuid, uuid, text, integer) is 'Validates and saves an answer only while the authenticated owner has time remaining.';
comment on function public.submit_exam_attempt(uuid) is 'Atomically submits and grades an exam attempt; safe to retry after a lost client response.';

-- Practice explanations may be revealed after the student has submitted an
-- answer, including structured responses that cannot be auto-graded. Exam
-- explanations remain gated on a fully graded exam attempt.
create or replace function public.get_question_explanation(p_question_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_answered boolean;
begin
  select public.is_staff()
    or exists (
      select 1 from public.practice_answers pa
      join public.practice_sessions ps on ps.id = pa.practice_session_id
      where pa.question_id = p_question_id and ps.student_id = auth.uid()
    )
    or exists (
      select 1 from public.exam_answers ea
      join public.exam_attempts eat on eat.id = ea.exam_attempt_id
      where ea.question_id = p_question_id and eat.student_id = auth.uid() and eat.status = 'graded'
    )
  into v_has_answered;
  if not v_has_answered then return null; end if;
  return (select q.explanation from public.questions q where q.id = p_question_id and q.status = 'published');
end;
$$;
revoke all on function public.get_question_explanation(uuid) from public, anon;
grant execute on function public.get_question_explanation(uuid) to authenticated;

-- Force exam and practice writes through the validating RPCs above. RLS policies
-- remain defense in depth, but table privileges prevent bypassing the RPC checks.
revoke insert, update, delete on public.exam_attempts from public, anon, authenticated;
grant select on public.exam_attempts to authenticated;
revoke insert, update, delete on public.exam_answers from public, anon, authenticated;
grant select on public.exam_answers to authenticated;

-- Practice sessions and answers also need a server-validated write path: direct
-- inserts previously allowed repeated answers and answers from unrelated topics.
create or replace function public.start_practice_session(
  p_mode public.practice_mode,
  p_course_id uuid,
  p_topic_id uuid default null
)
returns public.practice_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_session public.practice_sessions;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_course_id is null then raise exception 'Choose a course first'; end if;
  if p_mode not in ('topic', 'course', 'mixed', 'weak_topic') then
    raise exception 'This practice mode is not available yet';
  end if;
  if not exists (
    select 1 from public.course_enrollments ce
    join public.course_offerings co on co.id = ce.course_offering_id
    where ce.student_id = v_user and ce.status = 'active' and co.course_id = p_course_id and co.status = 'published'
  ) then raise exception 'An active course enrollment is required'; end if;
  if p_mode = 'topic' and (p_topic_id is null or not exists (
    select 1 from public.course_topics ct where ct.id = p_topic_id and ct.course_id = p_course_id and ct.status = 'published'
  )) then raise exception 'Choose a published topic from this course'; end if;

  insert into public.practice_sessions (student_id, mode, course_id, topic_id)
  values (v_user, p_mode, p_course_id, case when p_mode = 'topic' then p_topic_id else null end)
  returning * into v_session;
  return v_session;
end;
$$;

create or replace function public.submit_practice_answer(
  p_practice_session_id uuid,
  p_question_id uuid,
  p_selected_option_id uuid default null,
  p_answer_text text default null,
  p_response_time_ms integer default null
)
returns public.practice_answers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_session public.practice_sessions;
  v_question public.questions;
  v_answer public.practice_answers;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_session from public.practice_sessions where id = p_practice_session_id for update;
  if not found or v_session.student_id <> v_user then raise exception 'Practice session not found'; end if;
  if v_session.ended_at is not null then raise exception 'This practice session has ended'; end if;
  select * into v_question from public.questions where id = p_question_id and status = 'published';
  if not found or v_question.course_id <> v_session.course_id then raise exception 'Question does not belong to this course'; end if;
  if v_session.mode = 'topic' and v_question.topic_id <> v_session.topic_id then raise exception 'Question does not belong to the selected topic'; end if;
  if v_session.mode = 'weak_topic' and not exists (
    select 1 from public.practice_answers pa
    join public.practice_sessions ps on ps.id = pa.practice_session_id
    where ps.student_id = v_user and ps.course_id = v_session.course_id
      and pa.question_id = p_question_id and pa.is_correct = false
  ) then raise exception 'This question is not in your recorded weak-topic set'; end if;
  if p_selected_option_id is not null and not exists (
    select 1 from public.question_options qo where qo.id = p_selected_option_id and qo.question_id = p_question_id
  ) then raise exception 'Selected option does not belong to this question'; end if;
  if p_response_time_ms is not null and p_response_time_ms < 0 then raise exception 'Invalid response time'; end if;
  if exists (select 1 from public.practice_answers pa where pa.practice_session_id = p_practice_session_id and pa.question_id = p_question_id) then
    raise exception 'This question has already been answered in this session';
  end if;

  insert into public.practice_answers (practice_session_id, question_id, selected_option_id, answer_text, response_time_ms, is_correct)
  values (p_practice_session_id, p_question_id, p_selected_option_id, p_answer_text, p_response_time_ms, null)
  returning id into v_answer.id;
  -- The AFTER INSERT trigger grades the row in a separate UPDATE; re-read it
  -- so the RPC returns the final correctness value, not the pre-trigger NEW row.
  select * into v_answer from public.practice_answers where id = v_answer.id;
  return v_answer;
end;
$$;

create or replace function public.end_practice_session(p_practice_session_id uuid)
returns public.practice_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_session public.practice_sessions;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_session from public.practice_sessions where id = p_practice_session_id for update;
  if not found or (v_session.student_id <> v_user and not public.is_staff()) then raise exception 'Practice session not found'; end if;
  update public.practice_sessions set ended_at = coalesce(ended_at, now()) where id = p_practice_session_id returning * into v_session;
  return v_session;
end;
$$;

revoke insert, update, delete on public.practice_sessions from public, anon, authenticated;
grant select on public.practice_sessions to authenticated;
revoke insert, update, delete on public.practice_answers from public, anon, authenticated;
grant select on public.practice_answers to authenticated;
revoke all on function public.start_practice_session(public.practice_mode, uuid, uuid) from public, anon;
revoke all on function public.submit_practice_answer(uuid, uuid, uuid, text, integer) from public, anon;
revoke all on function public.end_practice_session(uuid) from public, anon;
grant execute on function public.start_practice_session(public.practice_mode, uuid, uuid) to authenticated;
grant execute on function public.submit_practice_answer(uuid, uuid, uuid, text, integer) to authenticated;
grant execute on function public.end_practice_session(uuid) to authenticated;

-- Narrow student reads to their current academic context or actual course
-- enrollments. Earlier policies allowed every authenticated student to query
-- every published course/exam/question in the entire institution catalog.
drop policy if exists "read published courses" on public.courses;
create policy "read context or enrolled published courses" on public.courses for select
using (
  public.is_staff()
  or (
    status = 'published'
    and (
      exists (
        select 1 from public.course_offerings co
        join public.profiles p on p.id = auth.uid()
        where co.course_id = courses.id and co.status = 'published'
          and co.institution_id = p.institution_id
          and co.programme_id = p.programme_id
          and co.level_id = p.level_id
          and co.semester_id = p.current_semester_id
      )
      or exists (
        select 1 from public.course_offerings co
        join public.course_enrollments ce on ce.course_offering_id = co.id
        where co.course_id = courses.id and ce.student_id = auth.uid()
          and ce.status in ('active', 'completed')
      )
    )
  )
);

drop policy if exists "read published course_offerings" on public.course_offerings;
create policy "read context or enrolled course_offerings" on public.course_offerings for select
using (
  public.is_staff()
  or (
    status = 'published'
    and (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.institution_id = course_offerings.institution_id
          and p.programme_id = course_offerings.programme_id
          and p.level_id = course_offerings.level_id
          and p.current_semester_id = course_offerings.semester_id
      )
      or exists (
        select 1 from public.course_enrollments ce
        where ce.course_offering_id = course_offerings.id
          and ce.student_id = auth.uid()
          and ce.status in ('active', 'completed')
      )
    )
  )
);

drop policy if exists "read published course_topics" on public.course_topics;
create policy "read enrolled published course_topics" on public.course_topics for select
using (
  public.is_staff()
  or (
    status = 'published'
    and exists (
      select 1 from public.course_offerings co
      join public.course_enrollments ce on ce.course_offering_id = co.id
      where co.course_id = course_topics.course_id and co.status = 'published'
        and ce.student_id = auth.uid() and ce.status in ('active', 'completed')
    )
  )
);

drop policy if exists "read published lessons" on public.lessons;
create policy "read enrolled published lessons" on public.lessons for select
using (
  public.is_staff()
  or (
    status = 'published'
    and exists (
      select 1 from public.course_topics ct
      join public.course_offerings co on co.course_id = ct.course_id
      join public.course_enrollments ce on ce.course_offering_id = co.id
      where ct.id = lessons.topic_id and ct.status = 'published' and co.status = 'published'
        and ce.student_id = auth.uid() and ce.status in ('active', 'completed')
    )
  )
);

drop policy if exists "read published materials" on public.materials;
create policy "read enrolled published materials" on public.materials for select
using (
  public.is_staff()
  or (
    status = 'published'
    and (
      exists (
        select 1 from public.course_offerings co
        join public.course_enrollments ce on ce.course_offering_id = co.id
        where co.id = materials.course_offering_id and co.status = 'published'
          and ce.student_id = auth.uid() and ce.status in ('active', 'completed')
      )
      or exists (
        select 1 from public.lessons l
        join public.course_topics ct on ct.id = l.topic_id
        join public.course_offerings co on co.course_id = ct.course_id
        join public.course_enrollments ce on ce.course_offering_id = co.id
        where l.id = materials.lesson_id and l.status = 'published' and ct.status = 'published'
          and co.status = 'published' and ce.student_id = auth.uid()
          and ce.status in ('active', 'completed')
      )
    )
  )
);

drop policy if exists "read published past_questions" on public.past_questions;
create policy "read enrolled published past_questions" on public.past_questions for select
using (
  public.is_staff()
  or (
    status = 'published'
    and exists (
      select 1 from public.course_offerings co
      join public.course_enrollments ce on ce.course_offering_id = co.id
      where co.course_id = past_questions.course_id and co.status = 'published'
        and ce.student_id = auth.uid() and ce.status in ('active', 'completed')
    )
  )
);

drop policy if exists "read published exams" on public.exams;
create policy "read enrolled published exams" on public.exams for select
using (
  public.is_staff()
  or (
    status = 'published'
    and exists (
      select 1 from public.course_enrollments ce
      where ce.course_offering_id = exams.course_offering_id
        and ce.student_id = auth.uid() and ce.status in ('active', 'completed')
    )
  )
);

create or replace view public.questions_public
  with (security_invoker = false) as
  select q.id, q.course_id, q.topic_id, q.question_type, q.prompt, q.difficulty, q.xp_value, q.status, q.created_at
  from public.questions q
  where q.status = 'published'
    and (
      public.is_staff()
      or exists (
        select 1 from public.course_offerings co
        join public.course_enrollments ce on ce.course_offering_id = co.id
        where co.course_id = q.course_id and co.status = 'published'
          and ce.student_id = auth.uid() and ce.status in ('active', 'completed')
      )
    );

create or replace view public.question_options_public
  with (security_invoker = false) as
  select qo.id, qo.question_id, qo.option_text, qo.display_order
  from public.question_options qo
  join public.questions q on q.id = qo.question_id
  where q.status = 'published'
    and (
      public.is_staff()
      or exists (
        select 1 from public.course_offerings co
        join public.course_enrollments ce on ce.course_offering_id = co.id
        where co.course_id = q.course_id and co.status = 'published'
          and ce.student_id = auth.uid() and ce.status in ('active', 'completed')
      )
    );

comment on view public.questions_public is
  'Student-safe published questions, limited to courses with an active/completed enrollment; staff can preview all statuses through the base table.';
comment on view public.question_options_public is
  'Student-safe options without correctness flags, limited to enrolled course offerings.';

-- Enrollment is the authorization bridge between published content and a
-- student. Do not allow direct inserts that could enroll a student in another
-- department's offering by guessing its UUID; validate context and capacity in
-- one locked server-side transaction.
create or replace function public.enroll_in_course_offering(p_course_offering_id uuid)
returns public.course_enrollments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_offering public.course_offerings;
  v_profile public.profiles;
  v_existing public.course_enrollments;
  v_active_count integer;
  v_enrollment public.course_enrollments;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_offering from public.course_offerings where id = p_course_offering_id for update;
  if not found or v_offering.status <> 'published' then raise exception 'Course offering is unavailable'; end if;
  select * into v_profile from public.profiles where id = v_user;
  if not found or v_profile.institution_id is distinct from v_offering.institution_id
    or v_profile.programme_id is distinct from v_offering.programme_id
    or v_profile.level_id is distinct from v_offering.level_id
    or v_profile.current_semester_id is distinct from v_offering.semester_id then
    raise exception 'Course offering does not match your current academic context';
  end if;

  select * into v_existing from public.course_enrollments
  where student_id = v_user and course_offering_id = p_course_offering_id;
  if found then
    if v_existing.status = 'dropped' then raise exception 'This enrollment was previously dropped; contact an administrator to restore it'; end if;
    return v_existing;
  end if;

  if v_offering.capacity is not null then
    select count(*) into v_active_count from public.course_enrollments
    where course_offering_id = p_course_offering_id and status = 'active';
    if v_active_count >= v_offering.capacity then raise exception 'This course offering has reached capacity'; end if;
  end if;

  insert into public.course_enrollments (student_id, course_offering_id, status)
  values (v_user, p_course_offering_id, 'active') returning * into v_enrollment;
  return v_enrollment;
end;
$$;

revoke insert, update, delete on public.course_enrollments from public, anon, authenticated;
grant select on public.course_enrollments to authenticated;
revoke all on function public.enroll_in_course_offering(uuid) from public, anon;
grant execute on function public.enroll_in_course_offering(uuid) to authenticated;

comment on function public.enroll_in_course_offering(uuid) is
  'Validates a student’s current academic context and offering capacity before creating an enrollment.';
