-- is_group_member: usada dentro de RLS policies por usuarios autenticados.
-- Revocamos a PUBLIC/anon, mantenemos a authenticated.
REVOKE EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) TO authenticated;

-- add_group_owner_as_member: solo el trigger debe llamarla.
REVOKE EXECUTE ON FUNCTION public.add_group_owner_as_member() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_group_owner_as_member() FROM anon;
REVOKE EXECUTE ON FUNCTION public.add_group_owner_as_member() FROM authenticated;