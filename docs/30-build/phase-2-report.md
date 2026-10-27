## Phase 2 report

**Done:** FitG is now an app you can open on your phone. It works with no internet.
- **Onboarding:** welcome → 11 questions (goal, about you, activity, gym days and time, experience and injuries, where you train, food, who cooks, your day, kitchen staples, health check) → permissions and privacy.
- **Plan reveal:** calories and protein count up, your next 7 days, tomorrow's meals, and a preview of the first ping. Under 3 seconds; tap to skip.
- **Today:** one next step with real buttons. "Ate it" ticks the meal. "Later" moves the workout 30 minutes. "Skip" moves it to a free day and tells you once ("Full body B moved to Thursday. Same weights as last time."). Below it: today's timeline, and the protein bar (protein dots in habit-only mode).
- **Also:** the Week tab (this week and next, moved sessions labelled), a day view, the workout view (sets × reps × kg, rest, three form cues), Progress and Coach placeholders, and Settings (profile, plan, appearance, haptics, privacy links, and a developer section with time travel and "start over").
- **The plan is computed on the phone** by the engine and saved in SQLite as the same rows the server will keep in Phase 3. Missed workouts reshuffle the next time you open the app.
- **Real food data:** USDA values for 34 foods, pack-label values for 6 Indian foods, all 20 starter recipes approved, and a recipe for every home dish (29). The production data build passes.
- **Design system:** Warm Spotter colours in light and dark, Outfit + DM Sans, motion and haptic tokens, PulseDot, and the reveal animation.

**Verified:**
- `npm test` → 406 passed (vitest: engine, contracts, AI, data, app domain on real SQLite, design checks) + 7 passed (jest: the app's UI).
- `npm run typecheck`, `npm run lint`, `prettier --check .` → clean.
- `npx expo export` → Android and iOS bundles build.
- **On an Android phone emulator in Expo Go** (Pixel 7, Android 16), exactly as you'll run it:
  - your T1 answers show **1,850 kcal / 120 g protein** on the reveal;
  - Ate it, Skip (with the reshuffle), Week, workout, Settings, time travel, start over, dark mode, the notifications permission, habit-only mode, and airplane mode all work.
  - Running it this way found 14 bugs that tests didn't catch. All are fixed, with tests where a test can see them. The worst: Android's notification prompt crashed Expo Go, and habit-only mode still showed grams.
- **An independent code review** found 8 more bugs. All are fixed:
  - screens could keep showing an old time (the React Compiler dropped the clock from their memo);
  - a double tap could run two commands against the same plan, or lock the database;
  - going back from the reveal and changing an answer kept the old plan;
  - a saved week the app can't read locked you out (now it's planned again from today);
  - smaller ones in navigation, the reveal's retry, the stepper and time travel.
- **On your iPhone** through Expo Go, from the cloud (EAS Update; the Mac isn't involved).

**Needs Abdul:**
1. **Try it on your iPhone:** open Expo Go (signed in as abdikunsama) and tap FitG, or open
   `exp://u.expo.dev/a24dd859-5f34-4053-a039-75e4412623e1?channel-name=main`. Every fix I publish arrives the next
   time you open it. Settings → Developer → Time travel shows a whole day in a minute.
2. **One-time fix on your Mac:** run `sudo chown -R $(whoami) ~/.npm`. A folder in your npm cache belongs to root, left over from an old `sudo npm`. Until you fix it, `npm install` fails with "EACCES".
3. **Check the label values against the packs you buy:** Amul paneer, MuscleBlaze whey isolate, Jabsons roasted chana, Nutrela soya chunks, Fortune poha, Amul fresh cream. If yours differ, tell me the numbers on the pack.
4. **For Phase 3, when you're ready:** free accounts on Supabase, PostHog and Sentry (Expo is done).

**Decisions I made:**
1. **Expo SDK 58, not 54.** The App Store's Expo Go now opens only SDK 58, and this Mac has no Xcode. So the app runs in Expo Go until Phase 6, when the lock-screen workout needs a dev build.
2. **Storage on the phone:** each table holds the server's row as JSON, checked with the same schemas as the server.
3. **Signing up mid-week:**
   - days before today are left out;
   - a workout that already ended today is dropped;
   - today's earlier meals count as eaten and are never asked about.
   - Your first session is always "Full body A" (your call; building next).
4. **All numbers use Outfit.** Google's DM Sans has no fixed-width digits, so numbers would jitter as they change.
5. **Recipe names carry no counts** ("Egg bhurji with roti", not "+ 2 rotis"), because portions scale with your targets.
6. **Buttons for later phases are hidden, not dead:** Swap, Something else, Home Food picker, check-in. "Start" opens the workout view; gym mode comes in Phase 4.
7. **Android asks for notifications through Android's own prompt.** expo-notifications crashes Expo Go on Android. The screen also re-checks the real permission, because Expo Go loses the prompt's answer.
8. **I approved the Phase 1 ping wordings,** as you asked me to decide.
9. **Pinning your gym** uses your location once. The "Always" permission waits for gym auto-start in Phase 6.
10. **Libraries not added yet:** a list library, Skia and a bottom-sheet library. Today's lists are short; Skia comes with the rest timer in Phase 4.
11. **Habit-only mode:** Settings shows a support line (Tele-MANAS, 14416, free, 24×7).

12. **Developer tools** (time travel) can be switched off with `EXPO_PUBLIC_DEV_TOOLS=0` for store builds.

**Your decisions (MCQ, 2026-10-28):**
- iPhone; you see FitG from the cloud, nothing runs on the Mac.
- Paywall: no "Maybe later"; the 7-day trial is required. Prices: India ₹299/month · ₹1,999/year; US $12.99/month · $69.99/year.
- One Skip that moves two workouts shows one card.
- After a skipped workout, the "after gym" meal stays as planned.
- Foods: boneless chicken breast and Amul paneer as they are; whey switches to ON Gold Standard label values.
- GitHub: a private repo. Accounts: Expo now, Supabase later.

**For Phase 4 (noted, not blocking):**
- The ping copy needs habit-only wording: "{protein} g protein" is a food number.

**Questions:** none blocking.

**Next:** Phase 3. Supabase: the database, sign-in and sync, with the same screens.
