/** Build-your-own lab palette — same as `BuildYourOwnLab` in web-presentation */
export const BYO_BG = "#FFF8E7";
export const BYO_INK = "#002FA7";

function swatchRelLuminance(hex: string): number {
  const raw = hex.replace(/^#/, "").slice(0, 6).padStart(6, "0");
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const r = lin(parseInt(raw.slice(0, 2), 16));
  const g = lin(parseInt(raw.slice(2, 4), 16));
  const b = lin(parseInt(raw.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** ◎ on letter color swatch — Klein blue on light fills, white on dark fills. */
export function byoLabSwatchIconColor(swatchHex: string): string {
  return swatchRelLuminance(swatchHex) >= 0.45 ? BYO_INK : "#FFFFFF";
}
