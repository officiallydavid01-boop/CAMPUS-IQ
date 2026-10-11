-- Move the carefully scoped question reads behind explicit RPC-safe functions,
-- allowing the API views themselves to run as the requesting user.
create or replace function public.ci_questions_public()
returns table (
  id uuid,
  course_id uuid,
  topic_id uuid,
  question_type public.question_type,
  prompt text,
  difficulty public.difficulty_level,
  xp_value integer,
  status public.content_status,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select q.id, q.course_id, q.topic_id, q.question_type, q.prompt,
         q.difficulty, q.xp_value, q.status, q.created_at
  from public.questions q
  where q.status = 'published'::public.content_status
    and (
      public.is_staff()
      or exists (
        select 1
        from public.course_offerings co
        join public.course_enrollments ce on ce.course_offering_id = co.id
        where co.course_id = q.course_id
          and co.status = 'published'::public.content_status
          and ce.student_id = auth.uid()
          and ce.status in ('active'::public.enrollment_status, 'completed'::public.enrollment_status)
      )
    );
$function$;

create or replace function public.ci_question_options_public()
returns table (
  id uuid,
  question_id uuid,
  option_text text,
  display_order integer
)
language sql
stable
security definer
set search_path = ''
as $function$
  select qo.id, qo.question_id, qo.option_text, qo.display_order
  from public.question_options qo
  join public.questions q on q.id = qo.question_id
  where q.status = 'published'::public.content_status
    and (
      public.is_staff()
      or exists (
        select 1
        from public.course_offerings co
        join public.course_enrollments ce on ce.course_offering_id = co.id
        where co.course_id = q.course_id
          and co.status = 'published'::public.content_status
          and ce.student_id = auth.uid()
          and ce.status in ('active'::public.enrollment_status, 'completed'::public.enrollment_status)
      )
    );
$function$;

revoke all on function public.ci_questions_public() from public, anon;
revoke all on function public.ci_question_options_public() from public, anon;
grant execute on function public.ci_questions_public() to authenticated;
grant execute on function public.ci_question_options_public() to authenticated;

create or replace view public.questions_public as
select * from public.ci_questions_public();

create or replace view public.question_options_public as
select * from public.ci_question_options_public();

alter view public.questions_public set (security_invoker = true);
alter view public.question_options_public set (security_invoker = true);

revoke all on public.questions_public from anon;
revoke all on public.question_options_public from anon;
grant select on public.questions_public to authenticated;
grant select on public.question_options_public to authenticated;
