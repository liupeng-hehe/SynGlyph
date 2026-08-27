# Annotation Data Summary

For each annotated word, the following information is recorded:

## 1. Segmentation
- **Splits / boundaries**: Positions where the word is divided into segments
- **Raw input**: Pipe-separated text (e.g. `"t|o"` for "to" split between t and o)
- **Segments**: The resulting text spans (e.g. `["t", "o"]`)

## 2. Per-Segment Attributes
For each segment:
- **text_span**: The substring (e.g. `"t"`, `"o"`)
- **color_lab**: LAB color `[L, a, b]`
- **prominence**: 0–1, controls halo/glow strength (text-shadow blur)
- **spread**: 0–1, controls opacity and blur (虚实)

## 3. Per-Character Overrides (UI only; saved as segment averages)
- **charAttrs**: Per-character prominence and spread
- On save, these are averaged per segment into the segment-level prominence and spread

## 4. Boundary Diffusion (new)
- **boundary_influence**: Array of length N-1 for N segments
- Each value 0–1 controls the gradient polarity at that boundary:
  - **0.5**: No diffusion (both segments keep their colors)
  - **> 0.5**: Left segment invades right (right segment’s boundary chars blend toward left color)
  - **< 0.5**: Right segment invades left (left segment’s boundary chars blend toward right color)

## 5. Background Colors
- **bgColors**: Up to 6 hex colors used for the page gradient background (session/UI state, not stored in annotation)

## Database Storage
- **annotation**: Links session, stimulus
- **segmentation**: raw_input, boundary_influence_json
- **span** (per segment): span_text, color_lab_l/a/b, prominence, spread
- **color_annotation**: whole_word fallback hex for home grid
