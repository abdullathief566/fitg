## Phase 1 report

**Done:** FitG's brain exists and is proven by tests. No app and no backend yet, as planned.
- **Engine** (`packages/engine`, pure TypeScript, zero dependencies): calorie and macro targets, the weekly calorie adjustment, the workout planner (templates, schedule, sets/reps/weights, double progression, calibration, swaps, reshuffle, PRs), the meal planner (day shapes, candidates, portion scaling, daily rebalance, Home Food portions, eating out, grocery list, prep tasks), the ping scheduler and its copy bank, the gym-day state machine, the one "next step" card for Today, plan commands, and the no-invented-numbers and banned-words checks.
- **Contracts** (`packages/contracts`): Zod schemas for all 35 database tables, the 20 API functions, plan and coach commands, events, AI outputs and seed files, plus mappers between database rows and engine types.
- **Mock AI** (`packages/ai`): the provider interface, the mock provider over the 36 fixtures, the 7-step output check, the prompts, the context builder, prices, and a stub for the real Claude provider (Phase 5).
- **Seed pipeline** (`data/`): `npm run data:build -- --sample` turns the seed files into database seed SQL and the phone bundle. `--prod` refuses synthetic, draft or missing data.
- **The T1 week works end to end:** 1,850 kcal / 120 g protein, `full_ab_machine` with Mon A · Wed B · Fri A, all 7 days planned ok, and 4 pings on each gym day at 18:15 · 20:15 · 20:45 · 21:30.

**Verified:**
- `npm test` → 381 passed (engine 150, contracts 113, AI 62, data 56). Includes every golden case (T1–T11, T8, W1–W6, M1–M4, P1–P5, S1), commands, validators, property tests, the 36 AI fixtures and the end-to-end T1 week.
- `npm run typecheck` → clean (engine, contracts, AI, data).
- `npm run lint` → clean. `prettier --check .` → clean.
- `npm run data:build -- --sample` → ok: 25 foods, 20 recipes, 7 home dishes, 7 add-ons, 33 exercises, 6 templates.
- `npm run data:build -- --prod` → refuses, as it should today: 21 foods without a USDA match, 4 curated foods without values, 20 draft recipes, 22 home dishes still needing a recipe.
- Every AI fixture gives exactly its expected result. No AI schema has a number field except `exerciseOrder`.
- An independent review of the engine found 10 bugs. All are fixed, each with its own test (`packages/engine/test/review-fixes.test.ts`).

**Needs Abdul:**
1. Approve or edit the ping wordings: `docs/30-build/phase-1-copy-for-approval.md`. The first wording of each ping is the canonical one from copy.md; the rest are mine.
2. Download the USDA FoodData Central CSVs (SR Legacy + Foundation Foods) into `data/raw/usda/`, then run `npm run data:import-usda` and confirm each match.
3. Fill in the curated values for paneer, whey, roasted chana and soya chunks from pack labels (`data/seed/foods.map.json`).
4. Approve the 13 draft recipes and add the ones you and your friends actually eat (same format).
5. The repo is local at `~/Desktop/fitg` with commits on `main`. Make a GitHub repo when you want it pushed; nothing has been pushed.

**Decisions I made:**
1. The repo lives at `~/Desktop/fitg`, next to Sumi. The space in "Fitness App Idea" would break iOS builds later.
2. Tools: TypeScript 5.9 as specified (TypeScript 7 exists, but the linter doesn't support it yet), Vitest 5, Zod 4, ESLint 10, Prettier, fast-check for property tests. Node 26 is installed; the repo asks for Node 22 or newer.
3. A few spec function signatures lacked inputs needed to produce their outputs, so I added them: the time zone (`planDays`, `reshuffle`), recipe and exercise names (`buildPingSchedule`, `rebalanceDay`), foods and add-ons (`groceryList`), body weight for the protein line in pings, and the session id for `buildSession`.
4. Planned rows get deterministic ids (from user + date + slot), because the engine can't use random numbers. A re-plan updates rows in place.
5. Small type additions: a Home Food or eat-out marker on day-shape slots, a home-dish link on portions, two problem codes (`component`, `wrong_slot`), removed-row lists in command results, and day names ('mon'…) for the coach's gym days so AI tools never carry numbers.
6. `schema.sql` now stores what the engine produces: `workout_sets.target_reps`, `plan_days.ok` and `plan_days.problems`. Two jsonb comments were updated.
7. Pings: an "ask" ping keeps its normal wording and adds "Did lunch happen?", as copy.md says. The scheduled post-gym ping uses the fallback wording; the immediate one at session end comes from `postGymNow`.
8. Today: a workout card stays until the session's planned end. A meal card shows from 90 minutes before to 60 minutes after. A prep task shows when it's due before the next meal, or after the last one.
9. Commands: Skip, Later and Move work while a session is planned, reminded or ready. A reshuffle bumps the plan version, so stale commands are caught. Skipping a future day keeps the A/B order. Home Food meals aim for their share of protein, so the add-on kicks in.
10. "Midnight → skipped" runs as a command: `missedSessions()` lists unstarted past sessions, and the app sends a skip for each at the first open of a new day (Phase 2).
11. The no-AI meal planner's seed rotates the breakfasts; everything else is the spec's scoring.
12. "Oil" means fats measured by the teaspoon (oil, ghee), not peanut butter.
13. The Anthropic SDK (1.3.0) is installed for its types only. The real provider is a stub until Phase 5. Haiku cache prices are estimates to re-check then.

**Questions:**
1. Rotis and eggs: labels round to whole rotis and eggs, but the math uses the exact amount, as the spec says. At ×0.75 the label says "2 rotis" while the math counts 1.5. May I make rotis and eggs always scale in whole numbers? I recommend yes.
2. A meal swap that misses the protein target is applied and the day is flagged, not refused. Keep it that way, or should swaps only offer meals that keep the day on target?
3. Driving past the gym: by the spec, arriving ("Ready?") and leaving without tapping Start marks the session abandoned, so it can't be started that day. I'd send it back to "planned" instead. OK to change?

**Next:** Phase 2 — the app shell, design system, onboarding, plan reveal and Today/Week, running fully on the phone with this engine. Run Codex locally on your Mac for it.
