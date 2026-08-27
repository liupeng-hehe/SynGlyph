const EDGE_PAD_CSS_PX = 4;
/** Small slack for backdrop-filter line boxes; avoid huge blanks under Y/Z rows */
const BOTTOM_GUARD_CSS_PX = 24;

/**
 * Height for html-to-image **fallback** (`height`-only option). Keeps slack minimal so
 * PDF/PNG don’t inherit a massively tall raster; html2canvas path trims solid bottom band.
 *
 * Do **not** pass custom capture `width` into html-to-image (aspect-ratio reflow bugs).
 */
export function letterGridExportHeightPx(node: HTMLElement): number {
  const root = node.getBoundingClientRect();
  const brH = Math.ceil(root.height);

  let rangeBottom = brH;
  try {
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = range.getClientRects();
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i]!;
      rangeBottom = Math.max(rangeBottom, Math.ceil(r.bottom - root.top));
    }
  } catch {
    /* ignore */
  }

  let unionTop = 0;
  let unionBottom = brH;
  node.querySelectorAll<HTMLElement>("*").forEach((el) => {
    const cr = el.getBoundingClientRect();
    unionTop = Math.min(unionTop, Math.floor(cr.top - root.top));
    unionBottom = Math.max(unionBottom, Math.ceil(cr.bottom - root.top));
  });
  const unionH = unionBottom - Math.min(0, unionTop);

  const height = Math.max(
    brH,
    unionH,
    rangeBottom,
    node.scrollHeight,
    node.offsetHeight,
  );

  return Math.max(
    1,
    height + EDGE_PAD_CSS_PX + BOTTOM_GUARD_CSS_PX,
  );
}

/** @deprecated Prefer {@link letterGridExportHeightPx} */
export function domNodeFullCaptureCssPx(node: HTMLElement): {
  width: number;
  height: number;
} {
  return {
    width: Math.max(1, node.offsetWidth),
    height: letterGridExportHeightPx(node),
  };
}
