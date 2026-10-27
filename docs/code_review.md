# FitG self-review checklist

Run this against your own diff **before** reporting a phase or task as done. Fix what fails; list anything you consciously left in the report.

## 1. Product laws (PRD §8)
- [ ] One next step at a time — Today renders exactly one `NextUpCard`.
- [ ] Confirm, don't log — the default path for a planned set/meal is one tap.
- [ ] ≤ 4 sounding pings per local day; every ping has ≥ 1 action button.
- [ ] **No number originates from AI.** Displayed numbers are `PlanNumber`s from `packages/engine`; AI prose passed `assertNoForeignNumbers`.
- [ ] No guilt — no banned words (`copy.md` §8a) in the copy bank, UI strings or AI outputs (prompt files are exempt: they quote the list); `copy.md` §8b checked by eye; missed things are framed as schedule changes.
- [ ] Works without location and health permissions (tap fallback exists).
- [ ] Friend, not dashboard — copy follows `docs/10-design/copy.md`.
- [ ] Indian home food handled (household units, Home Food mode, oil/ghee explicit).

## 2. Engineering laws
- [ ] TypeScript strict, no `any` without a comment explaining why; `npm run typecheck` clean.
- [ ] Engine functions are pure (no `Date.now()`, `Math.random()`, I/O); time/tz/seed are parameters.
- [ ] Every new engine rule has a test; golden tests unchanged unless the spec changed (update both together).
- [ ] Offline-first: Today, gym, kitchen, logging work in airplane mode.
- [ ] Writes only through Edge Functions; RLS untouched or tightened; no secret in the app or repo.
- [ ] Notifications: stable ids, DATE triggers, `diffSchedule` (only `ping:` ids) — never cancel-all, never repeating triggers; ≤ 3 action buttons per category (Android limit).
- [ ] Chat history append-only (no edits/deletes/reorders; frozen system + tools per thread).
- [ ] AI requests: no `temperature`/`top_p`/`top_k`; `tool_choice` only `auto`; effort set explicitly; content read by block `type`; `stop_reason` checked before content; no `fallbacks` on Haiku or Batches.
- [ ] Every AI feature has a deterministic fallback and mock fixtures (≥ 1 bad fixture for prose outputs).
- [ ] Library APIs you weren't sure about were checked against current docs (note which in the report).

## 3. Design acceptance checks (self-verifiable)
1. `grep -rnE "#[0-9A-Fa-f]{6}\b" apps/mobile/app apps/mobile/src` returns nothing (hex only in `constants/theme.ts`).
2. Every `Pressable` in gym mode ≥ 56 × 56 pt; the Done-set button ≥ 72 pt.
3. Every `Pressable` elsewhere ≥ 48 × 48 pt.
4. Today renders exactly one `NextUpCard` (snapshot test).
5. No day schedules more than 4 sounding notifications; rest timer and Live Activity are silent (scheduler test).
6. Every notification category has 1–3 actions.
7. All strings in `packages/engine/src/pings/copy-bank.ts` and `apps/mobile/src/copy/**` pass the banned-words test.
8. No `withRepeat` without a matching `cancelAnimation` on unmount, blur and background.
9. Number-displaying components accept only `PlanNumber`.
10. `useReducedMotion()` is consulted wherever `withSpring`/`withRepeat` is used; `expo-haptics` is imported only in `lib/haptics.ts`.

## 4. Scope
- [ ] Nothing from PRD §7 "Not in v1" was built (health import, widget, gym buddy, grocery ordering, calendar, GLP-1 mode, voice, pantry inventory, Watch app).
- [ ] No unrequested refactors of finished code; no new dependencies without a reason in the report.
- [ ] Docs updated where behaviour changed (and the change is listed in the report).
