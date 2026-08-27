/**
 * Thin client for `POST /api/letter-sequence/predict-text` only.
 * No imports from the training workbench app.
 */

import { getPublicApiUrl } from "./apiBase";

const API_BASE = getPublicApiUrl();

export type LetterSequencePreprocessing = {
  syllable_count: number;
  stress_pattern: string;
  pronunciation_source: string;
  parse_confidence: number;
  preprocessing_version: string;
};

export type LetterSequencePrediction = {
  word_text: string;
  pred_lab: [number, number, number][];
  pred_prominence: number[];
  pred_spread: number[];
  pred_boundary: number[];
  /** Present when the API runs the syllable-aware phonology path. */
  preprocessing?: LetterSequencePreprocessing;
};

export type PredictTextOptions = {
  snapshotId?: string | null;
  checkpointPath?: string | null;
};

function wrapFetchError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === "Failed to fetch") {
    return new Error(
      `Cannot reach API at ${API_BASE}. Is the backend running?`,
    );
  }
  return e instanceof Error ? e : new Error(String(e));
}

export async function predictText(
  text: string,
  options?: PredictTextOptions,
): Promise<LetterSequencePrediction> {
  const raw = text?.trim();
  if (!raw) {
    throw new Error("Text is empty");
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/letter-sequence/predict-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: raw,
        snapshot_id:
          options?.snapshotId && options.snapshotId.length > 0
            ? options.snapshotId
            : null,
        checkpoint_path:
          options?.checkpointPath && options.checkpointPath.length > 0
            ? options.checkpointPath
            : null,
      }),
    });
  } catch (e) {
    throw wrapFetchError(e);
  }

  if (!res.ok) {
    let detail = `API error: ${res.status}`;
    try {
      const err = (await res.json()) as {
        detail?: string | { msg?: string }[];
      };
      if (typeof err.detail === "string") detail = err.detail;
      else if (Array.isArray(err.detail))
        detail = err.detail
          .map((x) =>
            typeof x === "object" && x && "msg" in x
              ? String(x.msg)
              : String(x),
          )
          .join(", ");
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }

  return res.json();
}
