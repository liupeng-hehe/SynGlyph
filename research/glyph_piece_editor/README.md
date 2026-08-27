# Glyph piece editor — Python utilities

Optional offline mirror of the web editor’s preprocessing and splitting logic.

- `glyph_preprocess.py` — Otsu, largest component, `skimage` skeleton, keypoints
- `skeleton_graph.py` — pruned graph (endpoints + junctions)
- `piece_splitter.py` — cut neighborhoods + connected components
- `piece_suggester.py` — lightweight rule-based labels
- `glyph_io.py` — JSON load/save and table extraction

The **canonical interactive editor** is the Next.js app: `/glyph-pieces`.
