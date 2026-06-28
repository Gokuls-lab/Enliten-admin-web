CREATE TABLE IF NOT EXISTS public.mock_interview_profiles (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  resume_storage_path TEXT,
  resume_file_name TEXT,
  resume_source_mime_type TEXT,
  resume_markdown_char_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mock_interview_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  candidate_name TEXT,
  status TEXT NOT NULL DEFAULT 'initiated' CHECK (
    status IN ('initiated', 'queued', 'in_progress', 'done', 'failed', 'unknown')
  ),
  resume_storage_path TEXT,
  resume_used BOOLEAN NOT NULL DEFAULT false,
  elevenlabs_agent_id TEXT,
  elevenlabs_conversation_id TEXT UNIQUE,
  elevenlabs_call_sid TEXT,
  dynamic_variables JSONB NOT NULL DEFAULT '{}'::jsonb,
  initiation_payload JSONB,
  initiation_response JSONB,
  conversation_details JSONB,
  performance_summary JSONB,
  transcript_summary TEXT,
  call_summary_title TEXT,
  duration_secs INTEGER,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mock_interview_sessions_user_created_idx
  ON public.mock_interview_sessions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS mock_interview_sessions_user_status_idx
  ON public.mock_interview_sessions (user_id, status);

ALTER TABLE public.mock_interview_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_interview_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own mock interview profile"
  ON public.mock_interview_profiles;
CREATE POLICY "Users can manage their own mock interview profile"
  ON public.mock_interview_profiles
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own mock interview sessions"
  ON public.mock_interview_sessions;
CREATE POLICY "Users can manage their own mock interview sessions"
  ON public.mock_interview_sessions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'mock-interview-resumes',
  'mock-interview-resumes',
  false,
  10485760,
  ARRAY['text/markdown']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users can read own interview resume markdown"
  ON storage.objects;
CREATE POLICY "Users can read own interview resume markdown"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'mock-interview-resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can upload own interview resume markdown"
  ON storage.objects;
CREATE POLICY "Users can upload own interview resume markdown"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'mock-interview-resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can update own interview resume markdown"
  ON storage.objects;
CREATE POLICY "Users can update own interview resume markdown"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'mock-interview-resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'mock-interview-resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can delete own interview resume markdown"
  ON storage.objects;
CREATE POLICY "Users can delete own interview resume markdown"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'mock-interview-resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
