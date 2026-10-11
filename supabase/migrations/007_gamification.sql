-- CampusIQ — Migration 007: XP, levels, streaks, quests, achievements
--
-- XP integrity (Master Spec section 36): xp_transactions is an append-only
-- ledger. A client can never directly UPDATE user_xp — it is maintained by
-- the trigger below, which recomputes it from the ledger every time a row
-- is appended. RLS (012) additionally restricts who may INSERT into
-- xp_transactions at all: never the student themselves for
-- self-service sources.

create table public.xp_transactions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  amount int not null check (amount <> 0),
  source public.xp_source not null,
  -- polymorphic-lite reference to the thing that earned the XP (a lesson,
  -- an exam attempt, a competition result, ...); not a hard FK, since the
  -- source table varies. See docs/database-architecture.md.
  source_id uuid,
  note text,
  created_at timestamptz not null default now()
);

create table public.user_xp (
  student_id uuid primary key references auth.users(id) on delete cascade,
  total_xp bigint not null default 0,
  campusiq_level int not null default 1,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Centralized level configuration
-- ---------------------------------------------------------------------
-- A single table drives level thresholds so the calculation is never
-- duplicated across frontend components (Master Spec section 37).

create table public.level_config (
  level int primary key,
  xp_required bigint not null check (xp_required >= 0),
  title text,      -- e.g. "Scholar", "Sage" — optional flavor label
  created_at timestamptz not null default now()
);

create or replace function public.recalculate_user_xp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_total bigint;
  new_level int;
begin
  select coalesce(sum(amount), 0) into new_total
  from public.xp_transactions
  where student_id = new.student_id;

  select coalesce(max(level), 1) into new_level
  from public.level_config
  where xp_required <= new_total;

  insert into public.user_xp (student_id, total_xp, campusiq_level, updated_at)
  values (new.student_id, new_total, new_level, now())
  on conflict (student_id)
  do update set total_xp = excluded.total_xp,
                campusiq_level = excluded.campusiq_level,
                updated_at = now();

  return new;
end;
$$;

create trigger recalculate_user_xp_on_transaction
  after insert on public.xp_transactions
  for each row execute function public.recalculate_user_xp();

-- ---------------------------------------------------------------------
-- Streaks
-- ---------------------------------------------------------------------
-- Meaningful-activity-only, per Master Spec section 38: current_streak is
-- advanced by application logic (a server-side function in a later phase)
-- when a qualifying event happens (lesson completion, practice session,
-- study session, legitimate exam) — never by a bare button click.

create table public.streaks (
  student_id uuid primary key references auth.users(id) on delete cascade,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_activity_date date,
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.streaks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Achievements
-- ---------------------------------------------------------------------

create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,       -- e.g. "first_lesson", "seven_day_streak"
  title text not null,
  description text,
  icon text,
  xp_reward int not null default 0 check (xp_reward >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.achievements
  for each row execute function public.set_updated_at();

create table public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  earned_at timestamptz not null default now(),
  unique (student_id, achievement_id)
);

-- ---------------------------------------------------------------------
-- Quests
-- ---------------------------------------------------------------------

create table public.quests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  period public.quest_period not null default 'daily',
  target_type text not null,        -- e.g. "lessons_completed", "questions_answered", "study_minutes"
  target_count int not null check (target_count > 0),
  xp_reward int not null default 0 check (xp_reward >= 0),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.quests
  for each row execute function public.set_updated_at();

create table public.quest_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  quest_id uuid not null references public.quests(id) on delete cascade,
  period_start date not null,      -- the day (daily) or week-start (weekly) this progress row covers
  current_count int not null default 0,
  is_completed boolean not null default false,
  completed_at timestamptz,
  xp_awarded boolean not null default false,
  unique (student_id, quest_id, period_start)
);
