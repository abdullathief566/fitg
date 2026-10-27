// Nutrition, portions, labels (docs/20-engineering/types.md §3).
import type { Unit } from './enums.ts';

export interface Nutrition {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/**
 * grams are exact; qty is rounded for the label.
 * For Home Food portions `homeDishKey` is set and `foodKey` holds the same dish key (a dish is not a food row).
 */
export interface Portion {
  foodKey: string;
  grams: number;
  unit: Unit;
  qty: number;
  label: string;
  homeDishKey?: string;
}

export interface AddonPick {
  addonKey: string;
  qty: number;
}
