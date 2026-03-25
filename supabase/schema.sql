create extension if not exists pgcrypto;

create table if not exists public.crews (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  code text not null unique,
  name text not null,
  role text not null default 'crew',
  created_at timestamptz not null default now()
);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  bib text not null unique,
  name text not null,
  category text not null default 'general',
  created_at timestamptz not null default now()
);

create table if not exists public.checkpoints (
  id text primary key,
  code text not null unique,
  name text not null,
  km_marker numeric not null,
  order_index integer not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.scans (
  id uuid primary key default gen_random_uuid(),
  client_scan_id text not null unique,
  race_id text not null,
  checkpoint_id text not null references public.checkpoints(id),
  participant_id uuid not null references public.participants(id),
  bib text not null,
  crew_id uuid references public.crews(id),
  crew_code text not null,
  device_id text not null,
  scanned_at timestamptz not null,
  captured_offline boolean not null default false,
  server_received_at timestamptz not null default now(),
  position integer not null,
  created_at timestamptz not null default now()
);

create unique index if not exists scans_race_checkpoint_bib_unique
  on public.scans (race_id, checkpoint_id, bib);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  race_id text,
  checkpoint_id text,
  bib text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.top5_notifications (
  id uuid primary key default gen_random_uuid(),
  checkpoint_id text not null references public.checkpoints(id),
  participant_id uuid not null references public.participants(id),
  bib text not null,
  position integer not null,
  telegram_message_id text,
  delivered boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (checkpoint_id, bib, position)
);
