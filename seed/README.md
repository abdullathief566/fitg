# FitG starter seed data

Copy `*.json` into `data/seed/` (names unchanged), `sample/foods.sample.json` into `data/sample/`, and `fixtures/ai/**` into `fixtures/ai/` in Phase 1. Generated 2026-10-27 by scripts with cross-reference checks: every exercise id in the templates exists, every recipe ingredient, add-on and `requires` key is a known food, oil amounts match `oil_tsp`, and the valid plan fixture uses only real slugs, no duplicate candidates, and respects the T1 profile's cooking-time rule.

| File | What it is | Status |
|---|---|---|
| `foods.map.json` | 25 food keys with USDA **search hints** (`usda_query`), aliases (Hinglish/English pairs), household units (raw grams per unit), `staple` flags. 4 foods (paneer, whey, roasted chana, soya chunks) are `curated` with **null values the founder fills from labels**. | Hints are confirmed by `import-usda.ts`; unit grams are kitchen conventions — verify with a scale. |
| `recipes.schema.json` | JSON Schema for a recipe entry (incl. `requires`, `prep`, `cooked_yield_g`). | Final. |
| `recipes.seed.json` | **13 plannable meals** (incl. high-protein: whey-banana shake, soya chunks curry + rice, 3 eggs + toast) + **7 `component` recipes** (home-style bases for Home Food mode, with `cooked_yield_g`). No nutrition numbers — computed by `build-seed.ts`. All `is_draft: true`. | Founder approves/edits, then adds 50–90 more real recipes. |
| `home_dishes.seed.json` | 29 family-cooked dishes with aliases, unit, cooked grams per unit. 7 have a component recipe; 22 are `needs_recipe: true` (skipped until a recipe exists). | Founder adds standard recipes over time. |
| `protein_addons.seed.json` | 7 add-ons (boiled egg, curd, milk, whey, paneer, soya chunks, roasted chana). | Final for v1. |
| `exercises.seed.json` | 33 beginner-safe exercises with pattern, equipment, injury tags, 3 form cues, starting-load ratio, increment, rep range. Home-dumbbell exercises need no bench. `source_name` matches free-exercise-db. | Coach-tunable defaults — founder reviews the cues. |
| `workout_templates.seed.json` | `full_ab` and `upper_lower` splits with a preferred exercise list per variant (gym / machine / home_db). Expanded to 6 templates by `build-seed.ts`. | Final for v1. |
| `sample/foods.sample.json` | **Synthetic** per-100 g values (rough USDA-like approximations) for all 25 foods, each marked `synthetic: true`. The reference results in `engines.md` (M1, M2, the 7/7 T1 week) were computed with exactly these. | Tests and `--sample` builds only — `--prod` refuses them. |
| `fixtures/ai/<call_type>/*.json` | **36** mock AI outputs across 9 call types: valid ones and deliberately bad ones (`expect: "reject:<reason>"`). | Codex adds more if needed (≥ 3 per type already). |

Fixture shape: `{ scenario, expect: "valid" | "refused" | "reject:<schema|unknown_slug|unknown_id|validation|too_long|foreign_number|banned_word>", input?, allowedNumbers?, output | response }` — validation order in `docs/20-engineering/ai-orchestration.md` §4.0. `coach_chat` fixtures hold API-shaped `response` objects (content blocks incl. an empty-text thinking block with a mock signature; tool inputs use `CoachCommand`, which has no ids or versions).

Note on knee injuries: every squat-pattern exercise carries the `knee` tag, so golden test **W6** expects the squat slot to be dropped with a note.
