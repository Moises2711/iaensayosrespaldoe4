-- Profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles viewable by authenticated users"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Core rehearsal data tables
CREATE TABLE IF NOT EXISTS public.scripts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author TEXT,
  genre TEXT,
  act_count INTEGER NOT NULL DEFAULT 1 CHECK (act_count > 0),
  description TEXT,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT false,
  is_public BOOLEAN NOT NULL DEFAULT false,
  raw_text TEXT,
  source_type TEXT NOT NULL DEFAULT 'seed' CHECK (source_type IN ('seed', 'manual', 'imported', 'duplicated')),
  imported_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.scenes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  script_id UUID NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  location TEXT,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.characters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  script_id UUID NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  actor_type TEXT NOT NULL DEFAULT 'ai' CHECK (actor_type IN ('user', 'ai')),
  voice TEXT,
  base_emotion TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.script_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scene_id UUID NOT NULL REFERENCES public.scenes(id) ON DELETE CASCADE,
  character_id UUID REFERENCES public.characters(id) ON DELETE SET NULL,
  line_order INTEGER NOT NULL CHECK (line_order > 0),
  text TEXT NOT NULL,
  cue TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 4 CHECK (duration_seconds > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scene_id, line_order)
);

CREATE TABLE IF NOT EXISTS public.rehearsal_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  script_id UUID REFERENCES public.scripts(id) ON DELETE SET NULL,
  scene_id UUID REFERENCES public.scenes(id) ON DELETE SET NULL,
  selected_character_id UUID REFERENCES public.characters(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('draft', 'active', 'completed')),
  mode TEXT NOT NULL DEFAULT 'individual',
  score INTEGER CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  ai_difficulty INTEGER NOT NULL DEFAULT 50 CHECK (ai_difficulty >= 0 AND ai_difficulty <= 100),
  suggest_emotions BOOLEAN NOT NULL DEFAULT true,
  allow_improv BOOLEAN NOT NULL DEFAULT true,
  feedback_enabled BOOLEAN NOT NULL DEFAULT false,
  completed_lines INTEGER NOT NULL DEFAULT 0 CHECK (completed_lines >= 0),
  total_lines INTEGER NOT NULL DEFAULT 0 CHECK (total_lines >= 0),
  repeated_lines INTEGER NOT NULL DEFAULT 0 CHECK (repeated_lines >= 0),
  skipped_lines INTEGER NOT NULL DEFAULT 0 CHECK (skipped_lines >= 0),
  clarity_score INTEGER CHECK (clarity_score IS NULL OR (clarity_score >= 0 AND clarity_score <= 100)),
  expression_score INTEGER CHECK (expression_score IS NULL OR (expression_score >= 0 AND expression_score <= 100)),
  rhythm_score INTEGER CHECK (rhythm_score IS NULL OR (rhythm_score >= 0 AND rhythm_score <= 100)),
  projection_score INTEGER CHECK (projection_score IS NULL OR (projection_score >= 0 AND projection_score <= 100)),
  memorization_score INTEGER CHECK (memorization_score IS NULL OR (memorization_score >= 0 AND memorization_score <= 100)),
  feedback_summary TEXT,
  teleprompter_session_id TEXT,
  teleprompter_status TEXT NOT NULL DEFAULT 'pending' CHECK (teleprompter_status IN ('pending', 'ready', 'running', 'stopped', 'error')),
  teleprompter_last_event TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rehearsal_highlights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.rehearsal_sessions(id) ON DELETE CASCADE,
  event_time TEXT NOT NULL,
  note TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.perfil_usuario (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  avatar_url TEXT,
  preferred_voice TEXT NOT NULL DEFAULT 'Sofia (Femenina)',
  rehearsal_mode TEXT NOT NULL DEFAULT 'individual' CHECK (rehearsal_mode IN ('individual', 'grupo', 'lectura')),
  ai_difficulty INTEGER NOT NULL DEFAULT 50 CHECK (ai_difficulty >= 0 AND ai_difficulty <= 100),
  suggest_emotions BOOLEAN NOT NULL DEFAULT true,
  allow_improv BOOLEAN NOT NULL DEFAULT true,
  feedback_enabled BOOLEAN NOT NULL DEFAULT true,
  notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  offline_mode_enabled BOOLEAN NOT NULL DEFAULT false,
  privacy_level TEXT NOT NULL DEFAULT 'privado' CHECK (privacy_level IN ('privado', 'equipo', 'publico')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.teleprompter_recordings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rehearsal_session_id UUID NOT NULL REFERENCES public.rehearsal_sessions(id) ON DELETE CASCADE,
  teleprompter_session_id TEXT NOT NULL,
  recording_id TEXT,
  character_name TEXT NOT NULL,
  segment_index INTEGER NOT NULL CHECK (segment_index >= 0),
  segment_text TEXT,
  audio_url TEXT,
  duration_sec NUMERIC CHECK (duration_sec IS NULL OR duration_sec >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX scripts_user_id_idx ON public.scripts(user_id);
CREATE INDEX scripts_public_idx ON public.scripts(is_public);
CREATE INDEX scripts_deleted_at_idx ON public.scripts(deleted_at);
CREATE INDEX scripts_source_type_idx ON public.scripts(source_type);
CREATE INDEX scenes_script_id_idx ON public.scenes(script_id);
CREATE INDEX characters_script_id_idx ON public.characters(script_id);
CREATE INDEX script_lines_scene_id_idx ON public.script_lines(scene_id);
CREATE INDEX script_lines_character_id_idx ON public.script_lines(character_id);
CREATE INDEX rehearsal_sessions_user_id_idx ON public.rehearsal_sessions(user_id);
CREATE INDEX rehearsal_sessions_updated_at_idx ON public.rehearsal_sessions(updated_at DESC);
CREATE INDEX rehearsal_sessions_teleprompter_session_id_idx ON public.rehearsal_sessions(teleprompter_session_id);
CREATE INDEX teleprompter_recordings_user_id_idx ON public.teleprompter_recordings(user_id);
CREATE INDEX teleprompter_recordings_rehearsal_session_id_idx ON public.teleprompter_recordings(rehearsal_session_id);
CREATE INDEX teleprompter_recordings_session_segment_idx ON public.teleprompter_recordings(teleprompter_session_id, segment_index);

-- Enable RLS
ALTER TABLE public.scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.script_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rehearsal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rehearsal_highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfil_usuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teleprompter_recordings ENABLE ROW LEVEL SECURITY;

-- GRANTs (Data API access)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scripts TO authenticated;
GRANT SELECT ON public.scripts TO anon;
GRANT ALL ON public.scripts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scenes TO authenticated;
GRANT SELECT ON public.scenes TO anon;
GRANT ALL ON public.scenes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.characters TO authenticated;
GRANT SELECT ON public.characters TO anon;
GRANT ALL ON public.characters TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.script_lines TO authenticated;
GRANT SELECT ON public.script_lines TO anon;
GRANT ALL ON public.script_lines TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rehearsal_sessions TO authenticated;
GRANT ALL ON public.rehearsal_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rehearsal_highlights TO authenticated;
GRANT ALL ON public.rehearsal_highlights TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.perfil_usuario TO authenticated;
GRANT ALL ON public.perfil_usuario TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teleprompter_recordings TO authenticated;
GRANT ALL ON public.teleprompter_recordings TO service_role;

-- Policies: scripts
CREATE POLICY "Scripts are readable by owner or public" ON public.scripts FOR SELECT USING (is_public OR auth.uid() = user_id);
CREATE POLICY "Users insert own scripts" ON public.scripts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own scripts" ON public.scripts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own scripts" ON public.scripts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Policies: scenes
CREATE POLICY "Scenes readable through readable scripts" ON public.scenes FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.scripts WHERE scripts.id = scenes.script_id AND (scripts.is_public OR scripts.user_id = auth.uid()))
);
CREATE POLICY "Users insert scenes for own scripts" ON public.scenes FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.scripts WHERE scripts.id = scenes.script_id AND scripts.user_id = auth.uid())
);
CREATE POLICY "Users update scenes for own scripts" ON public.scenes FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.scripts WHERE scripts.id = scenes.script_id AND scripts.user_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.scripts WHERE scripts.id = scenes.script_id AND scripts.user_id = auth.uid())
);
CREATE POLICY "Users delete scenes for own scripts" ON public.scenes FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.scripts WHERE scripts.id = scenes.script_id AND scripts.user_id = auth.uid())
);

-- Policies: characters
CREATE POLICY "Characters readable through readable scripts" ON public.characters FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.scripts WHERE scripts.id = characters.script_id AND (scripts.is_public OR scripts.user_id = auth.uid()))
);
CREATE POLICY "Users insert characters for own scripts" ON public.characters FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.scripts WHERE scripts.id = characters.script_id AND scripts.user_id = auth.uid())
);
CREATE POLICY "Users update characters for own scripts" ON public.characters FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.scripts WHERE scripts.id = characters.script_id AND scripts.user_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.scripts WHERE scripts.id = characters.script_id AND scripts.user_id = auth.uid())
);
CREATE POLICY "Users delete characters for own scripts" ON public.characters FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.scripts WHERE scripts.id = characters.script_id AND scripts.user_id = auth.uid())
);

-- Policies: script_lines
CREATE POLICY "Script lines readable through readable scenes" ON public.script_lines FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.scenes
    JOIN public.scripts ON scripts.id = scenes.script_id
    WHERE scenes.id = script_lines.scene_id
      AND (scripts.is_public OR scripts.user_id = auth.uid())
  )
);
CREATE POLICY "Users insert script lines for own scripts" ON public.script_lines FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.scenes
    JOIN public.scripts ON scripts.id = scenes.script_id
    WHERE scenes.id = script_lines.scene_id AND scripts.user_id = auth.uid()
  )
);
CREATE POLICY "Users update script lines for own scripts" ON public.script_lines FOR UPDATE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.scenes
    JOIN public.scripts ON scripts.id = scenes.script_id
    WHERE scenes.id = script_lines.scene_id AND scripts.user_id = auth.uid()
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.scenes
    JOIN public.scripts ON scripts.id = scenes.script_id
    WHERE scenes.id = script_lines.scene_id AND scripts.user_id = auth.uid()
  )
);
CREATE POLICY "Users delete script lines for own scripts" ON public.script_lines FOR DELETE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.scenes
    JOIN public.scripts ON scripts.id = scenes.script_id
    WHERE scenes.id = script_lines.scene_id AND scripts.user_id = auth.uid()
  )
);

-- Policies: rehearsal_sessions
CREATE POLICY "Rehearsal sessions readable by owner or demo" ON public.rehearsal_sessions FOR SELECT USING (user_id IS NULL OR auth.uid() = user_id);
CREATE POLICY "Users insert own rehearsal sessions" ON public.rehearsal_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own rehearsal sessions" ON public.rehearsal_sessions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own rehearsal sessions" ON public.rehearsal_sessions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Policies: rehearsal_highlights
CREATE POLICY "Highlights readable through readable sessions" ON public.rehearsal_highlights FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.rehearsal_sessions WHERE rehearsal_sessions.id = rehearsal_highlights.session_id
    AND (rehearsal_sessions.user_id IS NULL OR rehearsal_sessions.user_id = auth.uid()))
);
CREATE POLICY "Users manage highlights for own sessions" ON public.rehearsal_highlights FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.rehearsal_sessions WHERE rehearsal_sessions.id = rehearsal_highlights.session_id AND rehearsal_sessions.user_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.rehearsal_sessions WHERE rehearsal_sessions.id = rehearsal_highlights.session_id AND rehearsal_sessions.user_id = auth.uid())
);

-- Policies: perfil_usuario
CREATE POLICY "Users can read own perfil_usuario" ON public.perfil_usuario FOR SELECT TO authenticated USING (auth.uid() = id_usuario);
CREATE POLICY "Users can insert own perfil_usuario" ON public.perfil_usuario FOR INSERT TO authenticated WITH CHECK (auth.uid() = id_usuario);
CREATE POLICY "Users can update own perfil_usuario" ON public.perfil_usuario FOR UPDATE TO authenticated USING (auth.uid() = id_usuario) WITH CHECK (auth.uid() = id_usuario);

-- Policies: teleprompter_recordings
CREATE POLICY "Users can read own teleprompter recordings" ON public.teleprompter_recordings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own teleprompter recordings" ON public.teleprompter_recordings FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.rehearsal_sessions WHERE rehearsal_sessions.id = teleprompter_recordings.rehearsal_session_id AND rehearsal_sessions.user_id = auth.uid())
);
CREATE POLICY "Users can update own teleprompter recordings" ON public.teleprompter_recordings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own teleprompter recordings" ON public.teleprompter_recordings FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- updated_at triggers
CREATE TRIGGER update_scripts_updated_at BEFORE UPDATE ON public.scripts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_rehearsal_sessions_updated_at BEFORE UPDATE ON public.rehearsal_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_perfil_usuario_updated_at BEFORE UPDATE ON public.perfil_usuario FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_teleprompter_recordings_updated_at BEFORE UPDATE ON public.teleprompter_recordings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile + perfil_usuario on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_name TEXT;
BEGIN
  resolved_name := COALESCE(
    NEW.raw_user_meta_data ->> 'display_name',
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'name'
  );

  INSERT INTO public.profiles (user_id, display_name, avatar_url)
  VALUES (NEW.id, resolved_name, NEW.raw_user_meta_data ->> 'avatar_url')
  ON CONFLICT (user_id) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      avatar_url = EXCLUDED.avatar_url;

  INSERT INTO public.perfil_usuario (user_id, display_name, email, avatar_url)
  VALUES (NEW.id, resolved_name, NEW.email, NEW.raw_user_meta_data ->> 'avatar_url')
  ON CONFLICT (user_id) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      email = EXCLUDED.email,
      avatar_url = EXCLUDED.avatar_url;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Seed catalog data
INSERT INTO public.scripts (id, title, author, genre, act_count, description, is_favorite, is_active, is_public, source_type, created_at, updated_at)
VALUES
  ('00000000-0000-4000-8000-000000000101', 'Romeo y Julieta', 'William Shakespeare', 'Drama', 2, 'La obra narra la historia de amor entre Romeo Montesco y Julieta Capuleto, dos jovenes enamorados cuyas familias estan enfrentadas.', true, true, true, 'seed', now() - interval '2 days', now() - interval '2 days'),
  ('00000000-0000-4000-8000-000000000102', 'Hamlet', 'William Shakespeare', 'Drama', 5, 'El principe Hamlet busca la verdad tras la muerte de su padre y enfrenta una corte marcada por la duda.', false, false, true, 'seed', now() - interval '1 day', now() - interval '1 day'),
  ('00000000-0000-4000-8000-000000000103', 'La casa de Bernarda Alba', 'Federico Garcia Lorca', 'Drama', 3, 'Bernarda impone un luto rigido a sus hijas, desatando deseo, silencio y conflicto familiar.', false, false, true, 'seed', now() - interval '5 days', now() - interval '5 days'),
  ('00000000-0000-4000-8000-000000000104', 'Esperando a Godot', 'Samuel Beckett', 'Absurdo', 2, 'Dos personajes esperan a alguien que nunca llega mientras el tiempo se vuelve circular.', false, false, true, 'seed', now() - interval '7 days', now() - interval '7 days'),
  ('00000000-0000-4000-8000-000000000105', 'La importancia de llamarse Ernesto', 'Oscar Wilde', 'Comedia', 3, 'Una comedia de identidades, ingenio social y enredos romanticos.', false, false, true, 'seed', now() - interval '14 days', now() - interval '14 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.scenes (id, script_id, title, location, description, sort_order)
VALUES
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 'Escena 1', 'Verona', 'Primer encuentro entre las familias enfrentadas.', 1),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000101', 'Escena 2 - Balcon', 'Patio de la casa Capuleto', 'Romeo visita a Julieta en su balcon durante la noche.', 2),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000102', 'Escena 4', 'Castillo de Elsinor', 'Hamlet encara una decision que cambiara su destino.', 4)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.characters (id, script_id, name, role, actor_type, voice, base_emotion, sort_order)
VALUES
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000101', 'Romeo', 'Protagonista', 'user', 'Tu voz', 'Enamorado', 1),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000101', 'Julieta', 'Protagonista', 'ai', 'Sofia (Femenina)', 'Romantica', 2),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000101', 'Fray Lorenzo', 'Secundario', 'ai', 'Diego (Masculina)', 'Serena', 3),
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000102', 'Hamlet', 'Protagonista', 'user', 'Tu voz', 'Dubitativo', 1),
  ('00000000-0000-4000-8000-000000000305', '00000000-0000-4000-8000-000000000102', 'Claudio', 'Antagonista', 'ai', 'Diego (Masculina)', 'Tenso', 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.script_lines (id, scene_id, character_id, line_order, text, cue, duration_seconds)
VALUES
  ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000301', 1, 'De que luz se alimenta esa ventana? Es el este, y Julieta es el sol!', 'Esperando tu respuesta...', 6),
  ('00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000302', 2, 'Es Romeo, y Romeo es el mismo! Ah, Romeo, por que eres tu Romeo!', 'La IA prepara su entrada.', 4),
  ('00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000301', 3, 'Niega a tu padre y rehusa tu nombre; o, si no quieres, jura que me amas.', 'Retoma con intencion romantica.', 6),
  ('00000000-0000-4000-8000-000000000504', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000302', 4, 'Solo tu nombre es mi enemigo; tu eres tu mismo, aunque no seas Montesco.', 'Mantener pausa dramatica.', 6),
  ('00000000-0000-4000-8000-000000000505', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000301', 5, 'Con un nombre no se que decirte quien soy; mi nombre, santa querida, me es odioso.', 'Sube la emocion sin perder claridad.', 6),
  ('00000000-0000-4000-8000-000000000506', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000302', 6, 'Mis oidos aun no han bebido cien palabras de tu boca, y ya conozco el sonido.', 'Cerrar con ternura.', 5),
  ('00000000-0000-4000-8000-000000000507', '00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000304', 1, 'Ser o no ser, esa es la cuestion.', 'Entrar con duda contenida.', 5),
  ('00000000-0000-4000-8000-000000000508', '00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000305', 2, 'Tu tristeza nubla la sala, Hamlet.', 'Responder con cautela.', 4)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.rehearsal_sessions 
ADD COLUMN IF NOT EXISTS repeated_lines INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS skipped_lines INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS clarity_score INTEGER,
ADD COLUMN IF NOT EXISTS expression_score INTEGER,
ADD COLUMN IF NOT EXISTS rhythm_score INTEGER,
ADD COLUMN IF NOT EXISTS projection_score INTEGER,
ADD COLUMN IF NOT EXISTS memorization_score INTEGER,
ADD COLUMN IF NOT EXISTS feedback_summary TEXT;
INSERT INTO public.rehearsal_sessions (id, script_id, scene_id, selected_character_id, score, mode, ai_difficulty, suggest_emotions, allow_improv, feedback_enabled, completed_lines, total_lines, repeated_lines, skipped_lines, clarity_score, expression_score, rhythm_score, projection_score, memorization_score, feedback_summary, started_at, ended_at, updated_at)
VALUES
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000301', 87, 'individual', 72, true, true, true, 18, 18, 2, 0, 90, 85, 82, 88, 89, 'Mostraste gran conexion emocional y un ritmo consistente. Sigue practicando la pausa antes de responder.', now() - interval '2 days 35 minutes', now() - interval '2 days', now() - interval '2 days'),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000304', 82, 'individual', 68, true, false, true, 14, 16, 1, 1, 83, 80, 78, 85, 84, 'Buen control del texto, con oportunidad de sostener mejor el ritmo dramatico.', now() - interval '1 day 28 minutes', now() - interval '1 day', now() - interval '1 day'),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000301', 79, 'lectura', 55, false, true, false, 12, 15, 3, 0, 79, 76, 81, 78, 80, 'La lectura fue estable; conviene reforzar proyeccion y memorizacion.', now() - interval '4 days 20 minutes', now() - interval '4 days', now() - interval '4 days')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.rehearsal_highlights 
ADD COLUMN IF NOT EXISTS event_time TEXT,
ADD COLUMN IF NOT EXISTS note TEXT,
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
INSERT INTO public.rehearsal_highlights (id, session_id, event_time, note, sort_order)
VALUES
  ('00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000401', '00:04:32', 'Excelente proyeccion de voz', 1),
  ('00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-000000000401', '00:08:11', 'Buena pausa dramatica', 2),
  ('00000000-0000-4000-8000-000000000603', '00000000-0000-4000-8000-000000000401', '00:14:27', 'Emocion muy convincente', 3),
  ('00000000-0000-4000-8000-000000000604', '00000000-0000-4000-8000-000000000402', '00:03:10', 'Buen inicio de monologo', 1),
  ('00000000-0000-4000-8000-000000000605', '00000000-0000-4000-8000-000000000402', '00:09:42', 'Mejoria notable en intencion', 2)
ON CONFLICT (id) DO NOTHING;