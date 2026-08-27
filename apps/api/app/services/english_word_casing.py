"""
Stimulus-level English word form: casing rules for bulk import and dedup keys.

For **registry / pattern-supply** uniqueness (NFKC, strip punct, lowercase), use
``app.services.pattern_supply.normalization.normalize_word`` instead — different purpose.
"""

from __future__ import annotations

# Words that should keep their original casing (regions, proper nouns, etc.)
_KEEP_CAPITALIZED = frozenset({
    "america", "american", "americans", "asia", "asian", "asians",
    "europe", "european", "europeans", "africa", "african", "africans",
    "china", "chinese", "japan", "japanese", "korea", "korean", "koreans",
    "france", "french", "germany", "german", "germans", "italy", "italian", "italians",
    "spain", "spanish", "portugal", "portuguese", "russia", "russian", "russians",
    "india", "indian", "indians", "australia", "australian", "australians",
    "canada", "canadian", "canadians", "mexico", "mexican", "mexicans",
    "brazil", "brazilian", "brazilians", "argentina", "argentinian",
    "egypt", "egyptian", "egyptians", "turkey", "turkish", "turks",
    "greece", "greek", "greeks", "ireland", "irish", "scotland", "scottish",
    "england", "english", "britain", "british", "wales", "welsh",
    "dutch", "belgium", "belgian", "sweden", "swedish", "norway", "norwegian",
    "denmark", "danish", "finland", "finnish", "poland", "polish",
    "ukraine", "ukrainian", "ukrainians", "israel", "israeli", "israelis",
})


def normalize_word_for_stimulus_text(w: str) -> str:
    """Lowercase unless region/proper noun or acronym (stimulus ``text`` display form)."""
    if not w:
        return w
    w_lo = w.lower()
    if len(w) >= 2 and w.isupper():
        return w
    if w_lo in _KEEP_CAPITALIZED:
        return w
    return w_lo
