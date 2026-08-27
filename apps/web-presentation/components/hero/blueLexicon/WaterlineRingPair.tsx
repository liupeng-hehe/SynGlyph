import type { ReactNode } from "react";

import styles from "./blueLexicon.module.css";

const CLIP_UPPER = "blue-lexicon-clip-upper";
const CLIP_LOWER = "blue-lexicon-clip-lower";

export { CLIP_UPPER, CLIP_LOWER };

type WaterlineRingPairProps = {
  pathId: string;
  ringClassName: string;
  startOffset: string;
  upperTextClass: string;
  lowerTextClass: string;
  surfaceSpans: ReactNode;
  submergedSpans: ReactNode;
};

/**
 * Waterline is **fixed** in disk coordinates: `clipPath` must NOT sit inside the
 * rotating group, or the clip spins with the text and colors stop following the
 * real horizontal waterline.
 *
 * Structure: `clip > rotate > text`. Draw submerged first, then surface (IKB wins at seam).
 */
export function WaterlineRingPair({
  pathId,
  ringClassName,
  startOffset,
  upperTextClass,
  lowerTextClass,
  surfaceSpans,
  submergedSpans,
}: WaterlineRingPairProps) {
  const href = `#${pathId}`;
  return (
    <>
      <g clipPath={`url(#${CLIP_LOWER})`}>
        <g className={ringClassName}>
          <text className={`${styles.ringSubmergedText} ${lowerTextClass}`}>
            <textPath href={href} startOffset={startOffset}>
              {submergedSpans}
            </textPath>
          </text>
        </g>
      </g>
      <g clipPath={`url(#${CLIP_UPPER})`}>
        <g className={ringClassName}>
          <text className={`${styles.ringSurfaceText} ${upperTextClass}`}>
            <textPath href={href} startOffset={startOffset}>
              {surfaceSpans}
            </textPath>
          </text>
        </g>
      </g>
    </>
  );
}
