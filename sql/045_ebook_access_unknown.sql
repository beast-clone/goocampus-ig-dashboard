-- 045 (28 Oct): eBook orders imported from Razorpay history — whether the Drive folder
-- was shared isn't known for those, so access_shared may be null (= unknown).
alter table mm_ebook_orders alter column access_shared drop not null;
