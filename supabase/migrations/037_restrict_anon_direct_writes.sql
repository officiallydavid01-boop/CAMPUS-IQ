-- Anonymous browser sessions need no direct table or sequence writes.
-- Public read access, where explicitly allowed by RLS, remains available.
revoke insert, update, delete, truncate, references, trigger, maintain
  on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
