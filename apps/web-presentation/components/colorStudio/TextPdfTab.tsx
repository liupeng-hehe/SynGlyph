"use client";

import { pdf } from "@react-pdf/renderer";
import { toPng } from "html-to-image";
import { useMemo, useRef, useState } from "react";

import { ColorEditModal } from "@/components/colorStudio/ColorEditModal";
import { ExportControls } from "@/components/colorStudio/ExportControls";
import { FeelingSelector } from "@/components/colorStudio/FeelingSelector";
import { PassageLivePreview } from "@/components/colorStudio/PassageLivePreview";
import { PassageTextBoxPanel } from "@/components/colorStudio/PassageTextBoxPanel";
import { TextPassageDocument } from "@/components/colorStudio/pdf/TextPassageDocument";
import { SuggestedColorPopover } from "@/components/colorStudio/SuggestedColorPopover";
import { softenRawBackground, textColorForPdfBackground } from "@/lib/colorStudio/colorUtils";
import { combinedPassageText, hasPassageContent } from "@/lib/colorStudio/passageBoxes";
import { isPdfFontFamily, PDF_FONT_OPTIONS } from "@/lib/colorStudio/passageFonts";
import { PASSAGE_LETTER_VISUAL_OPTIONS } from "@/lib/colorStudio/passageLetterVisual";
import { suggestColor, type SuggestColorMode } from "@/lib/colorStudio/suggestColor";
import { useLabPassagePreviewMap } from "@/lib/colorStudio/useLabPassagePreviewMap";
import { useStudio } from "@/lib/colorStudio/studioContext";

/** PNG raster scale — 6× for crisp thin rims and light font weights. */
const PASSAGE_PNG_PIXEL_RATIO = 6;

export function TextPdfTab() {
  const { state, dispatch } = useStudio();
  const previewRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [trySeq, setTrySeq] = useState(0);
  const [showPopover, setShowPopover] = useState(false);
  const [editSuggestionOpen, setEditSuggestionOpen] = useState(false);
  const [engine, setEngine] = useState<SuggestColorMode>("colorrec");

  const { tokensByBoxId, loading: labPreviewLoading } = useLabPassagePreviewMap(
    state.labProfileId,
    state.passageBoxes,
  );

  const passageForSuggest = combinedPassageText(state.passageBoxes);
  const canExport = hasPassageContent(state.passageBoxes);

  const rawPreview =
    state.rawBackgroundHex ?? state.suggestion?.hex ?? "#D8D6D2";
  const renderedPreview =
    state.renderedBackgroundHex ??
    softenRawBackground(rawPreview, state.pdfSettings.backgroundIntensity);
  const rawMeta = state.rawBackgroundHex ?? state.suggestion?.hex ?? null;

  const textColor = textColorForPdfBackground(
    renderedPreview,
    state.pdfSettings.textContrast,
  );

  const pdfDoc = useMemo(
    () => (
      <TextPassageDocument
        boxes={state.passageBoxes}
        letters={state.letters}
        labTokensByBoxId={tokensByBoxId}
        renderedBackgroundHex={renderedPreview}
        rawBackgroundHex={rawMeta}
        textColor={textColor}
        settings={state.pdfSettings}
      />
    ),
    [
      state.passageBoxes,
      state.letters,
      tokensByBoxId,
      renderedPreview,
      rawMeta,
      textColor,
      state.pdfSettings,
    ],
  );

  async function runSuggest(tryAnotherSalt = 0) {
    setBusy(true);
    try {
      const s = await suggestColor(
        {
          passage: passageForSuggest,
          feelings: state.feelings,
        },
        {
          mode: engine,
          tryAnotherSalt,
        },
      );
      dispatch({ type: "SET_SUGGESTION", suggestion: s });
      setShowPopover(true);
    } finally {
      setBusy(false);
    }
  }

  function handleTryAnother() {
    const next = trySeq + 1;
    setTrySeq(next);
    void runSuggest(next);
  }

  function toggleFeeling(w: string) {
    const next = new Set(state.feelings);
    if (next.has(w)) next.delete(w);
    else next.add(w);
    dispatch({ type: "SET_FEELINGS", feelings: Array.from(next) });
  }

  function removeFeeling(w: string) {
    dispatch({
      type: "SET_FEELINGS",
      feelings: state.feelings.filter((f) => f !== w),
    });
  }

  function clearFeelings() {
    dispatch({ type: "SET_FEELINGS", feelings: [] });
  }

  function addCustomFeeling() {
    const t = state.customFeelingInput.trim().toLowerCase();
    if (!t) return;
    if (!state.feelings.includes(t)) {
      dispatch({
        type: "SET_FEELINGS",
        feelings: [...state.feelings, t],
      });
    }
    dispatch({ type: "SET_CUSTOM_FEELING_INPUT", text: "" });
  }

  async function downloadPdf() {
    const blob = await pdf(pdfDoc).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "synesthetic-passage.pdf";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadPng() {
    const node = previewRef.current;
    if (!node || !canExport) return;

    node.classList.add("passage-exporting");
    try {
      await document.fonts.ready;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );

      const dataUrl = await toPng(node, {
        pixelRatio: PASSAGE_PNG_PIXEL_RATIO,
        cacheBust: true,
        backgroundColor: renderedPreview,
      });

      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = "synesthetic-passage.png";
      a.click();
    } finally {
      node.classList.remove("passage-exporting");
    }
  }

  const uniformMargin = state.pdfSettings.margins.top;

  return (
    <div className="space-y-8">
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-6">
          <PassageTextBoxPanel
            boxes={state.passageBoxes}
            activeBoxId={state.activePassageBoxId}
            onSelectBox={(id) =>
              dispatch({ type: "SET_ACTIVE_PASSAGE_BOX", id })
            }
            onChangeText={(id, text) =>
              dispatch({ type: "SET_PASSAGE_BOX_TEXT", id, text })
            }
            onUpdateBox={(id, patch) =>
              dispatch({ type: "UPDATE_PASSAGE_BOX", id, patch })
            }
            onAddBox={() => dispatch({ type: "ADD_PASSAGE_BOX" })}
            onDeleteBox={(id) =>
              dispatch({ type: "DELETE_PASSAGE_BOX", id })
            }
          />
          <FeelingSelector
            feelings={state.feelings}
            customInput={state.customFeelingInput}
            onTogglePreset={toggleFeeling}
            onRemoveFeeling={removeFeeling}
            onClearFeelings={clearFeelings}
            onCustomInputChange={(text) =>
              dispatch({ type: "SET_CUSTOM_FEELING_INPUT", text })
            }
            onAddCustom={addCustomFeeling}
          />

          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs text-byo-ink/70">
              Suggestion engine
              <select
                value={engine}
                onChange={(e) => setEngine(e.target.value as SuggestColorMode)}
                className="ml-2 rounded-lg border border-byo-ink/20 bg-white px-2 py-2 text-sm text-byo-ink"
              >
                <option value="colorrec">Color model (HPC v2)</option>
                <option value="rules">Rules (deterministic)</option>
                <option value="llm">OpenAI (rules fallback)</option>
              </select>
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setTrySeq(0);
                void runSuggest(0);
              }}
              className="rounded-full bg-byo-ink px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-byo-ink/90 disabled:opacity-40"
            >
              {busy ? "Suggesting…" : "Suggest color"}
            </button>
          </div>

          <section className="space-y-4 rounded-2xl border border-byo-ink/15 bg-white/55 p-5 shadow-sm">
            <h3 className="font-display text-base font-semibold text-byo-ink">
              PDF settings
            </h3>
            <label className="block text-xs text-byo-ink/70">
              Background intensity ({state.pdfSettings.backgroundIntensity}% raw)
              <input
                type="range"
                min={5}
                max={100}
                value={state.pdfSettings.backgroundIntensity}
                onChange={(e) =>
                  dispatch({
                    type: "SET_PDF_SETTINGS",
                    patch: {
                      backgroundIntensity: Number(e.target.value),
                    },
                  })
                }
                className="mt-2 w-full"
              />
            </label>
            <label className="block text-xs text-byo-ink/70">
              Text contrast
              <input
                type="range"
                min={40}
                max={100}
                value={state.pdfSettings.textContrast}
                onChange={(e) =>
                  dispatch({
                    type: "SET_PDF_SETTINGS",
                    patch: {
                      textContrast: Number(e.target.value),
                    },
                  })
                }
                className="mt-2 w-full"
              />
            </label>
            <label className="block text-xs text-byo-ink/70">
              Page size
              <select
                value={state.pdfSettings.pageSize}
                onChange={(e) =>
                  dispatch({
                    type: "SET_PDF_SETTINGS",
                    patch: {
                      pageSize: e.target.value as "A4" | "Letter",
                    },
                  })
                }
                className="mt-2 block w-full rounded-lg border border-byo-ink/20 bg-white px-2 py-2 text-sm text-byo-ink"
              >
                <option value="A4">A4</option>
                <option value="Letter">Letter</option>
              </select>
            </label>
            <label className="block text-xs text-byo-ink/70">
              Font
              <select
                value={state.pdfSettings.fontFamily}
                onChange={(e) => {
                  const next = e.target.value;
                  if (!isPdfFontFamily(next)) return;
                  dispatch({
                    type: "SET_PDF_SETTINGS",
                    patch: { fontFamily: next },
                  });
                }}
                className="mt-2 block w-full rounded-lg border border-byo-ink/20 bg-white px-2 py-2 text-sm text-byo-ink"
              >
                {PDF_FONT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="space-y-2">
              <span className="block text-xs text-byo-ink/70">Letter style</span>
              <div className="flex flex-wrap gap-2">
                {PASSAGE_LETTER_VISUAL_OPTIONS.map((opt) => {
                  const active =
                    (state.pdfSettings.passageLetterVisual ?? "fill") === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        dispatch({
                          type: "SET_PDF_SETTINGS",
                          patch: { passageLetterVisual: opt.value },
                        })
                      }
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                        active
                          ? "bg-byo-ink text-white"
                          : "bg-byo-ink/10 text-byo-ink hover:bg-byo-ink/15"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] leading-relaxed text-byo-ink/50">
                {
                  PASSAGE_LETTER_VISUAL_OPTIONS.find(
                    (o) =>
                      o.value === (state.pdfSettings.passageLetterVisual ?? "fill"),
                  )?.hint
                }
              </p>
            </div>
            <label className="block text-xs text-byo-ink/70">
              Margins (all sides)
              <input
                type="range"
                min={28}
                max={92}
                value={uniformMargin}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  dispatch({
                    type: "SET_PDF_SETTINGS",
                    patch: {
                      margins: {
                        top: n,
                        right: n,
                        bottom: n,
                        left: n,
                      },
                    },
                  });
                }}
                className="mt-2 w-full"
              />
            </label>
          </section>
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="font-display text-base font-semibold text-byo-ink">
              Live preview
            </h3>
            <p className="mt-1 text-xs text-byo-ink/55">
              Drag and resize text boxes · letter colors from your palette
            </p>
          </div>

          <PassageLivePreview
            ref={previewRef}
            boxes={state.passageBoxes}
            activeBoxId={state.activePassageBoxId}
            letters={state.letters}
            labTokensByBoxId={tokensByBoxId}
            renderedBackgroundHex={renderedPreview}
            textColor={textColor}
            settings={state.pdfSettings}
            onSelectBox={(id) =>
              dispatch({
                type: "SET_ACTIVE_PASSAGE_BOX",
                id: id || null,
              })
            }
            onUpdateBox={(id, patch) =>
              dispatch({ type: "UPDATE_PASSAGE_BOX", id, patch })
            }
          />
          {state.labProfileId && labPreviewLoading ? (
            <p className="text-center text-[10px] text-byo-ink/45">Updating model preview…</p>
          ) : null}
          <ExportControls
            onDownloadPdf={downloadPdf}
            onDownloadPng={downloadPng}
            disabled={!canExport}
          />
        </div>
      </div>

      {state.suggestion && showPopover ? (
        <SuggestedColorPopover
          key={`${state.suggestion.hex}-${trySeq}`}
          suggestion={state.suggestion}
          retrying={busy}
          onDismiss={() => setShowPopover(false)}
          onTryAnother={handleTryAnother}
          onEditColor={() => {
            setShowPopover(false);
            setEditSuggestionOpen(true);
          }}
          onUseThisColor={() => {
            dispatch({ type: "USE_SUGGESTION_AS_BACKGROUND" });
            setShowPopover(false);
          }}
        />
      ) : null}

      <ColorEditModal
        open={editSuggestionOpen}
        mode={
          state.suggestion
            ? { kind: "suggestion", suggestion: state.suggestion }
            : null
        }
        onClose={() => setEditSuggestionOpen(false)}
        onSaveSuggestion={(hex, customName) => {
          dispatch({ type: "APPLY_HEX_TO_SUGGESTION", hex });
          dispatch({
            type: "SET_SUGGESTION_CUSTOM_NAME",
            name: customName,
          });
          setEditSuggestionOpen(false);
          setShowPopover(true);
        }}
      />
    </div>
  );
}
