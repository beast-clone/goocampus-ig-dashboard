-- Marketing Campaigns — offline-event leads that live in a sheet, not the CRM.
--
-- Run this once in the Supabase SQL editor (project: Beast Clone).
-- The dashboard's connector has no DDL permission, so this cannot be applied
-- from the app.

create table if not exists mk_campaigns (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  -- Where the leads came from. 'sheet' is the first one; 'csv'/'fillout' later.
  source_kind   text not null default 'sheet',
  -- Google spreadsheet id + tab name, once connected.
  source_ref    text,
  source_tab    text,
  -- Which of the sheet's own columns identifies a row, chosen at import. Updates
  -- are written back by matching on this, so it must be unique in the sheet.
  key_column    text,
  -- Sheet column header -> dashboard field, as agreed at import.
  column_map    jsonb not null default '{}'::jsonb,
  created_by    text,
  created_at    timestamptz not null default now(),
  last_synced_at timestamptz
);

create table if not exists mk_campaign_leads (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references mk_campaigns(id) on delete cascade,
  -- The value of the sheet's key column for this row. Unique per campaign so a
  -- re-import updates a lead rather than duplicating it.
  row_key      text not null,
  name         text,
  phone        text,
  email        text,
  city         text,
  interest     text,
  registered_at timestamptz,
  -- Everything else from the sheet, kept as-is so nothing is lost in mapping.
  raw          jsonb not null default '{}'::jsonb,

  -- Dashboard-owned fields. These are the ONLY ones written back to the sheet.
  status       text not null default 'Pending',   -- Confirmed | Pending | Not attending
  notes        text,
  called_at    timestamptz,
  owner_key    text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (campaign_id, row_key)
);

create index if not exists mk_campaign_leads_campaign_idx on mk_campaign_leads (campaign_id);
create index if not exists mk_campaign_leads_status_idx   on mk_campaign_leads (campaign_id, status);

comment on table mk_campaigns is
  'Offline-event lead lists imported from a Google Sheet. See docs/CAMPAIGNS_SPEC.md.';
comment on column mk_campaign_leads.row_key is
  'Value of the sheet''s chosen key column. Write-back matches on this; duplicates are refused at import.';
comment on column mk_campaign_leads.status is
  'Dropdown in the dashboard, plain text in the sheet.';
