-- Individual (per-person) dashboard tables for the /me workspace.
-- Accessed ONLY via the app's service-role key (SUPABASE_SECRET_KEY), which
-- bypasses RLS. RLS is enabled with NO policies so the anon/publishable key
-- can neither read nor write these tables (matches the mh_* security posture).

-- Cross-functional pin board (shared by the whole team).
create table if not exists ind_pins (
  id uuid primary key default gen_random_uuid(),
  author_id text not null,
  author_initials text,
  text text not null,
  created_at timestamptz not null default now()
);
alter table ind_pins enable row level security;
create index if not exists ind_pins_created_idx on ind_pins (created_at desc);

-- Per-person day-plan tasks.
create table if not exists ind_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text not null,
  kind text,                                   -- carousel | reel | post | photoshoot | meeting
  est_min int,
  status text not null default 'todo',         -- todo | now | done
  plan_date date not null default ((now() at time zone 'Asia/Kolkata')::date),
  sort int not null default 0,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
alter table ind_tasks enable row level security;
create index if not exists ind_tasks_user_date_idx on ind_tasks (user_id, plan_date);

-- Shared daily standup notes (tickable).
create table if not exists ind_standup (
  id uuid primary key default gen_random_uuid(),
  user_id text,                                -- assignee whose note this is
  author_id text not null,
  text text not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
alter table ind_standup enable row level security;

-- Per-person reminders (webinars, launches, etc.).
create table if not exists ind_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  title text not null,
  alert_at timestamptz,
  remind_before_min int default 60,
  created_at timestamptz not null default now()
);
alter table ind_reminders enable row level security;

-- Cross-functional team chat (channel = 'general' or a userId for DMs).
create table if not exists ind_chat (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'general',
  from_id text not null,
  text text not null,
  created_at timestamptz not null default now()
);
alter table ind_chat enable row level security;
create index if not exists ind_chat_channel_idx on ind_chat (channel, created_at);
