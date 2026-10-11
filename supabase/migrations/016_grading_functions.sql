-- CampusIQ — Migration 016: Grading functions (Phase 5)
--
-- Implements the "answer-delivery-and-grading RPC" flagged as a known
-- limitation back in Phase 2 (see docs/database-architecture.md "RLS
-- model" point 3). Two different mechanisms, deliberately:
--
--   PRACTICE — immediate per-answer feedback is the whole point of
--   practice mode, so grading happens via an AFTER INSERT trigger the
--   instant a student submits one answer.
--
--   EXAMS — grading the whole attempt happens via an explicit RPC
--   (`grade_exam_attempt`) the client calls once at submission time, not
--   per-answer, so a student can't infer correctness of earlier answers
--   mid-exam by re-querying their own exam_answers.
--
-- IMPORTANT TRIGGER-TIMING NOTE (worth understanding before touching
-- this file): the practice trigger is AFTER INSERT, not BEFORE INSERT,
-- and deliberately so. RLS's WITH CHECK for an INSERT is evaluated
-- against the row *after* any BEFORE ROW triggers have run — so a BEFORE
-- INSERT trigger that set NEW.is_correct would collide with
-- practice_answers' own INSERT policy ("is_correct is null" — see
-- 012_rls.sql), and Postgres would reject the very insert the trigger is
-- trying to grade. An AFTER INSERT trigger sidesteps this entirely: the
-- original INSERT (with is_correct still null, satisfying the student's
-- own WITH CHECK) has already committed by the time the trigger fires,
-- and the trigger's own UPDATE is a separate statement that runs under
-- this function's SECURITY DEFINER privilege — which, like
-- recalculate_user_xp() in migration 007, bypasses RLS because it
-- executes as the migration-owning role rather than the calling student
-- (see "XP & grading security model" in docs/database-architecture.md
-- for the general mechanism; the same reasoning applies here).

-- ---------------------------------------------------------------------
-- Shared grading logic
-- ---------------------------------------------------------------------
-- One function both mechanisms below call, so "how do we decide if an
-- answer is correct" is defined exactly once. Multiple-choice/true-false
-- questions are graded against question_options.is_correct; numerical/
-- short-answer questions are graded against questions.correct_answer_text
-- with a case-insensitive, whitespace-trimmed comparison. Structured
-- questions (free-form, potentially multi-part) are NOT auto-gradable —
-- they come back null (ungraded), which the UI must treat as "pending
-- manual review," not "incorrect."

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
  v_question record;
begin
  select * into v_question from public.questions where id = p_question_id;
  if v_question is null then
    return null;
  end if;

  if v_question.question_type in ('multiple_choice', 'true_false') then
    if p_selected_option_id is null then
      return false;
    end if;
    return coalesce(
      (select qo.is_correct from public.question_options qo where qo.id = p_selected_option_id),
      false
    );
  elsif v_question.question_type in ('numerical', 'short_answer') then
    if v_question.correct_answer_text is null or p_answer_text is null then
      return false;
    end if;
    return lower(trim(p_answer_text)) = lower(trim(v_question.correct_answer_text));
  else
    -- 'structured' — not auto-gradable.
    return null;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- PRACTICE — immediate per-answer grading
-- ---------------------------------------------------------------------

create or replace function public.grade_practice_answer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_correct boolean;
begin
  v_is_correct := public.evaluate_answer(new.question_id, new.selected_option_id, new.answer_text);

  update public.practice_answers
  set is_correct = v_is_correct
  where id = new.id;

  update public.practice_sessions
  set
    question_count = question_count + 1,
    correct_count = correct_count + (case when v_is_correct then 1 else 0 end)
  where id = new.practice_session_id;

  return new;
end;
$$;

create trigger grade_practice_answer_after_insert
  after insert on public.practice_answers
  for each row execute function public.grade_practice_answer();

-- ---------------------------------------------------------------------
-- EXAMS — batch grading at submission time, via explicit RPC
-- ---------------------------------------------------------------------
-- Callable by any authenticated user (see grants below), but the
-- function itself re-verifies ownership and state before doing anything
-- — SECURITY DEFINER bypasses RLS, it does not bypass the need for this
-- function to make its own authorization decision.

create or replace function public.grade_exam_attempt(p_attempt_id uuid)
returns public.exam_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.exam_attempts;
  v_correct_count int;
  v_total_count int;
begin
  select * into v_attempt from public.exam_attempts where id = p_attempt_id;

  if v_attempt is null then
    raise exception 'Exam attempt % not found', p_attempt_id;
  end if;

  if v_attempt.student_id <> auth.uid() and not public.is_staff() then
    raise exception 'Not authorized to grade this attempt';
  end if;

  if v_attempt.status <> 'submitted' then
    raise exception 'Attempt must be in ''submitted'' status to be graded (currently: %)', v_attempt.status;
  end if;

  -- Grade every answer for this attempt in one pass.
  update public.exam_answers ea
  set is_correct = public.evaluate_answer(ea.question_id, ea.selected_option_id, ea.answer_text)
  where ea.exam_attempt_id = p_attempt_id;

  select
    count(*) filter (where is_correct = true),
    count(*)
  into v_correct_count, v_total_count
  from public.exam_answers
  where exam_attempt_id = p_attempt_id;

  update public.exam_attempts
  set
    status = 'graded',
    score = v_correct_count,
    max_score = v_total_count,
    submitted_at = coalesce(submitted_at, now())
  where id = p_attempt_id
  returning * into v_attempt;

  return v_attempt;
end;
$$;

-- Explicit grant, even though functions default to PUBLIC-executable —
-- being explicit here documents the intent for a function this sensitive
-- (it's the entire exam scoring engine) rather than relying on the default.
revoke execute on function public.grade_exam_attempt(uuid) from public;
grant execute on function public.grade_exam_attempt(uuid) to authenticated;

comment on function public.grade_exam_attempt(uuid) is
  'Client calls this via supabase.rpc(''grade_exam_attempt'', { p_attempt_id }) '
  'immediately after transitioning an exam_attempts row to ''submitted''. '
  'See services/exams/examAttemptService.ts submitExamAttempt().';

-- ---------------------------------------------------------------------
-- Explanation delivery — gated by "have you actually answered this
-- question", not by a blanket view column
-- ---------------------------------------------------------------------
-- questions_public/question_options_public (migration 012) deliberately
-- do NOT include `explanation`: it was written for both practice *and*
-- live exam-question delivery, and an explanation typically all but
-- states the correct answer — fine to reveal in practice immediately,
-- but a real cheating vector if visible on an in-progress exam question.
-- Rather than two different views, one function makes the one security
-- decision that actually matters: has this student already committed an
-- answer to this specific question (a graded practice answer, or an
-- answer within a *graded* — not merely submitted — exam attempt)? If
-- so, explanation is instructive review material. If not, it's a way to
-- skip the question.

create or replace function public.get_question_explanation(p_question_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_answered boolean;
begin
  select
    public.is_staff()
    or exists (
      select 1
      from public.practice_answers pa
      join public.practice_sessions ps on ps.id = pa.practice_session_id
      where pa.question_id = p_question_id
        and ps.student_id = auth.uid()
        and pa.is_correct is not null
    )
    or exists (
      select 1
      from public.exam_answers ea
      join public.exam_attempts eat on eat.id = ea.exam_attempt_id
      where ea.question_id = p_question_id
        and eat.student_id = auth.uid()
        and eat.status = 'graded'
    )
  into v_has_answered;

  if not v_has_answered then
    return null;
  end if;

  return (select explanation from public.questions where id = p_question_id);
end;
$$;

revoke execute on function public.get_question_explanation(uuid) from public;
grant execute on function public.get_question_explanation(uuid) to authenticated;

comment on function public.get_question_explanation(uuid) is
  'Returns null (not an error) if the calling student has not yet '
  'answered this question — callers should treat null as "nothing to '
  'show yet", not as a failure. See practiceService.ts / '
  'examAttemptService.ts getQuestionExplanation().';

-- ---------------------------------------------------------------------
-- Correct-answer reveal for a *graded* attempt (results review)
-- ---------------------------------------------------------------------
-- question_options_public hides is_correct on purpose. Once an attempt
-- is graded, though, a student reviewing their result legitimately needs
-- to see what the right answers were. Same principle as
-- get_question_explanation: one function makes the one security
-- decision (is this my attempt, and is it graded?) instead of loosening
-- a view. Output columns are prefixed r_ so they can't collide with the
-- table columns referenced in the query body (plpgsql treats RETURNS
-- TABLE column names as in-scope variables).

create or replace function public.get_graded_attempt_correct_answers(p_attempt_id uuid)
returns table (r_question_id uuid, r_option_id uuid, r_answer_text text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.exam_attempts;
begin
  select * into v_attempt from public.exam_attempts where id = p_attempt_id;

  if v_attempt is null then
    raise exception 'Exam attempt % not found', p_attempt_id;
  end if;

  if v_attempt.student_id <> auth.uid() and not public.is_staff() then
    raise exception 'Not authorized to view this attempt';
  end if;

  if v_attempt.status <> 'graded' then
    raise exception 'Correct answers are only available once an attempt is graded';
  end if;

  return query
    select eq.question_id, qo.id, null::text
    from public.exam_questions eq
    join public.question_options qo on qo.question_id = eq.question_id and qo.is_correct = true
    where eq.exam_id = v_attempt.exam_id
    union all
    select eq.question_id, null::uuid, q.correct_answer_text
    from public.exam_questions eq
    join public.questions q on q.id = eq.question_id
    where eq.exam_id = v_attempt.exam_id
      and q.question_type in ('numerical', 'short_answer');
end;
$$;

revoke execute on function public.get_graded_attempt_correct_answers(uuid) from public;
grant execute on function public.get_graded_attempt_correct_answers(uuid) to authenticated;
