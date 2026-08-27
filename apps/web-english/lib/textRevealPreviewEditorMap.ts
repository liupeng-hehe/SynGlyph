/**
 * Letter-level preview editor (WordLetterReviewGrid): maps display P/S to
 * inputs for `visualStyleFromPxS` only. Does not change model, storage, or UI labels.
 *
 * Debug (dev): pDisplay/sDisplay → pRender/sRender before calling visualStyleFromPxS.
 */

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Display P ∈ [0,1] → render input so P=0 matches old visual at P=0.5, P=1 unchanged. */
export function mapPForRender(pDisplay: number): number {
  const p = clamp01(pDisplay);
  return Math.max(0.5, Math.min(1, 0.5 + 0.5 * p));
}

/** Display S ∈ [0,1] → render input so S=1 matches old visual at S=0.5 (tighter spread). */
export function mapSForRender(sDisplay: number): number {
  const s = clamp01(sDisplay);
  return Math.max(0, Math.min(0.5, 0.5 * s));
}
