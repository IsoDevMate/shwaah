# CONTEXT BRIEF: The Person Behind Shwaah
## Handoff Document for Any AI / Collaborator
**Last updated:** 2026-09-27  
**Live frontend (promise):** https://shwaah-frontend-31fs.vercel.app/  
**This repo:** backend API — Social Media Publisher (`/home/archlinux/Documents/shwaah`)

---

## HOW TO USE THIS DOCUMENT

You are receiving this because the person you're helping has a long, scattered history of asking for help with social media, branding, content strategy, and a product called **Shwaah**. This document compresses what they've confessed and what has already been decided. **Do NOT make them repeat it.**

### How they want to be helped
- Be **specific**, never vague. Vagueness makes them angry; they will call it out.
- No tech-stack lectures (databases, frameworks, "full stack") unless they explicitly ask. Their world is social media, brands, clients, and content — unless they ask you to code.
- They respond to directness and being "milked" — ask hard follow-ups, name contradictions, hold them accountable.
- They pivot constantly ("pivot pivot pivot"), crash out, chase shiny additions. Your job includes **stopping them**: ONE problem, ONE person, ONE next step.
- Give **scripts, templates, and exact words** (DM scripts, onboarding questions, pricing lines) — not abstract advice.
- They distrust AI-generated content and "AI features on top" as the *product*. Respect that. Tools can assist; the brand must stay human/raw.
- Start with their **own page / first-session win** before new feature lists — otherwise you hand them strategy soup.

### Single most important sentence they ever said
> "I've not posted in days because I don't know what I'm supposed to post… **the pushing part is not a problem.**"

Every plan must be measured against whether it fixes THAT (capture → direction → presence), not just scheduling.

---

## SECTION 1: WHO THIS PERSON IS

- Nairobi-based (Kenya), active in hackathons and tech/creator communities.
- Background across marketing, branding, content creation, social media management, brand strategy, content strategy.
- Has worn all hats, often simultaneously: social media manager, content creator, brand strategist, content planner, brand manager, digital marketer — part of the overwhelm.
- Currently building **Shwaah** while trying to grow their own personal brand and land clients.
- Self-described pattern: crashouts, pressure, inventing workarounds, chasing too many directions, requesting strategies and not following through.
- Honest self-assessment: *"I built Shwaah not out of the experiences people are going through."* Their own life is the raw material for the product and they know it.
- Has dealt with housing instability — creates fear about showing their life/environment in content.
- Superpower: competitive diagnosis (walked Gabber's funnel screen-by-screen while being farmed). Trap: mistaking building for solving; defaulting to what's knowable over what's true.
- Own IG identity historically tangled: **dev / gym / running** with no single lane — while also running multiple client brands (see Section 1B).

---

## SECTION 1B: LIVED CLIENT FRONTS & FAILURE PATTERNS (from their history)

### Simultaneous fronts (context-switch load — the real crashout fuel)
| Front | What it was |
|-------|-------------|
| Gym client | Carousels, **dachshund mascot**, controversial-funny tone, grey/white/red/black |
| Jay-B Fitness | Fitness posts (e.g. spin class); fight to avoid stock/AI-template look |
| Mabcas Labs | Separate brand voice/calendar |
| WhatsApp content service | Strategy they tried to sell to Kenyan SMBs — "entertain-first," class-rep/emcee analogy; built because SMBs won't pay for website traffic |
| snrdev001 | Own portfolio / personal brand track |
| Shamiri + freelance + ventures | Bandwidth competition; consistency slips first |

**Insight they already lived:** too many context switches for one brain without tooling that holds per-client DNA. That *is* Shwaah product research.

### Recurring failures / time sinks (named, not guessed)
1. **Copying creators instead of owning a format** — e.g. rebuilt gym carousel around a viral coffee-vs-matcha dog post (~27K likes); considered rebuilding own IG around **@omgadrian**-style creator-education. Pattern: reach for someone else's proven structure because building from zero felt slow/risky.
2. **Fighting "looks AI / looks templated"** — dachshund images "obviously AI"; Jay-B posts scrubbed of distressed text, Canva divider lines. Hours spent removing tells instead of shipping.
3. **No single identity** — own page mixes lanes; clients each need different voices; nowhere holding "who am I" separate from "what am I doing for client X today."
4. **Format paralysis** — belief that once gym carousel format is picked, "there's no going back," so deliberation burns time before a single post.
5. **Shortcut-hunting around paid traffic** — WhatsApp entertain-first as free-distribution path for Kenyan SMBs who won't buy ads/website traffic. Instinct: find the channel that doesn't require ad spend.
6. **Inventing frameworks under deadline** — entertain-first WhatsApp, class-rep/emcee analogy, dachshund gig gag — originating every time instead of editing from a seeded bank.
7. **Selling vs serving gap** — building the WhatsApp strategy ≠ pitching it to a skeptical SMB owner; closing is a separate skill they flagged.

### Pain → product (aligned with locked philosophy — with guardrails)
| Lived pain | Shwaah angle | Guardrail |
|------------|--------------|-----------|
| Client context-switch | Per-client workspace: DNA, formats, calendar | DNA fixed; don't rebuild from scratch each switch |
| Idea fatigue | Ideation **seeded by that client's past/niche**, human edits | Not generic AI posts as the product; soul stays human |
| Platform rewrite labor | One idea → platform expression (IG carousel / LinkedIn / etc.) | Never one caption paste-everywhere |
| Consistency under load | Scheduler as safety net on worst weeks | Engine room, not the headline |
| Hard to close clients | Presence Check + before/after proof / simple pitch artifacts | No fear-funnel Gabber clone |

**WhatsApp note:** WhatsApp *marketing product* stays in the year-two drawer. WhatsApp as **capture inbox** (and their past SMB service insight) is separate — don't conflate.

---

## SECTION 2: SHWAAH — CURRENT STATE (as of Sept 2026)

### Promise (marketing)
- Positioning historically: "social publishing, simplified. One post. Every platform."
- Connect TikTok, Instagram, LinkedIn, YouTube, Facebook; publish in one click; scheduling; analytics.
- Pricing mentioned on site historically: Free / Pro / Team. Fake social proof risk: "10k+ creators," "99.9% uptime," etc. — **trust liability**. Kill or make real.

### Reality — Frontend
- Vercel frontend often behaves like a landing page; dashboard/login may not load as a real product surface. Treat the marketing site as **promise**, not proof.

### Reality — This backend repo (IMPORTANT UPDATE)
This is **not** "nothing behind the landing page." The API already includes substantial capability:

| Area | What exists |
|------|-------------|
| Auth | Register/login, OTP flows |
| Social OAuth | Connect/disconnect TikTok, IG, LinkedIn, YouTube, Facebook |
| Publishing | Create posts, media upload (R2), publish; **TikTok + Instagram publishing confirmed working** |
| Scheduling | Cron scheduler, scheduled posts, calendar endpoints |
| Presence / diagnosis | **Health Score** (`/api/v4/health-score`) |
| Competitor / brand spy | **Profile Scout** (`/api/v4/scout`) — Spyglass-adjacent |
| Timing | Best times (`/api/v4/best-times`) |
| Inspiration bank | Bookmarks + idea generation (`/api/v4/inspiration`) |
| Goals / milestones | Goals, progress, milestones |
| Creator tools | Hooks, captions, carousel, greenscreen, slideshow (`/api/tools`) |
| Monetization infra | Credits, Paystack subscriptions, affiliates |
| Campaigns / analytics | Campaign CRUD, analytics dashboard |

**Working features (do not casually break):** media upload to R2, post creation, TikTok publish, Instagram photo/Reels publish, OAuth + token encryption. See `.kiro/context.md`.

### Builder irony
- The builder themselves often does NOT use Shwaah. Hasn't posted for days. *"The fact that I still struggle with content and I do not go to Shwaah at all is very very funny."*
- Verdict: Shwaah felt "random" when framed only as scheduling — because **scheduling is not where they bleed**.

---

## SECTION 3: CORE CONFESSIONS (pain in their words)

- Don't know what to post; don't know what they're waiting for.
- **Pushing/scheduling is not the broken part** — everything UPSTREAM of posting is.
- Stories are easy (Gen Z habit); **feed presence freezes**.
- Fear of posting due to life circumstances (don't want environment judged).
- Does worth-posting things (hackathons, communities) that never become feed posts.
- Requests content strategies/calendars from AI → **abandons them**. Calendars die when life, trends, or campaigns interrupt.
- Feels pressure from volume culture ("post 9 videos a day") but sees people have no **direction**.
- Brand alignment struggle: "how am I selling myself?", brand cookbook/voice, brand growing while doing client work.
- Portfolio shame: *"If I come to your page and find it's shitty, I won't pay you to replicate that on my page."*
- Client work building everyone else's brand; own brand stagnates.

---

## SECTION 4: CLIENT WORK (trainer = worked example)

- First real client: fitness trainer.
- Send videos → client sends back revisions → so bad they drafted an **agreement limiting revisions**.
- Physical shoots: camera angles, production stress.
- Client is **busy** — extracting content/time/material is the hardest job part.
- Trainer sells merch mostly **at the gym** = trust layer (proximity). Online discovery system is weak.
- Generalized: Nairobi "10th floor" businesses (salon, locks, nail spa, ashwagandha, etc.) hire content people; chain breaks at capture from busy owners → inconsistency → presence never compounds.

### Journey with break points
1. Get known → dies at "I don't know what to post"
2. Land client → dies at "my page looks shitty"
3. Onboard → dies at brand voice / no brand book
4. Extract from busy client → **biggest bleed**
5. Post consistently → where old Shwaah lived
6. Learn/adjust → missing direction analytics

**Product must cover 1–4, not only 5.**

---

## SECTION 5: MARKET & COMPETITOR NOTES

### Gabber / Adley-style funnel (they lived it)
- Comment → instant DM → keyword → "free audit" graded Fair → fake-feeling uplift stats → paywall → cohort upsell.
- **Steal:** meet people where they are; instant personalized value; local currency (KES) display.
- **Never copy:** fake persona in DMs, invented math, fear grades, teaser-not-product free tier, displayed price ≠ charged price.
- Counter-position: *Gabber tells you you're failing. Shwaah makes sure your content actually ships.* Honest free **Presence Check**, then accompaniment.

### Distribution era
- Culture shifted: raw + volume + consistency. Creation helpers (clip tools) exist; **last mile** (clip → native caption → right platform → right time → posted) is still manual → Shwaah.
- Consistency dies from **distribution fatigue**, not laziness.
- "Raw" here means **authentic / actually-the-person**, NOT "raw vs AI." Automate shipping, never the soul.

### Meta / Stories objections (settled)
- IG/FB/WhatsApp convergence: Meta already handles Meta. Don't fight there as the wedge.
- **Wedge platforms:** TikTok + LinkedIn (opposite cultures, weak pipelines) — plus IG feed if useful.
- Stories: leave native. *"We handle the feed. You handle the moment."*
- "One post every platform" as copy-paste is a **lie**. Real job: **one idea → native version per platform**.

---

## SECTION 6: LOCKED PRODUCT PHILOSOPHY (do not relitigate)

### Brand lines
- **Primary:** *Stay raw. We'll handle everywhere.*
- **One-liner (ops):** *One idea in. Native on every platform. Fifteen minutes. Then go make the work.*
- **Short:** *Shwaah does the repeat work. You do the real work.*

### Product split
- Human owns the **moment** (capture, taste).
- Shwaah owns the **after** (wrappers, timing, queue, approvals, direction).

### Two layers per brand/client
1. **Brand DNA (fixed):** tone words, never-say list, visual identity cues, what you're known for.
2. **Platform expression (flexes):** same idea translated for TikTok vs IG feed vs LinkedIn (not one caption pasted everywhere).

### Presence pipeline (mental model)
**Capture → Bank → Voice (DNA) → Fan-out (platform expression) → Direction**

- Capture ideal later: WhatsApp number (busy experts live there).
- Bank: "I don't know what to post" = "I don't save what I live."
- Voice: living voice from their content + short onboarding questions — not a 40-page brand book.
- Fan-out: native drafts + schedule spine (already partly built).
- Direction: theme analytics ("this topic is your lane") — not vanity impression dumps.
- Calendar trauma fix: calendar generated from lived moments (mirror), not imposed boss.

### Anti-goals (drawer — year two)
Email marketing, WhatsApp marketing, newsletters, monetization features as core, "Gen-Z content modes," fighting Stories, fighting Meta Business Suite, fear marketing, fake stats, AI captions as the *selling point*.

---

## SECTION 7: WHO TO SERVE (ONE PERSON)

**Primary (90 days):** Solo social media manager / freelancer managing 1–3 clients (the builder six months ago).  
**Pain:** nights, revision hell, approvals, portfolio shame, rewriting one idea for many apps.  
**Secondary later:** Busy expert / owner-operator (trainer, salon, 10th-floor shops) — same pipeline, WhatsApp capture entry.

**One-sentence problem (expert):** *"My business is full of content, but none of it ever becomes posts, so online I don't exist."*  
**One-sentence problem (SMM):** *"I know what good looks like on each app, but rewriting and posting it everywhere is eating my nights."*

Do **not** sell to "everyone who creates content."

---

## SECTION 8: HOOK, FIRST TASTE, JOURNEY (how not to fuck up the first chance)

### Hook (mirror, not tool)
Presence Check — Health Score + Scout on their handle. Name the mess plainly:
- Grid has no pattern; stranger doesn't get them in 3 seconds.
- Stories alive, feed silent N days.
- Multiple voices; call out which one actually performed.

No Gabber fear grades. No fake uplift %.

### First taste (free AND fixed)
Diagnose + **one real fix** before paywall:
- Grid salvage plan (archive / pin / next 9 posts), **or**
- Best story → feed post draft, **or**
- One Scout report on a brand they already spy → pattern to steal (not a post to copy).

### Journey stages (artifacts, not feature lists)
1. Empty page → Presence Check + grid fix  
2. First client → outreach script + 30-min onboarding Qs + revision-capped agreement  
3. Busy client → capture inbox (WhatsApp later; upload/bank now)  
4. Consistency → Sunday 15-min queue from bank  
5. Proof → before/after becomes portfolio byproduct  

Sell **evenings back**, not AI features.

### Per-persona knots (same product)
| Persona | Knot | Hook | Free taste |
|---------|------|------|------------|
| SMM | Revision/approval hell | Stop living in approval hell | One client week → one approval link → queued |
| Creator | "Nothing to post" | You already made this week | Bank from stories/clips → 9 forgotten posts |
| Brand strategist | Can't brand myself | Voice in 5 lines from best posts | Screenshottable voice card |
| Busy expert | Too busy to be known | Voice-note after next client = a post | One note → one live post |

---

## SECTION 9: PLATFORM EXPRESSION (reference)

| Platform | Expression | Shwaah owns? |
|----------|------------|--------------|
| TikTok | Raw, hook in 0.5s, imperfect OK | Yes — video/feed |
| IG Feed | Cleaner human; grid coherence | Yes — posts/Reels/carousels |
| IG Stories | Conversational, native stickers/music | **No — leave native** |
| LinkedIn | Credibility, longer open, no TikTok slang | Yes |
| Meta IG↔FB | Business Suite already works | Optional, not the wedge |

Reference brands for the *pattern* (not to copy blindly): Stanley (chaos TikTok / shop-window IG), Marc Jacobs (platform-personalized), Duolingo (one character, different energy).

Spyglass / Whop / Stanley AI / Adley: **scout + diagnosis as door; shipping + native voice + queue as product.** Don't become a fear funnel or a spy tool only.

---

## SECTION 10: MVP DEFINITION

### Not the MVP
Five perfect platform integrations as the headline. AI caption generators as the brand. Fake creator counts.

### Is the MVP
1. **Front door:** Presence Check (Health Score + Scout) → one free fix artifact.  
2. **Spine:** Bank → DNA + platform drafts → weekly queue → publish (TikTok + IG + LinkedIn as targets).  
3. **Success test:** One trainer OR one SMM ends a week with ~5 posts from short captures/dumps — evenings back. Concierge/hand-run OK before full automation.

### 15-minute promise (only claim when true)
1. Dump week's raw into bank  
2. Pick ideas → DNA + platform rules → drafts  
3. Human taste tweak  
4. Queue at best times  
5. Client approval = one link  

---

## SECTION 11: WHAT'S ALREADY IN CODE → MAP TO PRODUCT

| User need | API / area |
|-----------|------------|
| "My page is shitty — diagnose" | `/api/v4/health-score` |
| "What are competitors doing?" | `/api/v4/scout` |
| "When to post?" | `/api/v4/best-times` |
| Save inspiration instead of doomscroll | `/api/v4/inspiration` |
| Ship without 5 apps | `/api/posts` + scheduler |
| Hooks/captions/carousels (assist, not soul) | `/api/tools` |
| Pay | `/api/v2/subscriptions`, credits, Paystack |

**Strategic implication:** Stop leading as Buffer-clone. Lead as **presence pipeline**; publishing is the engine room you already built.

---

## SECTION 12: OPEN QUESTIONS (start here when helping)

1. **Own page (priority):** Concrete 2-week personal presence plan with daily actions — low-exposure formats that don't require showing housing situation. **→ Delivered:** see `OWN_PAGE_14_DAY_PLAN.md` (2026-09-26). Execute Day 1 before any new product pivot.
2. **Sell with imperfect portfolio:** Scripts for in-person ("to town") and DM that work *before* the page is perfect.
3. **Client onboarding:** Exact 30-min questions to extract voice/material from a busy expert.
4. **Revision / agreement:** Scope clauses beyond "N revisions" — pricing + boundaries.
5. **Personal brand voice:** Derived from hackathons, communities, building Shwaah in public — not invented.
6. **Name + landing page:** Keep "Shwaah" but reframe copy away from "One post. Every platform." toward presence pipeline / native voice — undecided execution.
7. **WhatsApp capture:** Concierge first vs build number — when?

**Instruction for any AI receiving this brief:**  
Start with open question **#1 (own page)**. Do not let them pivot to new features until there is a 2-week plan with daily actions. Then wire the Presence Check as the product hook.

---

## SECTION 13: RECURRING TOPICS (mentioned across chats)

Brand direction/alignment; brand book/"cookbook"/voice; content calendars (requested, abandoned); Instagram/TikTok/Snapchat how-to; copying brands then wanting to *diagnose* instead; client strategy strong / self-execution weak; monetization curiosity (deferred); crashouts while inventing workarounds.

---

## SECTION 14: ROOT-CAUSE TOOL (if you had built for past-them)

Not another calendar. Not AI captions as product.

**A single inbox for the entire content life:** own moments + client footage + trends + voice ideas → one bank → everything else generated (native wrappers, calendar, approvals, client queues, theme direction, portfolio proof). Contributor = raw. System = after.

Torch direction: **be user zero → Presence Check on self → fix own grid → prove 15-min week → then sell evenings back.**

---

## SECTION 15: PSYCHOLOGY & WORKING STYLE

- Voice-note / long tangled streams — extract signal; don't demand tidy prompts.
- When they say "milk everything out," they want exhaustive synthesis over short summaries — but **decisions must still be ONE at a time**.
- They test you ("you're not helping") when output is generic — get specific, don't get defensive.
- Motivator: be a person who **solves** a real-world problem people pay for because it removes anxiety and repetitive labor.
- When lost, ask: *"What would have saved past-you?"* The person they build for is themselves six months ago.

---

## END OF BRIEF

**Do not restart positioning from zero.** Sections 6–10 are settled. Extend them.  
**Do not expand the drawer.**  
**Next concrete move after reading this:** Section 12, question 1 — own page, 14-day plan — then Presence Check as the first product surface users feel.
