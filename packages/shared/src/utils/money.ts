/**
 * UGX money handling, shared by the API and the web.
 *
 * An invoice line's rate is a daily figure — normally a contract's monthly rate
 * divided by 30 — so it legitimately carries cents. Two decimals is the money
 * granularity everywhere it appears: the boundary validator rejects anything
 * finer instead of quietly rounding what the user typed, and every derived
 * figure is snapped back so binary arithmetic cannot leak dust into a total.
 */

/** Whole shillings or at most two decimals: true for 16666.67, false for 1.199. */
export function isTwoDpOrWhole(value: number): boolean {
  // Round-tripping through toFixed is exact for money-sized values. The obvious
  // alternative — a multiple-of-0.01 test — is not: binary floats make
  // 1.19 * 100 come out as 118.99999999999999 and reject a valid amount.
  return Number.isFinite(value) && Number(value.toFixed(2)) === value;
}

/** Snaps a derived money figure back to the two decimals money is kept at. */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * "UGX 600,000" while the amount is whole, "UGX 16,666.67" once it has cents.
 * Decimals are shown only when they carry information, and never more than two.
 */
export function formatUgx(value: number | null | undefined): string {
  const n = value ?? 0;
  return `UGX ${n.toLocaleString(undefined, {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
