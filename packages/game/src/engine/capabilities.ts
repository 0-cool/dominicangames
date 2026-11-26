import type { GraphicsPreset } from '@sd/shared';

export interface Capabilities {
  webgl2: boolean;
  wasm: boolean;
  renderer: string;
  vendor: string;
  software: boolean;
  maxTexture: number;
  cores: number;
  memoryGB: number | null;
  suggested: GraphicsPreset;
  supported: boolean;
  reasons: string[];
}

/** Probe the browser/GPU and suggest a safe graphics preset. */
export function detectCapabilities(): Capabilities {
  const reasons: string[] = [];
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false }) as WebGL2RenderingContext | null;
  const wasm = typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function';
  let renderer = 'desconocido';
  let vendor = '';
  let maxTexture = 0;
  if (gl) {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    vendor = dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) : String(gl.getParameter(gl.VENDOR));
    maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } else reasons.push('Tu navegador no soporta WebGL 2.');
  if (!wasm) reasons.push('Tu navegador no soporta WebAssembly (necesario para la física).');
  const r = renderer.toLowerCase();
  const software = /swiftshader|llvmpipe|software|microsoft basic render/.test(r);
  const cores = navigator.hardwareConcurrency || 4;
  const memoryGB = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null;
  let suggested: GraphicsPreset = 'medium';
  if (software) suggested = 'low';
  else if (/rtx|radeon rx [5-9]|rx 6|rx 7|rx 9|apple m[2-9]|arc a7/.test(r)) suggested = 'high';
  else if (/intel|uhd|iris|hd graphics|mali|adreno|apple m1/.test(r)) suggested = /iris xe|arc/.test(r) ? 'medium' : 'low';
  if (memoryGB !== null && memoryGB <= 4) suggested = 'low';
  if (cores <= 2 && suggested !== 'low') suggested = 'low';
  if (software) reasons.push('Se detectó renderizado por software: el rendimiento será muy bajo.');
  return { webgl2: !!gl, wasm, renderer, vendor, software, maxTexture, cores, memoryGB, suggested, supported: !!gl && wasm, reasons };
}
