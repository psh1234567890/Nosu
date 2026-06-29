# AGENTS.md

## Project

* This is the `노수베스트` React/Vite/Express MVP.
* Work in small, high-confidence changes.
* Do not refactor, reformat, move files, or add dependencies unless the active ticket explicitly requires it.

## TODO workflow

* Read `TODO.md`.
* Under `## 대기`, select only the first `[대기]` ticket.
* Do not summarize the whole TODO file.
* At task start, change that ticket to `[진행]`.
* At task completion, change it to `[완료]`.

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

## Final report

Report only:

1. Modified files
2. Completed ticket title and brief summary
3. Extra files read, or `없음`
