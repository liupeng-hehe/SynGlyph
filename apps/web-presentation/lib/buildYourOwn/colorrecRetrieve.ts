export type ColorRecHit = {
  rank: number;
  score: number;
  color_id?: string;
  name?: string;
  display_name?: string;
  hex?: string;
  family?: string;
  source?: string;
  descriptor?: string;
  explanation?: string;
};

export type ColorRecRetrieveResponse = {
  query: string;
  top_k: number;
  results: ColorRecHit[];
  model_path?: string;
};

export type ColorRecHealthResponse = {
  enabled: boolean;
  ready: boolean;
  loaded?: boolean;
  model_path?: string;
  embeddings_path?: string;
  missing?: string[];
  load_error?: string;
};

export async function fetchColorRecHealth(): Promise<ColorRecHealthResponse> {
  const res = await fetch("/api/colorrec/health", { cache: "no-store" });
  const data = (await res.json()) as ColorRecHealthResponse & { detail?: string };
  if (!res.ok) {
    throw new Error(data.detail ?? `HTTP ${res.status}`);
  }
  return data;
}

export async function retrieveColors(
  query: string,
  topK = 8,
): Promise<ColorRecRetrieveResponse> {
  const res = await fetch("/api/colorrec/retrieve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, top_k: topK }),
  });
  const data = (await res.json()) as ColorRecRetrieveResponse & {
    detail?: string | { message?: string };
  };
  if (!res.ok) {
    const detail = data.detail;
    const msg =
      typeof detail === "string"
        ? detail
        : detail?.message ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}
