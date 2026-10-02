# Intentionally empty

Netlify is configured (in the project UI, not `netlify.toml`) to look for
functions in `netlify/functions`. Deleting the last file in here removed the
directory from git, the build could not find it, and the deploy failed at
Initializing. This file exists purely so the directory survives.

The seven Scheduled Functions that used to live here were removed on
2 October 2026 because Netlify bills their run time against the team's credit
allowance — see `docs/CRON_JOBS.md` for every schedule, its endpoint, and how to
run them from n8n instead.

Nothing needs to be added back here. Markdown is not bundled as a function, so
this file is inert at build time.
