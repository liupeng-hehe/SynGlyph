# Text reveal: model preview & review

The **Text reveal** page (`/text-reveal`) combines the existing letter-sequence color preview with a lightweight **evaluation / correction** workflow.

## Modes (right panel)

| Mode | Purpose |
|------|---------|
| **Preview** | Original behavior: hover spotlight, model colors, sliders only. Word feedback is disabled. |
| **Evaluate** | Select text on the canvas, then log accept / reject and error type. |
| **Correct** | Same as Evaluate; use when you expect corrections (e.g. wrong color). |

Default mode is **Preview**.

### Canvas click: Word vs Letter

When not in Preview, use **Word** / **Letter** under Review:

- **Word** — one click selects the full whitespace-bounded token (same as before).
- **Letter** — click a **letter** to keep the word context but **focus** that character (double outline on canvas). In the form, when error type is **Wrong color** or **Wrong intensity**, use **Per-letter Lab + P×S** to edit color and/or **prominence** and **spread** (letter-sequence model heads, 0–1). Saved JSON includes `feedback.letterColorCorrections` (with optional `predictedProminence` / `correctedProminence` / `predictedSpread` / `correctedSpread` per letter) and `prediction.letterPredictions` (with `prominence` and `spread` per letter).

After **计算模型颜色**, the sidebar shows **Model under cursor** with Lab hex and P×S for the glyph under the pointer (distinct from the reveal spotlight sliders).

On the canvas, the **colored reveal layer** maps: **Lab** → fill color; **prominence** → fill alpha + subtle stroke weight; **spread** → colored shadow blur (glow). Without running the model, P/S default to 0.5 for a neutral look.

## How to review

1. Choose a checkpoint and run **计算模型颜色** so predictions match what you judge.
2. Switch to **Evaluate** or **Correct**.
3. **Click a word** in the main canvas (whitespace-bounded token). The span is outlined in blue; the right panel shows span indices, token index, and average predicted hex for that word.
4. Fill **Review outcome**, **Error type** (required if outcome is not “Accept as-is”), **Severity**, **Confidence**, optional **Notes**.
5. If error type is **Wrong color**, use the color picker and optional qualitative tags (warmer, cooler, …).
6. Save with one of:
   - **Save feedback** — evaluation record only (`saveMode: feedback`).
   - **Save as correction sample** — evaluation + correction target for supervised use (`saveMode: correction_sample`).
   - **Queue for retraining** — mark as hard example / pool candidate (`saveMode: retraining_queue`).

Keyboard shortcuts (when focus is not in an input): **A** accept, **M** minor edits, **R** reject, **S** save feedback.

## Where data is stored

- **API**: `POST /api/review-feedback`, `GET /api/review-feedback?checkpointId=…`, `PATCH /api/review-feedback/:id`
- **Database**: table `model_review_feedback` (SQLite/Postgres via SQLAlchemy), columns `id`, `checkpoint_id`, `full_text`, `record_json`, timestamps.
- **Payload**: the full structured object is stored in `record_json` (camelCase), including prediction snapshot and `feedback.saveMode`.

Run migrations so the table exists:

```bash
cd apps/api && alembic upgrade head
```

The English app loads saved rows for the current checkpoint and filters by the current **Text** on the client so long passages do not need to be sent in the query string.

## Saved record shape (summary)

Aligned with `ModelFeedbackRecord` in `apps/web-english/lib/modelFeedbackTypes.ts`:

- `id`, `checkpointId`, `text`
- `selectedSpan`: `{ start, end, selectedText, tokenIndex? }`
- `prediction`: `{ predictedColor?, letterPredictions?: [{ charIndex, char, hex }], revealRadiusX/Y, edgeFeather, hoverFalloff }`
- `feedback`: `{ reviewOutcome, errorType?, severity?, confidence?, correctedColor?, letterColorCorrections?, qualitativeTags?, notes?, saveMode }`
- `createdAt`, `updatedAt?`

Use `feedback.saveMode` to distinguish the three save actions in downstream tooling.

Each **Save** creates a **new** row. Submitting again for the same word adds another record (useful for iteration); use `PATCH /api/review-feedback/:id` if you need to amend an existing row programmatically.
