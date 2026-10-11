-- CampusIQ — Migration 011: Audit logs & platform settings

create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,             -- e.g. "course.published", "user.suspended"
  entity_type text not null,        -- e.g. "course", "competition", "user"
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,  -- previous/new values where relevant — never passwords/secrets
  created_at timestamptz not null default now()
);

comment on table public.admin_audit_logs is
  'Append-only. Nothing ever UPDATEs or DELETEs a row here (see 012_rls.sql) '
  '— it is a historical record, not a mutable log table.';

create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.platform_settings is
  'Small key/value store for admin-configurable platform settings '
  '(platform name, support email/WhatsApp, maintenance message, default '
  'XP/competition settings, feature flags). Seeded with sane defaults in '
  '014_seed.sql. Never used for anything that requires real relational '
  'integrity — those get proper tables.';
