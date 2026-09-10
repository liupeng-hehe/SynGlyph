/** Camera match for the React Bits Circular Gallery (OGL) setup. */
export const CIRCULAR_GALLERY_FOV = 45;
export const CIRCULAR_GALLERY_CAM_Z = 20;
export const CIRCULAR_GALLERY_BEND = 2.4;

export type CircularGalleryLayout = {
  screenW: number;
  screenH: number;
  viewportW: number;
  viewportH: number;
  plane: number;
  stride: number;
  bend: number;
};

export function shortestRelative(index: number, offset: number, total: number): number {
  if (total <= 0) return index - offset;
  let relative = index - offset;
  relative -= Math.round(relative / total) * total;
  return relative;
}

/**
 * Circular-segment bend from Circular Gallery.
 * World/CSS y-up: bend > 0 drops the sides and tilts each plane onto the tangent.
 */
export function circularBend(
  x: number,
  viewportHalf: number,
  bend: number,
): { y: number; rotation: number } {
  if (bend === 0 || viewportHalf <= 0) {
    return { y: 0, rotation: 0 };
  }

  const bendAbs = Math.abs(bend);
  const radius = (viewportHalf * viewportHalf + bendAbs * bendAbs) / (2 * bendAbs);
  const effectiveX = Math.min(Math.abs(x), radius * 0.985);
  const under = Math.max(radius * radius - effectiveX * effectiveX, 0);
  const arc = radius - Math.sqrt(under);
  const tilt = Math.asin(Math.min(effectiveX / radius, 1));
  const sign = x === 0 ? 1 : Math.sign(x);

  if (bend > 0) {
    return { y: -arc, rotation: -sign * tilt };
  }

  return { y: arc, rotation: sign * tilt };
}

export function measureCircularGalleryLayout(
  screenW: number,
  screenH: number,
  bend = CIRCULAR_GALLERY_BEND,
): CircularGalleryLayout {
  const width = Math.max(screenW, 1);
  const height = Math.max(screenH, 1);
  const fov = (CIRCULAR_GALLERY_FOV * Math.PI) / 180;
  const viewportH = 2 * Math.tan(fov / 2) * CIRCULAR_GALLERY_CAM_Z;
  const viewportW = viewportH * (width / height);
  const scale = height / 1500;
  const plane = Math.min(
    (viewportH * (1080 * scale)) / height,
    (viewportW * (980 * scale)) / width,
  );

  return {
    screenW: width,
    screenH: height,
    viewportW,
    viewportH,
    plane,
    stride: plane * 1.18,
    bend,
  };
}

export function worldToCss(
  worldX: number,
  worldY: number,
  layout: CircularGalleryLayout,
): { x: number; y: number } {
  return {
    x: (worldX / layout.viewportW) * layout.screenW,
    y: (-worldY / layout.viewportH) * layout.screenH,
  };
}
