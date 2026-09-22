# Changelog — 21–22 Sep 2026

Branch **`feat/dashboard-reskin`**, HEAD **`a3ffd67`**, everything pushed.
**Nothing below is deployed.** Live is still `27b2088`. Deploy only when Praveen says "deploy".

---

## Start here if you're resuming

```bash
git fetch && git checkout feat/dashboard-reskin && git pull
npm run dev
```

Open **http://localhost:3000/dashboard/preview** and sign in.
Before any commit: `find app components lib public -name "._*" -delete`

**At the next deploy:**
- Set `SERPER_MONTHLY_BUDGET=1500` on Netlify (SEO Google research + Content Radar share it).
- All 5 users are admins **on purpose** for testing. Switch everyone except Maheen back afterwards (Team page).
- Turn on **Connect Claude** for Nandu on the Team page. Then he makes his key on the **live** site (My Account).

---

## What changed, in order

### 21 Sep
1. **Design work goes to Praveen, enforced in the database** (`9dc6c2c`, already applied).
2. **Who created each task is tracked.** Creators are notified as their task moves, and comments can be edited (`43fef1c`). The database part (sql/014) is already applied.

### 22 Sep — SEO tab
3. **SEO tab rebuilt** for Instagram and YouTube keywords for doctors. The website SEO part is removed (`8811a4d`).
4. **Keywords are grouped by topic.** You can copy a whole group and see who uses each keyword (`cdacaf2`, `8ce8f0c`, `9f827c8`).
5. **Accounts panel** (`f6e2eb8` → `af9582e`):
   - Instagram/YouTube split.
   - Add and remove accounts, with a lookup dropdown.
   - Post grid you can collapse.
   - GooCampus shown in its own "Our account" group.
   - Refresh button removed.
   - Keywords we don't use yet are marked.
   - The last good read is kept when Instagram's hourly limit hits.
6. **Ranking tab.** Our keywords by reach, views, saves, shares and engagement rate, and across all accounts per 1K followers (`cccc84e`).
7. **Keyword generator in two columns** (caption left, keywords right). You can add your own topics with AI suggestions, and each section has a short explainer (`da0b6b7`, `42ee269`).
8. **One Instagram/YouTube switch** for the whole SEO page (`b095eef`).
9. **Google research tab.** Free Google keyword research using only free sources (`653218e`).

### 22 Sep — across the dashboard
10. **Themed popups everywhere.** Every browser confirm/alert/prompt is replaced by the dashboard's own popup (`a5fe3ed`).
11. **Comment #1, AI Reports.** Monthly says it's the company report. Weekly and Quarterly regenerate when you switch account (`43904ee`).
12. **Comment #2, My Day.** The editors' Pipeline lists only videos queued for them, not the claim pool (`27d69b6`).
13. **Comment #3, My Day.** You can open a claimable video to see it before claiming (`ae8c8e3`).
14. **Comment #4, My Day.** "Sort by" dropdown on My tasks (`9c3b9bd`).
15. **Comment #5, calendars** (`6ddcbd1` → `c91e7a3`):
    - Publishing and Content calendars stay separate.
    - The content calendar gets account and SBU dropdowns and a "+" on each date.
    - The accounts are named GooCampus, GooCampus World and 12th Plus.
16. **Comment #9, profile photos and dark theme** (`bbdaec8` → `08bda72`):
    - Profile photos are uploaded on the Account page.
    - Light / Dark / System switch, saved per person.
    - White logo in dark mode, centred.
    - Every tab passes the dark-mode contrast check.
17. **New task button moved.** The floating button now sits above the Comment button (`ad36e97`).
18. **Comment #6, Revenue page** under Sales Hub (`e7e6c53`). ⚠ The Revenue Tracker has **no amounts since April 2026**. The sales team needs to fill them in; the page lists every payment that's missing one.
19. **Comment #7, audience by state and city** for Facebook and Instagram, every brand (`c6078c3`).
20. **Comment #10, Claude connector** (`df32c07`). Nandu can say "create a task" in Claude Code.
    - Primary interest and content type are **required**, and Claude asks for them if they're missing.
    - An admin turns on "Connect Claude" per person.
    - Each person makes a key on My Account and runs the command it shows once.
    - Tasks are created as that person and owned by them.
    - It can only create tasks, never edit or delete.
21. **Test data removed.** 13 rows deleted: the ZZ demo tasks, "Test Task", QA test notifications and 3 LinkedIn test posts.
22. **Posting page follows the primary interest** (`d662ac3`). The single list is `lib/sbu-pages.ts`:
    - **GooCampus World:** Mentorship Platform, 10K Mentorship
    - **GooCampus India (12th Plus):** 12thPlus.com, India NEET UG Consulting. 12th Plus is UG only.
    - **None:** Samvaya (it has its own channel)
    - **GooCampus Main:** everything else, including NEET PG, Middle East, Australia/UK PGCP, Study Abroad, University Programs, Allied Courses, SSAHE, ISIP
23. **Scheduler "Send back" button** on each Ready-to-schedule row (`a3ffd67`). It moves the post back to Content Review, and nothing is deleted.

---

## End-to-end test (22 Sep), NOT fixed yet

We tested the UAE carousel (7 DHA slides) through every step: upload → Output Ready → Content Review → Scheduler. It reached the Scheduler with the right slides, caption and page, and was **not published**. It's now back in Content Review at Output Ready. The next test uses a **different** carousel; pick one of USA, MTE, MTE 2026, Newsletter or Medical PG Roadmap.

Problems found:
1. **Slide order looks reversed in the task.** The task shows the newest upload first, and there's no way to reorder slides there. The Scheduler can reorder.
2. **Uploads are credited to the task owner**, not the person who uploaded.
3. **The task's Caption field stays empty.** The caption lives inside the content, and the Scheduler reads it from **Airtable**, which will break when Airtable is dropped.
4. **The My Day status menu can skip review** by jumping straight to "Ready to Publish" or "Published".
5. **The Content Review popup doesn't show the slides**, and it labels the whole content as "Caption".
6. **Push to Schedule works with no creative attached.**
7. **The caption includes the bracketed keyword list** "[DHA exam steps, …]", which would be published.
8. **WebP slides are untested with Instagram**, which officially wants JPEG. Nothing warns about it.
9. **Scheduled posts open view-only.** The format and cover aren't shown and nothing can be edited. The composer also ignores the task type, so a Story task opens as a Post.
10. **Scheduled LinkedIn posts never fire**, because nothing triggers `/api/cron/publish-linkedin`. Publish now works.

Also still open:
- The **Instagram/Facebook token has ~17 days left**, and the **LinkedIn token lapses around 3 Oct**.
- **13 new comments** in the Comments section: #11–#23 (90-day view, Samvaya accounts, posts vs videos, Airtable-style filters, report edit access, collaborator rules, claim bug, reminders). None are started.
- The **claim issue** for Nikhil and Nandu in My Day still needs looking at.
