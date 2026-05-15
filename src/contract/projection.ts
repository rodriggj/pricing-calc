// Contract Module — pure projection from EstimatePayload to PerYearGroupPayload.
//
// Implements Algorithm 1 from the design: reshapes the per-resource year-array
// form into the per-year-group form that Agent 2 consumes.
//
// This function is PURE:
//   - No side effects
//   - No mutation of the input payload
//   - Deterministic: same input always produces same output

import type {
  EstimatePayload,
  PerYearGroupPayload,
  YearGroup,
  YearGroupItem,
} from './schema';

/**
 * Add `months` calendar months to a `YYYY-MM-01` date string.
 * Pure calendar arithmetic — no timezone handling.
 *
 * Since we only ever add multiples of 12, this simplifies to incrementing
 * the year component by `months / 12`.
 */
function addMonths(yearMonthStr: string, months: number): string {
  const year = parseInt(yearMonthStr.slice(0, 4), 10);
  const month = parseInt(yearMonthStr.slice(5, 7), 10);

  // Total months (0-indexed internally for arithmetic)
  const totalMonths = (year * 12 + (month - 1)) + months;
  const newYear = Math.floor(totalMonths / 12);
  const newMonth = (totalMonths % 12) + 1;

  return `${String(newYear).padStart(4, '0')}-${String(newMonth).padStart(2, '0')}-01`;
}

/**
 * Project a validated EstimatePayload into a PerYearGroupPayload.
 *
 * Algorithm 1 from the design:
 *   1. Compute year-start months from the estimate anchor.
 *   2. Distribute each line item into year groups where its quantity > 0.
 *   3. Sort items within each group by lineItemId ascending for determinism.
 *
 * Postconditions:
 *   - Output has exactly 5 groups, indexed Year 1 through Year 5.
 *   - Each group's startMonth = yearOneStartMonth + (yearIndex − 1) × 12 months.
 *   - Zero-quantity items are omitted from groups.
 *   - Items within a group are sorted by lineItemId ascending.
 *   - Configuration objects in the output reference the same objects as the input
 *     (no mutation occurs; they are carried forward unchanged).
 *
 * @param payload - A validated EstimatePayload (must have passed parseEstimatePayload).
 * @returns A PerYearGroupPayload with exactly 5 year groups.
 */
export function projectToPerYearGroups(
  payload: EstimatePayload,
): PerYearGroupPayload {
  // Step 1: Compute year-start months from the estimate anchor
  const groups: [YearGroup, YearGroup, YearGroup, YearGroup, YearGroup] = [
    { yearIndex: 1, startMonth: addMonths(payload.yearOneStartMonth, 0), items: [] },
    { yearIndex: 2, startMonth: addMonths(payload.yearOneStartMonth, 12), items: [] },
    { yearIndex: 3, startMonth: addMonths(payload.yearOneStartMonth, 24), items: [] },
    { yearIndex: 4, startMonth: addMonths(payload.yearOneStartMonth, 36), items: [] },
    { yearIndex: 5, startMonth: addMonths(payload.yearOneStartMonth, 48), items: [] },
  ];

  // Step 2: Distribute each line item into the year groups where its quantity > 0
  for (const item of payload.lineItems) {
    for (let yearIndex = 1; yearIndex <= 5; yearIndex++) {
      const qty = item.quantityPerYear[yearIndex - 1];
      if (qty > 0) {
        const groupItem: YearGroupItem = {
          lineItemId: item.id,
          serviceCode: item.serviceCode,
          configuration: item.configuration,
          region: item.region,
          quantity: qty,
        };
        groups[yearIndex - 1].items.push(groupItem);
      }
    }
  }

  // Step 3: Stable ordering — sort items within each group by lineItemId ascending
  for (const group of groups) {
    group.items.sort((a, b) => a.lineItemId.localeCompare(b.lineItemId));
  }

  return {
    estimateId: payload.id,
    yearOneStartMonth: payload.yearOneStartMonth,
    groups,
  };
}
