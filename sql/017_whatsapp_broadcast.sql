-- 017 — WhatsApp broadcast queue (Scheduler → Community Broadcast tab)
--
-- Replaces Blueticks. The dashboard owns the UI, this queue and the status; it
-- NEVER talks to WhatsApp itself: WAHA runs on the Hostinger VPS with no public
-- port, so an n8n workflow on that same VPS polls /api/scheduler/whatsapp/due,
-- sends through WAHA and writes the outcome back to /api/scheduler/whatsapp/status.
--
-- One row per recipient per message — the composer fans a multi-recipient send out
-- into separate rows, the way Blueticks does ("scheduled individually for each one"),
-- so one failed recipient never hides the others.

create table if not exists whatsapp_scheduled_messages (
  id             uuid primary key default gen_random_uuid(),
  chat_id        text not null,          -- 918892869798@c.us | 12036...@g.us | 123@newsletter
  chat_label     text,                   -- human name shown in the UI
  body           text,
  image_url      text,
  schedule_time  timestamptz not null,
  status         text not null default 'scheduled',
    -- scheduled | sending | sent | delivered | failed | canceled
  wa_message_id  text,                   -- WAHA message id, for delivery tracking
  error          text,
  created_by     text,
  created_at     timestamptz not null default now(),
  sent_at        timestamptz
);

-- The worker's only query: due rows, oldest first.
create index if not exists whatsapp_sched_due_idx
  on whatsapp_scheduled_messages (status, schedule_time);

-- Service-role only, like every other table here: the app talks to Supabase with
-- the secret key, and no anon/public policy is wanted.
alter table whatsapp_scheduled_messages enable row level security;
