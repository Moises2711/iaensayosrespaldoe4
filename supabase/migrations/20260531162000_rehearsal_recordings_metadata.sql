-- Create rehearsal_recordings_metadata table for frontend-synced metadata
CREATE TABLE IF NOT EXISTS public.rehearsal_recordings_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  user_id UUID NOT NULL,
  transcript TEXT NOT NULL,
  confidence FLOAT,
  duration_ms INTEGER,
  source VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT rehearsal_recordings_metadata_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES public.rehearsal_sessions(id) ON DELETE CASCADE,
  CONSTRAINT rehearsal_recordings_metadata_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.auth.users(id) ON DELETE CASCADE,
  CONSTRAINT non_empty_transcript CHECK (transcript != '')
);

-- Ensure rehearsal_sessions can track the latest transcript and recording count
ALTER TABLE public.rehearsal_sessions
  ADD COLUMN IF NOT EXISTS latest_transcript TEXT,
  ADD COLUMN IF NOT EXISTS latest_confidence FLOAT,
  ADD COLUMN IF NOT EXISTS recordings_count INTEGER DEFAULT 0;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_rehearsal_recordings_metadata_session_id
  ON public.rehearsal_recordings_metadata(session_id);

CREATE INDEX IF NOT EXISTS idx_rehearsal_recordings_metadata_user_id
  ON public.rehearsal_recordings_metadata(user_id);

CREATE INDEX IF NOT EXISTS idx_rehearsal_recordings_metadata_created_at
  ON public.rehearsal_recordings_metadata(created_at DESC);

ALTER TABLE public.scripts ADD COLUMN IF NOT EXISTS status TEXT;
CREATE INDEX IF NOT EXISTS idx_scripts_user_id_status
  ON public.scripts(user_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_scenes_script_id
  ON public.scenes(script_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_characters_script_id
  ON public.characters(script_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_script_lines_scene_id_line_order
  ON public.script_lines(scene_id, line_order);

CREATE INDEX IF NOT EXISTS idx_rehearsal_sessions_user_id_status
  ON public.rehearsal_sessions(user_id, status);

CREATE INDEX IF NOT EXISTS idx_rehearsal_sessions_script_id
  ON public.rehearsal_sessions(script_id);
