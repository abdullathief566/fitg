# FitG build pack

Everything Codex needs to build FitG, written 2026-10-27.

## How to use it (Abdul)
1. Create an empty GitHub repo called `fitg` and clone it.
2. Copy **everything in this folder** into the repo root (`AGENTS.md`, `MASTER-PROMPT.md`, `PHASE-PROMPTS.md`, `README.md`, `docs/`, `seed/`, `reference/`). Commit.
3. Open Codex on the repo. Paste the part of `MASTER-PROMPT.md` below the line. That's Phase 1 (cloud Codex is fine for it). **From Phase 2 on, run Codex locally on your Mac** — it needs Xcode and the simulators.
4. When Codex sends the Phase 1 report: read it, run what it asks you to run, then paste **Phase 2** from `PHASE-PROMPTS.md`. Repeat, one phase at a time.
5. Codex reads `AGENTS.md` automatically on every task — those are its standing rules.

## What's inside
| File | For |
|---|---|
| `MASTER-PROMPT.md` | The big kickoff prompt: the product, how it thinks, the rules, how we work, and Phase 1. |
| `PHASE-PROMPTS.md` | Paste-able prompts for Phases 2–8. |
| `AGENTS.md` | Codex's standing rules (stack, commands, laws, report format). |
| `docs/00-product/` | `PRD.md` (what and why) · `brand.md` (FitG, voice, look). |
| `docs/10-design/` | Tokens (colours, type, spacing, motion, haptics) · screens + wireframes · components · motion · copy · accessibility · store assets. |
| `docs/20-engineering/` | Architecture · database (`schema.sql`) · the engines (formulas) · signals & pings · AI orchestration (prompts, schemas, guardrails, costs) · RAG · data pipeline · sync · backend API · analytics & paywall · security · testing. |
| `docs/30-build/phases.md` | The 8 build phases with acceptance checks. |
| `docs/code_review.md` | The checklist Codex runs on its own work. |
| `seed/` | Starter data (foods, recipes, home dishes, exercises, templates), synthetic sample food values for tests, and 36 mock AI outputs. |
| `reference/sumi/` | 9 components from your Sumi app for Codex to port (re-coloured for FitG). |

## What only you can do (when each phase needs it)
- Now: buy `fitg.app`; start collecting real recipes; download USDA FoodData Central CSVs (Foundation + SR Legacy).
- Phase 2–3: free accounts — Expo, Supabase, PostHog, Sentry.
- Phase 5: ~$20 Anthropic API credit; weigh 50 meals for the photo benchmark.
- Phase 6: Apple Developer ($99/yr), Google Play ($25), real phones.
- Phase 7: App Store / Play products + 7-day trial, RevenueCat, privacy policy + terms pages.
- Phase 8: 20–30 beta testers.
