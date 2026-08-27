#!/usr/bin/env python3
"""
Download MakeMeAHanzi graphics.txt (same stroke/median dataset as 福.json) into
data/chinese_glyphs/graphics.txt. The API will then resolve ~9500 common characters
without per-character JSON files.

Source: https://github.com/skishore/makemeahanzi (LGPL / Arphic license — see project site).
"""

from __future__ import annotations

import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
OUT = REPO_ROOT / "data" / "chinese_glyphs" / "graphics.txt"
URL = "https://raw.githubusercontent.com/skishore/makemeahanzi/master/graphics.txt"


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading\n  {URL}\n-> {OUT}")
    urllib.request.urlretrieve(URL, OUT)
    n = OUT.stat().st_size
    print(f"Done ({n:,} bytes). Restart the API to load the index.")


if __name__ == "__main__":
    main()
