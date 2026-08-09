-- Movies & TV Recaps Maker - Supabase schema
--
-- Run this once in your Supabase project's SQL Editor (Dashboard -> SQL Editor -> New query),
-- after creating the project. See README.md for the full setup walkthrough.
--
-- Before running this, enable anonymous sign-ins:
--   Dashboard -> Authentication -> Sign In / Providers -> Anonymous Sign-Ins -> Enable
-- The site works without anyone creating a real account - every visitor gets a real
-- (but anonymous) Supabase user automatically, which is what these tables' Row Level
-- Security policies key off of (auth.uid()).

-- === recaps ===================================================================

create table if not exists public.recaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  genre text,
  description text,
  script_text text not null,
  video_url text,
  audio_url text,
  duration integer not null default 0,
  cut_interval integer not null default 0,
  rating text check (rating in ('up', 'down')),
  created_at timestamptz not null default now()
);

alter table public.recaps enable row level security;

create policy "Users can view their own recaps"
  on public.recaps for select
  using (auth.uid() = user_id);

create policy "Users can insert their own recaps"
  on public.recaps for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own recaps"
  on public.recaps for update
  using (auth.uid() = user_id);

create policy "Users can delete their own recaps"
  on public.recaps for delete
  using (auth.uid() = user_id);

create index if not exists recaps_user_id_created_at_idx
  on public.recaps (user_id, created_at desc);

-- === tuning_jobs ===============================================================
-- Tracks Gemini fine-tuning jobs (see src/lib/geminiTuning.ts) so a long-running
-- job (minutes to hours) can be checked on across sessions instead of blocking.

create table if not exists public.tuning_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_name text not null,
  base_model text not null,
  example_count integer not null,
  status text not null check (status in ('training', 'ready', 'failed')),
  tuned_model_name text,
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.tuning_jobs enable row level security;

create policy "Users can view their own tuning jobs"
  on public.tuning_jobs for select
  using (auth.uid() = user_id);

create policy "Users can insert their own tuning jobs"
  on public.tuning_jobs for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own tuning jobs"
  on public.tuning_jobs for update
  using (auth.uid() = user_id);

create index if not exists tuning_jobs_user_id_created_at_idx
  on public.tuning_jobs (user_id, created_at desc);

-- === storage ====================================================================
-- A public bucket for generated recap videos/audio - public so saved recaps can be
-- played back and downloaded via a plain URL, same as before.

insert into storage.buckets (id, name, public)
values ('recaps', 'recaps', true)
on conflict (id) do nothing;

create policy "Anyone can view recap files"
  on storage.objects for select
  using (bucket_id = 'recaps');

create policy "Signed-in users can upload recap files"
  on storage.objects for insert
  with check (bucket_id = 'recaps' and auth.role() = 'authenticated');
