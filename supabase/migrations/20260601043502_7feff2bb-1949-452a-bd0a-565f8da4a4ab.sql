
-- Allow owners to see their own soft-deleted scripts (Papelera + soft-delete RETURNING)
DROP POLICY IF EXISTS "Scripts readable by owner, public, or group members" ON public.scripts;

CREATE POLICY "Scripts readable by owner, public, or group members"
ON public.scripts
FOR SELECT
USING (
  (auth.uid() = user_id)
  OR (
    deleted_at IS NULL
    AND (
      is_public
      OR (group_id IS NOT NULL AND public.is_group_member(group_id, auth.uid()))
    )
  )
);

-- Allow 'finalizado' as a valid session/teleprompter status (used by finalizeRehearsalSession)
ALTER TABLE public.rehearsal_sessions DROP CONSTRAINT IF EXISTS rehearsal_sessions_status_check;
ALTER TABLE public.rehearsal_sessions
  ADD CONSTRAINT rehearsal_sessions_status_check
  CHECK (status = ANY (ARRAY['draft','active','completed','finalizado']));

ALTER TABLE public.rehearsal_sessions DROP CONSTRAINT IF EXISTS rehearsal_sessions_teleprompter_status_check;
ALTER TABLE public.rehearsal_sessions
  ADD CONSTRAINT rehearsal_sessions_teleprompter_status_check
  CHECK (teleprompter_status = ANY (ARRAY['pending','ready','running','stopped','error','finalizado']));
