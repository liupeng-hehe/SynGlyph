/** Shared footer gradient — keep in sync with LetterColorCard live styles */
export const LETTER_CARD_FOOTER_GRADIENT =
  "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.48) 55%, transparent 100%)";

/** html2canvas cannot rasterize backdrop-filter; strip it without changing the gradient */
export function prepareLetterCardFootersForRasterExport(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>("[data-letter-card-footer]").forEach((el) => {
    el.style.backdropFilter = "none";
    el.style.setProperty("-webkit-backdrop-filter", "none");
  });
}
