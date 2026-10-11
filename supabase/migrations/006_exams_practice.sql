-- CampusIQ — Migration 006: Question bank, past questions, exams, practice
--
-- Scoring integrity (Master Spec sections 33/48): none of the "is this
-- correct / what's my score" logic lives only on the client. question_options
-- .is_correct and exam_answers.is_correct are only ever writable by
-- staff/server-side logic (see 012_rls.sql) — a student's INSERT into
-- exam_answers can carry their chosen option, but never the correctness
-- flag or the exam_attempts.score, which are computed and written by a
-- SECURITY DEFINER grading function (docs/database-architecture.md
-- documents the intended Edge Function / RPC that performs this in a
-- later phase; this migration lays the tables and constraints for it).

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  topic_id uuid references public.course_topics(id) on delete set null,
  question_type public.question_type not null default 'multiple_choice',
  prompt text not null,
  difficulty public.difficulty_level not null default 'medium',
  explanation text,
  source text,
  xp_value int not null default 5 check (xp_value >= 0),
  -- used by numerical/short_answer question types where there is no
  -- separate options table to hold the correct answer
  correct_answer_text text,
  status public.content_status not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.questions
  for each row execute function public.set_updated_at();

create table public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  option_text text not null,
  is_correct boolean not null default false,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.past_questions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  topic_id uuid references public.course_topics(id) on delete set null,
  institution_id uuid references public.institutions(id) on delete set null,
  session_label text not null,      -- e.g. "2023/2024" — free text since the sitting predates current session rows
  semester_label text,
  exam_type public.exam_type not null default 'past_question_exam',
  prompt text not null,
  options jsonb,                    -- [{ "text": "...", "is_correct": bool }] for MCQ-style past questions
  correct_answer_text text,
  explanation text,
  status public.content_status not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.past_questions
  for each row execute function public.set_updated_at();

create table public.exams (
  id uuid primary key default gen_random_uuid(),
  course_offering_id uuid not null references public.course_offerings(id) on delete cascade,
  title text not null,
  description text,
  exam_type public.exam_type not null default 'mock_exam',
  duration_minutes int not null check (duration_minutes > 0),
  question_count int not null check (question_count > 0),
  difficulty public.difficulty_level,
  attempt_limit int check (attempt_limit is null or attempt_limit > 0),
  available_from timestamptz,
  available_until timestamptz,
  status public.content_status not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.exams
  for each row execute function public.set_updated_at();

create table public.exam_questions (
  exam_id uuid not null references public.exams(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  display_order int not null default 0,
  primary key (exam_id, question_id)
);

create table public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  status public.attempt_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  -- score/xp are only ever set by the grading function, never by client UPDATEs
  score numeric(6,2),
  max_score numeric(6,2),
  xp_awarded int not null default 0,
  created_at timestamptz not null default now()
);

create table public.exam_answers (
  id uuid primary key default gen_random_uuid(),
  exam_attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  selected_option_id uuid references public.question_options(id) on delete set null,
  answer_text text,
  is_correct boolean,          -- written only by the grading function
  response_time_ms int check (response_time_ms is null or response_time_ms >= 0),
  answered_at timestamptz not null default now(),
  unique (exam_attempt_id, question_id)
);

create table public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  mode public.practice_mode not null default 'topic',
  course_id uuid references public.courses(id) on delete set null,
  topic_id uuid references public.course_topics(id) on delete set null,
  question_count int not null default 0,
  correct_count int not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  xp_awarded int not null default 0
);

create table public.practice_answers (
  id uuid primary key default gen_random_uuid(),
  practice_session_id uuid not null references public.practice_sessions(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  selected_option_id uuid references public.question_options(id) on delete set null,
  answer_text text,
  is_correct boolean,
  response_time_ms int check (response_time_ms is null or response_time_ms >= 0),
  answered_at timestamptz not null default now()
);
