// Graphics quality that fits the machine: notices when the browser draws without the graphics
// card (software WebGL, which makes any 3D game crawl) and starts light, and watches the frame
// rate while playing, stepping quality down (glow, shadow detail, shadows, resolution) whenever
// frames stay slow, so the game never sits frozen-looking on a weak setup.

/** The GPU name WebGL reports, and whether it is a software rasteriser. */
export function detectRenderer(renderer) {
  const gl = renderer.getContext();
  let name = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch {
    name = '';
  }
  const software = /swiftshader|llvmpipe|software|basic render|microsoft basic/i.test(name);
  return { name, software };
}

const LEVELS = [
  { label: 'high', postfx: true, shadowSize: 2048, shadows: true, pixelRatio: 1.5 },
  { label: 'medium', postfx: false, shadowSize: 1024, shadows: true, pixelRatio: 1 },
  { label: 'low', postfx: false, shadowSize: 1024, shadows: false, pixelRatio: 0.75 },
  { label: 'lowest', postfx: false, shadowSize: 512, shadows: false, pixelRatio: 0.5 },
];

/**
 * Applies and adjusts quality. `apply(level)` is given each LEVELS entry to put in force;
 * `sample(dt)` is fed every frame's real duration while the world is running.
 */
export function createQualityGovernor(start, apply, onDrop) {
  let level = Math.max(0, Math.min(LEVELS.length - 1, start));
  let window = 0;
  let frames = 0;
  let settle = 2;
  apply(LEVELS[level]);
  return {
    get level() {
      return LEVELS[level];
    },
    sample(dt) {
      // The first moments after a change (shader compiles, a new scene) are not judged.
      if (settle > 0) {
        settle -= dt;
        return;
      }
      window += dt;
      frames += 1;
      if (window < 2) return;
      const fps = frames / window;
      window = 0;
      frames = 0;
      if (fps < 25 && level < LEVELS.length - 1) {
        level += 1;
        apply(LEVELS[level]);
        settle = 2;
        if (onDrop) onDrop(LEVELS[level], fps);
      }
    },
  };
}
