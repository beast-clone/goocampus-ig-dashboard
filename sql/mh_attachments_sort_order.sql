-- Drag-to-reorder for a task's files (Praveen, 23 Oct 2026). Files with an order
-- come first in that order; files added later (no order yet) follow, oldest first.
alter table mh_attachments add column if not exists sort_order int;
