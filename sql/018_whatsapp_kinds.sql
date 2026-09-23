-- 018 — WhatsApp broadcast: message kinds (Community Broadcast tab)
--
-- The tab now sends three things, all through the same queue and the same n8n
-- worker, which branches on `kind`:
--   message → WAHA POST /api/sendText        (or /api/sendImage when image_url is set)
--   poll    → WAHA POST /api/sendPoll        payload: { name, options[], multipleAnswers }
--   status  → WAHA POST /api/{session}/status/text | /status/image
--             chat_id is 'status@broadcast'; it goes to all contacts, because
--             picking contacts needs the NOWEB store, which isn't enabled yet.
alter table whatsapp_scheduled_messages
  add column if not exists kind text not null default 'message',
  add column if not exists payload jsonb;
