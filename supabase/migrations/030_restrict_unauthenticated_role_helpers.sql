-- CampusIQ security follow-up 030
-- These role predicates may be called by authenticated RLS policies and
-- authenticated SECURITY DEFINER workflows, but do not need anonymous RPC access.
REVOKE EXECUTE ON FUNCTION public.has_role(public.user_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_staff() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(public.user_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;
