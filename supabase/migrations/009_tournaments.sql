-- CampusIQ — Migration 009: Tournaments
--
-- Hierarchy: tournaments -> tournament_rounds -> tournament_matches ->
-- participants/questions/results (Master Spec section 43). Supports
-- leaderboard_challenge, knockout, head_to_head and group_stage formats;
-- V1 admin tooling may only implement a subset (leaderboard_challenge is
-- the simplest to ship first), but the schema itself does not block the
-- others — see docs/database-architecture.md.

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  banner_url text,
  format public.tournament_format not null default 'leaderboard_challenge',
  institution_id uuid references public.institutions(id) on delete set null,
  faculty_id uuid references public.faculties(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  programme_id uuid references public.programmes(id) on delete set null,
  level_id uuid references public.levels(id) on delete set null,
  course_id uuid references public.courses(id) on delete set null,
  topic_id uuid references public.course_topics(id) on delete set null,
  registration_starts_at timestamptz,
  registration_ends_at timestamptz,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  participant_limit int check (participant_limit is null or participant_limit > 0),
  round_count int not null default 1 check (round_count > 0),
  match_duration_minutes int check (match_duration_minutes is null or match_duration_minutes > 0),
  question_count int not null check (question_count > 0),
  tie_breaker text,                  -- e.g. "fastest_time", "sudden_death_question"
  xp_reward int not null default 0 check (xp_reward >= 0),
  achievement_id uuid references public.achievements(id) on delete set null,
  status public.tournament_status not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tournaments_window_check check (ends_at > starts_at)
);
create trigger set_updated_at before update on public.tournaments
  for each row execute function public.set_updated_at();

create table public.tournament_participants (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  seed int,
  registered_at timestamptz not null default now(),
  is_eliminated boolean not null default false,
  eliminated_at timestamptz,
  unique (tournament_id, student_id)
);

create table public.tournament_rounds (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_number int not null check (round_number > 0),
  title text,                        -- e.g. "Quarter-final", "Round 1"
  starts_at timestamptz,
  ends_at timestamptz,
  status public.match_status not null default 'scheduled',
  created_at timestamptz not null default now(),
  unique (tournament_id, round_number)
);

create table public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_round_id uuid not null references public.tournament_rounds(id) on delete cascade,
  -- nullable: a leaderboard_challenge / group_stage round may not model
  -- discrete 1v1 matches at all, in which case results attach at the round
  -- level instead. Populated for knockout / head_to_head formats.
  participant_a_id uuid references public.tournament_participants(id) on delete cascade,
  participant_b_id uuid references public.tournament_participants(id) on delete cascade,
  winner_participant_id uuid references public.tournament_participants(id) on delete set null,
  status public.match_status not null default 'scheduled',
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.tournament_match_questions (
  tournament_match_id uuid not null references public.tournament_matches(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  display_order int not null default 0,
  primary key (tournament_match_id, question_id)
);

create table public.tournament_results (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  final_rank int,
  score numeric(6,2),
  xp_awarded int not null default 0,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tournament_id, student_id)
);
