# FitG security and privacy

## 1. Secrets and access
- The app holds only the Supabase **anon** key and public PostHog/Sentry/RevenueCat keys. `ANTHROPIC_API_KEY`, the service-role key, `RC_WEBHOOK_SECRET`, `CRON_SECRET` live only in Supabase function secrets. `.env*` files are gitignored; never commit secrets; never hard-code fallback keys.
- **RLS on every table from migration 0001.** Users can only `SELECT` their own rows; all writes go through Edge Functions that verify the JWT and scope by `userId`. A test proves user A cannot read user B's rows with the anon key.
- Storage bucket `meal-photos` is private; uploads via the user's own folder (`<user_id>/…`) only; Edge Functions read photos with the service role.
- Rate limits per user (backend-api.md); cron functions require `x-cron-secret`; the RevenueCat webhook checks its secret.
- Input validation with Zod at every function boundary; SQL only through the Supabase client / parameterized queries.

## 2. Data minimisation
- AI context: first name only; no email, phone, exact birth date or location coordinates; injuries as tags; safety flags as variants. Raw health data (v1.1) never leaves the device except as derived daily flags.
- PostHog: user id only; coarse properties; no meal photos, no free text, no weights.
- Meal photos deleted after 7 days (`PHOTO_RETENTION_DAYS`); parsed items remain.
- Location: only the pinned gym/home coordinates are stored (for geofences); the app never uploads location traces.

## 3. User rights (India DPDP Act, GDPR basics)
- Consent on the onboarding **Permissions & privacy** step (O12) with plain-language purposes (copy in `copy.md` §6); a separate toggle for health inferences (v1.1).
- Settings → Privacy: **Export my data** (`export-data`, signed URL, JSON) and **Delete my account** (`delete-account`: auth user cascade, storage prefix, PostHog person; RevenueCat records kept as billing law requires; anonymized cost aggregates kept).
- Privacy policy lists processors: Supabase, Anthropic, PostHog, Sentry, RevenueCat, Apple/Google. Pick and record the Supabase project region.

## 4. Health and safety
- 18+ gate at onboarding (birth year → age; under 18 → a friendly "FitG is for adults for now" screen).
- Safety flags change behaviour in code (no deficit; habit-only mode) and in prompts (`ai-orchestration.md` §3, §7).
- Medical disclaimer on the plan reveal and in Ask the coach: "FitG gives general fitness and nutrition guidance, not medical advice."
- No claims to cure, treat or prevent anything. "cure" is in the automated banned-words test (`copy.md` §8a); "treat" and "prevent" go to human review (`copy.md` §8b) because they also have everyday meanings.

## 5. Platform rules
- **Apple HealthKit** (v1.1): read-only; never used for advertising or sold; `NSHealthShareUsageDescription`; data not sent to analytics.
- **Background location**: iOS `NSLocationAlwaysAndWhenInUseUsageDescription` with a clear purpose; Google Play background-location declaration (prominent disclosure screen before the system prompt).
- **Subscriptions**: Apple/Google rules on trial disclosure and cancellation are met by the honest-billing requirements (analytics-paywall.md §2). (Cal AI was pulled from the App Store in April 2026 for billing violations.)
- **Notifications**: time-sensitive used only for the pre-gym ping, user-toggleable.

## 6. Pre-release security checklist (Phase 8)
RLS test green · no secrets in the repo (`git grep` for key patterns) · service-role key absent from the app bundle (inspect the JS bundle) · all functions reject missing/invalid JWT · rate limits verified · photo bucket private · export and delete tested end to end · dependency audit (`npm audit --omit=dev`) reviewed.
