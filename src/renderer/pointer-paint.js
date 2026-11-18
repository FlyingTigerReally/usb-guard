import * as THREE from "./vendor/three.module.js";

// Adapted screen-paint lifecycle; see THIRD_PARTY_NOTICES.md for shader provenance.
export const pointerInput = {
  x: 0,
  y: 0,
  version: 0,
  lastMove: -Infinity,
  inside: false,
};
document.addEventListener(
  "pointermove",
  (event) => {
    if (event.pointerType === "touch" || event.clientY < 36) return;
    const x = event.clientX,
      y = event.clientY - 36;
    if (
      pointerInput.inside &&
      Math.hypot(x - pointerInput.x, y - pointerInput.y) < 0.3
    )
      return;
    pointerInput.x = x;
    pointerInput.y = y;
    pointerInput.inside = true;
    pointerInput.lastMove = performance.now();
    pointerInput.version++;
    window.dispatchEvent(new Event("usbguard-pointer-input"));
  },
  { passive: true },
);
document.addEventListener(
  "pointerleave",
  () => {
    pointerInput.inside = false;
  },
  { passive: true },
);
window.addEventListener("blur", () => {
  pointerInput.inside = false;
});

export function createScreenPaint(renderer, sources) {
  const type = renderer.extensions.has("EXT_color_buffer_float")
    ? THREE.HalfFloatType
    : THREE.UnsignedByteType;
  const makeTarget = () =>
    new THREE.WebGLRenderTarget(1, 1, {
      type,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
  const targets = [makeTarget(), makeTarget()],
    low = makeTarget(),
    blur = makeTarget();
  const scene = new THREE.Scene(),
    camera = new THREE.Camera();
  const geometry = new THREE.PlaneGeometry(2, 2);
  const from = new THREE.Vector4(),
    to = new THREE.Vector4(),
    velocity = new THREE.Vector2(),
    delta = new THREE.Vector2();
  const uniforms = {
    u_lowPaintTexture: { value: low.texture },
    u_prevPaintTexture: { value: targets[0].texture },
    u_paintTexelSize: { value: new THREE.Vector2() },
    u_scrollOffset: { value: new THREE.Vector2() },
    u_drawFrom: { value: from },
    u_drawTo: { value: to },
    u_pushStrength: { value: 25 },
    u_dissipations: { value: new THREE.Vector3(0.975, 0.95, 0.8) },
    u_vel: { value: velocity },
    u_curlScale: { value: 0.02 },
    u_curlStrength: { value: 3 },
  };
  const paint = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: sources["screen.vert.glsl"],
    fragmentShader: sources["pointer-paint.frag.glsl"],
    defines: { USE_NOISE: true },
    depthWrite: false,
    depthTest: false,
  });
  const blurUniforms = {
    uTexture: { value: null },
    uStep: { value: new THREE.Vector2() },
  };
  const blurMaterial = new THREE.ShaderMaterial({
    uniforms: blurUniforms,
    vertexShader: sources["screen.vert.glsl"],
    fragmentShader: sources["pointer-blur.frag.glsl"],
    depthWrite: false,
    depthTest: false,
  });
  const quad = new THREE.Mesh(geometry, paint);
  scene.add(quad);
  let index = 0,
    simWidth = 1,
    simHeight = 1,
    viewWidth = 1,
    viewHeight = 1,
    version = -1,
    initialized = false;
  const clearColor = new THREE.Color();
  function clear() {
    const previous = renderer.getRenderTarget(),
      alpha = renderer.getClearAlpha();
    renderer.getClearColor(clearColor);
    renderer.setClearColor(new THREE.Color(0.5, 0.5, 0), 0);
    for (const target of [...targets, low, blur]) {
      renderer.setRenderTarget(target);
      renderer.clear();
    }
    renderer.setClearColor(clearColor, alpha);
    renderer.setRenderTarget(previous);
    velocity.set(0, 0);
    from.set(0, 0, 0, 0);
    to.set(0, 0, 0, 0);
    initialized = false;
    version = pointerInput.version;
  }
  function resize(w, h, quality = "balanced") {
    viewWidth = w;
    viewHeight = h;
    const scale = quality === "low" ? 0.18 : quality === "high" ? 0.33 : 0.25;
    simWidth = Math.max(2, Math.round(w * scale));
    simHeight = Math.max(2, Math.round(h * scale));
    for (const target of targets) target.setSize(simWidth, simHeight);
    low.setSize(Math.max(2, simWidth >> 1), Math.max(2, simHeight >> 1));
    blur.setSize(low.width, low.height);
    uniforms.u_paintTexelSize.value.set(1 / simWidth, 1 / simHeight);
    clear();
  }
  function update(dt) {
    dt = Math.min(0.05, Math.max(1 / 120, dt));
    const step = dt * 60;
    const moved = version !== pointerInput.version && pointerInput.inside;
    const x = (pointerInput.x / viewWidth) * simWidth,
      y = (1 - pointerInput.y / viewHeight) * simHeight;
    if (!initialized) {
      to.set(x, y, 0, 0);
      initialized = true;
    }
    from.copy(to);
    const dx = moved ? x - from.x : 0,
      dy = moved ? y - from.y : 0;
    const distance = Math.hypot(
      (dx * viewWidth) / simWidth,
      (dy * viewHeight) / simHeight,
    );
    const maxRadius = Math.max(40, viewWidth / 20);
    const radius = moved
      ? (Math.min(1, distance / 100) * maxRadius * simHeight) / viewHeight
      : 0;
    to.set(x, y, radius, moved ? 1 : 0);
    velocity
      .multiplyScalar(Math.pow(0.8, step))
      .add(delta.set(dx, dy).multiplyScalar(dt * 0.8))
      .clampLength(0, 0.45);
    uniforms.u_dissipations.value.set(
      Math.pow(0.975, step),
      Math.pow(0.95, step),
      Math.pow(0.8, step),
    );
    uniforms.u_prevPaintTexture.value = targets[index].texture;
    const next = 1 - index;
    quad.material = paint;
    renderer.setRenderTarget(targets[next]);
    renderer.render(scene, camera);
    index = next;
    quad.material = blurMaterial;
    blurUniforms.uTexture.value = targets[index].texture;
    blurUniforms.uStep.value.set(4 / simWidth, 0);
    renderer.setRenderTarget(blur);
    renderer.render(scene, camera);
    blurUniforms.uTexture.value = blur.texture;
    blurUniforms.uStep.value.set(0, 4 / low.height);
    renderer.setRenderTarget(low);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    version = pointerInput.version;
  }
  return {
    resize,
    update,
    clear,
    get texture() {
      return targets[index].texture;
    },
    get texel() {
      return uniforms.u_paintTexelSize.value;
    },
    dispose() {
      [...targets, low, blur, geometry, paint, blurMaterial].forEach(
        (resource) => resource.dispose(),
      );
    },
  };
}
