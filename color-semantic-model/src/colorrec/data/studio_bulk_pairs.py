"""Generate large Studio-format user_curated pairs without OpenAI (rules + palette)."""

from __future__ import annotations

import csv
import itertools
import random
from pathlib import Path

from colorrec.data.openai_distill import (
    PALETTE_HEADER,
    SCHEMA_A_HEADER,
    build_positive_descriptor,
    build_studio_anchor,
)
from colorrec.schemas import normalize_hex

# Align with apps/web-presentation FeelingSelector presets.
FEELING_PRESETS = [
    "melancholic",
    "luminous",
    "calm",
    "fierce",
    "tender",
    "mysterious",
    "restless",
    "fresh",
    "nostalgic",
    "warm",
]

# Short original passages (PDF / literary wash context). No external corpus.
PASSAGE_SNIPPETS = [
    "The horn section lingered over empty chairs long after the room had gone quiet.",
    "Morning light slid across the page like honey, slow and patient.",
    "Neon rain stitched the alley into a fever dream of distant engines.",
    "She folded the letter twice, as if softness could hide what it said.",
    "Every sentence burned at the edges but refused to collapse.",
    "Mint air and new ink — the first line of a book that might forgive you.",
    "Candle smoke curled above the margin where the poem finally breathed.",
    "The harbor fog turned the city into a watercolor nobody signed.",
    "His laughter arrived late, like a train everyone had stopped expecting.",
    "Silk and static — the dress remembered a party the photograph forgot.",
    "Under the awning, rain wrote shorthand on the pavement.",
    "A single trumpet note held the room together longer than speech could.",
    "The manuscript smelled of cedar drawers and unfinished apologies.",
    "Heat shimmered off the plaza; even the shadows looked thirsty.",
    "Her voice lowered the lights without touching a switch.",
    "Pine needles clicked against the window like impatient typewriter keys.",
    "The gallery closed, but one painting kept giving off late sun.",
    "Ink bled softly into the deckled edge — not a mistake, a mood.",
    "Midnight coffee left a bronze ring on the chapter she reread.",
    "Snow erased the street names; only the bakery sign remained legible.",
    "The choir paused between verses, and the silence was its own color.",
    "Rust and river mud — the old bridge still knew everyone's secrets.",
    "A paperback spine cracked open to the dog-eared page of summer.",
    "Electric signs buzzed in a language the tourists pretended to learn.",
    "Wool scarf, cold bench, the kind of dusk that forgives small sins.",
    "The typewriter bell rang once, politely, at the end of the world.",
    "Lavender soap and hallway dust in a house that waited for guests.",
    "He traced the headline with one finger, as if touch could change it.",
    "The orchard at noon was loud with bees and quiet with memory.",
    "Velvet curtain, half-drawn; the stage held its breath in amber.",
    "Sea glass in her pocket — small greens and blues from another year.",
    "The elevator mirror showed a stranger wearing her tired optimism.",
    "Chalk dust hung in the classroom long after the last question.",
    "Thunder rolled somewhere polite, far enough not to frighten the tea.",
    "The map folded wrong on purpose; getting lost was part of the plan.",
    "Oil paint on his cuff — proof the afternoon had been real.",
    "Street musicians packed up; only the echo of strings remained.",
    "Her ring caught the projector light: a brief, private constellation.",
    "The garden gate squeaked like a metronome for slow thoughts.",
    "Newsprint gray at dawn, before the city remembered to be loud.",
    "A bottle of ink named after a storm she had never seen.",
    "The photograph yellowed at the corners but not at the center.",
    "Wind flipped the pages back to the chapter about returning home.",
    "Porcelain cups, chipped rims, stories that outlasted the guests.",
    "The platform emptied; one suitcase kept watching the tracks.",
    "Moths negotiated with the lamp; the poem negotiated with her.",
    "Saffron steam rose from the pot — ceremony for an ordinary Tuesday.",
    "The mural faded except where children still touched the blue.",
    "His coat held the smell of rain on wool and distant cigarettes.",
    "The clock tower struck wrong on purpose once a year, they said.",
    "Pencil graphite on her palm — a sketch of something not yet named.",
]

# Map feelings → palette color names (from curated_palette.csv).
FEELING_COLOR_NAMES: dict[str, list[str]] = {
    "melancholic": ["charcoal", "soft black", "coffee brown", "sepia brown"],
    "luminous": ["champagne", "cream", "warm ivory", "sunny yellow"],
    "calm": ["soft sage", "cream", "warm ivory", "champagne"],
    "fierce": ["crimson", "scarlet", "burgundy", "hot pink"],
    "tender": ["warm ivory", "cream", "coral", "terracotta"],
    "mysterious": ["charcoal", "soft black", "burgundy", "muted gold"],
    "restless": ["hot pink", "scarlet", "coral", "burnt orange"],
    "fresh": ["soft sage", "cream", "sunny yellow", "warm ivory"],
    "nostalgic": ["sepia brown", "champagne", "muted gold", "coffee brown"],
    "warm": ["burnt orange", "terracotta", "muted gold", "coral", "sepia brown"],
}

DESCRIPTION_TEMPLATES = [
    "A readable atmospheric wash behind literary text, tuned to the mood chips and passage.",
    "Soft background tint for PDF passage layout — gentle contrast, not decorative neon.",
    "Evokes the emotional temperature of the excerpt without overpowering the letterforms.",
]


def _feeling_combos(max_combo_size: int = 2) -> list[list[str]]:
    combos: list[list[str]] = [[f] for f in FEELING_PRESETS]
    if max_combo_size >= 2:
        for a, b in itertools.combinations(FEELING_PRESETS, 2):
            combos.append([a, b])
    if max_combo_size >= 3:
        for trio in itertools.combinations(FEELING_PRESETS[:8], 3):
            combos.append(list(trio))
    return combos


def _load_palette(path: Path) -> dict[str, dict[str, str]]:
    by_name: dict[str, dict[str, str]] = {}
    with path.open(encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            name = (row.get("name") or "").strip().lower()
            if not name:
                continue
            by_name[name] = row
    return by_name


def _pick_colors_for_feelings(feelings: list[str], palette: dict[str, dict[str, str]], n: int) -> list[dict[str, str]]:
    names: list[str] = []
    for f in feelings:
        names.extend(FEELING_COLOR_NAMES.get(f, []))
    if not names:
        names = list(palette.keys())
    # dedupe preserve order
    seen: set[str] = set()
    ordered: list[str] = []
    for nm in names:
        key = nm.lower()
        if key not in seen and key in palette:
            seen.add(key)
            ordered.append(key)
    if len(ordered) < n:
        for nm in palette:
            if nm not in seen:
                ordered.append(nm)
            if len(ordered) >= n:
                break
    return [palette[k] for k in ordered[:n]]


def generate_studio_bulk_rows(
    *,
    palette_path: Path,
    max_pairs: int = 800,
    colors_per_anchor: int = 3,
    pair_weight: float = 2.8,
    seed: int = 42,
    max_combo_size: int = 2,
) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    """Return (pair_rows, palette_rows) for schema A + palette CSV."""
    palette = _load_palette(palette_path)
    if not palette:
        raise FileNotFoundError(f"No palette rows in {palette_path}")

    rng = random.Random(seed)
    combos = _feeling_combos(max_combo_size=max_combo_size)
    pair_rows: list[dict[str, str]] = []
    palette_rows: list[dict[str, str]] = []
    seen_pair: set[tuple[str, str]] = set()
    seen_hex: set[str] = set()

    anchors: list[tuple[str, list[str], str]] = []
    for passage in PASSAGE_SNIPPETS:
        for feelings in combos:
            anchors.append((passage, feelings, build_studio_anchor(passage, feelings)))

    rng.shuffle(anchors)

    for passage, feelings, anchor in anchors:
        colors = _pick_colors_for_feelings(feelings, palette, colors_per_anchor)
        for pal in colors:
            hex_val = normalize_hex(str(pal["hex"]))
            key = (anchor, hex_val)
            if key in seen_pair:
                continue
            seen_pair.add(key)

            color_name = str(pal["name"]).strip()
            family = str(pal.get("family") or "neutral").strip().lower()
            desc_tpl = rng.choice(DESCRIPTION_TEMPLATES)
            reason = f"Synthetic studio bulk mapping for feelings: {', '.join(feelings)}."
            positive_descriptor = build_positive_descriptor(
                color_name=color_name,
                family=family,
                hex_val=hex_val,
                description=desc_tpl,
                reason=reason,
                feelings=feelings,
                passage=passage,
            )

            pair_rows.append(
                {
                    "anchor_text": anchor,
                    "positive_color_name": color_name,
                    "positive_hex": hex_val,
                    "positive_descriptor": positive_descriptor,
                    "color_family": family,
                    "weight": str(pair_weight),
                }
            )

            if hex_val not in seen_hex:
                seen_hex.add(hex_val)
                palette_rows.append(
                    {
                        "name": color_name,
                        "hex": hex_val,
                        "family": family,
                        "descriptor": positive_descriptor[:220],
                        "keywords": anchor[:160],
                        "weight": "1.0",
                    }
                )

            if len(pair_rows) >= max_pairs:
                return pair_rows, palette_rows

    return pair_rows, palette_rows


def write_bulk_csv(path: Path, header: list[str], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=header, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
