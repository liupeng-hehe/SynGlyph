"""LAB → sRGB (D65, 2°), aligned with web `lib/labColor.ts` for preview hex."""

from __future__ import annotations


def lab_to_rgb(l: float, a: float, b: float) -> tuple[int, int, int]:
    y = (l + 16) / 116
    x = a / 500 + y
    z = y - b / 200
    x3 = x * x * x
    y3 = y * y * y
    z3 = z * z * z
    xr = (x3 if x3 > 0.008856 else (x - 16 / 116) / 7.787) * 0.95047
    yr = y3 if y3 > 0.008856 else (y - 16 / 116) / 7.787
    zr = (z3 if z3 > 0.008856 else (z - 16 / 116) / 7.787) * 1.08883
    r_lin = xr * 3.2406 + yr * -1.5372 + zr * -0.4986
    g_lin = xr * -0.9689 + yr * 1.8758 + zr * 0.0415
    b_lin = xr * 0.0557 + yr * -0.204 + zr * 1.057

    def lin(u: float) -> float:
        return (1.055 * (u ** (1 / 2.4)) - 0.055) if u > 0.0031308 else 12.92 * u

    r = lin(r_lin)
    g = lin(g_lin)
    bl = lin(b_lin)
    return (
        max(0, min(255, round(r * 255))),
        max(0, min(255, round(g * 255))),
        max(0, min(255, round(bl * 255))),
    )


def rgb_to_hex(r: int, g: int, b: int) -> str:
    return f"#{r:02x}{g:02x}{b:02x}"


def average_lab_preview_hex(lab_rows: list[tuple[float, float, float]]) -> str | None:
    if not lab_rows:
        return None
    n = len(lab_rows)
    l = sum(t[0] for t in lab_rows) / n
    a = sum(t[1] for t in lab_rows) / n
    b = sum(t[2] for t in lab_rows) / n
    rgb = lab_to_rgb(l, a, b)
    return rgb_to_hex(rgb[0], rgb[1], rgb[2])
