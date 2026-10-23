-- Marketing Materials (Praveen, 23 Oct 2026): six Airtable Marketing Hub tables brought
-- into the dashboard — copied once, then edited here only. Files (receipts, photos,
-- brochures) are copied into storage too: Airtable's file links expire.
-- Every table: airtable_id (the source row, so the import can be re-run safely),
-- created/updated stamps, who added it, and deleted_at (removed rows can be brought back).
-- Read and written only by the server (service key); RLS on with no policies.

create table if not exists mm_expenses (
  id uuid primary key default gen_random_uuid(),
  title text not null default '', description text, sbus text[] not null default '{}',
  expense_date date, amount numeric(12,2), owner text,
  card_last4 text,                       -- only the last 4 digits of the card, never the full number
  files jsonb not null default '[]',     -- receipts: [{url, name, mime, size}]
  airtable_id text unique, created_by text, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table if not exists mm_photos (
  id uuid primary key default gen_random_uuid(),
  title text not null default '', description text, files jsonb not null default '[]',
  non_usable boolean not null default false, design_files boolean not null default false,
  airtable_id text unique, created_by text, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table if not exists mm_materials (
  id uuid primary key default gen_random_uuid(),
  title text not null default '', files jsonb not null default '[]',
  country text, education_level text, dimensions text, kind text,
  airtable_id text unique, created_by text, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table if not exists mm_promotions (
  id uuid primary key default gen_random_uuid(),
  title text not null default '', start_date date, interest text, spend numeric(12,2),
  files jsonb not null default '[]',
  airtable_id text unique, created_by text, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table if not exists mm_subscriptions (
  id uuid primary key default gen_random_uuid(),
  title text not null default '', description text, teams text[] not null default '{}',
  amount numeric(12,2), status text, frequency text, billing text,
  airtable_id text unique, created_by text, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table if not exists mm_meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null default '', meeting_date date, attendees text[] not null default '{}',
  minutes text, cross_functional boolean not null default false,
  airtable_id text unique, created_by text, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), deleted_at timestamptz
);

alter table mm_expenses enable row level security;
alter table mm_photos enable row level security;
alter table mm_materials enable row level security;
alter table mm_promotions enable row level security;
alter table mm_subscriptions enable row level security;
alter table mm_meetings enable row level security;
