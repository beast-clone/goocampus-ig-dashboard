-- 039 — the on-camera pair, set on the Team page (27 Oct).
--
-- "When Nikhil presents, Nandu edits" (and Nandu editing puts Nikhil on camera) was
-- typed into the code (takeover VIDEO_PAIR, My Day PAIR_EDITOR / PAIR_PRESENTER).
-- Now each person may name one edit partner: when they present a pool video, the edit
-- goes straight to that person; when that person edits, they go on camera. Empty =
-- no pair. Value reproduces today's pair. Safe to run twice.

alter table mh_team_members add column if not exists edit_partner text
  references mh_team_members(key) on update cascade on delete set null;
update mh_team_members set edit_partner = 'nandu' where key = 'nikhil' and edit_partner is null;
