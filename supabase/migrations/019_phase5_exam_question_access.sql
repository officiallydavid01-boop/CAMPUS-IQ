-- Phase 5 access correction: the original 017 policy allowed any authenticated
-- student to read question-link UUIDs for every published exam. Keep access to
-- links aligned with the enrolled-offering rule used for exam content.
drop policy if exists "students read published exam question links" on public.exam_questions;

create policy "students read enrolled published exam question links"
on public.exam_questions for select
using (
  public.is_staff()
  or exists (
    select 1
    from public.exams e
    join public.course_enrollments ce on ce.course_offering_id = e.course_offering_id
    where e.id = exam_questions.exam_id
      and e.status = 'published'
      and ce.student_id = auth.uid()
      and ce.status in ('active', 'completed')
  )
);
