"""Load Color-Pedia dataset into CandidateColor records."""

from __future__ import annotations

import hashlib
import json
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping

import pandas as pd
from omegaconf import DictConfig, OmegaConf

from colorrec.colorspace import (
    hex_to_rgb,
    hsl_to_rgb,
    is_weird_display_name,
    rgb_to_hex,
    rgb_to_hsl,
)
from colorrec.config import resolve_path
from colorrec.data.candidate_fields import prepare_color_fields
from colorrec.schemas import CandidateColor, normalize_hex

logger = logging.getLogger(__name__)

_RGB_FUNC_RE = re.compile(
    r"rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)",
    re.IGNORECASE,
)

_LAST_LOAD_STATS: "ColorPediaLoadStats | None" = None


@dataclass
class ColorPediaLoadStats:
    """Summary of the most recent Color-Pedia load."""

    source: str = "color_pedia"
    rows_read: int = 0
    loaded: int = 0
    skipped: int = 0
    skip_reasons: dict[str, int] = field(default_factory=dict)

    def record_skip(self, reason: str) -> None:
        self.skipped += 1
        self.skip_reasons[reason] = self.skip_reasons.get(reason, 0) + 1


def get_last_color_pedia_load_stats() -> ColorPediaLoadStats | None:
    """Return stats from the most recent :func:`load_color_pedia_colors` call."""
    return _LAST_LOAD_STATS


def _is_missing(val: Any) -> bool:
    if val is None:
        return True
    if isinstance(val, float) and pd.isna(val):
        return True
    if isinstance(val, str) and not val.strip():
        return True
    return False


def _to_float(val: Any) -> float | None:
    if _is_missing(val):
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def _normalize_hsl_component(value: float, *, is_hue: bool) -> float:
    if is_hue:
        return value % 360.0
    if value > 1.0:
        return value / 100.0
    return max(0.0, min(1.0, value))


def parse_rgb_value(val: Any) -> tuple[int, int, int] | None:
    """Parse RGB from int columns, lists, ``rgb(r,g,b)``, or ``r,g,b`` strings."""
    if _is_missing(val):
        return None

    if isinstance(val, (list, tuple)) and len(val) >= 3:
        try:
            return int(val[0]), int(val[1]), int(val[2])
        except (TypeError, ValueError):
            return None

    if isinstance(val, dict):
        r = val.get("r", val.get("red"))
        g = val.get("g", val.get("green"))
        b = val.get("b", val.get("blue"))
        if not any(_is_missing(x) for x in (r, g, b)):
            try:
                return int(r), int(g), int(b)
            except (TypeError, ValueError):
                return None

    s = str(val).strip()
    m = _RGB_FUNC_RE.match(s)
    if m:
        return int(m.group(1)), int(m.group(2)), int(m.group(3))

    parts = re.split(r"[,;/\s]+", s)
    nums: list[int] = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        if part.isdigit():
            nums.append(int(part))
        if len(nums) >= 3:
            break
    if len(nums) >= 3:
        return nums[0], nums[1], nums[2]
    return None


def _normalize_col_name(name: str) -> str:
    """Normalize column names for flexible matching (spaces, case, punctuation)."""
    return re.sub(r"[^a-z0-9]+", "_", name.strip().lower()).strip("_")


def detect_columns(
    df_columns: list[str],
    column_candidates: Mapping[str, list[str]],
) -> dict[str, str | None]:
    """Map logical fields to actual dataframe column names."""
    exact_map = {c: c for c in df_columns}
    lower_map = {c.lower(): c for c in df_columns}
    norm_map = {_normalize_col_name(c): c for c in df_columns}

    detected: dict[str, str | None] = {}
    for field, candidates in column_candidates.items():
        found: str | None = None
        for cand in candidates:
            if cand in exact_map:
                found = cand
                break
            if cand.lower() in lower_map:
                found = lower_map[cand.lower()]
                break
            norm_cand = _normalize_col_name(cand)
            if norm_cand in norm_map:
                found = norm_map[norm_cand]
                break
        detected[field] = found
    return detected


def _inspect_dataframe(df: pd.DataFrame, detected: dict[str, str | None]) -> dict[str, Any]:
    sample_rows: list[dict[str, Any]] = []
    for _, row in df.head(5).iterrows():
        sample_rows.append({k: (None if pd.isna(v) else v) for k, v in row.items()})

    weird_display_name_count = 0
    name_col = detected.get("name")
    if name_col and name_col in df.columns:
        for val in df[name_col].dropna():
            if is_weird_display_name(str(val)):
                weird_display_name_count += 1

    return {
        "columns": list(df.columns),
        "dtypes": {col: str(dtype) for col, dtype in df.dtypes.items()},
        "non_null_counts": {col: int(df[col].notna().sum()) for col in df.columns},
        "row_count": int(len(df)),
        "sample_rows": sample_rows,
        "detected_columns": detected,
        "weird_display_name_count": weird_display_name_count,
        "warnings": [],
    }


def _write_schema_inspection(report: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(report, indent=2, ensure_ascii=False, default=str) + "\n",
        encoding="utf-8",
    )
    logger.info("Wrote Color-Pedia schema inspection: %s", path)


def _resolve_color_pedia_cfg(config_or_path: DictConfig | str | Path) -> DictConfig:
    if isinstance(config_or_path, DictConfig):
        if "color_pedia" in config_or_path and "sources" not in config_or_path:
            return config_or_path
        if "data" in config_or_path:
            return config_or_path.data.color_pedia
        return config_or_path

    if isinstance(config_or_path, (str, Path)):
        p = Path(config_or_path)
        if p.suffix.lower() in {".yaml", ".yml"}:
            from colorrec.config import load_config

            cfg = load_config(p)
            return cfg.data.color_pedia
        if p.is_dir():
            return OmegaConf.create({"local_dir": str(p)})
        if p.is_file():
            return OmegaConf.create({"local_dir": str(p.parent)})
    return OmegaConf.create(config_or_path)


def _column_candidates_from_cfg(cp_cfg: DictConfig) -> dict[str, list[str]]:
    if "column_candidates" in cp_cfg:
        return OmegaConf.to_container(cp_cfg.column_candidates, resolve=True)  # type: ignore[return-value]
    return {
        "name": ["name", "color_name", "title", "color"],
        "hex": ["hex", "hex_code", "hex_value", "HEX"],
        "rgb": ["rgb", "RGB"],
        "r": ["r", "red"],
        "g": ["g", "green"],
        "b": ["b", "blue"],
        "h": ["h", "hue"],
        "s": ["s", "saturation"],
        "l": ["l", "lightness", "luminosity"],
        "mood": ["mood", "moods"],
        "emotion": ["emotion", "emotions"],
        "symbolism": ["symbolism", "symbolic_meaning", "meaning"],
        "personality": ["personality", "personalities"],
        "keywords": ["keywords", "tags"],
        "use_case": ["use_case", "use_cases", "usage", "applications"],
    }


def _load_dataframe_from_local(local_dir: Path) -> pd.DataFrame | None:
    if local_dir.is_file():
        return _read_tabular_file(local_dir)

    if not local_dir.is_dir():
        return None

    patterns = ["*.parquet", "*.csv", "*.json", "*.jsonl"]
    skip_names = {"schema_inspection.json"}
    files: list[Path] = []
    for pattern in patterns:
        for f in sorted(local_dir.glob(pattern)):
            if f.name in skip_names:
                continue
            files.append(f)

    if not files:
        return None

    frames = [_read_tabular_file(f) for f in files]
    return pd.concat(frames, ignore_index=True)


def _read_tabular_file(path: Path) -> pd.DataFrame:
    suffix = path.suffix.lower()
    if suffix == ".parquet":
        return pd.read_parquet(path)
    if suffix == ".csv":
        return pd.read_csv(path)
    if suffix == ".json":
        return pd.read_json(path)
    if suffix == ".jsonl":
        return pd.read_json(path, lines=True)
    raise ValueError(f"Unsupported Color-Pedia file format: {path}")


def _load_dataframe_from_hf(cp_cfg: DictConfig) -> pd.DataFrame:
    try:
        from datasets import load_dataset
    except ImportError as exc:
        raise ImportError(
            "Hugging Face `datasets` is required for online Color-Pedia loading. "
            'Install with: pip install -e ".[color_pedia]" '
            "or place parquet/csv/json under data/raw/color_pedia/."
        ) from exc

    dataset_name = str(cp_cfg.get("dataset_name", "boltuix/color-pedia"))
    cache_dir = cp_cfg.get("cache_dir")
    cache_path = resolve_path(str(cache_dir)) if cache_dir else None

    logger.info("Loading Color-Pedia from Hugging Face: %s", dataset_name)
    ds = load_dataset(dataset_name, cache_dir=str(cache_path) if cache_path else None)
    if hasattr(ds, "keys"):
        split = "train" if "train" in ds else next(iter(ds.keys()))
        ds = ds[split]
    return ds.to_pandas()


def _load_dataframe(cp_cfg: DictConfig) -> pd.DataFrame:
    local_dir = cp_cfg.get("local_dir")
    if local_dir:
        local_path = resolve_path(str(local_dir))
        df = _load_dataframe_from_local(local_path)
        if df is not None:
            logger.info(
                "Loaded Color-Pedia from local files under %s (%d rows)",
                local_path,
                len(df),
            )
            return df

    return _load_dataframe_from_hf(cp_cfg)


def _row_value(row: pd.Series, col: str | None) -> Any:
    if col is None:
        return None
    return row[col]


def _extract_metadata(row: pd.Series, detected: dict[str, str | None]) -> dict[str, Any]:
    meta: dict[str, Any] = {}
    text_fields = ("mood", "emotion", "symbolism", "personality", "keywords", "use_case")
    for field in text_fields:
        col = detected.get(field)
        if col is None:
            continue
        val = _row_value(row, col)
        if not _is_missing(val):
            meta[field] = val

    reserved = {c for c in detected.values() if c is not None}
    extra: dict[str, Any] = {}
    for col in row.index:
        if col in reserved:
            continue
        val = row[col]
        if _is_missing(val):
            continue
        extra[col] = val
    if extra:
        meta["extra_fields"] = extra

    return meta


def _resolve_rgb_from_row(row: pd.Series, detected: dict[str, str | None]) -> tuple[int, int, int] | None:
    hex_col = detected.get("hex")
    if hex_col:
        hex_val = _row_value(row, hex_col)
        if not _is_missing(hex_val):
            try:
                return hex_to_rgb(normalize_hex(str(hex_val)))
            except ValueError:
                pass

    rgb_col = detected.get("rgb")
    if rgb_col:
        rgb = parse_rgb_value(_row_value(row, rgb_col))
        if rgb is not None:
            return rgb

    r_col, g_col, b_col = detected.get("r"), detected.get("g"), detected.get("b")
    if r_col and g_col and b_col:
        try:
            r = int(_row_value(row, r_col))
            g = int(_row_value(row, g_col))
            b = int(_row_value(row, b_col))
            return r, g, b
        except (TypeError, ValueError):
            pass

    h_col, s_col, l_col = detected.get("h"), detected.get("s"), detected.get("l")
    if h_col and s_col and l_col:
        h_raw = _to_float(_row_value(row, h_col))
        s_raw = _to_float(_row_value(row, s_col))
        l_raw = _to_float(_row_value(row, l_col))
        if h_raw is not None and s_raw is not None and l_raw is not None:
            h = _normalize_hsl_component(h_raw, is_hue=True)
            s = _normalize_hsl_component(s_raw, is_hue=False)
            l = _normalize_hsl_component(l_raw, is_hue=False)
            return hsl_to_rgb(h, s, l)

    return None


def _make_color_id(name: str, hex_val: str) -> str:
    slug_base = f"{name.strip().lower()}:{hex_val.upper()}"
    digest = hashlib.sha256(slug_base.encode("utf-8")).hexdigest()[:12]
    return f"color_pedia:{digest}"


def _row_to_candidate(
    row: pd.Series,
    detected: dict[str, str | None],
    *,
    descriptor_max_chars: int,
    stats: ColorPediaLoadStats,
) -> CandidateColor | None:
    name_col = detected.get("name")
    if name_col is None:
        stats.record_skip("missing_name_column")
        return None

    name_val = _row_value(row, name_col)
    if _is_missing(name_val):
        stats.record_skip("missing_name")
        return None
    name = str(name_val).strip()

    rgb = _resolve_rgb_from_row(row, detected)
    if rgb is None:
        stats.record_skip("missing_color_values")
        return None

    r, g, b = rgb
    hex_val = rgb_to_hex(r, g, b)
    h, s, l = rgb_to_hsl(r, g, b)
    row_metadata = _extract_metadata(row, detected)
    display_name, family, _family_hsl, descriptor, metadata = prepare_color_fields(
        name,
        hex_val=hex_val,
        r=r,
        g=g,
        b=b,
        h=h,
        s=s,
        l=l,
        extra_metadata=row_metadata,
    )
    if len(descriptor) > descriptor_max_chars:
        descriptor = descriptor[: descriptor_max_chars - 3].rsplit(", ", 1)[0]

    return CandidateColor(
        color_id=_make_color_id(name, hex_val),
        source="color_pedia",
        name=display_name,
        hex=hex_val,
        r=r,
        g=g,
        b=b,
        h=round(h, 2),
        s=round(s, 4),
        l=round(l, 4),
        family=family,
        descriptor=descriptor,
        metadata=metadata,
    )


def load_color_pedia_colors(config_or_path: DictConfig | str | Path) -> list[CandidateColor]:
    """Load Color-Pedia rows as CandidateColor records."""
    global _LAST_LOAD_STATS

    cp_cfg = _resolve_color_pedia_cfg(config_or_path)
    stats = ColorPediaLoadStats()
    warnings: list[str] = []

    df = _load_dataframe(cp_cfg)
    stats.rows_read = len(df)

    max_rows = cp_cfg.get("max_rows")
    if max_rows is not None:
        df = df.head(int(max_rows))

    column_candidates = _column_candidates_from_cfg(cp_cfg)
    detected = detect_columns(list(df.columns), column_candidates)

    if detected.get("name") is None:
        warnings.append("No name column detected; all rows will be skipped.")

    inspection = _inspect_dataframe(df, detected)
    inspection["warnings"] = warnings

    descriptor_max_chars = int(cp_cfg.get("descriptor_max_chars", 256))
    colors: list[CandidateColor] = []

    for idx, row in df.iterrows():
        try:
            candidate = _row_to_candidate(
                row,
                detected,
                descriptor_max_chars=descriptor_max_chars,
                stats=stats,
            )
            if candidate is not None:
                colors.append(candidate)
        except Exception as exc:
            stats.record_skip("parse_error")
            logger.warning("Color-Pedia row %s parse error: %s", idx, exc)

    stats.loaded = len(colors)
    inspection["load_stats"] = {
        "loaded": stats.loaded,
        "skipped": stats.skipped,
        "skip_reasons": stats.skip_reasons,
    }
    inspection["warnings"].extend(
        [f"Skipped {count} rows: {reason}" for reason, count in stats.skip_reasons.items()]
    )

    if cp_cfg.get("write_schema_inspection", True):
        inspection_path = cp_cfg.get("schema_inspection_path")
        if inspection_path:
            _write_schema_inspection(inspection, resolve_path(str(inspection_path)))
        else:
            local_dir = cp_cfg.get("local_dir")
            if local_dir:
                out = resolve_path(str(local_dir)) / "schema_inspection.json"
                _write_schema_inspection(inspection, out)

    if stats.skipped:
        logger.warning(
            "Color-Pedia load skipped %d/%d rows. Reasons: %s",
            stats.skipped,
            stats.rows_read,
            stats.skip_reasons,
        )
    logger.info("Loaded %d Color-Pedia colors (%d skipped)", stats.loaded, stats.skipped)

    _LAST_LOAD_STATS = stats
    return colors
