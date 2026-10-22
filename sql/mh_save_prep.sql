-- The publisher's PREPARE step (n8n publisher v3) saves what it sent to Instagram /
-- Facebook ahead of a post's time. Only that one key is merged into custom, and only
-- while the post is still queued — so it can never overwrite a dashboard change.
create or replace function mh_save_prep(p_id uuid, p_prep jsonb) returns void
language sql security definer set search_path = public as $$
  update mh_posts
     set custom = coalesce(custom, '{}'::jsonb) || jsonb_build_object('prep', p_prep)
   where id = p_id and publish_status = 'scheduled';
$$;
revoke all on function mh_save_prep(uuid, jsonb) from public, anon, authenticated;
grant execute on function mh_save_prep(uuid, jsonb) to service_role;
