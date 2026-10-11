-- CampusIQ — Migration 003: Profiles, roles & permissions
--
-- Role/permission model:
--   roles              — the fixed set of role names CampusIQ recognizes
--   permissions        — fine-grained capability keys (e.g. "courses.publish")
--   role_permissions   — which permissions a role grants
--   user_roles         — which role(s) a given auth.users row holds
--
-- A join-table role model (rather than a single `role` column on profiles)
-- is used deliberately: it lets a user hold more than one role (e.g. a
-- content_editor who is also a moderator) and lets new roles/permissions be
-- introduced later without a schema migration on `profiles` itself.
--
-- SECURITY: authorization is decided by these tables + the helper functions
-- below (has_role / is_admin / is_staff), evaluated with Row Level Security
-- in migration 012 — never by anything the client claims about itself.

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name public.user_role not null unique,
  description text,
  created_at timestamptz not null default now()
);

comment on table public.roles is 'Fixed catalogue of CampusIQ roles. Seeded in 014_seed.sql.';

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

comment on table public.user_roles is
  'Authoritative record of who holds which role. The initial super_admin '
  'bootstrap (see docs/database-architecture.md) inserts the first row here '
  'manually via the Supabase SQL editor — never via client-writable code.';

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
-- One row per authenticated user, 1:1 with auth.users. Academic placement
-- columns (institution_id, faculty_id, ...) are added by migration 004
-- via ALTER TABLE, once those referenced tables exist — see that file for
-- the reasoning on ordering.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  phone text,
  bio text,
  account_status public.account_status not null default 'active',
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Extends auth.users with CampusIQ-specific profile data. Row is created '
  'automatically by handle_new_user() on signup.';

-- ---------------------------------------------------------------------
-- Generic updated_at trigger
-- ---------------------------------------------------------------------
-- Reused by every table below (and in later migrations) that has an
-- `updated_at` column, so "when was this last changed" is always accurate
-- without every service having to remember to set it manually.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- New-user bootstrap
-- ---------------------------------------------------------------------
-- Creates a profile row and assigns the default 'student' role whenever a
-- new row appears in auth.users (i.e. on signup). SECURITY DEFINER is
-- required because the trigger must be able to write to public.profiles
-- and public.user_roles regardless of the new user's (nonexistent, at
-- this point) permissions.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  student_role_id uuid;
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');

  select id into student_role_id from public.roles where name = 'student';

  if student_role_id is not null then
    insert into public.user_roles (user_id, role_id)
    values (new.id, student_role_id)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Authorization helper functions
-- ---------------------------------------------------------------------
-- These are the single source of truth for "does the current user have
-- role X" and are what every RLS policy in 012_rls.sql calls into. Never
-- duplicate this logic ad hoc inside a policy — call these functions so
-- the rule only has to be gotten right once.

create or replace function public.has_role(_role public.user_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.name = _role
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('super_admin');
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('super_admin') or public.has_role('admin');
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_role('super_admin')
    or public.has_role('admin')
    or public.has_role('content_editor')
    or public.has_role('moderator');
$$;

comment on function public.is_staff() is
  'True for any elevated role (super_admin/admin/content_editor/moderator). '
  'Used to gate read access to Admin-only tables; write access is further '
  'restricted per-table to the specific roles that should be able to '
  'mutate it (see 012_rls.sql).';
