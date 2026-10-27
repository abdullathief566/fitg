// @fitg/engine — every number FitG shows comes from here (engines.md). Pure functions, zero runtime dependencies.
export * from './types/index.ts';

export * from './util/round.ts';
export * from './util/hash.ts';
export * from './util/plan-number.ts';
export * from './util/uuid.ts';
export * from './util/time.ts';
export * from './util/format.ts';

export * from './nutrition/nutrition.ts';
export * from './units/units.ts';
export * from './workout/templates.ts';

export * from './targets/targets.ts';
export * from './workout/steps.ts';
export * from './workout/select.ts';
export * from './workout/session.ts';
export * from './workout/reshuffle.ts';

export * from './meal/shape.ts';
export * from './meal/eligibility.ts';
export * from './meal/candidates.ts';
export * from './meal/scale.ts';
export * from './meal/plan.ts';
export * from './meal/rebalance.ts';
export * from './meal/home.ts';
export * from './meal/eatout.ts';
export * from './meal/grocery.ts';
export * from './meal/menu.ts';

export * from './validate/numbers.ts';
export * from './validate/banned.ts';

export * from './pings/copy-bank.ts';
export * from './pings/windows.ts';
export * from './pings/schedule.ts';
export * from './pings/categories.ts';
export * from './state/transition.ts';
export * from './state/next-step.ts';
export * from './state/derive.ts';
export * from './plan/week.ts';
export * from './plan/commands.ts';
