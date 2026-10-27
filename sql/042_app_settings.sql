-- 042 — numbers the team can change on the Rules page (27 Oct): posting limits per
-- page, default time per content type, when the due-today reminder starts. Missing
-- rows mean "the built-in default" (lib/app-settings.ts). Safe to run twice.
create table if not exists mh_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table mh_settings enable row level security;
