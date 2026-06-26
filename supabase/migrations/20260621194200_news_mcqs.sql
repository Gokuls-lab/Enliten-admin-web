-- Create news_mcqs table to cache AI-generated MCQs per date
-- One MCQ set is generated per date from that day's current_affairs_news content

CREATE TABLE IF NOT EXISTS public.news_mcqs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date         DATE NOT NULL,
  news_ids     TEXT[],                -- source current_affairs_news record ids used
  mcqs         JSONB NOT NULL,        -- array of MCQ objects (see schema below)
  total        INTEGER NOT NULL DEFAULT 0,
  model_used   TEXT,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT news_mcqs_date_unique UNIQUE (date)
);

-- MCQ JSONB array element schema:
-- {
--   "id": "<uuid>",
--   "question": "With reference to X...",
--   "options": [
--     { "letter": "A", "text": "..." },
--     { "letter": "B", "text": "..." },
--     { "letter": "C", "text": "..." },
--     { "letter": "D", "text": "..." }
--   ],
--   "correct_letter": "B",
--   "explanation": "...",
--   "tags": ["International Relations", "GS2"],
--   "source_title": "...",
--   "difficulty": "medium"
-- }

-- Enable Row Level Security
ALTER TABLE public.news_mcqs ENABLE ROW LEVEL SECURITY;

-- Public read — the mobile app (anon key) can fetch MCQs
CREATE POLICY "Anyone can read news MCQs"
  ON public.news_mcqs
  FOR SELECT
  USING (true);

-- Only service role can insert / update / delete
CREATE POLICY "Service role can write news MCQs"
  ON public.news_mcqs
  FOR ALL
  USING (auth.role() = 'service_role');

-- Index for fast date lookups
CREATE INDEX IF NOT EXISTS news_mcqs_date_idx ON public.news_mcqs (date DESC);
