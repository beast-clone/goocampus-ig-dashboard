-- 044: GEO SEO (28 Oct). Do ChatGPT, Gemini, Perplexity and Google's AI answer
-- name our brands? Questions come from topics (real Google India questions and
-- searches, via DataForSEO); every check asks each question to 4 AIs and keeps
-- the full answer, so history, reports and costs are all read from here.
-- New tables only — nothing existing reads them.

create table if not exists geo_brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text,
  aliases text[] not null default '{}',
  position int not null default 0,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists geo_questions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references geo_brands(id) on delete cascade,
  topic text not null,
  question text not null,
  -- real = a Google "People also ask" question; search = reworded from a real
  -- search; choose = a "who should I choose" question; own = typed by a person
  kind text not null default 'own' check (kind in ('real','search','choose','own')),
  source text,
  paused boolean not null default false,
  deleted_at timestamptz,
  added_by text,
  created_at timestamptz not null default now()
);
create index if not exists geo_questions_brand_idx on geo_questions(brand_id);

-- One row per topic search (what was found, what it cost).
create table if not exists geo_topics (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references geo_brands(id) on delete set null,
  topic text not null,
  found jsonb not null default '[]',
  cost numeric not null default 0,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists geo_runs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references geo_brands(id) on delete set null,   -- null = every brand
  trigger text not null check (trigger in ('weekly','manual')),
  started_by text,
  status text not null default 'running' check (status in ('running','done','partial','failed')),
  questions int not null default 0,
  expected int not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- One row per question × AI per run.
create table if not exists geo_answers (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references geo_runs(id) on delete cascade,
  question_id uuid not null references geo_questions(id) on delete cascade,
  brand_id uuid not null references geo_brands(id) on delete cascade,
  engine text not null check (engine in ('chatgpt','google','gemini','perplexity')),
  task_id text,
  status text not null default 'pending' check (status in ('pending','done','failed')),
  named boolean,
  cited boolean,
  position int,
  competitors text[] not null default '{}',
  sources jsonb not null default '[]',
  answer text,
  model text,
  error text,
  cost numeric not null default 0,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists geo_answers_run_idx on geo_answers(run_id);
create index if not exists geo_answers_q_idx on geo_answers(question_id, engine, created_at desc);
create index if not exists geo_answers_pending_idx on geo_answers(status) where status = 'pending';

alter table geo_brands enable row level security;
alter table geo_questions enable row level security;
alter table geo_topics enable row level security;
alter table geo_runs enable row level security;
alter table geo_answers enable row level security;

insert into geo_brands (name, domain, aliases, position)
select * from (values
  ('GooCampus', 'goocampus.in', array['Goo Campus','GooCampus Edu'], 1),
  ('12thPlus.com', '12thplus.com', array['12thPlus','12th Plus'], 2),
  ('GooCampus World', 'goocampusworld.com', array['GooCampusWorld'], 3)
) v(name, domain, aliases, position)
where not exists (select 1 from geo_brands);
