"use client";

import { pdf } from "@react-pdf/renderer";
import { useMemo, useState } from "react";

import { ColorEditModal } from "@/components/studio/ColorEditModal";
import { ExportControls } from "@/components/studio/ExportControls";
import { FeelingSelector } from "@/components/studio/FeelingSelector";
import { PdfPreview } from "@/components/studio/PdfPreview";
import { TextPassageDocument } from "@/components/studio/pdf/TextPassageDocument";
import { SuggestedColorPopover } from "@/components/studio/SuggestedColorPopover";
import { TextInputPanel } from "@/components/studio/TextInputPanel";
import { softenRawBackground, textColorForPdfBackground } from "@/lib/colorUtils";
import { suggestColor } from "@/lib/suggestColor";
import { useStudio } from "@/lib/studioContext";

export function TextPdfTab() {
  const { state, dispatch } = useStudio();
  const [busy, setBusy] = useState(false);
  const [showPopover, setShowPopover] = useState(false);
  const [editSuggestionOpen, setEditSuggestionOpen] = useState(false);
  const [engine, setEngine] = useState<"rules" | "llm">("rules");

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
        passage={state.passage}
        renderedBackgroundHex={renderedPreview}
        rawBackgroundHex={rawMeta}
        textColor={textColor}
        settings={state.pdfSettings}
      />
    ),
    [
      state.passage,
      renderedPreview,
      rawMeta,
      textColor,
      state.pdfSettings,
    ],
  );

  async function runSuggest(salt?: number) {
    setBusy(true);
    try {
      const s = await suggestColor(
        {
          passage: state.passage,
          feelings: state.feelings,
        },
        {
          mode: engine === "llm" ? "llm" : "rules",
          tryAnotherSalt: salt,
        },
      );
      dispatch({ type: "SET_SUGGESTION", suggestion: s });
      setShowPopover(true);
    } finally {
      setBusy(false);
    }
  }

  function toggleFeeling(w: string) {
    const next = new Set(state.feelings);
    if (next.has(w)) next.delete(w);
    else next.add(w);
    dispatch({ type: "SET_FEELINGS", feelings: Array.from(next) });
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

  const uniformMargin = state.pdfSettings.margins.top;

  return (
    <div className="space-y-8">
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-6">
          <TextInputPanel
            passage={state.passage}
            onChange={(value) =>
              dispatch({ type: "SET_PASSAGE", passage: value })
            }
          />
          <FeelingSelector
            feelings={state.feelings}
            customInput={state.customFeelingInput}
            onTogglePreset={toggleFeeling}
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
                onChange={(e) =>
                  setEngine(e.target.value === "llm" ? "llm" : "rules")
                }
                className="ml-2 rounded-lg border border-byo-ink/20 bg-white px-2 py-2 text-sm text-byo-ink"
              >
                <option value="rules">Rules (deterministic)</option>
                <option value="llm">OpenAI (rules fallback)</option>
              </select>
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => runSuggest(0)}
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
                onChange={(e) =>
                  dispatch({
                    type: "SET_PDF_SETTINGS",
                    patch: {
                      fontFamily: e.target.value as
                        | "Helvetica"
                        | "Times-Roman"
                        | "Courier",
                    },
                  })
                }
                className="mt-2 block w-full rounded-lg border border-byo-ink/20 bg-white px-2 py-2 text-sm text-byo-ink"
              >
                <option value="Helvetica">Helvetica</option>
                <option value="Times-Roman">Times</option>
                <option value="Courier">Courier</option>
              </select>
            </label>
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
          <h3 className="font-display text-base font-semibold text-byo-ink">
            Live PDF preview
          </h3>
          <p className="text-xs text-byo-ink/55">
            Raw: {rawPreview} · Rendered: {renderedPreview}
          </p>
          <PdfPreview document={pdfDoc} />
          <ExportControls
            onDownload={downloadPdf}
            disabled={!state.passage.trim()}
          />
        </div>
      </div>

      {state.suggestion && showPopover ? (
        <SuggestedColorPopover
          suggestion={state.suggestion}
          onDismiss={() => setShowPopover(false)}
          onTryAnother={() => runSuggest(Date.now())}
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
