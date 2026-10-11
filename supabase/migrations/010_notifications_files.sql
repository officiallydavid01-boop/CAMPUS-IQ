-- CampusIQ — Migration 010: Leaderboards, notifications, announcements, files
--
-- leaderboards is an authoritative, staff/server-write-only cache table
-- (Master Spec section 50) — it is not recomputed on every read, since a
-- global leaderboard query over the whole student body would be
-- expensive to run live. Later phases add the function/Edge Function
-- that repopulates it on a schedule or on relevant events (competition
-- finalized, tournament finalized, XP milestone, etc).

create table public.leaderboards (
  id uuid primary key default gen_random_uuid(),
  scope public.leaderboard_scope not null,
  -- the id of the institution/faculty/.../competition/tournament this row
  -- ranks within, depending on `scope`; null when scope = 'global'
  scope_ref_id uuid,
  student_id uuid not null references auth.users(id) on delete cascade,
  rank int not null,
  score bigint not null,
  computed_at timestamptz not null default now(),
  unique (scope, scope_ref_id, student_id)
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  audience public.announcement_audience not null default 'everyone',
  -- interpreted according to `audience`: an institution/faculty/.../course
  -- id, a competition_id, or a tournament_id. Null when audience = 'everyone'.
  audience_ref_id uuid,
  status public.content_status not null default 'draft',
  publish_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.announcements
  for each row execute function public.set_updated_at();

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  type public.notification_type not null,
  title text not null,
  body text,
  -- polymorphic-lite pointer to the thing this notification is about
  related_type text,
  related_id uuid,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.notification_preferences (
  student_id uuid primary key references auth.users(id) on delete cascade,
  exam_reminders boolean not null default true,
  deadlines boolean not null default true,
  announcements boolean not null default true,
  competition_updates boolean not null default true,
  tournament_updates boolean not null default true,
  achievement_alerts boolean not null default true,
  streak_alerts boolean not null default true,
  course_updates boolean not null default true,
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.notification_preferences
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Files (metadata table; actual bytes live in Supabase Storage — see
-- docs/database-architecture.md "Storage model")
-- ---------------------------------------------------------------------

create table public.files (
  id uuid primary key default gen_random_uuid(),
  storage_bucket text not null,
  storage_path text not null,
  filename text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  visibility public.file_visibility not null default 'private',
  uploaded_by uuid references auth.users(id) on delete set null,
  related_type text,     -- e.g. 'material', 'lesson', 'avatar', 'competition_banner'
  related_id uuid,
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);

-- materials.file_id -> files.id, deferred from 005 until this table exists
alter table public.materials
  add constraint materials_file_id_fkey foreign key (file_id) references public.files(id) on delete set null;
