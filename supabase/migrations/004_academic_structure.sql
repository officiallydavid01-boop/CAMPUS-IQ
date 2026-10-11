-- CampusIQ — Migration 004: Academic hierarchy, courses & enrollment
--
-- Canonical hierarchy (see docs/database-architecture.md for the full
-- write-up of this design, including one deliberate deviation from the
-- Master Specification's hierarchy diagram, explained below):
--
--   institutions -> faculties -> departments -> programmes -> levels
--   academic_sessions -> semesters
--   courses -> course_topics -> lessons -> materials / questions / exams
--   course_offerings (course x programme x level x semester)
--
-- DESIGN NOTE — course vs course_offering, and where topics/lessons live:
-- The Master Specification's course-vs-offering section explains the split
-- exists "to prevent unnecessary duplication" when the same course recurs
-- across sessions/programmes. Its hierarchy diagram elsewhere shows
-- Topics/Lessons nested under Course Offering. Taken literally, that would
-- mean re-creating every topic and lesson each time a course is re-offered
-- next semester — which re-introduces exactly the duplication the
-- course/offering split was meant to prevent. This schema resolves that in
-- favor of the stated goal: course_topics and lessons attach to the
-- reusable `courses` row, so a course's content is authored once and
-- appears under every current and future course_offering of it. Materials
-- and exams, which are commonly delivery-specific (a particular semester's
-- handout, a particular sitting's exam), can optionally attach to a
-- specific course_offering as well as to course-level content.

create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  short_name text,
  country text,
  city text,
  logo_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.institutions
  for each row execute function public.set_updated_at();

create table public.faculties (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  name text not null,
  code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institution_id, name)
);
create trigger set_updated_at before update on public.faculties
  for each row execute function public.set_updated_at();

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  faculty_id uuid not null references public.faculties(id) on delete cascade,
  name text not null,
  code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (faculty_id, name)
);
create trigger set_updated_at before update on public.departments
  for each row execute function public.set_updated_at();

create table public.programmes (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  name text not null,
  code text,
  degree_type text,
  duration_years smallint not null default 4 check (duration_years > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (department_id, name)
);
create trigger set_updated_at before update on public.programmes
  for each row execute function public.set_updated_at();

create table public.levels (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.programmes(id) on delete cascade,
  name text not null,                -- e.g. "200 Level"
  numeric_value smallint not null,   -- e.g. 200, used for ordering/filtering
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (programme_id, numeric_value)
);
create trigger set_updated_at before update on public.levels
  for each row execute function public.set_updated_at();

create table public.academic_sessions (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  name text not null,                -- e.g. "2026/2027"
  start_date date,
  end_date date,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institution_id, name)
);
create trigger set_updated_at before update on public.academic_sessions
  for each row execute function public.set_updated_at();

create table public.semesters (
  id uuid primary key default gen_random_uuid(),
  academic_session_id uuid not null references public.academic_sessions(id) on delete cascade,
  name text not null,                -- e.g. "First Semester"
  numeric_value smallint not null check (numeric_value in (1, 2, 3)),
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academic_session_id, numeric_value)
);
create trigger set_updated_at before update on public.semesters
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Student CURRENT academic context (added to profiles now that the
-- referenced tables exist — see migration 003 for why profiles itself was
-- created earlier).
--
-- IMPORTANT DISTINCTION (see docs/database-architecture.md "Current
-- context vs. academic history"): these columns represent only the
-- student's *current* institution/faculty/department/programme/level/
-- session/semester — the context used to decide which course offerings
-- they see right now. They are intentionally mutable and are NOT the
-- record of academic history. History lives in course_enrollments,
-- lesson_progress, topic_progress, exam_attempts, practice_sessions, etc.,
-- which key off specific course_offering/lesson/exam rows rather than off
-- "the student's current level" — so changing current_level_id or
-- current_semester_id here never deletes, overwrites, or reinterprets any
-- past row in those tables. A student moving from 100L First Semester to
-- 100L Second Semester, and later to 200L First Semester, keeps every
-- prior semester's enrollments and progress fully intact and queryable.
-- ---------------------------------------------------------------------

alter table public.profiles
  add column institution_id uuid references public.institutions(id) on delete set null,
  add column faculty_id uuid references public.faculties(id) on delete set null,
  add column department_id uuid references public.departments(id) on delete set null,
  add column programme_id uuid references public.programmes(id) on delete set null,
  add column level_id uuid references public.levels(id) on delete set null,
  add column current_session_id uuid references public.academic_sessions(id) on delete set null,
  add column current_semester_id uuid references public.semesters(id) on delete set null,
  add column onboarding_completed_at timestamptz;

comment on column public.profiles.level_id is
  'Student''s CURRENT level. Mutable via Settings -> Academic Profile ->
  "Change Academic Context". Does not affect historical records.';
comment on column public.profiles.current_semester_id is
  'Student''s CURRENT semester within current_session_id. Paired with
  level_id/programme_id to resolve which course_offerings the student
  currently sees (see the "student course filtering" query pattern in
  docs/database-architecture.md).';

-- ---------------------------------------------------------------------
-- Academic context consistency guard
-- ---------------------------------------------------------------------
-- Enforces "do not allow arbitrary combinations that do not exist in the
-- database" for the student's current context. Each check only fires when
-- BOTH the child and its parent are already set, so onboarding can still
-- fill these columns in one at a time (institution, then faculty, then
-- department, ...) without tripping the guard on a still-incomplete row —
-- but once both are present they must actually chain together, e.g. a
-- non-null department_id must belong to the profile's own faculty_id.

create or replace function public.validate_profile_academic_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.faculty_id is not null and new.institution_id is not null then
    if not exists (
      select 1 from public.faculties
      where id = new.faculty_id and institution_id = new.institution_id
    ) then
      raise exception 'faculty_id % does not belong to institution_id %', new.faculty_id, new.institution_id;
    end if;
  end if;

  if new.department_id is not null and new.faculty_id is not null then
    if not exists (
      select 1 from public.departments
      where id = new.department_id and faculty_id = new.faculty_id
    ) then
      raise exception 'department_id % does not belong to faculty_id %', new.department_id, new.faculty_id;
    end if;
  end if;

  if new.programme_id is not null and new.department_id is not null then
    if not exists (
      select 1 from public.programmes
      where id = new.programme_id and department_id = new.department_id
    ) then
      raise exception 'programme_id % does not belong to department_id %', new.programme_id, new.department_id;
    end if;
  end if;

  if new.level_id is not null and new.programme_id is not null then
    if not exists (
      select 1 from public.levels
      where id = new.level_id and programme_id = new.programme_id
    ) then
      raise exception 'level_id % does not belong to programme_id %', new.level_id, new.programme_id;
    end if;
  end if;

  if new.current_session_id is not null and new.institution_id is not null then
    if not exists (
      select 1 from public.academic_sessions
      where id = new.current_session_id and institution_id = new.institution_id
    ) then
      raise exception 'current_session_id % does not belong to institution_id %', new.current_session_id, new.institution_id;
    end if;
  end if;

  if new.current_semester_id is not null and new.current_session_id is not null then
    if not exists (
      select 1 from public.semesters
      where id = new.current_semester_id and academic_session_id = new.current_session_id
    ) then
      raise exception 'current_semester_id % does not belong to current_session_id %', new.current_semester_id, new.current_session_id;
    end if;
  end if;

  return new;
end;
$$;

create trigger validate_profile_academic_context
  before insert or update on public.profiles
  for each row execute function public.validate_profile_academic_context();

-- ---------------------------------------------------------------------
-- Courses (reusable identity) & course offerings (delivery context)
-- ---------------------------------------------------------------------

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  course_code text not null unique,     -- e.g. "MTH101" — see docs for the V1 global-uniqueness caveat
  title text not null,
  description text,
  credit_units smallint not null default 0 check (credit_units >= 0),
  course_type text,                     -- e.g. "core", "elective"
  department_id uuid references public.departments(id) on delete set null,
  status public.content_status not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.courses
  for each row execute function public.set_updated_at();

create table public.course_offerings (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  programme_id uuid not null references public.programmes(id) on delete cascade,
  level_id uuid not null references public.levels(id) on delete cascade,
  semester_id uuid not null references public.semesters(id) on delete cascade,
  capacity int check (capacity is null or capacity > 0),
  status public.content_status not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_offerings_unique_context unique (course_id, programme_id, level_id, semester_id)
);
create trigger set_updated_at before update on public.course_offerings
  for each row execute function public.set_updated_at();

comment on constraint course_offerings_unique_context
  on public.course_offerings is
  'The same course_id may appear in many rows here — once per distinct
  programme/level/semester combination it is offered under (e.g. CSC101 to
  Programme A 100L/1st AND separately to Programme B 100L/1st) — this is
  exactly what keeps Course (reusable identity) and Course Offering
  (specific delivery context) from collapsing back into one duplicated
  concept. See the design note at the top of this file.';

-- Admin-side integrity guard, mirroring validate_profile_academic_context()
-- above: prevents an Admin (or a buggy CMS form) from saving a course
-- offering whose programme/level/semester/institution do not actually
-- chain together, per the "IMPORTANT CLARIFICATION" requirement that this
-- relationship "must be represented and enforced at the database/backend
-- level," not merely by frontend dropdown filtering.
create or replace function public.validate_course_offering_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.programmes p
    join public.departments d on d.id = p.department_id
    join public.faculties f on f.id = d.faculty_id
    where p.id = new.programme_id and f.institution_id = new.institution_id
  ) then
    raise exception 'programme_id % does not belong to institution_id %', new.programme_id, new.institution_id;
  end if;

  if not exists (
    select 1 from public.levels
    where id = new.level_id and programme_id = new.programme_id
  ) then
    raise exception 'level_id % does not belong to programme_id %', new.level_id, new.programme_id;
  end if;

  if not exists (
    select 1 from public.semesters s
    join public.academic_sessions a on a.id = s.academic_session_id
    where s.id = new.semester_id and a.institution_id = new.institution_id
  ) then
    raise exception 'semester_id % does not belong to institution_id %', new.semester_id, new.institution_id;
  end if;

  return new;
end;
$$;

create trigger validate_course_offering_context
  before insert or update on public.course_offerings
  for each row execute function public.validate_course_offering_context();

create table public.course_enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  course_offering_id uuid not null references public.course_offerings(id) on delete cascade,
  status public.enrollment_status not null default 'active',
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (student_id, course_offering_id)
);

-- ---------------------------------------------------------------------
-- Topics & lessons (attached to the reusable course — see design note above)
-- ---------------------------------------------------------------------

create table public.course_topics (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  description text,
  display_order int not null default 0,
  status public.content_status not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.course_topics
  for each row execute function public.set_updated_at();

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.course_topics(id) on delete cascade,
  title text not null,
  introduction text,
  learning_objectives text[],
  core_concept text,
  detailed_explanation text,
  examples text,
  formulas text,
  key_points text[],
  notes text,
  additional_resources jsonb not null default '[]'::jsonb,
  estimated_reading_minutes int check (estimated_reading_minutes is null or estimated_reading_minutes > 0),
  display_order int not null default 0,
  status public.content_status not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.lessons
  for each row execute function public.set_updated_at();

create table public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  completed_at timestamptz,
  xp_awarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, lesson_id)
);
create trigger set_updated_at before update on public.lesson_progress
  for each row execute function public.set_updated_at();

comment on column public.lesson_progress.xp_awarded is
  'Set true the first (and only) time XP is granted for this lesson, so a '
  'student re-marking a lesson complete can never farm repeat XP.';

create table public.topic_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid not null references public.course_topics(id) on delete cascade,
  lessons_completed int not null default 0,
  lessons_total int not null default 0,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (student_id, topic_id)
);
create trigger set_updated_at before update on public.topic_progress
  for each row execute function public.set_updated_at();
