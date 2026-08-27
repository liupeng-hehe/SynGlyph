/** Dispatched on `document` before letter-grid PNG/PDF rasterization. */
export const LETTER_GRID_EXPORT_PREP_EVENT = "synGlyph:prepareLetterGridExport";

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function doubleFrame(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}

/** Force off-screen stipple canvases to paint and wait for layout before capture. */
export async function prepareLetterGridForRasterExport(
  node: HTMLElement,
): Promise<void> {
  node.scrollIntoView({ block: "nearest", inline: "nearest" });
  node.dataset.letterGridExport = "1";
  document.dispatchEvent(new Event(LETTER_GRID_EXPORT_PREP_EVENT));

  await doubleFrame();

  const deadline = performance.now() + 4000;
  while (performance.now() < deadline) {
    const canvases = node.querySelectorAll("canvas");
    if (canvases.length > 0) {
      const ready = Array.from(canvases).every(
        (c) => c.width > 8 && c.height > 8,
      );
      if (ready) break;
    }
    await nextFrame();
  }

  await doubleFrame();
}

export function cleanupLetterGridExportPrep(node: HTMLElement): void {
  delete node.dataset.letterGridExport;
}
