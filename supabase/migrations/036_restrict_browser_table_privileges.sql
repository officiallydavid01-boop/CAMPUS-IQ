-- RLS does not protect TRUNCATE, REFERENCES, TRIGGER, or MAINTAIN privileges.
-- Remove these non-application privileges from browser roles on existing public tables.
revoke truncate, references, trigger, maintain on all tables in schema public from anon, authenticated;

-- New public tables created by the migration owner should not inherit broad browser DML.
-- Default to SELECT only; migrations must explicitly grant any additional direct-write access.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public grant select on tables to anon, authenticated;
