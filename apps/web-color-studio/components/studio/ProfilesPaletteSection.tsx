"use client";

import { useMemo, useState } from "react";

import { useStudio } from "@/lib/studioContext";

export function ProfilesPaletteSection() {
  const { state, dispatch } = useStudio();
  const [paletteName, setPaletteName] = useState("My palette");
  const [newProfileName, setNewProfileName] = useState("");

  const activeProfile = useMemo(
    () =>
      state.persistence.profiles.find(
        (p) => p.id === state.persistence.activeProfileId,
      ),
    [state.persistence.profiles, state.persistence.activeProfileId],
  );

  return (
    <section className="rounded-2xl border border-byo-ink/15 bg-white/60 p-5 shadow-sm">
      <h3 className="font-display text-lg font-semibold text-byo-ink">
        Profiles & saved palettes
      </h3>
      <p className="mt-1 text-xs text-byo-ink/65">
        Phase 4: named profiles and reusable palettes (stored locally).
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block text-xs text-byo-ink/65">
          Active profile
          <select
            value={state.persistence.activeProfileId}
            onChange={(e) =>
              dispatch({ type: "SET_ACTIVE_PROFILE", id: e.target.value })
            }
            className="mt-1 block w-56 rounded-lg border border-byo-ink/20 bg-white px-2 py-2 text-sm text-byo-ink"
          >
            {state.persistence.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-1 flex-wrap gap-2">
          <input
            value={newProfileName}
            onChange={(e) => setNewProfileName(e.target.value)}
            placeholder="New profile name"
            className="min-w-[10rem] flex-1 rounded-lg border border-byo-ink/20 bg-white px-3 py-2 text-sm text-byo-ink placeholder:text-byo-ink/40"
          />
          <button
            type="button"
            onClick={() => {
              dispatch({
                type: "ADD_PROFILE",
                displayName: newProfileName || "New profile",
              });
              setNewProfileName("");
            }}
            className="rounded-lg bg-byo-ink/10 px-4 py-2 text-sm text-byo-ink hover:bg-byo-ink/15"
          >
            Add profile
          </button>
        </div>
      </div>

      <div className="mt-6 border-t border-byo-ink/15 pt-4">
        <p className="text-xs uppercase tracking-wide text-byo-ink/55">
          Palettes for {activeProfile?.displayName ?? "profile"}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={paletteName}
            onChange={(e) => setPaletteName(e.target.value)}
            className="min-w-[12rem] flex-1 rounded-lg border border-byo-ink/20 bg-white px-3 py-2 text-sm text-byo-ink"
          />
          <button
            type="button"
            onClick={() =>
              dispatch({ type: "SAVE_PALETTE", name: paletteName })
            }
            className="rounded-lg bg-byo-ink px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-byo-ink/90"
          >
            Save palette
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <select
            className="rounded-lg border border-byo-ink/20 bg-white px-2 py-2 text-sm text-byo-ink"
            defaultValue=""
            onChange={(e) => {
              const id = e.target.value;
              if (id) dispatch({ type: "LOAD_PALETTE", id });
              e.target.selectedIndex = 0;
            }}
          >
            <option value="" disabled>
              Load saved palette…
            </option>
            {state.persistence.palettes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {state.persistence.palettes.length === 0 ? (
            <span className="text-xs text-byo-ink/55">No saved palettes yet.</span>
          ) : null}
        </div>
        <ul className="mt-3 space-y-1 text-sm text-byo-ink/90">
          {state.persistence.palettes.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-byo-ink/5 px-3 py-2"
            >
              <span>{p.name}</span>
              <button
                type="button"
                className="text-xs text-rose-600 hover:underline"
                onClick={() =>
                  dispatch({ type: "DELETE_PALETTE", id: p.id })
                }
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
