-- LinkedIn auto-refresh: keep the OAuth refresh token next to the access token so
-- lib/integration-tokens.ts can mint a new access token on its own (no redeploy,
-- no human pasting a token every ~60 days).
--
-- RLS stays enabled; the app uses the service-role client which bypasses it.

alter table mh_integration_tokens add column if not exists refresh_token text;
alter table mh_integration_tokens add column if not exists refresh_expires_at timestamptz;

comment on column mh_integration_tokens.refresh_token is
  'Long-lived OAuth refresh token. LinkedIn ROTATES this on every use — each refresh returns a new one and kills the old — so it is re-saved on every renewal. Losing a rotation permanently breaks auto-refresh.';

comment on column mh_integration_tokens.refresh_expires_at is
  'When the refresh token itself dies. LinkedIn: ~1 year from the ORIGINAL authorisation — refreshing does NOT reset it. Past this date a human must re-authorise the app once.';
