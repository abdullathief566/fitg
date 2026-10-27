# FitG retrieval ("RAG") — kept deliberately small

## v1: no vector search
- The recipe library (~100), exercise library (~120), home dishes (~50) and a user's memory (≤ 40 bullets) are small enough to put in the prompt (cached system/reference blocks) or to prefilter with plain SQL. Embeddings would add a vendor, cost and failure modes for no gain at this size.
- **Food lookup is name resolution, not semantic search.** The AI returns names the way the user would say them; code finds the database row and computes the numbers.

## `resolveFood(name, lang)` (server, `supabase/functions/_shared/resolve-food.ts`)
Returns a `ResolvedFood` (`types.md` §5) or a short candidate list. In order, first hit wins:
1. **Home dishes**: exact (case-insensitive) match on `home_dishes.name` or `aliases` ("dal", "chapati", "chole") → nutrition from its component recipe.
2. **Recipes**: exact match on a recipe name or slug.
3. **Food aliases**: exact match in `food_aliases` ("dahi" → curd, "chawal" → rice, "anda" → egg).
4. **Fuzzy**: `pg_trgm` similarity > 0.4 over home-dish names/aliases, food names and aliases, ordered by similarity, boosting home dishes and `source = 'curated'`.
5. **Full-text** on `foods.search`.
6. **Generic dishes** (`foods.is_generic`, e.g. "restaurant biryani, 1 plate") — none are seeded; the founder adds standard recipes for common eat-out dishes over time (`data-pipeline.md` §4).
7. **Ask the user**: a one-tap list of the top 3 candidates + "Something else" (type it).
Every miss at step 6 or 7 is written to `food_resolution_misses`; a weekly founder task turns frequent misses into aliases or new home-dish recipes. **That alias table is the real learning loop.** Home dishes with `needs_recipe: true` aren't loaded, so they resolve only once their recipe exists.

On the device, the off-plan **Pick** tab searches the same bundled lists (recipes, home dishes, recent foods) offline with simple prefix + alias matching — no server needed.

## Meal swap candidates
SQL prefilter (same slot, eligible per `engines.md` §3.3, kcal per serving within ±25% of the slot target, pantry coverage score) → top 20 → the fast model picks 3 (or code takes the top 3 when offline or the AI fails).

## Photo-to-plan matching
When a photo is logged for a slot that had a planned meal, the parsed dish names are resolved and compared with the planned recipe's ingredients; if they match, the app offers "Looks like your planned {meal} — log it as planned?" (one tap, exact numbers).

## v1.1 trigger for vectors
Only if the beta shows a food-resolution miss rate > 20%: enable `pgvector`, embed `name + aliases + category` for foods, home dishes, recipes and exercises (short documents, no chunking) with Supabase's built-in small embedding model from inside an Edge Function (verify the current API), HNSW index, and use it as step 4.5 (after trigram, before full-text). No other change.
