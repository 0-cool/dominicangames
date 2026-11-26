# Performance budget

Targets are for a 1920×1080 browser window. “Measured” figures come from headless Chromium with the
SwiftShader software rasteriser (the only GPU available in the build environment) and therefore measure
**content complexity** (draw calls, triangles, bytes), not frame rate. Frame-rate targets must be verified
on real hardware (see QA_CHECKLIST.md).

## 1. Frame-rate targets

| Preset | Target hardware | Target | Resolution scale | Notes |
|---|---|---|---|---|
| LOW | Integrated GPU (recent Intel/AMD iGPU), 8 GB RAM | 30 FPS | 0.75 + dynamic | no shadows, no bloom, 350 m draw distance, 35 % traffic/pedestrians |
| MEDIUM | Entry dedicated GPU / Apple M1 | 45–60 FPS | 1.0 + dynamic | low shadows, bloom, 550 m |
| HIGH | Mid-range dedicated GPU | 60 FPS | 1.0 + dynamic | high shadows, 850 m |
| ULTRA | High-end GPU | 60 FPS | 1.25 | GTAO, 1200 m, 100 % density |

Dynamic resolution (`RenderPipeline.adapt`) lowers the internal resolution down to 50 % when the frame time
exceeds the budget and recovers when there is headroom. The launcher suggests a preset from the WebGL
renderer string, CPU cores and device memory (`detectCapabilities`).

## 2. Per-frame budgets (HIGH)

| Metric | Budget | Measured (typical street views) |
|---|---|---|
| Draw calls | ≤ 700 | 250–700 |
| Triangles | ≤ 2.5 M | 1–2 M |
| Traffic vehicles (simulated) | ≤ 70 | ~60 after 30 s at full density |
| Pedestrians (simulated, GPU-skinned) | ≤ 80 | ~60 |
| Physics colliders | chunks within 320 m | — |
| CPU frame (simulation + culling) | ≤ 6 ms | to measure on hardware |

## 3. Download budget

| Asset | Raw | Over the wire (gzip/brotli) |
|---|---|---|
| Site JS (React, router, zod, pages) | 516 KB | 157 KB |
| Game chunk (three.js, Rapier WASM inlined, engine) | 5.3 MB | 1.96 MB |
| Fonts (Inter variable + Anton, latin subsets used) | — | ~120 KB |
| World: manifest + roads + map | 1.2 MB | ~0.3 MB |
| World chunks (116 GLB + JSON, all of them) | 42 MB | 10.2 MB |
| **First game load** (engine + nearby chunks) | — | **< 15 MB** |

World chunks are streamed by distance; the full city is never downloaded at once. Assets are served with
`ETag` + `Cache-Control: private, max-age=3600` so revisits revalidate cheaply.

## 4. Memory

* GPU: procedural textures baked once into 512–1024² mip-mapped targets (≈ 60 MB VRAM total); chunk meshes are
  disposed when they leave the draw distance.
* JS heap: ~250–400 MB with 30–40 chunks loaded (to verify on hardware).

## 5. Known hot spots and planned optimisations

1. **Rapier compat build** inlines its WASM as base64 (≈ 2 MB of the game chunk). Switching to the non-compat
   build with a streamed `.wasm` would save ~25 % download and compile faster.
2. **Ground layers** (asphalt, pavers, sidewalk, plaza, markings) are separate draw calls per chunk; merging into
   one material with a layer index would cut ~5 draw calls per chunk.
3. **LOD**: buildings beyond 400 m could use a simplified roof-only mesh.
4. **Tree cards**: foliage is the largest triangle contributor in parks; impostors would help LOW/MEDIUM.
5. **WebGPU** renderer (ADR-001) for better CPU submission costs.
