import type { Supervisor } from '@/lib/api';

/** One supervisee allowed; either phase may consume the seat when both quotas are ≥ 1 (e.g. 1/1/1). */
export function usesSharedSingleSeat(
  s: Pick<Supervisor, 'total_capacity' | 'choice_capacity' | 'lottery_capacity'>,
): boolean {
  return s.total_capacity === 1 && s.choice_capacity >= 1 && s.lottery_capacity >= 1;
}

export function combinedFilled(s: Pick<Supervisor, 'choice_filled' | 'lottery_filled'>): number {
  return s.choice_filled + s.lottery_filled;
}

export function supervisorHasChoiceRoom(s: Supervisor): boolean {
  if (!s.is_available) return false;
  if (combinedFilled(s) >= s.total_capacity) return false;
  if (usesSharedSingleSeat(s)) return true;
  return s.choice_filled < s.choice_capacity;
}

export function remainingChoiceSlotsDisplay(s: Supervisor): number {
  if (usesSharedSingleSeat(s)) {
    return Math.max(0, s.total_capacity - combinedFilled(s));
  }
  return Math.max(0, s.choice_capacity - s.choice_filled);
}

export function remainingLotterySlotsDisplay(s: Supervisor): number {
  if (usesSharedSingleSeat(s)) {
    return Math.max(0, s.total_capacity - combinedFilled(s));
  }
  return Math.max(0, s.lottery_capacity - s.lottery_filled);
}

/** When total > 1, choice + lottery partition total (not the 1/1/1 shared-seat case). */
export function usesPartitionedCapacities(total: number): boolean {
  return total > 1;
}

export function syncPartitionFromChoice(total: number, choice: number) {
  const c = Math.min(Math.max(0, choice), total);
  return { choice_capacity: c, lottery_capacity: total - c };
}

export function syncPartitionFromLottery(total: number, lottery: number) {
  const l = Math.min(Math.max(0, lottery), total);
  return { choice_capacity: total - l, lottery_capacity: l };
}

/** After total changes, clamp previous choice and derive lottery. */
export function syncPartitionFromTotal(total: number, previousChoice: number) {
  const c = Math.min(Math.max(0, previousChoice), total);
  return { choice_capacity: c, lottery_capacity: total - c };
}

/** Normalize stored row for the form when total > 1 (fixes bad sums from earlier saves). */
export function normalizePartitionForForm(
  total: number,
  choice: number,
  lottery: number,
): { choice_capacity: number; lottery_capacity: number } {
  if (total <= 1) {
    return { choice_capacity: choice, lottery_capacity: lottery };
  }
  return syncPartitionFromChoice(total, choice);
}
