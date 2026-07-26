# StoryMaker — Project Instructions

## Permissions / confirmations
- This session runs with confirmations suppressed. The user has authorized running commands (build, lint, test, git, file edits) without asking for per-command approval. Skip confirmation prompts; do not ask "should I proceed?" for routine dev commands.

## Git workflow
- Default standing rule: commit and push new changes to `main` (remote `origin` → `git@github.com:RPBMedia/story-maker.git`).
- Exception: when a specific task explicitly requests a feature branch, honor that task's branch instruction instead, then merge/push per the task.
- Commit as `RPBMedia` / `rui.palma.baiao@gmail.com`.

## Stack
- Vite + React + TypeScript, Supabase backend.
- Scripts: see `package.json` (`npm run dev`, `npm run build`, lint, test).
