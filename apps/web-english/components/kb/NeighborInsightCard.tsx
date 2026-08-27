"use client";

import { useCallback, useState } from "react";
import { fetchKbSegments, fetchNeighbors, type KbSegmentItem, type NeighborsResponse } from "@/lib/kbApi";
import { formatNeighborResults } from "@/lib/kbFormatters";
import { KbExamplePreview } from "@/components/kb/KbExamplePreview";
import { RawJsonDrawer } from "@/components/kb/RawJsonDrawer";

type PanelStatus = "idle" | "loading" | "empty" | "error" | "success";

type NeighborInsightCardProps = {
  vocabVersionId: string;
};

export function NeighborInsightCard({ vocabVersionId }: NeighborInsightCardProps) {
  const [letter, setLetter] = useState("e");
  const [side, setSide] = useState<"left" | "right">("right");
  const [status, setStatus] = useState<PanelStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [raw, setRaw] = useState<NeighborsResponse | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewItems, setPreviewItems] = useState<KbSegmentItem[]>([]);

  const load = useCallback(async () => {
    const c = (letter || "").slice(0, 1).toLowerCase();
    if (!vocabVersionId || !c) {
      setStatus("idle");
      setErrorMessage("Select a vocab version and enter a letter.");
      return;
    }
    setStatus("loading");
    setErrorMessage(null);
    setRaw(null);
    try {
      const res = await fetchNeighbors(vocabVersionId, c, side);
      setRaw(res);
      if (!res.neighbors?.length) setStatus("empty");
      else setStatus("success");
    } catch (e) {
      setStatus("error");
      setErrorMessage(e instanceof Error ? e.message : String(e));
    }
  }, [vocabVersionId, letter, side]);

  const formatted = raw ? formatNeighborResults(raw) : null;

  const openGalleryForNeighbor = async (neighborChar: string) => {
    if (!vocabVersionId || !raw) return;
    const center = raw.letter;
    const pair = side === "right" ? `${center}${neighborChar}` : `${neighborChar}${center}`;
    setPreviewTitle(`Examples containing “${pair}” (segment search)`);
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewItems([]);
    try {
      const { items } = await fetchKbSegments(vocabVersionId, { pattern: pair.toLowerCase(), limit: 40 });
      setPreviewItems(items);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewLoading(false);
    }
  };

  const openBroadGallery = async () => {
    if (!vocabVersionId || !raw) return;
    setPreviewTitle(`Words containing “${raw.letter}”`);
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewItems([]);
    try {
      const { items } = await fetchKbSegments(vocabVersionId, { letter: raw.letter, limit: 40 });
      setPreviewItems(items);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 shadow-sm" aria-busy={status === "loading"}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-lg font-medium text-zinc-100">Neighbor explorer</h2>
        {status === "success" && formatted && (
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs tabular-nums text-zinc-300">
            {formatted.rows.length} neighbors
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-zinc-500">Letter co-occurrence in the KB corpus (adjacent positions).</p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-zinc-500" htmlFor="kb-neighbor-letter">
            Letter
          </label>
          <input
            id="kb-neighbor-letter"
            className="w-14 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-center text-sm text-zinc-100"
            maxLength={1}
            value={letter}
            onChange={(e) => setLetter(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500" htmlFor="kb-neighbor-side">
            Side
          </label>
          <select
            id="kb-neighbor-side"
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
            value={side}
            onChange={(e) => setSide(e.target.value as "left" | "right")}
          >
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={!vocabVersionId || status === "loading"}
          className="rounded bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 disabled:opacity-50"
        >
          {status === "loading" ? "Loading…" : "Load neighbors"}
        </button>
      </div>

      <div className="mt-4 min-h-[4rem] text-sm">
        {status === "idle" && (
          <p className="text-zinc-500">
            {!vocabVersionId
              ? "Choose a vocab version first."
              : "Pick a letter and side, then load to see the neighbor ranking."}
          </p>
        )}
        {status === "loading" && <p className="text-zinc-400">Loading neighbor stats…</p>}
        {status === "error" && errorMessage && (
          <p className="rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-red-200/90">{errorMessage}</p>
        )}
        {status === "empty" && <p className="text-zinc-500">No neighbor rows for this letter in the KB.</p>}
        {status === "success" && formatted && raw && (
          <div className="space-y-4">
            <p className="text-zinc-200">{formatted.headline}</p>
            <p className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-3 text-sm leading-relaxed text-zinc-400">
              {formatted.quickRead}
            </p>
            <button
              type="button"
              onClick={openBroadGallery}
              className="rounded border border-zinc-600 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
            >
              Word gallery (contains this letter)
            </button>
            <div className="overflow-x-auto rounded-lg border border-zinc-800">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-zinc-800 bg-zinc-950/50 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Neighbor
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium tabular-nums">
                      Count
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      PMI
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Note
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {formatted.rows.map((row) => (
                    <tr key={row.neighbor} className={row.isSparse ? "bg-amber-950/10" : "hover:bg-zinc-950/40"}>
                      <td className="px-3 py-2 font-mono text-zinc-100">{row.neighbor}</td>
                      <td className="px-3 py-2 tabular-nums text-zinc-300">{row.count}</td>
                      <td className="px-3 py-2 tabular-nums text-zinc-400">{row.pmiDisplay}</td>
                      <td className="px-3 py-2 text-xs text-zinc-500">
                        {row.isSparse && (
                          <span className="mr-1 rounded bg-amber-900/40 px-1.5 py-0.5 text-amber-200/90">Sparse</span>
                        )}
                        {row.strengthNote}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => openGalleryForNeighbor(row.neighbor)}
                          className="text-xs text-sky-400/90 hover:underline"
                        >
                          Related examples
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <RawJsonDrawer value={raw} />
      <KbExamplePreview
        open={previewOpen}
        title={previewTitle}
        loading={previewLoading}
        error={previewError}
        items={previewItems}
        onClose={() => setPreviewOpen(false)}
      />
    </section>
  );
}
