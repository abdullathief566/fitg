// The ping copy bank (docs/10-design/copy.md §3). The engine builds pings, so it owns their words.
// Every number is a {placeholder} filled by code; AI copy may replace the wording nightly, never the numbers.
// Voice: one sentence, then the button; friend, not dashboard; funny at the edges, never at the user; no guilt.
// The FIRST standard wording of each ping is the canonical one from copy.md; the others are drafts for Abdul to approve.
//
// Placeholders: {session} {time} {exerciseList} {prepTask} {breakfast} {breakfastTime} {lunch} {offset} {n} {min}
// {firstLift} {sets} {reps} {kg} {deltaClause} {newTime} {protein} {meal} {mealMin} {oilLine} {carbPortion}
// {quickMeal} {quickMin} {dinnerPortions} {weekday} {price}.
// " at {kg} kg" is removed automatically for bodyweight exercises.
//
// The `ask` variant (copy.md §3): when a planned meal from earlier today has no status, the ping keeps its normal
// wording and the body ADDS one of the ASK_LINES below; its lowest-priority button becomes "Yes, ate it".
import type { CopyBank } from '../types/pings.ts';

/** Appended to a ping's body when it asks about an untapped meal. {askSlot}: "lunch", "your snack"… */
export const ASK_LINES: readonly string[] = ['Did {askSlot} happen?', 'Quick one: did {askSlot} happen?'];

export const COPY_BANK: CopyBank = {
  night_before: {
    gym: {
      standard: [
        {
          title: 'Tomorrow: {session} at {time}',
          body: '{exerciseList}. {prepTask}',
          short: 'Tomorrow: {session} at {time}.',
        },
        {
          title: '{session} tomorrow, {time}',
          body: 'On the list: {exerciseList}. {prepTask}',
          short: '{session} tomorrow at {time}.',
        },
        {
          title: 'Gym tomorrow at {time}',
          body: '{session}: {exerciseList}. Bag by the door tonight. {prepTask}',
          short: 'Gym tomorrow at {time}: {session}.',
        },
        {
          title: "Tomorrow's plan: {session}",
          body: "{time} at the gym. {exerciseList}. That's all you need to know. {prepTask}",
          short: 'Tomorrow: {session}, {time}.',
        },
        {
          title: 'Heads-up: {session} tomorrow',
          body: '{time}, same as planned. {exerciseList}. {prepTask}',
          short: '{session} tomorrow, {time}.',
        },
      ],
      comeback: [
        {
          title: "Tomorrow's your comeback: {session} at {time}",
          body: 'Same weights as last time. No catching up to do. {prepTask}',
          short: 'Comeback tomorrow: {session} at {time}.',
        },
        {
          title: 'Back at it tomorrow: {session}',
          body: '{time}. Same weights as last time, nothing to make up. {prepTask}',
          short: 'Back at it tomorrow: {session}.',
        },
      ],
    },
    rest: {
      standard: [
        {
          title: 'Rest day tomorrow',
          body: '{breakfast} at {breakfastTime}. {lunch} for lunch. Nothing else to think about. {prepTask}',
          short: 'Rest day tomorrow.',
        },
        {
          title: "Tomorrow's a rest day",
          body: '{breakfast} for breakfast, {lunch} for lunch. Your legs say thanks. {prepTask}',
          short: 'Rest day tomorrow.',
        },
        {
          title: 'No gym tomorrow',
          body: 'Breakfast is {breakfast} at {breakfastTime}, lunch is {lunch}. Easy day. {prepTask}',
          short: 'No gym tomorrow.',
        },
        {
          title: "Rest day tomorrow. Food's sorted.",
          body: '{breakfast} at {breakfastTime}, then {lunch}. {prepTask}',
          short: "Rest day tomorrow; food's sorted.",
        },
        {
          title: 'Tomorrow: rest and eat well',
          body: "{breakfast} at {breakfastTime}. {lunch} at lunch. That's the whole plan. {prepTask}",
          short: 'Tomorrow: rest and eat well.',
        },
      ],
    },
  },
  pre_gym: {
    gym: {
      standard: [
        {
          title: 'Gym in {offset}. {session}.',
          body: '{n} moves, about {min} min. {firstLift} {sets}×{reps} at {kg} kg{deltaClause}.',
          short: 'Gym in {offset}: {session}.',
        },
        {
          title: '{offset} minutes to gym time',
          body: '{session}: {n} moves, about {min} min. First up, {firstLift} {sets}×{reps} at {kg} kg{deltaClause}.',
          short: '{offset} min to gym: {session}.',
        },
        {
          title: 'Shoes on. {session} in {offset}.',
          body: '{n} moves, about {min} min. Start with {firstLift} {sets}×{reps} at {kg} kg{deltaClause}.',
          short: '{session} in {offset}.',
        },
        {
          title: '{session} starts in {offset}',
          body: 'About {min} min, {n} moves. {firstLift} first: {sets}×{reps} at {kg} kg{deltaClause}.',
          short: '{session} in {offset} min.',
        },
        {
          title: 'Time to head out: {session}',
          body: '{offset} min to go. {n} moves, about {min} min. {firstLift} {sets}×{reps} at {kg} kg{deltaClause}.',
          short: 'Head out: {session}.',
        },
      ],
      late: [
        {
          title: 'Gym in {offset}.',
          body: "Moved this to {newTime} since that's when you actually go. {session}, {n} moves.",
          short: 'Gym in {offset}: {session}.',
        },
        {
          title: '{session} in {offset}',
          body: 'This ping now comes at {newTime}, when you usually head out. {n} moves, about {min} min.',
          short: '{session} in {offset}.',
        },
      ],
      comeback: [
        {
          title: 'Welcome back. {session}, {n} moves.',
          body: 'Small session, same weights. Just show up.',
          short: 'Welcome back: {session}.',
        },
        {
          title: 'Back at it: {session}',
          body: '{n} moves, same weights as last time. Nothing to catch up on.',
          short: 'Back at it: {session}.',
        },
      ],
    },
  },
  post_gym: {
    gym: {
      // standard = the immediate ping when the session ends or the gym zone is left.
      standard: [
        {
          title: 'Good session. {protein} g protein in the next 2 hours.',
          body: 'Quickest from your kitchen: {meal}, {mealMin} min.',
          short: '{protein} g protein soon: {meal}.',
        },
        {
          title: 'Done. Now {protein} g protein.',
          body: 'Within 2 hours. Quickest option: {meal}, {mealMin} min.',
          short: '{protein} g protein soon: {meal}.',
        },
        {
          title: 'Nice work. Food next.',
          body: '{protein} g protein in the next 2 hours: {meal} takes {mealMin} min.',
          short: 'Food next: {meal}.',
        },
        {
          title: "That's the session done",
          body: 'Refuel with {protein} g protein in the next 2 hours. {meal}, {mealMin} min.',
          short: 'Refuel: {meal}.',
        },
        {
          title: 'Good one. Protein time.',
          body: '{protein} g in the next 2 hours. Easiest: {meal}, {mealMin} min.',
          short: 'Protein time: {meal}.',
        },
      ],
      // late = the scheduled fallback at planned end + 45 min (category post_gym_fallback).
      late: [
        {
          title: 'Done for today? {protein} g protein when you can.',
          body: 'Quickest from your kitchen: {meal}, {mealMin} min.',
          short: '{protein} g protein when you can.',
        },
        {
          title: 'Wrapped up? Protein next.',
          body: '{protein} g protein in the next 2 hours. {meal}, {mealMin} min.',
          short: 'Protein next: {meal}.',
        },
      ],
      comeback: [
        { title: "That's the comeback.", body: '{protein} g protein: {meal}.', short: 'Comeback done: {meal} next.' },
        {
          title: 'Comeback done.',
          body: 'Now {protein} g protein: {meal}, {mealMin} min.',
          short: 'Comeback done: {meal} next.',
        },
      ],
    },
  },
  pre_dinner: {
    gym: {
      standard: [
        { title: 'Dinner: {meal}, {mealMin} min.', body: '{oilLine} {carbPortion}.', short: 'Dinner: {meal}.' },
        { title: 'Cooking time: {meal}', body: '{mealMin} min. {oilLine} {carbPortion}.', short: 'Cooking: {meal}.' },
        {
          title: '{meal} tonight, {mealMin} min',
          body: '{oilLine} {carbPortion}. Everything else is already counted.',
          short: 'Tonight: {meal}.',
        },
        {
          title: 'Start dinner? {meal}',
          body: 'About {mealMin} min. {oilLine} {carbPortion}.',
          short: 'Dinner: {meal}.',
        },
        {
          title: "Tonight's dinner: {meal}",
          body: '{mealMin} min start to finish. {oilLine} {carbPortion}.',
          short: 'Dinner: {meal}.',
        },
      ],
      late: [
        {
          title: "Late dinner's fine.",
          body: '{meal}, {mealMin} min, or {quickMeal} in {quickMin}.',
          short: 'Late dinner: {meal}.',
        },
        {
          title: 'Dinner a bit later tonight?',
          body: '{meal} takes {mealMin} min; {quickMeal} takes {quickMin}.',
          short: 'Dinner: {meal}.',
        },
      ],
      comeback: [
        {
          title: "Dinner's a bit smaller tonight.",
          body: '{dinnerPortions}. Lunch is covered.',
          short: 'Smaller dinner tonight: {meal}.',
        },
        {
          title: 'Lighter dinner tonight',
          body: '{dinnerPortions}. Lunch already did some of the work.',
          short: 'Lighter dinner: {meal}.',
        },
      ],
    },
    rest: {
      standard: [
        { title: 'Dinner: {meal}, {mealMin} min.', body: '{oilLine} {carbPortion}.', short: 'Dinner: {meal}.' },
        { title: 'Cooking time: {meal}', body: '{mealMin} min. {oilLine} {carbPortion}.', short: 'Cooking: {meal}.' },
        {
          title: '{meal} tonight, {mealMin} min',
          body: '{oilLine} {carbPortion}. Everything else is already counted.',
          short: 'Tonight: {meal}.',
        },
        {
          title: 'Start dinner? {meal}',
          body: 'About {mealMin} min. {oilLine} {carbPortion}.',
          short: 'Dinner: {meal}.',
        },
        {
          title: "Tonight's dinner: {meal}",
          body: '{mealMin} min start to finish. {oilLine} {carbPortion}.',
          short: 'Dinner: {meal}.',
        },
      ],
      late: [
        {
          title: "Late dinner's fine.",
          body: '{meal}, {mealMin} min, or {quickMeal} in {quickMin}.',
          short: 'Late dinner: {meal}.',
        },
        {
          title: 'Dinner a bit later tonight?',
          body: '{meal} takes {mealMin} min; {quickMeal} takes {quickMin}.',
          short: 'Dinner: {meal}.',
        },
      ],
      comeback: [
        {
          title: "Dinner's a bit smaller tonight.",
          body: '{dinnerPortions}. Lunch is covered.',
          short: 'Smaller dinner tonight: {meal}.',
        },
        {
          title: 'Lighter dinner tonight',
          body: '{dinnerPortions}. Lunch already did some of the work.',
          short: 'Lighter dinner: {meal}.',
        },
      ],
    },
  },
  // Silent notices: no sound, outside the 4-a-day cap, not managed by diffSchedule.
  trial_reminder: {
    rest: {
      standard: [
        {
          title: 'Your free week ends {weekday}',
          body: '{price}/month after; cancel in Settings any time.',
          short: 'Free week ends {weekday}.',
        },
        {
          title: 'Trial ends {weekday}',
          body: 'After that it is {price}/month. Cancel in Settings in two taps if it is not for you.',
          short: 'Trial ends {weekday}.',
        },
      ],
    },
  },
  checkin: {
    rest: {
      standard: [
        {
          title: 'Sunday check-in is ready',
          body: '30 seconds. Next week builds itself after.',
          short: 'Check-in is ready.',
        },
        {
          title: 'Check-in time',
          body: 'Three taps and a weigh-in, then next week is ready.',
          short: 'Check-in time.',
        },
      ],
    },
  },
};
