# StoryMaker — Project Instructions

## Permissions / confirmations
- This session runs with confirmations suppressed. The user has authorized running commands (build, lint, test, git, file edits) without asking for per-command approval. Skip confirmation prompts; do not ask "should I proceed?" for routine dev commands.

## Git workflow
- **Always commit and push to `main` whenever new changes take place.** After
  completing any change (feature, fix, tweak), stage it, commit with a clear
  message, and `git push origin main` — do this automatically without waiting
  to be asked. Remote `origin` → `git@github.com:RPBMedia/story-maker.git`.
- Group a single logical change into one commit; don't commit mid-edit or
  leave the tree in a broken state (run lint/tests/build first when relevant).
- Only use a feature branch if a task *explicitly* asks for one; otherwise
  work directly on `main`.
- Commit as `RPBMedia` / `rui.palma.baiao@gmail.com`.

## Stack
- Vite + React + TypeScript, Supabase backend.
- Scripts: see `package.json` (`npm run dev`, `npm run build`, lint, test).
