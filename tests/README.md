# Tests

```bash
npm test          # once
npm run test:watch
```

Started 4 October 2026. Before this the project had no tests at all, which meant
"is anything broken?" could only ever be answered by someone going and looking —
and the answer was only as good as wherever they happened to look.

## What is here

`tests/unit` — pure functions only. No network, no database, no wall clock:
every test that cares about time passes the instant in. A suite that goes red
because the wifi blinked teaches people to ignore red, so this one cannot.

| File | Guards |
| --- | --- |
| `session-payload.test.ts` | Who is logged in and for how long. Midnight boundary, the 23:58 floor, and the refusal of every pre-expiry cookie shape. |
| `quiet-hours.test.ts` | The 00:00–06:00 stop zone. 52 n8n schedules were windowed on this rule; 06:00 being half-open is the bit that will break. |
| `client-ip.test.ts` | What the login limiter counts against. Reading the wrong end of `X-Forwarded-For` makes 5-attempts-per-15-minutes meaningless. |
| `ssrf.test.ts` | Stops a user-supplied URL pointing the server back inside the network, cloud metadata included. |
| `attendance.test.ts` | The start time a manager reads on the board. |

## Why these five first

They are the places where a bug is silent. A broken button gets reported within
the hour; a session that never expires, a rate limit keyed on a spoofable
header, or a stop zone off by one hour will sit there for months looking fine.
Each file above corresponds to a real defect found on 4 October, so the tests
are regression guards, not hypotheticals.

## The rule for adding to this

**A test that cannot fail is worse than no test**, because it buys false
confidence. When adding one, break the code on purpose and watch it go red
before you commit it. Both fixes above were checked that way: reverting the
`X-Forwarded-For` fix fails 4 tests, removing the expiry check fails 5.

## Not covered yet

API routes, React components, and anything touching Supabase or n8n. Those need
a different runner and real fixtures. The gap is deliberate, not forgotten —
`npm test` passing means these five units are sound, nothing wider.
