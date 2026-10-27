// UI strings (copy.md). The coach speaks as FitG: one sentence, then the button; friend, not dashboard. Every
// string here is checked by the banned-words test (design acceptance check #7). Ping wording lives in the engine.
import type { Activity, Cuisine, Diet, EatingMode, Equipment, Experience, Goal, Injury, Sex } from '@fitg/engine';

type Option<T> = { value: T; label: string; hint?: string };

export const WELCOME = {
  headline: 'Never walk into the gym wondering what to do.',
  sub: "You confirm. You don't log.",
  cta: 'Build my plan (3 min)',
  /** The demo NextUp card cycles these three examples. */
  demo: [
    { eyebrow: 'Next up · 6:30 PM', title: 'Full body A', line: 'Leg press 3×10 at 40 kg' },
    { eyebrow: 'Next up · 8:00 PM', title: 'After gym: egg bhurji', line: '2 rotis · 1 tsp oil' },
    { eyebrow: 'Next up · 8:45 PM', title: 'Dinner: dal, rice, sabzi', line: '1 katori dal · 1 katori rice' },
  ],
} as const;

export const STEP_COPY = {
  goal: {
    title: "What's the goal?",
    subtitle: 'Pick the one that matters most right now.',
    options: [
      { value: 'fat_loss', label: 'Lose fat' },
      { value: 'muscle', label: 'Build muscle' },
      { value: 'both', label: 'Both', hint: 'Lose some fat, build some muscle' },
      { value: 'get_fit', label: 'Get fit', hint: 'Feel better, move better' },
    ] satisfies Option<Goal>[],
  },
  about: {
    title: 'About you',
    subtitle: 'For your calories and protein. Nothing else.',
    name: 'What should we call you?',
    namePlaceholder: 'First name (optional)',
    sex: 'Body type for the maths',
    sexHint: 'Calorie formulas differ for male and female bodies.',
    sexOptions: [
      { value: 'male', label: 'Male' },
      { value: 'female', label: 'Female' },
    ] satisfies Option<Sex>[],
    age: 'Age',
    height: 'Height',
    weight: 'Weight',
    goalWeight: 'Goal weight',
    optional: 'Optional',
    add: 'Add',
    ageRange: 'Between 18 and 90',
    heightRange: 'Between 120 and 230 cm',
    weightRange: 'Between 30 and 250 kg',
  },
  activity: {
    title: 'Outside the gym, your day is…',
    options: [
      { value: 'desk', label: 'Mostly sitting', hint: 'Desk job, driving, studying' },
      { value: 'on_feet', label: 'On my feet', hint: 'Shop floor, teaching, lots of walking' },
      { value: 'very_active', label: 'Very active', hint: 'Physical work or sport most days' },
    ] satisfies Option<Activity>[],
  },
  schedule: {
    title: 'When can you train?',
    subtitle: 'Pick 2 to 4 days. Rest days are part of the plan.',
    days: 'Days',
    time: 'Start time',
    timeRow: 'Every gym day',
    length: 'How long?',
    lengths: [
      { value: 45, label: '45 min' },
      { value: 60, label: '60 min' },
      { value: 75, label: '75 min' },
    ] satisfies Option<45 | 60 | 75>[],
  },
  experience: {
    title: 'How long have you been lifting?',
    options: [
      { value: 'new', label: 'Brand new', hint: 'Machines first. We show every move.' },
      { value: 'lt6m', label: 'Under 6 months' },
      { value: 'gt6m', label: 'Over 6 months' },
    ] satisfies Option<Experience>[],
    injuries: 'Anything that hurts?',
    injuriesHint: 'We leave out moves that load it.',
    injuryOptions: [
      { value: 'knee', label: 'Knees' },
      { value: 'back', label: 'Back' },
      { value: 'shoulder', label: 'Shoulders' },
    ] satisfies Option<Injury>[],
    none: 'Nothing',
  },
  equipment: {
    title: 'Where do you train?',
    options: [
      { value: 'full', label: 'Full gym', hint: 'Barbells, racks, machines' },
      { value: 'basic', label: 'Basic gym', hint: 'Machines and dumbbells' },
      { value: 'home_db', label: 'Home, with dumbbells', hint: 'Just a set of dumbbells' },
    ] satisfies Option<Equipment>[],
    dumbbells: 'Which dumbbells do you have?',
    dumbbellsHint: 'Tick every weight you own.',
    pinTitle: 'Pin your gym',
    pinBody:
      "Pin your gym and FitG notices when you walk in — your workout is one tap away. The Start button does the same job if you'd rather not.",
    pinAllow: "I'm at my gym, pin it",
    pinSkip: "Skip, I'll tap Start",
    pinned: 'Gym pinned.',
    pinSkipped: 'No pin. The Start button does the same job.',
    pinFailed: "Couldn't get your location. You can pin it later in Settings.",
  },
  food: {
    title: 'How do you eat?',
    diet: 'Food',
    dietOptions: [
      { value: 'veg', label: 'Vegetarian' },
      { value: 'eggetarian', label: 'Eggetarian' },
      { value: 'non_veg', label: 'Non-veg' },
      { value: 'vegan', label: 'Vegan' },
    ] satisfies Option<Diet>[],
    cuisine: 'Cuisine',
    cuisineOptions: [
      { value: 'indian', label: 'Indian' },
      { value: 'western', label: 'Western' },
      { value: 'mixed', label: 'A mix' },
    ] satisfies Option<Cuisine>[],
    allergies: 'Allergies',
    allergyOptions: [
      { value: 'milk', label: 'Milk / dairy' },
      { value: 'peanut', label: 'Peanuts' },
      { value: 'gluten', label: 'Gluten' },
      { value: 'egg', label: 'Eggs' },
      { value: 'soy', label: 'Soy' },
      { value: 'tree_nut', label: 'Tree nuts' },
      { value: 'fish', label: 'Fish' },
      { value: 'shellfish', label: 'Shellfish' },
    ] satisfies Option<string>[],
    dislikes: "Anything you won't eat?",
    dislikesHint: "We'll leave it out of every plan.",
  },
  eating: {
    title: 'Who does the cooking?',
    options: [
      { value: 'cook', label: 'I cook', hint: 'Simple recipes with steps' },
      { value: 'family', label: 'Family cooks', hint: 'Pick the dishes, FitG does the portions' },
      { value: 'out', label: 'I eat out or at a mess', hint: 'Pick from the menu, FitG picks the portion' },
      { value: 'mix', label: 'A mix' },
    ] satisfies Option<EatingMode>[],
  },
  day: {
    title: 'Your day',
    subtitle: 'Pings land around your real day.',
    wake: 'Wake up',
    sleep: 'Sleep',
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    snack: 'Snack',
    dinner: 'Dinner',
    noSnack: 'No snack',
    addSnack: 'Add a snack',
    cookTime: 'Weekday cooking time',
    cookOptions: [
      { value: 10, label: '10 min' },
      { value: 20, label: '20 min' },
      { value: 30, label: '30+ min' },
    ] satisfies Option<10 | 20 | 30>[],
    budget: 'Food budget',
    budgetOptions: [
      { value: 1, label: 'Tight' },
      { value: 2, label: 'Normal' },
      { value: 3, label: 'Flexible' },
    ] satisfies Option<1 | 2 | 3>[],
  },
  staples: {
    title: "What's in your kitchen?",
    subtitle: 'Tick what you usually have. Plans use these first.',
  },
  health: {
    title: 'A quick health check',
    subtitle: 'Private to you. These change how FitG plans.',
    questions: [
      { key: 'pregnant', label: 'Are you pregnant?' },
      { key: 'diabetes', label: 'Do you have diabetes?' },
      { key: 'glp1', label: 'Are you on GLP-1 or other weight-loss medicine?' },
      { key: 'edHistory', label: 'Have you ever had an eating disorder?' },
    ] as const,
    yes: 'Yes',
    no: 'No',
    whyTitle: 'Why we ask',
    why: "If you're pregnant, have diabetes, or take weight-loss medicine, FitG never plans eating less than you burn — check your plan with your doctor. If you've had an eating disorder, FitG plans with portions and habits and never shows calorie numbers.",
  },
} as const;

/** Kitchen staples, Indian items first (PRD §5 step 10). Food keys from the bundle. */
export const STAPLES: Array<{ key: string; label: string }> = [
  { key: 'rice_white_raw', label: 'Rice' },
  { key: 'atta_whole_wheat', label: 'Atta' },
  { key: 'dal_toor_raw', label: 'Dal' },
  { key: 'egg_whole', label: 'Eggs' },
  { key: 'paneer', label: 'Paneer' },
  { key: 'chicken_breast_raw', label: 'Chicken' },
  { key: 'curd_whole', label: 'Curd' },
  { key: 'milk_whole', label: 'Milk' },
  { key: 'kidney_beans_raw', label: 'Rajma' },
  { key: 'chickpeas_raw', label: 'Chana' },
  { key: 'soya_chunks', label: 'Soya chunks' },
  { key: 'roasted_chana', label: 'Roasted chana' },
  { key: 'ghee', label: 'Ghee' },
  { key: 'oats_rolled', label: 'Oats' },
  { key: 'bread_whole_wheat', label: 'Bread' },
  { key: 'peanut_butter', label: 'Peanut butter' },
  { key: 'whey_isolate', label: 'Whey protein' },
  { key: 'banana', label: 'Bananas' },
];

export const PERMISSIONS_COPY = {
  title: 'Permissions & privacy',
  consentTitle: 'Your data',
  consent:
    'FitG uses your answers to plan your workouts and meals. Your data stays private, is never sold, and you can delete it any time in Settings.',
  agree: 'I agree',
  privacy: 'Privacy',
  terms: 'Terms',
  notifications: {
    title: 'Notifications',
    body: "The whole app is 4 pings a day. Without them it's a list.",
    allow: 'Allow',
    skip: 'Not now',
    denied: 'No problem, pings off. Turn them on in Settings any time.',
  },
  location: {
    title: 'Location',
    body: "Pin your gym and FitG notices when you walk in — your workout is one tap away. The Start button does the same job if you'd rather not.",
    allow: 'Pin my gym',
    skip: "Skip, I'll tap Start",
    denied: 'No problem. The Start button does the same job.',
  },
  cta: 'Build my week',
  needConsent: 'Tick "I agree" to continue.',
} as const;

export const REVEAL_COPY = {
  steps: ['Working out your calories', 'Picking your week', "Tomorrow's meals"],
  building: 'Building your week…',
  headline: (name?: string) => (name ? `Here's your week, ${name}.` : "Here's your week."),
  kcal: 'kcal a day',
  protein: 'g protein',
  perKg: (x: number) => `about ${x} g/kg`,
  tomorrow: 'Tomorrow',
  pingPreview: (when: string) => `${when} you'll get:`,
  cta: 'Show me the pings',
  skipHint: 'Tap anywhere to skip',
  error: "I'll refine this tonight.",
  disclaimer: 'Not medical advice. Check with your doctor if you have a health condition.',
} as const;

export const TODAY_COPY = {
  coachLine: "Today's sorted.",
  timeline: 'Today',
  empty: 'Rest day. Nothing to do but eat well.',
  sampleData: 'Sample food values (development build)',
  gymModeSoon: 'Gym mode arrives in the next build. Here is the session.',
} as const;

export const WEEK_COPY = {
  title: 'This week',
  nextWeek: 'Next week',
  rest: 'Rest',
  moved: (from: string) => `Moved from ${from}`,
  notBuilt: "Sunday's check-in builds next week.",
} as const;

export const WORKOUT_COPY = {
  start: 'Start workout',
  soon: 'Gym mode comes in the next build. For now, here is exactly what you will do.',
  sets: (sets: number, reps: string) => `${sets} × ${reps}`,
  whyMachine: 'Machines first: they guide the movement while you learn it.',
  rest: (sec: number) => `Rest ${sec} s between sets`,
} as const;

export const PROGRESS_COPY = {
  title: 'Progress',
  week1: 'Your week-1 numbers become the thing you beat.',
} as const;

export const COACH_COPY = {
  title: 'Coach',
  offline: 'Coach is out for a minute. Your plan still works.',
  soon: 'Ask anything about your plan — coming in a later build. Your week already runs without it.',
} as const;

export const SETTINGS_COPY = {
  title: 'Settings',
  profile: 'Profile',
  plan: 'Plan',
  appearance: 'Appearance',
  appearanceOptions: [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ] as const,
  gymDark: 'Gym mode stays dark, whatever you pick here.',
  haptics: 'Haptics',
  on: 'On',
  off: 'Off',
  habitOnly: 'Habit-only mode is on: FitG plans with portions and never shows calorie numbers.',
  support: 'Talking to someone helps. In India, call Tele-MANAS on 14416 (free, 24×7).',
  privacy: 'Privacy',
  developer: 'Developer',
  timeTravel: 'Time travel',
  timeTravelHint: 'Moves the app clock to test a whole day. Your real clock is untouched.',
  resetClock: 'Back to now',
  startOver: 'Start over',
  startOverHint: 'Deletes everything on this phone and goes back to the welcome screen.',
  version: (v: string, bundle: string) => `Version ${v} · data ${bundle}`,
} as const;

export const ERRORS = {
  offline: "Offline. Your plan's on your phone, pings still fire.",
  generic: 'Something went wrong on our side. Your plan is safe; try again.',
  stale: (day: string) => `Your ${day} change didn't apply — the week was replanned.`,
} as const;
