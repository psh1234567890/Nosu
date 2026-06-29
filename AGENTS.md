# AGENTS.md

## Project

* This is the `노수베스트` React/Vite/Express MVP.
* The current product direction is to move from a deployed MVP to a production-ready public service.
* Work in small, high-confidence changes.
* Do not refactor, reformat, move files, or add dependencies unless the active ticket explicitly requires it.

## TODO workflow

* Read `TODO.md`.
* Under `## 대기`, select only the first `[대기]` ticket.
* Do not summarize the whole TODO file.
* At task start, change that ticket to `[진행]`.
* At task completion, change it to `[완료]`.
* If the user explicitly asks only to maintain `TODO.md` or `AGENTS.md`, do not pick or mark a TODO ticket.

## File access

* Read only files directly related to the selected ticket.
* Prefer 2–3 files maximum.
* Do not scan the whole repository.
* Use `rg` only when a symbol, route, component, or failing error requires it.
* Report any extra files read beyond the directly related files.

## Safety

* Do not overwrite user changes.
* If there are unexpected diffs, permission problems, merge conflicts, or required missing dependencies, stop and report.
* Do not bypass blocked permissions.
* Never commit real secrets, API keys, phone numbers, Supabase service-role keys, or Render environment values.
* If a ticket requires a real production secret or dashboard-only setting, implement code/docs that name the required env var and stop for the user to enter the value in the provider dashboard.
* Do not send real SMS, run destructive database migrations, change paid plans, or rotate live credentials unless the active ticket and the user prompt both explicitly require it.

## Verification

* Run only the smallest verification that is directly relevant to the active ticket.
* If the user says not to verify, do not run checks.
* For deployment or production-readiness tickets, prefer local static checks and read-only health checks unless the ticket explicitly requires a live deployment action.

## Final report

Report only:

1. Modified files
2. Completed ticket title and brief summary
3. Extra files read, or `없음`
4. For documentation-only maintenance, report the document update summary instead of a completed ticket.
