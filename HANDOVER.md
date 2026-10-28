# FitG handover

Written on 28 Oct 2026 for whoever continues the build after Abdul. Read this first, then `AGENTS.md`, then the doc
for the phase you're on.

## What FitG is

FitG is an AI fitness agent for gym beginners. It plans every workout and every meal (Indian home food first) and
tells you the next step. When life happens, it moves things around for you. You confirm with a tap instead of
logging. Beginners don't know what to do at the gym, and planning meals wears them out. FitG takes both off their
hands.

- Product spec: `docs/00-product/PRD.md`. Brand: `docs/00-product/brand.md`.
- How it's built: `docs/20-engineering/architecture.md`. Engine maths: `docs/20-engineering/engines.md`.
- Build phases: `docs/30-build/phases.md`, with paste-able prompts in `PHASE-PROMPTS.md`.
- What each finished phase delivered: `docs/30-build/phase-1-report.md`, `docs/30-build/phase-2-report.md`.

## Where things stand

- **Phase 1, done:**
  - `packages/engine`: pure TypeScript for targets, workouts, meals, pings and state.
  - `packages/contracts`: Zod schemas.
  - `packages/ai`: a mock provider and fixtures.
  - `data/`: the food and recipe pipeline. Its output is `apps/mobile/assets/bundle/`.
- **Phase 2, done:** the Expo app in `apps/mobile`.
  - It runs entirely on the phone: SQLite, no backend, no real AI.
  - Screens: onboarding, plan reveal, Today, Week, the workout view, Settings.
- **Tests:** `npm test` passes 406 vitest tests and 7 jest tests. Typecheck, lint and prettier are clean.
- **Abdul's verdict after using it on his iPhone:** it works, but looks generic ("AI-made") and the AI agent is
  invisible.
- **Next job: Phase 2b**, the dark redesign and a visible agent. Everything you need is in
  `docs/30-build/phase-2b-redesign-and-agent.md`, including a prompt to paste. After that, Phase 3 (Supabase) and
  the rest of `PHASE-PROMPTS.md`.

## Run it

You need Node 22.13 or newer (the tests use the built-in `node:sqlite`) and Expo Go version 58 on a phone.

```bash
cd fitg                               # this folder (Abdul's copy is github.com/abdullathief566/fitg)
npm install
npm test                              # vitest (engine, contracts, data, app domain on real SQLite), then jest (app UI)
npm run typecheck && npm run lint && npx prettier --check .
npm run mobile                        # Expo dev server: scan the QR with Expo Go, phone and computer on the same Wi-Fi
```

- **Publish to phones without a computer running.** This uses EAS Update. You need `eas login` to an account with
  access to the project.

  ```bash
  cd apps/mobile
  npx eas-cli@latest update --channel main --environment preview --message "what changed" --non-interactive
  ```

  Phones open the latest update at `exp://u.expo.dev/a24dd859-5f34-4053-a039-75e4412623e1?channel-name=main`, or
  from Expo Go's project list when signed in to the account.
- **Testing a whole day in a minute:** Settings → Developer → Time travel. Hide it in store builds with
  `EXPO_PUBLIC_DEV_TOOLS=0`.
- **Rebuilding the food data:** `npm run data:build`. Never hand-edit `apps/mobile/assets/bundle/`.

## Accounts and access

| What                          | State                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| GitHub                        | Abdul's private copy is `abdullathief566/fitg`. To use your own repo, see below |
| Expo / EAS                    | Abdul's account `abdikunsama`, project `@abdikunsama/fitg`. To use your own, see below |
| Supabase, PostHog, Sentry     | Not created yet (Phase 3)                                                          |
| Anthropic API credit          | None yet. Real AI waits for about $5 (Phase 3 + 5)                                  |
| Apple Developer, Google Play  | Not yet (Phase 6)                                                                  |
| RevenueCat                    | Not yet (Phase 7)                                                                  |

There are no secrets in the repo. Only `apps/mobile/.env.example` is committed. Never commit any other `.env*`
file.

**Your own GitHub repo** (the git history comes with this folder):

```bash
git remote remove origin
gh repo create fitg --private --source . --push   # or create an empty repo on github.com, then:
# git remote add origin https://github.com/<you>/fitg.git && git push -u origin main
```

**Your own Expo account** (to publish updates to phones):

1. In `apps/mobile/app.json`, delete `owner`, `extra.eas.projectId` and `updates.url`.
2. Signed in as you, run `npx eas-cli@latest init`, then `npx eas-cli@latest update:configure`, then publish as
   shown under "Run it".
3. Send Abdul your new `exp://u.expo.dev/...?channel-name=main` link. His old link stops getting updates.

## Decisions already made (ask Abdul before reopening any)

| Decision                         | What                                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| Name                             | FitG; the coach speaks as FitG                                                           |
| Look (28 Oct)                    | Dark, like WHOOP / Oura. Replaces the cream "Warm Spotter" look                          |
| The agent                        | Acts and tells you, with undo; Snap my plate. AI uses sample answers until there's credit |
| Phone                            | Abdul uses an iPhone, through Expo Go and EAS Update                                     |
| Paywall                          | 7-day trial required, no "Maybe later"                                                   |
| Prices                           | India ₹299/month, ₹1,999/year. US $12.99/month, $69.99/year                               |
| Mid-week signup                  | First workout is always Full body A (not built yet)                                      |
| One Skip moves two workouts      | One card, now one agent action (not built yet)                                           |
| After-gym meal on a skipped day  | Stays as planned                                                                         |
| Foods                            | Boneless chicken breast; Amul paneer; whey uses ON Gold Standard values (not updated yet) |
| Stack                            | Expo SDK 58, Supabase later, Anthropic Claude for AI; all decisions in `architecture.md` |

## Known traps

1. **React Compiler is on.**
   - It drops manual `useMemo` dependencies that the body doesn't read. Time-based views must read `clock` from
     `useApp()` (a state value), never a tick counter.
   - Jest doesn't run the compiler, so UI tests can't catch this kind of bug. Check time behaviour on a device.
2. **SQLite locks.** expo-sqlite's exclusive transactions open a second connection, so two writes at once fail with
   "database is locked". Every database call goes through the queue in `apps/mobile/src/db/expo-sql.ts`. Don't
   bypass it.
3. **iOS times are unverified.** `Intl.DateTimeFormat` with `timeZone` hasn't been checked on iOS's JavaScript
   engine (Hermes). If times look wrong on an iPhone, start in `apps/mobile/src/domain/format.ts` and the engine's
   time helpers.
4. **Android notifications.** `expo-notifications` crashes Expo Go on Android. The permission screen uses
   Android's own prompt instead.
5. **No Xcode on Abdul's Mac.** So no dev builds until Phase 6, which needs a Mac with Xcode and the $99 Apple
   Developer account. Until then everything must run in Expo Go.
6. **Expo Go only opens SDK 58.** Don't change the Expo SDK without checking which Expo Go version the App Store
   ships.
7. **React is pinned to 19.3.0** in the root `package.json` overrides. Two copies of React break hooks.
8. **TypeScript versions:** 6.0 in the app, 5.9 in the packages.
9. **npm `EACCES` errors on Abdul's Mac:** `~/.npm` is owned by root. The fix is
   `sudo chown -R $(whoami) ~/.npm`.

## How work is checked here

- `AGENTS.md` holds the standing rules:
  - docs are the source of truth, so change them with the code;
  - every number comes from code, never from AI text;
  - the report format to send Abdul.
- **Habit-only mode** is for people with a history of eating disorders, and it must never show a food or body
  number. It's specified in `docs/20-engineering/engines.md` and `ai-orchestration.md`, and covered by the domain
  tests.
- `docs/code_review.md` is the checklist to run on your own changes before calling a phase done.
- Abdul isn't technical. Give him results in plain words: what works, what he must do, and what's next.
