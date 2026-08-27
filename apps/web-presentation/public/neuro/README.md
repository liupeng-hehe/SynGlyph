# 3D Brain Assets for Synesthesia Brain Atlas

This folder holds optional 3D brain model assets for the neuroscience chapter viewer.

**This project does not ship medical atlas data by default.**

## Synesthesia Brain Atlas (primary)

- **`segmented_brain.glb`** — segmented cortical / subcortical model with **named meshes or material groups** per region. The atlas highlights full colored regions (not point markers) when a synesthesia type is selected.
- Mesh names are resolved through the alias layer in `content/synesthesia3DFlows.ts` (`brainMeshAliases`). Examples:

| Logical region ID | Example mesh names |
|---|---|
| `visualCortexOccipital` | `visualCortex`, `occipital`, `BA17`, `BA18`, `BA19` |
| `ventralOccipitoTemporal` | `fusiform`, `VWFA`, `BA37` |
| `colorV4V8` | `V4`, `V8`, `colorArea` |
| `auditorySuperiorTemporal` | `auditoryCortex`, `STG`, `BA41`, `BA42` |
| `posteriorParietal` | `posteriorParietal`, `IPS`, `BA7`, `BA39`, `BA40` |
| `spatialParietal` | `intraparietalSulcus`, `IPS`, `BA7` |
| `semanticTemporal` | `middleTemporal`, `temporalPole`, `BA21`, `BA22`, `BA38` |
| `anteriorInsulaGustatory` | `anteriorInsula`, `gustatoryInsula` |
| `somatosensoryS1S2` | `somatosensory`, `S1`, `S2`, `postcentralGyrus` |
| `thalamus` | `thalamus` |
| `mirrorTouchPremotorInsula` | `mirrorTouch`, `premotor`, `insula` |
| `motorBodyMapping` | `motorCortex`, `precentralGyrus`, `M1` |
| `frontalAttention` | `DLPFC`, `BA9`, `BA46` |

If `segmented_brain.glb` is missing or meshes do not match aliases, the UI remains functional and shows: **“Segmented brain model not connected yet.”**

## Optional fallback shell

- **`brain_surface.glb`** — single translucent cortical shell shown only when the segmented atlas is unavailable (preview placeholder, not a region-accurate atlas).

## Synesthesia type → highlighted regions (educational model)

| Synesthesia type | Regions highlighted (pathway order) |
|---|---|
| Grapheme → Color | visual cortex, ventral occipito-temporal, posterior parietal, V4/V8 |
| Sound → Color | auditory cortex, posterior parietal, V4/V8 |
| Sequence → Space | semantic temporal, posterior parietal, spatial parietal |
| Symbols → Personality | ventral occipito-temporal, semantic temporal, frontal attention |
| Word → Taste | semantic temporal, anterior insula, posterior parietal |
| Sound → Touch | auditory cortex, thalamus, somatosensory, posterior parietal |
| Observed Touch → Felt Touch | visual cortex, mirror-touch network, somatosensory, posterior parietal |
| Concept → Shape | semantic temporal, posterior parietal, spatial parietal |
| System → Body | semantic temporal, posterior parietal, spatial parietal, motor body mapping |

These mappings are **not** guaranteed exact anatomical ROIs unless a validated segmented atlas asset is provided.

## Key literature

See `content/synesthesia3DFlows.ts` for full citations and evidence levels.
