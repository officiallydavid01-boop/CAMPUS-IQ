-- CampusIQ — Migration 008: Competitions & weekly challenges
--
-- Anti-cheat / scoring integrity (Master Spec sections 41-49): as with
-- exams, competition_attempts.score and competition_results are only ever
-- written by server-side/staff logic, never directly by a student's own
-- UPDATE (enforced in 012_rls.sql).

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  banner_url text,
  course_id uuid references public.courses(id) on delete set null,
  topic_id uuid references public.course_topics(id) on delete set null,
  difficulty public.difficulty_level,
  question_count int not null check (question_count > 0),
  time_limit_minutes int not null check (time_limit_minutes > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  participant_limit int check (participant_limit is null or participant_limit > 0),
  xp_reward int not null default 0 check (xp_reward >= 0),
  achievement_id uuid references public.achievements(id) on delete set null,
  leaderboard_scope public.leaderboard_scope not null default 'global',
  status public.competition_status not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competitions_window_check check (ends_at > starts_at)
);
create trigger set_updated_at before update on public.competitions
  for each row execute function public.set_updated_at();

create table public.competition_rules (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  -- e.g. "eligibility": {"institution_id": "...", "level_id": "..."} or
  -- {"scope": "everyone"}; scoring weights; tie-breaker rule; etc.
  rule_key text not null,
  rule_value jsonb not null,
  created_at timestamptz not null default now(),
  unique (competition_id, rule_key)
);

create table public.competition_questions (
  competition_id uuid not null references public.competitions(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  display_order int not null default 0,
  primary key (competition_id, question_id)
);

create table public.competition_participants (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  registered_at timestamptz not null default now(),
  unique (competition_id, student_id)
);

create table public.competition_attempts (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  status public.attempt_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  score numeric(6,2),                -- written only by the grading function
  response_time_ms int,
  disqualified boolean not null default false,
  disqualified_reason text,
  unique (competition_id, student_id)
);

create table public.competition_answers (
  id uuid primary key default gen_random_uuid(),
  competition_attempt_id uuid not null references public.competition_attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  selected_option_id uuid references public.question_options(id) on delete set null,
  answer_text text,
  is_correct boolean,
  response_time_ms int check (response_time_ms is null or response_time_ms >= 0),
  answered_at timestamptz not null default now(),
  unique (competition_attempt_id, question_id)
);

create table public.competition_results (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  rank int,
  score numeric(6,2) not null,
  xp_awarded int not null default 0,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  unique (competition_id, student_id)
);
