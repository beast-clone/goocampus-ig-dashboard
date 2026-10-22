-- Per-post publishing history (22 Oct 2026). Records what the n8n publisher does to a
-- post — picks it up, waits on Instagram's video processing, publishes it, fails — in
-- mh_activity, so the task's history shows it next to what people did. People's own
-- queue actions (schedule, publish now, reschedule, take out) are logged with their
-- name by the API routes; this only logs the transitions those routes never make.
create or replace function mh_log_publish_status() returns trigger
language plpgsql as $$
declare
  -- A reel Instagram is still processing is handed back as 'scheduled' between runs;
  -- picking it up again is a re-check, not a new start.
  rechecking boolean := old.publish_status = 'scheduled' and coalesce(old.custom ? 'ig_creation_id', false);
begin
  if new.publish_status is not distinct from old.publish_status then
    return null;
  end if;
  if new.publish_status = 'publishing' and not rechecking then
    insert into mh_activity (post_id, action, from_value, to_value)
      values (new.id, 'publish_started', old.publish_status, 'publishing');
  elsif new.publish_status = 'scheduled' and old.publish_status = 'publishing'
        and coalesce(new.custom ? 'ig_creation_id', false) then
    insert into mh_activity (post_id, action, to_value)
      values (new.id, 'publish_processing', coalesce(new.custom->>'attempts', '1'));
  elsif new.publish_status = 'published' then
    insert into mh_activity (post_id, action, to_value)
      values (new.id, 'published', coalesce(new.instagram_url, new.facebook_url));
  elsif new.publish_status = 'failed' then
    insert into mh_activity (post_id, action, from_value, to_value, detail)
      values (new.id, 'publish_failed', old.publish_status, 'failed', to_jsonb(new.failure_reason));
  end if;
  return null;
end $$;

drop trigger if exists mh_publish_status_log on mh_posts;
create trigger mh_publish_status_log after update of publish_status on mh_posts
  for each row execute function mh_log_publish_status();
