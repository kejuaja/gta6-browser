// The picture's last stage: the scene renders to an HDR target (multisampled), bright parts
// bleed into a two-level bloom (neon signs, headlights, sirens, the sun), and one composite pass
// applies the filmic tone curve, a warm golden-hour grade and a soft vignette before the screen.
// Turned off (Settings), the scene renders straight to the screen with the renderer's own curve.
import * as THREE from 'three';

const QUAD_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const BRIGHT_FS = `
uniform sampler2D tex; uniform float threshold; uniform float knee; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tex, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float soft = clamp(l - threshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  float w = max(soft, l - threshold) / max(l, 1e-4);
  gl_FragColor = vec4(c * w, 1.0);
}`;

const BLUR_FS = `
uniform sampler2D tex; uniform vec2 step; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tex, vUv).rgb * 0.227027;
  c += texture2D(tex, vUv + step * 1.3846).rgb * 0.316216;
  c += texture2D(tex, vUv - step * 1.3846).rgb * 0.316216;
  c += texture2D(tex, vUv + step * 3.2308).rgb * 0.070270;
  c += texture2D(tex, vUv - step * 3.2308).rgb * 0.070270;
  gl_FragColor = vec4(c, 1.0);
}`;

const COMPOSITE_FS = `
uniform sampler2D scene; uniform sampler2D bloomNear; uniform sampler2D bloomWide;
uniform float strength; uniform float exposure; varying vec2 vUv;
vec3 rrtOdt(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 aces(vec3 c) {
  const mat3 inMat = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 outMat = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  c *= exposure / 0.6;
  c = outMat * rrtOdt(inMat * c);
  return clamp(c, 0.0, 1.0);
}
vec3 toSrgb(vec3 c) {
  return mix(c * 12.92, pow(c, vec3(1.0 / 2.4)) * 1.055 - 0.055, step(0.0031308, c));
}
void main() {
  vec3 c = texture2D(scene, vUv).rgb;
  c += (texture2D(bloomNear, vUv).rgb * 0.6 + texture2D(bloomWide, vUv).rgb * 0.9) * strength;
  c = aces(c);
  // Golden hour: warmer highlights, a touch more colour, lifted cool shadows.
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 1.22);
  c *= mix(vec3(0.97, 0.98, 1.04), vec3(1.05, 1.0, 0.93), smoothstep(0.05, 0.8, l));
  float v = smoothstep(0.9, 0.3, length((vUv - 0.5) * vec2(1.2, 1.0)));
  c *= mix(0.8, 1.0, v);
  gl_FragColor = vec4(toSrgb(clamp(c, 0.0, 1.0)), 1.0);
}`;

function pass(fragmentShader, uniforms) {
  return new THREE.ShaderMaterial({ vertexShader: QUAD_VS, fragmentShader, uniforms, depthTest: false, depthWrite: false });
}

export function createPostFx(renderer) {
  const hdr = { type: THREE.HalfFloatType };
  const sceneRT = new THREE.WebGLRenderTarget(1, 1, { ...hdr, samples: 4 });
  const halfA = new THREE.WebGLRenderTarget(1, 1, hdr);
  const halfB = new THREE.WebGLRenderTarget(1, 1, hdr);
  const quarterA = new THREE.WebGLRenderTarget(1, 1, hdr);
  const quarterB = new THREE.WebGLRenderTarget(1, 1, hdr);
  const bright = pass(BRIGHT_FS, { tex: { value: null }, threshold: { value: 0.95 }, knee: { value: 0.45 } });
  const blur = pass(BLUR_FS, { tex: { value: null }, step: { value: new THREE.Vector2() } });
  const composite = pass(COMPOSITE_FS, {
    scene: { value: sceneRT.texture },
    bloomNear: { value: halfA.texture },
    bloomWide: { value: quarterB.texture },
    strength: { value: 0.55 },
    exposure: { value: 1.0 },
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), composite);
  quad.frustumCulled = false;
  const fsScene = new THREE.Scene();
  fsScene.add(quad);
  const fsCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const size = new THREE.Vector2();

  function draw(material, target) {
    quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(fsScene, fsCamera);
  }

  function blurInto(src, dst, dx, dy) {
    blur.uniforms.tex.value = src.texture;
    blur.uniforms.step.value.set(dx / src.width, dy / src.height);
    draw(blur, dst);
  }

  const fx = {
    enabled: true,
    setSize() {
      renderer.getDrawingBufferSize(size);
      const w = Math.max(1, size.x);
      const h = Math.max(1, size.y);
      sceneRT.setSize(w, h);
      halfA.setSize(Math.ceil(w / 2), Math.ceil(h / 2));
      halfB.setSize(Math.ceil(w / 2), Math.ceil(h / 2));
      quarterA.setSize(Math.ceil(w / 4), Math.ceil(h / 4));
      quarterB.setSize(Math.ceil(w / 4), Math.ceil(h / 4));
    },
    render(scene, camera) {
      if (!fx.enabled) {
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
        return;
      }
      renderer.setRenderTarget(sceneRT);
      renderer.render(scene, camera);
      bright.uniforms.tex.value = sceneRT.texture;
      draw(bright, halfA);
      blurInto(halfA, halfB, 1, 0);
      blurInto(halfB, halfA, 0, 1);
      blurInto(halfA, quarterA, 1.5, 0);
      blurInto(quarterA, quarterB, 0, 1.5);
      composite.uniforms.exposure.value = renderer.toneMappingExposure;
      draw(composite, null);
    },
  };
  return fx;
}
