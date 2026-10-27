-- 038 — each person's shift start, set on the Team page (27 Oct).
--
-- Shift hours were typed into the code: everyone 9:00, Nandu 10:00 (quiet hours,
-- My Day's plan start, the Hub's workload). They now come from this column, next to
-- the workflow role (mh_team_members.role: writer / designer / editor / manager),
-- and both are edited on the Team page. Values reproduce today's behaviour.
-- Safe to run twice.

alter table mh_team_members add column if not exists shift_start text not null default '09:00'
  check (shift_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
update mh_team_members set shift_start = '10:00' where key = 'nandu' and shift_start = '09:00';
