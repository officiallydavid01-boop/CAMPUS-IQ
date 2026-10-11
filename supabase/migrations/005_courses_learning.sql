-- CampusIQ — Migration 005: Materials, notes, bookmarks, planner
--
-- Continues the "courses & learning" domain started in 004. Split into its
-- own file once it covers materials/notes/bookmarks/planner so no single
-- migration grows unwieldy.

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  -- A material attaches to a lesson (lesson-specific handout/diagram) and/or
  -- a course offering (general materials for that semester's delivery of
  -- the course). At least one must be set.
  lesson_id uuid references public.lessons(id) on delete cascade,
  course_offering_id uuid references public.course_offerings(id) on delete cascade,
  title text not null,
  description text,
  file_id uuid, -- references public.files(id); FK added in 010 once that table exists
  status public.content_status not null default 'draft',
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint materials_attachment_check check (lesson_id is not null or course_offering_id is not null)
);
create trigger set_updated_at before update on public.materials
  for each row execute function public.set_updated_at();

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  -- A note can attach to any one of these; enforced loosely (not a hard
  -- CHECK) so the UI can support "general note" with none set.
  course_id uuid references public.courses(id) on delete cascade,
  topic_id uuid references public.course_topics(id) on delete cascade,
  lesson_id uuid references public.lessons(id) on delete cascade,
  title text,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.notes
  for each row execute function public.set_updated_at();

create table public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  -- Polymorphic-lite bookmark target: bookmarkable_type names the table,
  -- bookmarkable_id is that table's id. A CHECK constrains the type to a
  -- known set so it can't silently drift; a true foreign key isn't
  -- possible across a polymorphic reference in Postgres.
  bookmarkable_type text not null check (bookmarkable_type in ('lesson', 'question', 'material', 'past_question')),
  bookmarkable_id uuid not null,
  created_at timestamptz not null default now(),
  unique (student_id, bookmarkable_type, bookmarkable_id)
);

create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_minutes int check (duration_minutes is null or duration_minutes >= 0),
  notes text,
  created_at timestamptz not null default now()
);

create table public.planner_tasks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  title text not null,
  description text,
  task_type text not null default 'custom' check (task_type in ('study_session', 'assignment', 'revision', 'exam_prep', 'custom')),
  due_at timestamptz,
  is_completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.planner_tasks
  for each row execute function public.set_updated_at();
