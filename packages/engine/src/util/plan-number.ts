// PlanNumber (engines.md §0): the only kind of number UI components that display numbers accept.
// Only engine functions create them, so a number on screen can always be traced to code, never to AI text.

export type PlanNumber = number & { readonly __brand: 'PlanNumber' };

export function pn(x: number): PlanNumber {
  if (!Number.isFinite(x)) throw new Error(`PlanNumber must be finite, got ${x}`);
  return x as PlanNumber;
}
