-- Global, shared app usage stats (recaps created, unique visitors, ratings).
--
-- Previously these numbers lived only in each visitor's own browser
-- localStorage (see the now-removed src/lib/localStorage.ts), so they were
-- never actually shared across users - every new browser/device/incognito
-- session started back at 0. This moves them into Supabase so every visitor
-- sees the same real, global counts.
--
-- Safe to run more than once, same idempotency approach as
-- 20260809120000_initial_schema.sql (IF NOT EXISTS / DROP POLICY IF EXISTS /
-- CREATE OR REPLACE).

-- === app_stats (single row) ====================================================

create table if not exists public.app_stats (
  id int primary key check (id = 1),
  recaps_created bigint not null default 0,
  total_rating_sum bigint not null default 0,
  rating_count bigint not null default 0,
  created_at timestamptz not null default now()
);

insert into public.app_stats (id)
values (1)
on conflict (id) do nothing;

alter table public.app_stats enable row level security;

-- Public can read the aggregate row directly. All writes go only through the
-- SECURITY DEFINER functions below, so values can only move in valid, atomic
-- ways (e.g. "+1"), never be set to an arbitrary number by a client.
drop policy if exists "Anyone can view app stats" on public.app_stats;
create policy "Anyone can view app stats"
  on public.app_stats for select
  using (true);

-- === stats_visitors (one row per unique visitor) ===============================

create table if not exists public.stats_visitors (
  visitor_id uuid primary key,
  created_at timestamptz not null default now()
);

alter table public.stats_visitors enable row level security;

-- No policies here on purpose: this table holds nothing but visitor UUIDs
-- and isn't useful to expose directly (RLS is enabled with zero policies, so
-- normal client access is denied entirely). The aggregate visitor count is
-- exposed only via get_public_stats() below.

-- === RPC functions (SECURITY DEFINER - bypass RLS safely, only in the ways
-- === defined here) ==============================================================

create or replace function public.increment_recaps_created()
returns void
language sql
security definer
set search_path = public
as $$
  update public.app_stats set recaps_created = recaps_created + 1 where id = 1;
$$;

create or replace function public.add_app_rating(p_rating int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_rating < 1 or p_rating > 5 then
    raise exception 'rating must be between 1 and 5';
  end if;
  update public.app_stats
    set total_rating_sum = total_rating_sum + p_rating,
        rating_count = rating_count + 1
    where id = 1;
end;
$$;

create or replace function public.register_visitor(p_visitor_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.stats_visitors (visitor_id) values (p_visitor_id)
  on conflict (visitor_id) do nothing;
$$;

create or replace function public.get_public_stats()
returns table (
  recaps_created bigint,
  total_rating_sum bigint,
  rating_count bigint,
  active_users bigint
)
language sql
security definer
set search_path = public
as $$
  select
    s.recaps_created,
    s.total_rating_sum,
    s.rating_count,
    (select count(*) from public.stats_visitors) as active_users
  from public.app_stats s
  where s.id = 1;
$$;

grant execute on function public.increment_recaps_created() to anon, authenticated;
grant execute on function public.add_app_rating(int) to anon, authenticated;
grant execute on function public.register_visitor(uuid) to anon, authenticated;
grant execute on function public.get_public_stats() to anon, authenticated;
