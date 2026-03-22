create extension if not exists pgcrypto;

create table if not exists public.user_daily_quotas (
  user_key text not null,
  date date not null,
  used integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_key, date)
);

create table if not exists public.cached_results (
  user_key text not null,
  url text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_key, url)
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_key text not null,
  type text not null,
  url text,
  score integer,
  percentile integer,
  industry text,
  created_at timestamptz not null default now()
);

create index if not exists idx_events_created_at on public.events (created_at desc);
create index if not exists idx_events_type on public.events (type);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  user_key text not null,
  url text not null,
  score integer not null,
  percentile integer not null default 0,
  industry text not null default 'Unknown',
  summary text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_leads_created_at on public.leads (created_at desc);
