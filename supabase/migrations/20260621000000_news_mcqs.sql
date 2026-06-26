-- ─── news_mcqs: Store daily MCQs generated from current affairs news ───────────
create table if not exists public.news_mcqs (
  id            uuid primary key default gen_random_uuid(),
  date          date not null unique,          -- one row per calendar day
  mcqs          jsonb not null default '[]',   -- array of MCQ objects
  total         integer not null default 0,
  generated_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- Index for fast date lookups from the mobile app
create index if not exists idx_news_mcqs_date on public.news_mcqs (date desc);

-- Allow anonymous reads (mobile app uses anon key)
alter table public.news_mcqs enable row level security;

create policy "Allow public read on news_mcqs"
  on public.news_mcqs for select
  using (true);

comment on table public.news_mcqs is
  'Daily MCQs auto-generated from Tamil Nadu current affairs news via AI.';
