
## Plan aprobado con tus correcciones aplicadas

### 1. Teleprompter — Forma A (Frontend + Server Function + Lovable AI)
Mantener `transcribeAudio` en `src/lib/teleprompter.functions.ts` (Gemini 2.5 Flash). Generar `teleprompter_session_id` con `crypto.randomUUID()` y persistirlo en `rehearsal_sessions`.

### 2. Estandarización a tablas en inglés
Auditar todo el frontend. Reemplazar cualquier referencia a `obra`, `usuario_obra`, `visibilidad`, `personaje`, `sesion`, etc. por **`scripts`, `characters`, `script_lines`, `scenes`, `rehearsal_sessions`, `rehearsal_highlights`, `teleprompter_recordings`**. Eliminar campos inexistentes en formularios.

### 3. Bugs y limpieza
- **Métricas:** mostrar solo `score`, `total_lines`, `completed_lines`, `status` en `ensayo.tsx` y `finalizado.tsx`. Eliminar UI de `clarity_score`, `expression_score`, `rhythm_score`, `projection_score`, `memorization_score`, `feedback_summary`, `repeated_lines`, `skipped_lines`.
- **Finalizar ensayo:** convertir el `<Link>` en handler que (a) detiene grabación, (b) `UPDATE rehearsal_sessions SET status='finalizado', ended_at=now()`, (c) invalida React Query, (d) navega a `/finalizado`. Al iniciar un nuevo ensayo desde `configuracion-ensayo.tsx`, cerrar cualquier sesión previa no finalizada.
- **Nombre dinámico:** eliminar el string `"Claudio"` y renderizar `line.character?.name` en todos lados.
- **Auditoría:** revisar consola en `/ensayo`, `/libretos`, `/finalizado`, manejar nulls en `selectedCharacter`/`currentLine`/`setup`.

### 4. CRUD de libretos — Soft delete
- Botón "Eliminar" → `UPDATE scripts SET deleted_at = now() WHERE id = ? AND user_id = auth.uid()`.
- **Todas las consultas** de lectura de `scripts` (en `libretos.tsx`, `configuracion-ensayo.tsx`, `rehearsal-data.ts`) añaden `.is('deleted_at', null)`.
- Confirmación con `AlertDialog`. Invalidación de queries + toast.

### 5. Grupos de ensayo privados — SQL completo para que ejecutes

```sql
-- ─── 1. Tabla de grupos ──────────────────────────────────────────────
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

-- ─── 2. Tabla de miembros ────────────────────────────────────────────
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

-- ─── 3. Función security-definer (evita recursión RLS) ───────────────
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

-- ─── 4. RLS de rehearsal_groups ──────────────────────────────────────
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

-- ─── 5. RLS de rehearsal_group_members ───────────────────────────────
CREATE POLICY "Members can read membership of their groups"
  ON public.rehearsal_group_members FOR SELECT TO authenticated
  USING (public.is_group_member(group_id, auth.uid()));

-- Join por código: el cliente busca el group_id desde invite_code mediante
-- una server function (admin) o un SELECT permitido cuando se conoce el código.
CREATE POLICY "User can insert their own membership"
  ON public.rehearsal_group_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Owner can remove members"
  ON public.rehearsal_group_members FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.rehearsal_groups g
      WHERE g.id = rehearsal_group_members.group_id AND g.owner_id = auth.uid()
    )
  );

-- ─── 6. Trigger updated_at ───────────────────────────────────────────
CREATE TRIGGER trg_rehearsal_groups_updated_at
  BEFORE UPDATE ON public.rehearsal_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── 7. Vincular libretos a grupos ───────────────────────────────────
ALTER TABLE public.scripts
  ADD COLUMN group_id uuid REFERENCES public.rehearsal_groups(id) ON DELETE SET NULL;

CREATE INDEX idx_scripts_group_id ON public.scripts(group_id) WHERE group_id IS NOT NULL;

-- ─── 8. Ampliar política de lectura de scripts para grupos ───────────
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

-- ─── 9. Auto-añadir owner como miembro al crear grupo ────────────────
CREATE OR REPLACE FUNCTION public.add_group_owner_as_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.rehearsal_group_members (group_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_add_group_owner
  AFTER INSERT ON public.rehearsal_groups
  FOR EACH ROW EXECUTE FUNCTION public.add_group_owner_as_member();
```

**Nota:** la política de SELECT de `scripts` ahora también filtra `deleted_at IS NULL` a nivel DB (defensa en profundidad). El frontend seguirá filtrando explícitamente igualmente.

**UI nueva (`src/routes/grupos.tsx`):**
- Listar mis grupos (nombre, código, # miembros).
- "Crear grupo" → genera `invite_code` aleatorio (8 chars A-Z0-9), `INSERT INTO rehearsal_groups`.
- "Unirse con código" → server function que busca por `invite_code` con `supabaseAdmin` e inserta membresía como `auth.uid()`.
- Ver miembros, copiar código, abandonar grupo, eliminar grupo (owner).
- En `libretos.tsx`: filtro por grupo + selector "Asignar a grupo" al editar.
- Sidebar: nuevo enlace "Grupos".

### Orden de ejecución en build mode
1. Limpieza tablas inglés + soft delete + filtros `deleted_at IS NULL`.
2. Bugs teleprompter (finalizar, nombre dinámico, métricas).
3. CRUD eliminar libretos (soft delete).
4. Ruta y UI de Grupos (consume las tablas una vez ejecutes el SQL).

Cuando pase a build mode, ejecuto en este orden. El SQL de arriba lo corres tú directamente; mi UI de grupos quedará lista para usarlo en cuanto exista.
