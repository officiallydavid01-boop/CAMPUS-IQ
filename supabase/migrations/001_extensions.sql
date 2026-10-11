-- CampusIQ — Migration 001: Extensions
--
-- Enables the Postgres extensions CampusIQ relies on. Supabase projects
-- already ship most of these, but they are declared explicitly so this
-- migration set is self-describing and reproducible on a fresh project.

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pg_trgm";    -- trigram indexes for search (courses, lessons, users)
