-- Future public-schema functions are private by default; explicitly grant EXECUTE
-- only to the browser roles that need a given RPC in its migration.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- Future public tables should not expose sequences to browser roles.
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
