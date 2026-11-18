import * as THREE from "./vendor/three.module.js";
import { createScreenPaint, pointerInput } from "./pointer-paint.js";
import { shaderSources } from "./shader-sources.js";

const html = document.documentElement,
  canvas = document.getElementById("pointerPaint");
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
let renderer,
  paint,
  frame = 0,
  last = 0,
  disposed = false,
  quality = html.dataset.quality || "balanced";
const active = () =>
  !disposed &&
  !document.hidden &&
  !reduced.matches &&
  html.dataset.pointerEffect !== "off";
function idle() {
  cancelAnimationFrame(frame);
  frame = 0;
  html.dataset.pointerIdle = "true";
}
try {
  const sources = await shaderSources;
  const context = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
    depth: false,
    stencil: false,
  });
  if (!context) {
    idle();
    html.dataset.pointerReady = "fallback";
    canvas.hidden = true;
  } else {
    renderer = new THREE.WebGLRenderer({
      canvas,
      context,
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
    });
    renderer.setClearColor(0, 0);
    renderer.autoClear = true;
    paint = createScreenPaint(renderer, sources);
    const uniforms = {
      uPaint: { value: null },
      uTexel: { value: paint.texel },
      uDark: { value: 0 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: sources["screen.vert.glsl"],
      fragmentShader: sources["pointer-overlay.frag.glsl"],
      depthWrite: false,
      depthTest: false,
    });
    const geometry = new THREE.PlaneGeometry(2, 2),
      scene = new THREE.Scene(),
      camera = new THREE.Camera();
    scene.add(new THREE.Mesh(geometry, material));
    function blank() {
      idle();
      paint.clear();
      renderer.setRenderTarget(null);
      renderer.clear();
      canvas.hidden = !active();
    }
    function resize() {
      quality = html.dataset.quality || "balanced";
      renderer.setPixelRatio(
        quality === "high" ? Math.min(devicePixelRatio, 1.5) : 1,
      );
      renderer.setSize(innerWidth, Math.max(1, innerHeight - 36), false);
      paint.resize(innerWidth, Math.max(1, innerHeight - 36), quality);
      blank();
    }
    function render(now) {
      frame = 0;
      if (!active()) {
        blank();
        return;
      }
      if (now - pointerInput.lastMove > 3200) {
        blank();
        return;
      }
      if (now - last < 1000 / (quality === "high" ? 60 : 30) - 1) {
        frame = requestAnimationFrame(render);
        return;
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      paint.update(dt);
      uniforms.uPaint.value = paint.texture;
      uniforms.uDark.value = html.dataset.theme === "dark" ? 1 : 0;
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    }
    function wake() {
      if (!active()) return;
      canvas.hidden = false;
      html.dataset.pointerIdle = "false";
      if (!frame) {
        last = performance.now() - 34;
        frame = requestAnimationFrame(render);
      }
    }
    window.addEventListener("usbguard-pointer-input", wake);
    window.addEventListener("usbguard-pointer-toggle", blank);
    window.addEventListener("usbguard-quality", resize);
    window.addEventListener("resize", resize);
    window.addEventListener("blur", blank);
    document.addEventListener("visibilitychange", blank);
    reduced.addEventListener("change", blank);
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      idle();
      canvas.hidden = true;
      html.dataset.pointerReady = "fallback";
      disposed = true;
    });
    window.addEventListener(
      "beforeunload",
      () => {
        disposed = true;
        idle();
        paint.dispose();
        geometry.dispose();
        material.dispose();
        renderer.dispose();
      },
      { once: true },
    );
    resize();
    html.dataset.pointerReady = "true";
  }
} catch (error) {
  idle();
  canvas.hidden = true;
  html.dataset.pointerReady = "fallback";
  paint?.dispose();
  renderer?.dispose();
  console.warn("Pointer paint unavailable", error);
}
