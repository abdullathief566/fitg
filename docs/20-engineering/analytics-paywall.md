# FitG analytics, paywall, crash reporting

## 1. PostHog events → PRD §11 metrics
Wrapper `apps/mobile/src/analytics/` (`posthog-react-native`). Identify by user id only (no email/name). No health values in event properties beyond the coarse fields listed.

| Event | Properties | Metric it feeds |
|---|---|---|
| `onboarding_step`, `onboarding_completed`, `plan_revealed` | step, duration_s | onboarding funnel |
| `ping_scheduled`, `ping_delivered`, `ping_action` | type, action, latency_s | ≥ 40% acted within 30 min |
| `session_started`, `session_ended` | source (manual/geofence/ping_action), status, sets_done, sets_planned | ≥ 70% planned workouts done |
| `set_done`, `exercise_swapped`, `session_feedback`, `calibration_answered` | | |
| `meal_status` | status, source (`one_tap`/`device_pick`/`photo`/`text`/`home_food`/`eat_out`) | ≥ 60% one-tap meal logs |
| `offplan_parsed` | confidence, question_asked, resolved | |
| `notif_permission`, `location_permission` | status | ≤ 15% notifications off by day 30 |
| `rebalance_applied`, `checkin_completed`, `weekly_adjust` | delta_bucket | |
| `coach_message`, `coach_proposal`, `coach_confirm` | accepted | |
| `paywall_viewed`, `trial_started`, `trial_converted`, `subscription_cancelled` | product | trial → paid ≥ 38% |
| `app_opened` (once per local day) | | D1/D7/D30 retention |
| `live_activity_started`, `geofence_event` | type | |
| `pmf_survey` | answer ("very disappointed" / "somewhat" / "not") | ≥ 40% "very disappointed" (beta) |

Dashboards: funnel (onboarding → reveal → trial → paid), retention cohorts, ping action rate by type and hour, meal log source mix, AI cost per active user (from a nightly export of `ai_calls` sums by user).

## 2. Paywall (RevenueCat)
- `react-native-purchases` (dev build). Entitlement `pro`. Products `fitg_monthly` ($9.99 / ₹299) and `fitg_annual` ($59.99 / ₹1,999) with a 7-day introductory free trial configured in App Store Connect and Play Console.
- Flow: plan reveal → paywall (custom screen, `docs/10-design/screens.md` O14) → purchase → entitlement → Today. "Restore purchase" always visible.
- Honest billing (mandatory): trial end date shown in words on the paywall; on purchase the app schedules a **silent local notification at `trial_ends_at − 2 days, 10:00`** with the trial-reminder copy; Settings → Subscription shows the plan, renewal date and a literal **"Cancel subscription"** button opening the store's management page.
- Server: `revenuecat-webhook` mirrors status into `subscriptions`; AI endpoints check `entitlement_active` (3-day grace). The deterministic app (plan, pings, gym mode, logging) keeps working in read-only preview if the founder chooses that for "Maybe later" (open decision).

## 3. Sentry
- `@sentry/react-native` initialised as in the founder's Sumi app (`~/Desktop/sumi/app/frontend/utils/sentry.ts` pattern): DSN from env, `Sentry.setUser({ id })` only, release = app version + build number.
- Breadcrumbs for sync, notification scheduling, geofence task, Live Activity bridge.
- Edge Functions: Sentry for Deno if available (verify), otherwise structured error rows (`ai_calls.error`, function logs) plus a daily error-count check.
