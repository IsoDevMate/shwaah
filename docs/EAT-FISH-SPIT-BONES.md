# Eat the fish, spit the bones — Shwaah edition

**Sources (do not lose these):**
1. Jacob Jackson / ByteofDev — [*Turning Claude into Postgres so I can raise a Series A*](https://byteofdev.com/posts/turning-claude-postgres/) (Claudegres)
2. Multigres / Supabase parser build notes — engineer wins with checklists, knowing “right,” reading every critical rule, running regress
3. Shamiri lab transcript pack — [Eat fish Multigres rules](ba1f3786-bc78-4097-acfd-ea3b31a531d0) in `Documents/shamii` (`onboarding/docs/EAT-FISH-SPIT-BONES.md`, `BEHAVIOUR-LENS.md`, `REVIEWER-CHARTER.md`)

Those people built with AI and got lied to by confident output. We are building Presence Audit, Voice Notes, and Direction Engine on the same failure surface. This file exists so we **do not walk into the same traps**.

---

## One-line rule

**Keep AI (or agent) output only when it matches independent observation. Throw away confident stories that don’t.**

---

## What Claudegres actually taught (not the cute summary)

Claudegres made Claude act as Postgres. Queries returned rows. Then reality showed up:

| Failure | What looked true | What was actually true |
|---------|------------------|------------------------|
| Fake Index Scan | `EXPLAIN` showed Index Scan + plausible costs | FileRead log walked heap pages sequentially — empty/partial index filenode |
| Lazy “done” | Model said the index was built | Only the first page of rows was indexed |
| Catalog theater | `\di` and catalogs looked tidy | Persistence layer was incomplete |
| Semantic OK, bookkeeping fail | SQL meaning sounded right | Byte-exact storage / exhaustive work was fiction |
| Motivation theater | Cheerleading prompts completed more of the index | Still needed **explicit rules + verification**, not vibes |

**Translation:** a beautiful report is not a working system. Plans, EXPLAIN, UI toasts, and agent “done” messages are **artifacts of competence**, not competence.

---

## What Multigres actually taught

| Practice | Meaning for us |
|----------|----------------|
| Directory / phase checklists | `docs/STAGES.md` with status + evidence — not chat memory |
| Know what “right” looks like **before** the model runs | Write expected HTTP status, body fields, Turso row, R2 object first |
| Read every critical rule | Product law + OAuth/publish “do not touch” + credit gating rules |
| Regress after “fixed” | Re-hit the real endpoint; do not trust narrative PASS |
| “I engineered; Claude typed” | Agents draft; **outputs** authorize done; **you** authorize remotes |

---

## What the Shamiri lab already proved (our own scars)

These are not theoretical. From the shamii pack:

| Lab failure | Pattern |
|-------------|---------|
| **C11** | Report said `demonstrated:true` while body said session had not occurred / no write |
| **B-05** | FAIL hardcoded / asserted without calling the stub — theater FAIL |
| **U-15-style** | `pass:true` while only one of two invariants was checked |
| Partial PR fixes | Merged “authz fixed” while sibling surfaces still broken |
| Stale MEMORY | FAIL left open after merge + green Playwright |
| Code-only FAIL | “Looks insecure” with no HTTP/DB observation |

**Same disease as Claudegres:** scoring the story instead of the path.

---

## Three buckets — mandatory on every verify reply

1. **Fish (keep)** — claim + matching evidence this turn (status, body snippet, Turso before→after, R2 object, build exit)
2. **Bones (spit)** — “implemented / optimized / secure / viral / fixed” with no matching path; EXPLAIN-style theater; hardcoded PASS/FAIL; fake Gabber uplift %
3. **Unknown** — not exercised this run; say so. Do not promote Unknown into Fish.

Never update `docs/STAGES.md` with Bones.

---

## Map every Claudegres/lab failure → Shwaah features we are building

### Presence Audit (`/api/v4/presence-audit`, `/audit`)

| Historical failure | How it shows up here | Required fish |
|--------------------|----------------------|---------------|
| Fake Index Scan | UI shows Fair/Good grades while analysis never ran / used mock | `POST /presence-audit` 201 + row in `PresenceAudits` + grades match body |
| Lazy partial index | “Analyzed” without verifying media belongs to **this** user’s connected IG | Ownership check: `accountId`+`mediaId` via Graph with **their** token |
| Catalog theater | Thumbnail grid looks full; API returned empty/error | Network tab: media list status + `data.media[]` |
| C11 lie | `success:true` / toast while Turso has no audit row | Before count → after count on `PresenceAudits` |
| Gabber bones | Invented “69% chance of 4x” | **Forbidden.** Diagnosis free; fix gated honestly; no fake math |
| Wrong harness | Graded a client-supplied URL scrape as “their post” | Only connected-account media IDs |

**Expected secure/correct behaviour (write before probing):**
- No Instagram connected → actionable empty/permission state, not a fake grid
- Foreign `mediaId` → 404, no credit burn for unlock
- Free response includes Hook/Relatability/Retention + `fixLocked: true`
- Unlock without credits → 402
- Unlock with credits → fix string persisted; `fixLocked: false`; credit transaction row

### Voice Notes (`/api/v4/voice-notes`, `/voice-notes`)

| Historical failure | How it shows up here | Required fish |
|--------------------|----------------------|---------------|
| CREATE then relation missing | UI “saved” but `VoiceNotes` empty / R2 missing | POST 201 + Turso row + `audioUrl` fetchable |
| UI success / DB lie | Browser shows note; delete removes UI only | DELETE + Turso gone + R2 delete attempted |
| Partial “done” | Record button works; import path broken | Exercise **both** record and import |
| Lazy storage | Memory-only blob never uploaded | R2 key exists / public URL returns audio |

**Expected:**
- Non-audio upload → 400
- R2 misconfigured → clear 502, not silent empty bank
- List is user-scoped only

### Direction Engine (`/api/v4/direction-engine`, `/direction`)

| Historical failure | How it shows up here | Required fish |
|--------------------|----------------------|---------------|
| Semantic OK, bookkeeping fail | Pretty ideas, no `DirectionSessions` row | POST 201 + history GET returns session |
| Motivation theater | “5 viral posts” filler | Hooks must cite week answers; no fake reach promises |
| Mega-prompt mush | One blob regenerates forever, no checklist | Four fields validated; exactly five ideas structured |

### Existing publish / OAuth (leave alone — still protected by this doctrine)

| Historical failure | How it shows up here | Required fish |
|--------------------|----------------------|---------------|
| Partial PR fix | “Fixed Instagram” while TikTok publish broken | Touch only with reproduced bug; retest **both** |
| Wrong action ≠ secure | OAuth reconnect URL without disconnect | Callback + `SocialAccounts.isActive` + metrics fetch |
| `.kiro/context.md` ignored | Agent “refactors” working R2 upload | Diff must not touch confirmed paths without bug cite |

---

## Multigres triangle — how we run sessions on Shwaah

### System (memory outside chat)
- `AGENTS.md`, `docs/ENGINEERING.md`, `docs/STAGES.md`, this file
- Stage checklist: task → expected output → command → evidence path → status
- End of stage: append Fish-only evidence to `docs/STAGES.md`
- After long threads / compaction: **re-read** STAGES + product law before coding

### Expertise (know “right” before the model speaks)
- Define expected status/body/DB/R2 **first**
- Prefer translation against known references (existing route patterns, credit guard, OAuth helpers) over inventing new auth
- Papering over type/design errors with local hacks = Bones; mark debt or fix root

### Discipline (trust, but verify)
- Read the critical path: route → service → Turso/R2 → credit consume
- Re-run the real endpoint after “fixed”
- Agent says done → demand: **which command, which status, which DB/R2 field?** No answer = not done

---

## Anti-patterns (instant Bones — spit them)

1. “Build passed, so the feature works” (compile ≠ behaviour)
2. Mocked audit grades presented as live analysis
3. Fake creator counts / uplift % on landing or audit unlock
4. Claiming Voice Note saved without Turso+R2 check
5. One mega-prompt that rebuilds the whole product
6. Editing working publish/OAuth “while we’re here”
7. Updating STAGES with unverified PASS
8. Treating lint baseline noise as proof new pages are clean (or ignoring new-file lint)
9. Hardcoded FAIL/PASS in scripts without calling the real handler
10. “Looks like Gabber, so we’re done” without ownership + persistence checks

---

## Operator checklist (copy into every feature session)

- [ ] Feature named (Presence Audit / Voice Notes / Direction / other)
- [ ] Expected secure/correct output written **before** run
- [ ] Real auth token / connected Instagram where required
- [ ] Before snapshot (row counts / credit balance)
- [ ] After: HTTP status + body snippet + Turso fields + R2 if media
- [ ] Label Fish / Bones / Unknown
- [ ] STAGES updated **only** with Fish
- [ ] Did not invent Gabber-style uplift math
- [ ] Did not touch `.kiro/context.md` working paths without reproduced bug

---

## Cursor rules wired for this doctrine

- `.cursor/rules/eat-fish-spit-bones.mdc` (alwaysApply)
- `.cursor/rules/ai-session-system.mdc` (alwaysApply)
- `.cursor/rules/shwaah-product.mdc` (alwaysApply)
- Global mirrors: `~/.cursor/rules/eat-fish-spit-bones.mdc`, `ai-session-system.mdc`
- Frontend twin: `shwaah-frontend/docs/EAT-FISH-SPIT-BONES.md`

If an agent’s reply cannot produce Fish for a claim, the claim did not happen.
