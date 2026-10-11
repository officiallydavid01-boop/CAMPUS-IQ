-- Hoist auth.uid() out of per-row RLS evaluation without changing policy predicates.
-- Preserve policy names, roles, commands, permissive/restrictive modes, and all non-auth expressions.
do $$
declare
  pol record;
  v_qual text;
  v_check text;
  v_stmt text;
begin
  for pol in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') like '%auth.uid()%' or coalesce(with_check, '') like '%auth.uid()%')
  loop
    v_qual := case when pol.qual is null then null else replace(pol.qual, 'auth.uid()', '(select auth.uid())') end;
    v_check := case when pol.with_check is null then null else replace(pol.with_check, 'auth.uid()', '(select auth.uid())') end;
    v_stmt := format('ALTER POLICY %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    if pol.qual is not null then v_stmt := v_stmt || format(' USING (%s)', v_qual); end if;
    if pol.with_check is not null then v_stmt := v_stmt || format(' WITH CHECK (%s)', v_check); end if;
    execute v_stmt;
  end loop;
end;
$$;
