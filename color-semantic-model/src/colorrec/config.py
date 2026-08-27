"""Configuration loading with OmegaConf."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from omegaconf import DictConfig, OmegaConf


def get_project_root() -> Path:
    """Return the color-semantic-model package root (parent of src/)."""
    return Path(__file__).resolve().parents[2]


def resolve_path(path: str | Path, *, base: Path | None = None) -> Path:
    """Resolve a config path relative to the project root unless absolute."""
    p = Path(path)
    if p.is_absolute():
        return p.resolve()
    root = base or get_project_root()
    return (root / p).resolve()


def _merge_config_with_defaults(cfg_path: Path, cfg: DictConfig) -> DictConfig:
    """Recursively merge Hydra-style ``defaults: [foo, bar]`` chains."""
    if "defaults" not in cfg:
        return cfg

    defaults = OmegaConf.to_container(cfg.defaults, resolve=False)
    merged: dict[str, Any] = {}
    self_cfg = OmegaConf.create({k: v for k, v in cfg.items() if k != "defaults"})

    if isinstance(defaults, list):
        for item in defaults:
            if isinstance(item, dict):
                continue
            if item == "_self_":
                merged = OmegaConf.merge(OmegaConf.create(merged), self_cfg)
                self_cfg = OmegaConf.create({})
                continue
            default_path = cfg_path.parent / f"{item}.yaml"
            if not default_path.exists():
                raise FileNotFoundError(f"Default config not found: {default_path}")
            sub = _merge_config_with_defaults(default_path, OmegaConf.load(default_path))
            merged = OmegaConf.merge(OmegaConf.create(merged), sub)

    if len(self_cfg):
        merged = OmegaConf.merge(OmegaConf.create(merged), self_cfg)
    return OmegaConf.create(merged)


def load_config(config_path: str | Path, *, overrides: list[str] | None = None) -> DictConfig:
    """Load YAML config with optional defaults chain and CLI overrides.

    Supports OmegaConf interpolation including ``${oc.env:VAR,default}``.
    Relative paths in config values are *not* auto-resolved here; callers
    should use :func:`resolve_path` when reading path keys.
    """
    cfg_path = Path(config_path)
    if not cfg_path.is_absolute():
        cfg_path = get_project_root() / cfg_path
    if not cfg_path.exists():
        raise FileNotFoundError(f"Config not found: {cfg_path}")

    cfg = _merge_config_with_defaults(cfg_path, OmegaConf.load(cfg_path))

    if overrides:
        cfg = OmegaConf.merge(cfg, OmegaConf.from_dotlist(overrides))

    OmegaConf.resolve(cfg)
    return cfg


def get_path(cfg: DictConfig, key: str) -> Path:
    """Read ``paths.<key>`` from config and resolve against project root."""
    try:
        raw = cfg.paths[key]
    except Exception as exc:
        raise KeyError(f"Missing config key paths.{key}") from exc
    return resolve_path(str(raw))
