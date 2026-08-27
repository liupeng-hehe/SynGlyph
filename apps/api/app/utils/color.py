"""Hex and LAB color conversions. Uses sRGB -> XYZ -> LAB."""

import math


def _linearize(c: float) -> float:
    """sRGB gamma correction (decode)."""
    if c <= 0.04045:
        return c / 12.92
    return ((c + 0.055) / 1.055) ** 2.4


def _delinearize(c: float) -> float:
    """sRGB gamma correction (encode)."""
    if c <= 0.0031308:
        return c * 12.92
    return 1.055 * (c ** (1 / 2.4)) - 0.055


def hex_to_lab(hex_color: str) -> tuple[float, float, float]:
    """Convert 6-char hex (with or without #) to LAB [L, a, b]."""
    h = hex_color.replace("#", "").strip()
    if len(h) != 6:
        raise ValueError("Hex must be 6 chars")
    r = int(h[0:2], 16) / 255.0
    g = int(h[2:4], 16) / 255.0
    b = int(h[4:6], 16) / 255.0
    r, g, b = _linearize(r), _linearize(g), _linearize(b)
    # RGB to XYZ (sRGB D65)
    x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375
    y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750
    z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041
    # XYZ D65 white point
    xn, yn, zn = 0.95047, 1.0, 1.08883
    x, y, z = x / xn, y / yn, z / zn

    def f(t: float) -> float:
        if t > 0.008856:
            return t ** (1 / 3)
        return (7.787 * t) + (16 / 116)

    fy = f(y)
    L = 116 * fy - 16
    a = 500 * (f(x) - fy)
    b_val = 200 * (fy - f(z))
    return (L, a, b_val)


def lab_to_hex(L: float, a: float, b: float) -> str:
    """Convert LAB to 6-char hex (no #)."""
    yn = 1.0
    fy = (L + 16) / 116
    fx = a / 500 + fy
    fz = fy - b / 200

    def inv_f(t: float) -> float:
        if t > 0.20689655172413793:  # 6/29
            return t**3
        return (t - 16 / 116) / 7.787

    xn, zn = 0.95047, 1.08883
    x = xn * inv_f(fx)
    y = yn * inv_f(fy)
    z = zn * inv_f(fz)
    # XYZ to linear RGB
    r = x * 3.2404542 + y * -1.5371385 + z * -0.4985314
    g = x * -0.9692660 + y * 1.8760108 + z * 0.0415560
    b = x * 0.0556434 + y * -0.2040259 + z * 1.0572252
    r = max(0, min(1, _delinearize(r)))
    g = max(0, min(1, _delinearize(g)))
    b = max(0, min(1, _delinearize(b)))
    return f"{int(r*255):02x}{int(g*255):02x}{int(b*255):02x}"
