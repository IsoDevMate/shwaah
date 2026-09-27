# Delivery stages

## Stage 0 — Engineering scaffold

Status: complete

Evidence:

- Backend `npm run build`: pass (2026-09-27)
- Frontend `npm run build`: pass (2026-09-27)
- Frontend repository-wide lint has 155 pre-existing errors; CI uses the clean
  TypeScript/Vite production build until that baseline is repaired separately.
- Global Cursor rules appended under `~/.cursor/rules/`
  (`eat-fish-spit-bones.mdc`, `ai-session-system.mdc`).
- **Doctrine expansion (2026-09-27):** `docs/EAT-FISH-SPIT-BONES.md` rewritten
  with full Claudegres/Multigres/Shamiri failure catalogue mapped to Presence
  Audit, Voice Notes, and Direction Engine. Always-on rules + `AGENTS.md`
  tightened to force Fish before “done.”

## Stage 1 — Instagram Presence Audit API

Status: complete

- `GET /api/v4/presence-audit/instagram/media`
- `POST /api/v4/presence-audit`
- `GET /api/v4/presence-audit`
- `GET /api/v4/presence-audit/:id`
- `POST /api/v4/presence-audit/:id/unlock-fix` (credits)

## Stage 2 — Presence Audit UI

Status: complete

- `/audit` Instagram select → diagnose → gated fix

## Stage 3 — Voice Notes bank

Status: complete

- `POST/GET/DELETE /api/v4/voice-notes`
- `/voice-notes` record/import/list/play/delete

## Stage 4 — Product entry points and Direction Engine

Status: complete

- Landing CTAs for Audit + Voice Notes
- `/direction` + `POST/GET /api/v4/direction-engine/weekly`
