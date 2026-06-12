-- 1. Tabla de grupos
CREATE TABLE IF NOT EXISTS public.rehearsal_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description text,
  invite_code text NOT NULL UNIQUE CHECK (length(invite_code) BETWEEN 6 AND 16),
  owner_id    uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rehearsal_groups TO authenticated;
GRANT ALL ON public.rehearsal_groups TO service_role;

ALTER TABLE public.rehearsal_groups ENABLE ROW LEVEL SECURITY;

-- 2. Tabla de miembros
CREATE TABLE IF NOT EXISTS public.rehearsal_group_members (
  group_id  uuid NOT NULL REFERENCES public.rehearsal_groups(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL,
  role      text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rehearsal_group_members TO authenticated;
GRANT ALL ON public.rehearsal_group_members TO service_role;

ALTER TABLE public.rehearsal_group_members ENABLE ROW LEVEL SECURITY;

-- 3. Función security-definer
CREATE OR REPLACE FUNCTION public.is_group_member(_group_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rehearsal_group_members
    WHERE group_id = _group_id AND user_id = _user_id
  );
$$;

-- 4. RLS rehearsal_groups
CREATE POLICY "Members can read their groups"
  ON public.rehearsal_groups FOR SELECT TO authenticated
  USING (public.is_group_member(id, auth.uid()) OR owner_id = auth.uid());

CREATE POLICY "Authenticated users can create groups"
  ON public.rehearsal_groups FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owner can update group"
  ON public.rehearsal_groups FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owner can delete group"
  ON public.rehearsal_groups FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- 5. RLS rehearsal_group_members
CREATE POLICY "Members can read membership of their groups"
  ON public.rehearsal_group_members FOR SELECT TO authenticated
  USING (public.is_group_member(group_id, auth.uid()));

CREATE POLICY "User can insert their own membership"
  ON public.rehearsal_group_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Owner or self can remove members"
  ON public.rehearsal_group_members FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.rehearsal_groups g
      WHERE g.id = rehearsal_group_members.group_id AND g.owner_id = auth.uid()
    )
  );

-- 6. Trigger updated_at
CREATE TRIGGER trg_rehearsal_groups_updated_at
  BEFORE UPDATE ON public.rehearsal_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Vincular libretos a grupos
ALTER TABLE public.scripts
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.rehearsal_groups(id) ON DELETE SET NULL;

CREATE INDEX idx_scripts_group_id ON public.scripts(group_id) WHERE group_id IS NOT NULL;

-- 8. Política de lectura ampliada (grupos + soft delete)
DROP POLICY IF EXISTS "Scripts are readable by owner or public" ON public.scripts;

CREATE POLICY "Scripts readable by owner, public, or group members"
  ON public.scripts FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      is_public
      OR auth.uid() = user_id
      OR (group_id IS NOT NULL AND public.is_group_member(group_id, auth.uid()))
    )
  );

-- 9. Auto-añadir owner como miembro
CREATE OR REPLACE FUNCTION public.add_group_owner_as_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.rehearsal_group_members (group_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_add_group_owner ON public.rehearsal_groups;
CREATE TRIGGER trg_add_group_owner
  AFTER INSERT ON public.rehearsal_groups
  FOR EACH ROW EXECUTE FUNCTION public.add_group_owner_as_member();