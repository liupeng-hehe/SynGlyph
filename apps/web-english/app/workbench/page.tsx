"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GrainientBg } from "@/components/GrainientBg";
import {
  getPrioritizedStimuli,
  refreshPrioritizedStimuli,
  getTrainingMetrics,
  getTrainingRun,
  listDatasets,
  listModelSnapshots,
  createTrainingRun,
  stopTrainingRun,
  saveModelSnapshot,
  exportTrainingSnapshotToOnnx,
  type LetterSequenceModelFamily,
  type TrainingHyperParams,
  type TrainingRun,
  type ModelSnapshot,
} from "@/lib/api";
import type { PrioritizedStimulus } from "@synglyph/shared";

/** UI label → canonical ``model_family`` for API (no ``letter_sequence_*`` ids). */
const MODEL_FAMILY_OPTIONS: { label: string; value: LetterSequenceModelFamily }[] = [
  { label: "BiLSTM", value: "bilstm" },
  { label: "Transformer Encoder", value: "transformer_encoder" },
  { label: "MLP", value: "mlp" },
];

/**
 * Snapshot rows from older API/DB may omit ``model_family``. This string is **display-only**
 * for those legacy rows — it is **not** the default for new training (new runs always send explicit family).
 */
const SNAPSHOT_FAMILY_LABEL_LEGACY_FALLBACK = "bilstm";

function snapshotIsBilstmForOnnx(s: ModelSnapshot): boolean {
  const f = (s.model_family || SNAPSHOT_FAMILY_LABEL_LEGACY_FALLBACK).toLowerCase();
  return f === "bilstm" || f === "letter_sequence_bilstm";
}

type GenericHp = Pick<
  TrainingHyperParams,
  | "epochs"
  | "learning_rate"
  | "batch_size"
  | "dropout"
  | "weight_decay"
  | "train_ratio"
  | "split_seed"
  | "loss_lab"
  | "loss_prominence"
  | "loss_spread"
  | "loss_boundary"
>;

type BilstmMlpSpecific = {
  emb_dim: number;
  pos_dim: number;
  hidden_size: number;
  num_layers: number;
};

type TransformerSpecific = {
  emb_dim: number;
  pos_dim: number;
  num_layers: number;
  nhead: number;
  ff_dim: number;
};

type FamilySpecificState = {
  bilstm: BilstmMlpSpecific;
  mlp: BilstmMlpSpecific;
  transformer_encoder: TransformerSpecific;
};

const DEFAULT_GENERIC: GenericHp = {
  epochs: 30,
  learning_rate: 0.001,
  batch_size: 16,
  dropout: 0.1,
  weight_decay: 0.0001,
  train_ratio: 0.8,
  split_seed: 42,
  loss_lab: 1,
  loss_prominence: 1,
  loss_spread: 1,
  loss_boundary: 1,
};

const DEFAULT_FAMILY_SPECIFIC: FamilySpecificState = {
  bilstm: { emb_dim: 64, pos_dim: 16, hidden_size: 128, num_layers: 1 },
  mlp: { emb_dim: 64, pos_dim: 16, hidden_size: 128, num_layers: 2 },
  transformer_encoder: { emb_dim: 64, pos_dim: 16, num_layers: 2, nhead: 4, ff_dim: 256 },
};

function buildTrainingHyperParams(
  modelFamily: LetterSequenceModelFamily,
  generic: GenericHp,
  spec: FamilySpecificState
): TrainingHyperParams {
  const g = generic;
  if (modelFamily === "transformer_encoder") {
    const t = spec.transformer_encoder;
    return {
      model_family: "transformer_encoder",
      ...g,
      emb_dim: t.emb_dim,
      pos_dim: t.pos_dim,
      num_layers: t.num_layers,
      nhead: t.nhead,
      ff_dim: t.ff_dim,
      hidden_size: 128,
    };
  }
  const b = modelFamily === "bilstm" ? spec.bilstm : spec.mlp;
  return {
    model_family: modelFamily,
    ...g,
    emb_dim: b.emb_dim,
    pos_dim: b.pos_dim,
    hidden_size: b.hidden_size,
    num_layers: b.num_layers,
    nhead: 4,
    ff_dim: 256,
  };
}

function parseHyperparamsFromRunConfig(
  configJson: string | undefined
): { model_family: LetterSequenceModelFamily | null; hp: Record<string, unknown> | null } {
  if (!configJson?.trim()) return { model_family: null, hp: null };
  try {
    const root = JSON.parse(configJson) as { hyperparams?: Record<string, unknown> };
    const hp = root.hyperparams;
    if (!hp || typeof hp !== "object") return { model_family: null, hp: null };
    const raw = hp.model_family;
    const model_family =
      raw === "bilstm" || raw === "mlp" || raw === "transformer_encoder" ? raw : null;
    return { model_family, hp: hp as Record<string, unknown> };
  } catch {
    return { model_family: null, hp: null };
  }
}

function summarizeHyperparamsLine(
  model_family: LetterSequenceModelFamily | null,
  hp: Record<string, unknown> | null
): string {
  if (!hp) return "—";
  const emb = Number(hp.emb_dim ?? 64);
  const pos = Number(hp.pos_dim ?? 16);
  const layers = Number(hp.num_layers ?? 1);
  const fam = model_family ?? "bilstm";
  if (fam === "transformer_encoder") {
    return `transformer: emb=${emb} pos=${pos} heads=${Number(hp.nhead ?? 4)} ff=${Number(hp.ff_dim ?? 256)} layers=${layers}`;
  }
  const hid = Number(hp.hidden_size ?? 128);
  return `${fam}: emb=${emb} pos=${pos} hidden=${hid} layers=${layers}`;
}

function polylinePoints(
  values: number[],
  w: number,
  h: number,
  pad: number
): string {
  if (values.length === 0) return "";
  const maxL = Math.max(...values);
  const minL = Math.min(...values);
  const span = Math.max(1e-6, maxL - minL);
  return values
    .map((y, i) => {
      const x = pad + (i / Math.max(1, values.length - 1)) * (w - pad * 2);
      const yn = pad + (1 - (y - minL) / span) * (h - pad * 2);
      return `${x},${yn}`;
    })
    .join(" ");
}

export default function WorkbenchPage() {
  const [datasets, setDatasets] = useState<{ id: string; name: string }[]>([]);
  const [datasetId, setDatasetId] = useState<string>("");
  const [queueDatasetId, setQueueDatasetId] = useState<string>("");
  const [queueCandidateSource, setQueueCandidateSource] = useState<"stimulus" | "kb">("stimulus");
  const [queueRandomizeScoreTies, setQueueRandomizeScoreTies] = useState(false);
  const [useGlobalStimuli, setUseGlobalStimuli] = useState(false);

  const [modelFamily, setModelFamily] = useState<LetterSequenceModelFamily>("bilstm");
  const [genericHp, setGenericHp] = useState<GenericHp>(() => ({ ...DEFAULT_GENERIC }));
  const [familySpecific, setFamilySpecific] = useState<FamilySpecificState>(() => ({
    ...DEFAULT_FAMILY_SPECIFIC,
  }));

  const [activeRun, setActiveRun] = useState<TrainingRun | null>(null);
  const [snapshots, setSnapshots] = useState<ModelSnapshot[]>([]);
  const [onnxExportingId, setOnnxExportingId] = useState<string | null>(null);
  const [onnxMessage, setOnnxMessage] = useState<string | null>(null);
  const [queueItems, setQueueItems] = useState<PrioritizedStimulus[]>([]);
  const [queueMeta, setQueueMeta] = useState<{
    model_snapshot_id?: string | null;
    scoring_stage?: string | null;
    snapshot_time?: string | null;
    refresh_batch_id?: string | null;
  } | null>(null);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueRefreshing, setQueueRefreshing] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, unknown> | null>(null);
  const [finalMetrics, setFinalMetrics] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const runConfigParsed = useMemo(
    () => parseHyperparamsFromRunConfig(activeRun?.config_json),
    [activeRun?.config_json]
  );

  const liveModelFamilyLabel = useMemo(() => {
    if (!activeRun) return null;
    if (runConfigParsed.model_family) {
      return runConfigParsed.model_family;
    }
    return "— (legacy run, not recorded)";
  }, [activeRun, runConfigParsed.model_family]);

  const liveConfigSummary = useMemo(
    () => summarizeHyperparamsLine(runConfigParsed.model_family, runConfigParsed.hp),
    [runConfigParsed]
  );

  const loadLists = useCallback(async () => {
    const [ds, sn] = await Promise.all([listDatasets(), listModelSnapshots(10)]);
    const mapped = ds.map((d) => ({ id: d.id, name: d.name }));
    setDatasets(mapped);
    setQueueDatasetId((prev) => prev || mapped[0]?.id || "");
    setSnapshots(sn);
  }, [datasetId]);

  const loadQueue = useCallback(async () => {
    setQueueError(null);
    setQueueLoading(true);
    try {
      if (queueCandidateSource === "kb" && !queueDatasetId) {
        setQueueItems([]);
        setQueueMeta(null);
        setQueueError("Select a target dataset before using Active KB lexicon source.");
        return;
      }
      const data = await getPrioritizedStimuli(
        50,
        queueDatasetId || undefined,
        true,
        true,
        queueCandidateSource,
        queueRandomizeScoreTies ? "random" : null
      );
      setQueueItems(data.rows);
      setQueueMeta(data.meta ?? null);
    } catch (e) {
      setQueueItems([]);
      setQueueMeta(null);
      setQueueError(e instanceof Error ? e.message : String(e));
    } finally {
      setQueueLoading(false);
    }
  }, [queueDatasetId, queueCandidateSource, queueRandomizeScoreTies]);

  const refreshQueue = useCallback(async () => {
    setQueueError(null);
    setQueueRefreshing(true);
    try {
      if (queueCandidateSource === "kb" && !queueDatasetId) {
        setQueueItems([]);
        setQueueMeta(null);
        setQueueError("Select a target dataset before using Active KB lexicon source.");
        return;
      }
      await refreshPrioritizedStimuli(
        50,
        queueDatasetId || undefined,
        true,
        true,
        queueCandidateSource,
        queueRandomizeScoreTies ? "random" : null
      );
      const data = await getPrioritizedStimuli(
        50,
        queueDatasetId || undefined,
        true,
        true,
        queueCandidateSource,
        queueRandomizeScoreTies ? "random" : null
      );
      setQueueItems(data.rows);
      setQueueMeta(data.meta ?? null);
    } catch (e) {
      setQueueError(e instanceof Error ? e.message : String(e));
    } finally {
      setQueueRefreshing(false);
    }
  }, [queueDatasetId, queueCandidateSource, queueRandomizeScoreTies]);

  useEffect(() => {
    loadLists().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [loadLists]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    if (!activeRun) return;
    const tick = async () => {
      try {
        const [run, m] = await Promise.all([
          getTrainingRun(activeRun.id),
          getTrainingMetrics(activeRun.id),
        ]);
        setActiveRun(run);
        setProgress((m.progress as Record<string, unknown>) || null);
        setFinalMetrics(m.metrics_json || null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => clearInterval(id);
  }, [activeRun?.id]);

  const history = useMemo(() => {
    const p = progress?.history;
    if (Array.isArray(p)) return p as { train_loss?: number; val_loss?: number; epoch?: number }[];
    const fm = finalMetrics?.history;
    if (Array.isArray(fm)) return fm as { train_loss?: number; val_loss?: number; epoch?: number }[];
    return [];
  }, [progress, finalMetrics]);

  const trainLosses = history.map((h) => h.train_loss ?? 0).filter((x) => typeof x === "number");
  const valLosses = history.map((h) => h.val_loss).filter((x): x is number => typeof x === "number");

  const w = 400;
  const h = 140;
  const pad = 20;

  const payloadForSubmit = useMemo(
    () => buildTrainingHyperParams(modelFamily, genericHp, familySpecific),
    [modelFamily, genericHp, familySpecific]
  );

  async function onStart() {
    setError(null);
    setStarting(true);
    try {
      const ds = useGlobalStimuli ? null : datasetId.trim() || null;
      const run = await createTrainingRun(ds, payloadForSubmit);
      setActiveRun(run);
      setProgress(null);
      setFinalMetrics(null);
      await loadLists();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  }

  async function onStop() {
    if (!activeRun) return;
    const id = activeRun.id;
    try {
      await stopTrainingRun(id);
      const run = await getTrainingRun(id);
      setActiveRun(run);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onSaveSnapshot() {
    if (!activeRun || activeRun.status !== "finished") return;
    setError(null);
    try {
      await saveModelSnapshot(activeRun.id);
      setSnapshots(await listModelSnapshots(10));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onExportOnnxFromSnapshot(s: ModelSnapshot) {
    if (!snapshotIsBilstmForOnnx(s)) return;
    setOnnxMessage(null);
    setOnnxExportingId(s.id);
    try {
      const r = await exportTrainingSnapshotToOnnx(s.id);
      setOnnxMessage(
        `ONNX 已导出到：${r.output_dir}（含 model.onnx 与 export_report.json）。可在 stable_checkpoints.json 中把 onnx_dir 指到该目录以便 Text Reveal 使用。`
      );
    } catch (e) {
      setOnnxMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setOnnxExportingId(null);
    }
  }

  const canSaveSnapshot = activeRun?.status === "finished";
  const statusLabel = activeRun?.status ?? "—";

  function setGeneric<K extends keyof GenericHp>(key: K, value: number) {
    setGenericHp((prev) => ({ ...prev, [key]: value }));
  }

  function patchBilstmMlp(f: "bilstm" | "mlp", patch: Partial<BilstmMlpSpecific>) {
    setFamilySpecific((prev) => ({
      ...prev,
      [f]: { ...prev[f], ...patch },
    }));
  }

  function patchTransformer(patch: Partial<TransformerSpecific>) {
    setFamilySpecific((prev) => ({
      ...prev,
      transformer_encoder: { ...prev.transformer_encoder, ...patch },
    }));
  }

  return (
    <GrainientBg className="min-h-screen text-white/90">
      <div className="mx-auto max-w-5xl px-4 py-6 pb-16">
        <div className="mb-6 flex flex-wrap gap-2">
          <Link
            href="/"
            className="rounded-full border border-white/30 px-4 py-2 text-sm hover:bg-white/10"
          >
            ← Home
          </Link>
        </div>

        <h1 className="text-2xl font-semibold">ML workbench</h1>
        <p className="mt-2 text-sm text-white/55">
          Letter-sequence training (local PyTorch): pick model family, tune hyperparameters, live metrics, and
          snapshots. Default family matches the previous single-path workbench (BiLSTM).
        </p>

        {error && (
          <div className="mt-4 rounded-xl border border-red-400/30 bg-red-950/50 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-white/15 bg-[#12121a]/90 p-5">
            <h2 className="text-sm font-medium uppercase tracking-wide text-white/50">
              Training control
            </h2>

            <div className="mt-4">
              <label className="block text-xs text-white/45">Model family</label>
              <select
                className="mt-1 w-full rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-sm"
                value={modelFamily}
                onChange={(e) => setModelFamily(e.target.value as LetterSequenceModelFamily)}
              >
                {MODEL_FAMILY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-white/35">
                Canonical ids: bilstm · transformer_encoder · mlp
              </p>
            </div>

            <div className="mt-4 space-y-3">
              <label className="flex items-center gap-2 text-sm text-white/70">
                <input
                  type="checkbox"
                  checked={useGlobalStimuli}
                  onChange={(e) => setUseGlobalStimuli(e.target.checked)}
                />
                Use stimuli without dataset (global pool)
              </label>
              {!useGlobalStimuli && (
                <div>
                  <label className="text-xs text-white/45">Dataset</label>
                  <select
                    className="mt-1 w-full rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-sm"
                    value={datasetId}
                    onChange={(e) => setDatasetId(e.target.value)}
                  >
                    <option value="">— select —</option>
                    {datasets.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <h3 className="mt-6 text-xs font-medium uppercase tracking-wide text-white/40">
              General
            </h3>
            <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
              {(
                [
                  ["epochs", "epochs", 1, 5000],
                  ["learning_rate", "learning rate", 0.0001, 1],
                  ["batch_size", "batch size", 1, 4096],
                  ["dropout", "dropout", 0, 0.9],
                  ["weight_decay", "weight decay", 0, 1],
                  ["train_ratio", "train ratio", 0.1, 0.99],
                  ["split_seed", "split seed", 0, 999999],
                ] as const
              ).map(([key, label, min, max]) => (
                <label key={key} className="block">
                  <span className="text-xs text-white/45">{label}</span>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-lg border border-white/20 bg-black/40 px-2 py-1.5 font-mono text-xs"
                    min={min}
                    max={max}
                    step={
                      key === "learning_rate" || key === "dropout" || key === "weight_decay" || key === "train_ratio"
                        ? 0.001
                        : 1
                    }
                    value={genericHp[key]}
                    onChange={(e) =>
                      setGeneric(key, parseFloat(e.target.value) || 0)
                    }
                  />
                </label>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              {(
                [
                  ["loss_lab", "loss lab"],
                  ["loss_prominence", "loss prominence"],
                  ["loss_spread", "loss spread"],
                  ["loss_boundary", "loss boundary"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block text-sm">
                  <span className="text-xs text-white/45">{label}</span>
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    className="mt-1 w-full rounded-lg border border-white/20 bg-black/40 px-2 py-1.5 font-mono text-xs"
                    value={genericHp[key]}
                    onChange={(e) =>
                      setGeneric(key, parseFloat(e.target.value) || 0)
                    }
                  />
                </label>
              ))}
            </div>

            {modelFamily === "bilstm" && (
              <>
                <h3 className="mt-6 text-xs font-medium uppercase tracking-wide text-white/40">
                  BiLSTM
                </h3>
                <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                  {(
                    [
                      ["emb_dim", "emb dim", 8, 512],
                      ["pos_dim", "pos dim", 4, 128],
                      ["hidden_size", "hidden size", 8, 4096],
                      ["num_layers", "num layers", 1, 8],
                    ] as const
                  ).map(([key, label, min, max]) => (
                    <label key={key} className="block">
                      <span className="text-xs text-white/45">{label}</span>
                      <input
                        type="number"
                        className="mt-1 w-full rounded-lg border border-white/20 bg-black/40 px-2 py-1.5 font-mono text-xs"
                        min={min}
                        max={max}
                        value={familySpecific.bilstm[key]}
                        onChange={(e) =>
                          patchBilstmMlp("bilstm", {
                            [key]: parseFloat(e.target.value) || 0,
                          } as Partial<BilstmMlpSpecific>)
                        }
                      />
                    </label>
                  ))}
                </div>
              </>
            )}

            {modelFamily === "transformer_encoder" && (
              <>
                <h3 className="mt-6 text-xs font-medium uppercase tracking-wide text-white/40">
                  Transformer encoder
                </h3>
                <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                  {(
                    [
                      ["emb_dim", "emb dim", 8, 512],
                      ["pos_dim", "pos dim", 4, 128],
                      ["num_layers", "num layers", 1, 8],
                      ["nhead", "num heads", 1, 32],
                      ["ff_dim", "ff dim", 32, 4096],
                    ] as const
                  ).map(([key, label, min, max]) => (
                    <label key={key} className="block">
                      <span className="text-xs text-white/45">{label}</span>
                      <input
                        type="number"
                        className="mt-1 w-full rounded-lg border border-white/20 bg-black/40 px-2 py-1.5 font-mono text-xs"
                        min={min}
                        max={max}
                        value={familySpecific.transformer_encoder[key]}
                        onChange={(e) =>
                          patchTransformer({
                            [key]: parseFloat(e.target.value) || 0,
                          } as Partial<TransformerSpecific>)
                        }
                      />
                    </label>
                  ))}
                </div>
              </>
            )}

            {modelFamily === "mlp" && (
              <>
                <h3 className="mt-6 text-xs font-medium uppercase tracking-wide text-white/40">MLP</h3>
                <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                  {(
                    [
                      ["emb_dim", "emb dim", 8, 512],
                      ["pos_dim", "pos dim", 4, 128],
                      ["hidden_size", "hidden size", 8, 4096],
                      ["num_layers", "num layers", 1, 8],
                    ] as const
                  ).map(([key, label, min, max]) => (
                    <label key={key} className="block">
                      <span className="text-xs text-white/45">{label}</span>
                      <input
                        type="number"
                        className="mt-1 w-full rounded-lg border border-white/20 bg-black/40 px-2 py-1.5 font-mono text-xs"
                        min={min}
                        max={max}
                        value={familySpecific.mlp[key]}
                        onChange={(e) =>
                          patchBilstmMlp("mlp", {
                            [key]: parseFloat(e.target.value) || 0,
                          } as Partial<BilstmMlpSpecific>)
                        }
                      />
                    </label>
                  ))}
                </div>
              </>
            )}

            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={starting || (!useGlobalStimuli && !datasetId)}
                onClick={onStart}
                className="rounded-full border border-cyan-400/50 bg-cyan-500/20 px-4 py-2 text-sm text-cyan-100 disabled:opacity-40"
              >
                {starting ? "Starting…" : "Start training"}
              </button>
              <button
                type="button"
                disabled={!activeRun || activeRun.status !== "running"}
                onClick={onStop}
                className="rounded-full border border-white/30 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
              >
                Stop
              </button>
              <button
                type="button"
                disabled={!canSaveSnapshot}
                onClick={onSaveSnapshot}
                className="rounded-full border border-amber-400/40 px-4 py-2 text-sm text-amber-100 hover:bg-amber-500/15 disabled:opacity-40"
              >
                Save current model
              </button>
            </div>
            <p className="mt-2 text-xs text-white/35">
              {!useGlobalStimuli && !datasetId ? "Select a dataset or enable global pool." : null}
            </p>
          </section>

          <section className="rounded-2xl border border-white/15 bg-[#12121a]/90 p-5">
            <h2 className="text-sm font-medium uppercase tracking-wide text-white/50">Live metrics</h2>
            {activeRun ? (
              <div className="mt-3 space-y-2 text-sm">
                <p>
                  <span className="text-white/45">Run</span>{" "}
                  <code className="rounded bg-white/10 px-1 text-xs">{activeRun.id}</code>
                </p>
                <p>
                  <span className="text-white/45">Model family</span>{" "}
                  <span className="font-mono text-cyan-200/90">{liveModelFamilyLabel}</span>
                </p>
                <p className="text-xs leading-relaxed text-white/70">
                  <span className="text-white/45">Config</span>{" "}
                  <span className="font-mono text-white/85">{liveConfigSummary}</span>
                </p>
                <p>
                  <span className="text-white/45">Status</span>{" "}
                  <span
                    className={
                      statusLabel === "finished"
                        ? "text-emerald-300"
                        : statusLabel === "running"
                          ? "text-cyan-300"
                          : statusLabel === "failed"
                            ? "text-red-300"
                            : "text-white/80"
                    }
                  >
                    {statusLabel}
                  </span>
                </p>
                <p>
                  <span className="text-white/45">Epoch</span>{" "}
                  <span className="text-white/90 tabular-nums">
                    {(progress?.current_epoch as number) ?? history.length ?? "—"} /{" "}
                    {(progress?.total_epochs as number) ?? genericHp.epochs}
                  </span>
                </p>
                <p>
                  <span className="text-white/45">Step (approx.)</span>{" "}
                  <span className="text-white/90 tabular-nums">
                    {(progress?.global_step as number) ?? "—"}
                  </span>
                </p>
                <p>
                  <span className="text-white/45">Train loss</span>{" "}
                  <span className="text-white/90 tabular-nums">
                    {progress?.latest_train_loss != null
                      ? Number(progress.latest_train_loss).toFixed(4)
                      : "—"}
                  </span>
                </p>
                <p>
                  <span className="text-white/45">Val loss</span>{" "}
                  <span className="text-white/90 tabular-nums">
                    {progress?.latest_val_loss != null
                      ? Number(progress.latest_val_loss).toFixed(4)
                      : "—"}
                  </span>
                </p>
                <p>
                  <span className="text-white/45">Best val</span>{" "}
                  <span className="text-amber-200/90 tabular-nums">
                    {progress?.best_val_loss != null
                      ? Number(progress.best_val_loss).toFixed(4)
                      : activeRun.best_val_loss != null
                        ? activeRun.best_val_loss.toFixed(4)
                        : "—"}
                  </span>
                </p>
                <p>
                  <span className="text-white/45">Updated</span>{" "}
                  <span className="text-white/90 tabular-nums">
                    {(progress?.updated_at as string) ?? "—"}
                  </span>
                </p>
                {activeRun.error_message && (
                  <pre className="mt-2 max-h-32 overflow-auto rounded border border-red-500/30 bg-black/40 p-2 text-xs text-red-100/90">
                    {activeRun.error_message}
                  </pre>
                )}
              </div>
            ) : (
              <p className="mt-4 text-sm text-white/45">Start a run to see metrics (poll every 3s).</p>
            )}

            {trainLosses.length > 0 && (
              <div className="mt-4">
                <svg width={w} height={h} className="overflow-visible">
                  <rect
                    x={0}
                    y={0}
                    width={w}
                    height={h}
                    fill="none"
                    stroke="rgba(255,255,255,0.12)"
                    rx={8}
                  />
                  <polyline
                    fill="none"
                    stroke="rgb(34, 211, 238)"
                    strokeWidth={2}
                    points={polylinePoints(trainLosses, w, h, pad)}
                  />
                  {valLosses.length > 0 && (
                    <polyline
                      fill="none"
                      stroke="rgb(251, 191, 36)"
                      strokeWidth={2}
                      strokeDasharray="4 3"
                      points={polylinePoints(valLosses, w, h, pad)}
                    />
                  )}
                </svg>
                <p className="mt-1 text-[10px] text-white/40">
                  Cyan: train loss · Amber: val loss (if available)
                </p>
              </div>
            )}
          </section>
        </div>

        <section className="mt-8 rounded-2xl border border-white/15 bg-[#12121a]/90 p-5">
          <h2 className="text-sm font-medium uppercase tracking-wide text-white/50">Model snapshots</h2>
          <p className="mt-2 text-[11px] leading-relaxed text-white/40">
            BiLSTM 快照可点击「Export ONNX」一键写出 <span className="font-mono text-white/50">onnx_runtime/model.onnx</span>{" "}
           （需 API 环境变量 <span className="font-mono">ENABLE_MODEL_RUNTIME_MUTATIONS=1</span>，与
            <span className="font-mono">/api/models/export-onnx</span> 相同门控）。
            Transformer / MLP 请用 PyTorch 路径或后续扩展导出。
          </p>
          {onnxMessage && (
            <p className="mt-2 rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-xs text-amber-100/90">
              {onnxMessage}
            </p>
          )}
          {snapshots.length === 0 ? (
            <p className="mt-3 text-sm text-white/45">No snapshots yet. Finish a run and click Save.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs text-white/45">
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Model family</th>
                    <th className="py-2 pr-4">Words</th>
                    <th className="py-2 pr-4">Samples</th>
                    <th className="py-2 pr-4">Best val</th>
                    <th className="py-2 pr-4">Checkpoint</th>
                    <th className="py-2 pr-4">Created</th>
                    <th className="py-2">ONNX</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((s) => (
                    <tr key={s.id} className="border-b border-white/5">
                      <td className="py-2 pr-4 font-mono text-xs text-white/85">{s.name}</td>
                      <td className="py-2 pr-4 font-mono text-xs text-cyan-100/90">
                        {s.model_family ?? SNAPSHOT_FAMILY_LABEL_LEGACY_FALLBACK}
                      </td>
                      <td className="py-2 pr-4 tabular-nums">{s.n_unique_words ?? "—"}</td>
                      <td className="py-2 pr-4 tabular-nums">{s.n_samples ?? "—"}</td>
                      <td className="py-2 pr-4 tabular-nums">
                        {s.best_val_loss != null ? s.best_val_loss.toFixed(4) : "—"}
                      </td>
                      <td className="max-w-[200px] truncate py-2 pr-4 font-mono text-[10px] text-white/50">
                        {s.checkpoint_uri}
                      </td>
                      <td className="py-2 pr-4 text-xs text-white/50">{s.created_at}</td>
                      <td className="py-2">
                        {snapshotIsBilstmForOnnx(s) ? (
                          <button
                            type="button"
                            onClick={() => void onExportOnnxFromSnapshot(s)}
                            disabled={onnxExportingId === s.id}
                            className="whitespace-nowrap rounded border border-cyan-500/50 bg-cyan-950/40 px-2 py-1 text-[11px] text-cyan-100 hover:bg-cyan-900/50 disabled:opacity-50"
                          >
                            {onnxExportingId === s.id ? "…" : "Export ONNX"}
                          </button>
                        ) : (
                          <span className="text-[10px] text-white/35">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-white/85">Active learning queue</h3>
              <p className="mt-1 text-xs text-white/45">
                Prioritized words for annotation: boundary uncertainty, attribute uncertainty, novelty,
                coverage, instability.
              </p>
              {queueMeta?.snapshot_time ? (
                <p className="mt-1 text-[11px] text-white/40">
                  Snapshot: {new Date(queueMeta.snapshot_time).toLocaleString()} · Stage:{" "}
                  {queueMeta.scoring_stage || "hybrid_scoring_v1"}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => refreshQueue()}
              disabled={queueRefreshing}
              className="rounded-full border border-white/25 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
            >
              {queueRefreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          <div className="mt-3 max-w-lg">
            <label className="text-xs text-white/50" htmlFor="workbench-queue-dataset">
              Target dataset (word list)
            </label>
            <select
              id="workbench-queue-dataset"
              className="mt-1 w-full rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-sm text-white/90"
              value={queueDatasetId}
              onChange={(e) => setQueueDatasetId(e.target.value)}
            >
              {datasets.length === 0 && <option value="">(global / no dataset)</option>}
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-3 max-w-lg">
            <label className="text-xs text-white/50" htmlFor="workbench-queue-source">
              Candidate source
            </label>
            <select
              id="workbench-queue-source"
              className="mt-1 w-full rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-sm text-white/90"
              value={queueCandidateSource}
              onChange={(e) => setQueueCandidateSource(e.target.value as "stimulus" | "kb")}
            >
              <option value="stimulus">Current stimulus pool</option>
              <option value="kb">Active KB lexicon</option>
            </select>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input
              id="workbench-queue-random-ties"
              type="checkbox"
              className="h-4 w-4 rounded border-white/30 bg-black/40"
              checked={queueRandomizeScoreTies}
              onChange={(e) => setQueueRandomizeScoreTies(e.target.checked)}
            />
            <label htmlFor="workbench-queue-random-ties" className="text-xs text-white/60">
              Randomize score ties when rebuilding the queue (Refresh). Default server-side uses hash
              tie-break.
            </label>
          </div>
          {queueLoading ? (
            <p className="mt-4 text-sm text-white/50">Loading queue…</p>
          ) : queueError ? (
            <div className="mt-4 rounded-xl border border-red-400/25 bg-red-950/35 px-4 py-3 text-sm text-red-100/90">
              <p className="font-medium">Could not load queue</p>
              <p className="mt-1 text-xs text-red-100/70">{queueError}</p>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-white/20 bg-[#1a1a24] shadow-2xl">
              <table className="min-w-full divide-y divide-white/10">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Word</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Score</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Boundary unc.</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Attr unc.</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Novelty</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Coverage</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Instability</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {queueItems.map((row) => (
                    <tr key={row.stimulus_id} className="hover:bg-white/5">
                      <td className="px-4 py-2 font-mono text-white/90">{row.text}</td>
                      <td className="px-4 py-2 tabular-nums text-white/80">{row.score.toFixed(3)}</td>
                      <td className="px-4 py-2 text-xs text-white/70">{row.boundary_uncertainty.toFixed(3)}</td>
                      <td className="px-4 py-2 text-xs text-white/70">
                        {row.segment_attribute_uncertainty.toFixed(3)}
                      </td>
                      <td className="px-4 py-2 text-xs text-white/70">{row.segment_novelty.toFixed(3)}</td>
                      <td className="px-4 py-2 text-xs text-white/70">{row.coverage_gain.toFixed(3)}</td>
                      <td className="px-4 py-2 text-xs text-white/70">{row.instability.toFixed(3)}</td>
                      <td className="px-4 py-2">
                        <Link
                          href={`/annotate/${row.stimulus_id}?from=al${
                            queueDatasetId ? `&selected_list_id=${encodeURIComponent(queueDatasetId)}` : ""
                          }&queue_source=${queueCandidateSource}`}
                          className="inline-block rounded-full border border-white/30 px-3 py-1 text-sm text-white/90 hover:bg-white/10"
                        >
                          Annotate
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </GrainientBg>
  );
}
