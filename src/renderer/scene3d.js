/**
 * 3D 主视觉场景（Three.js + GSAP 联动）
 * ---------------------------------------------------------------
 * 两套可切换场景（设置 → 3D 背景样式，持久化）：
 * 1. Guard Core「守护核心」：金属多面体 + 线框外壳 + 双轨道环（硬朗几何）；
 * 2. Nebula「粒子星云」：双臂旋涡星尘 + 光核光晕（柔和流体）。
 * 共用：粒子尘埃场、灯光组、相机、GSAP 联动。
 *
 * GSAP × Three.js 联动（三种）：
 * 1. 鼠标视差：gsap.quickTo 惯性驱动相机位移（阻尼跟随）；
 * 2. 滚动驱动：ScrollTrigger 监听事件日志滚动 → 场景旋转 + 相机推进 + 尘埃增亮；
 * 3. 事件脉冲：业务事件（usbguard-evt）→ GSAP timeline 打脉冲（当前场景 + 灯光）。
 *
 * 场景切换：usbguard-scene 事件 / html[data-scene3d]（启动值），'off' 全部隐藏。
 * 降级：WebGL 不可用时 body.no-webgl，canvas 隐藏，CSS 渐变兜底。
 * 可访问性：prefers-reduced-motion 停持续运动，只渲染静态构图。
 */
import * as THREE from './vendor/three.module.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const canvas = document.getElementById('hero3d');
if (canvas && webglAvailable() && window.gsap) {
  init();
} else {
  document.body.classList.add('no-webgl');
}

function init() {
  gsap.registerPlugin(ScrollTrigger);

  // ============ 渲染器 / 场景 / 相机 ============
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x070a12, 0.038);

  const camera = new THREE.PerspectiveCamera(
    42, window.innerWidth / window.innerHeight, 0.1, 100
  );
  camera.position.set(0, 0, 9);

  // stage：承载全部场景组，滚动旋转统一作用于它
  const stage = new THREE.Group();
  scene.add(stage);

  // ============ 共用：粒子尘埃场 ============
  const P_COUNT = 320;
  const positions = new Float32Array(P_COUNT * 3);
  for (let i = 0; i < P_COUNT; i++) {
    const r = 3 + Math.pow(Math.random(), 0.6) * 8;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = Math.sin(phi) * Math.cos(theta) * r + 1.2;
    positions[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * r * 0.62;
    positions[i * 3 + 2] = Math.cos(phi) * r * 0.8 - 1.5;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const pMat = new THREE.PointsMaterial({
    color: 0x7aa4ff,
    size: 0.052,
    transparent: true,
    opacity: 0.62,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const dust = new THREE.Points(pGeo, pMat);
  scene.add(dust);

  // ============ 共用：光照 ============
  scene.add(new THREE.AmbientLight(0x223355, 1.35));
  const key = new THREE.DirectionalLight(0xbcd2ff, 2.8);
  key.position.set(5, 6, 8);
  scene.add(key);
  const rim = new THREE.PointLight(0x5b8cff, 110, 45, 2);
  rim.position.set(-6, -3, 4);
  scene.add(rim);
  const warm = new THREE.PointLight(0xffc255, 26, 30, 2);
  warm.position.set(4.5, -4, 3);
  scene.add(warm);

  // ============ 场景 1：Guard Core「守护核心」 ============
  function buildCore() {
    const group = new THREE.Group();
    group.position.set(2.7, 1.6, 0);
    group.scale.setScalar(1.22);

    const coreMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.35, 1),
      new THREE.MeshStandardMaterial({
        color: 0x2a4a8f,
        metalness: 0.85,
        roughness: 0.28,
        flatShading: true,
        emissive: 0x1d3f7a,
        emissiveIntensity: 1.05,
      })
    );
    group.add(coreMesh);

    const shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.95, 1),
      new THREE.MeshBasicMaterial({ color: 0x5b8cff, wireframe: true, transparent: true, opacity: 0.3 })
    );
    group.add(shell);

    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x5b8cff, metalness: 0.9, roughness: 0.2, transparent: true, opacity: 0.72,
    });
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(2.55, 0.032, 12, 140), ringMat);
    ring1.rotation.set(Math.PI / 2.35, 0, 0);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.022, 12, 140), ringMat.clone());
    ring2.rotation.set(Math.PI / 1.72, Math.PI / 5, 0);
    group.add(ring1, ring2);

    return {
      group,
      tick(t) {
        if (reducedMotion) return;
        coreMesh.rotation.y += 0.0016;
        coreMesh.rotation.x += 0.0006;
        shell.rotation.y -= 0.0011;
        shell.rotation.z += 0.0004;
        ring1.rotation.z += 0.0021;
        ring2.rotation.z -= 0.0015;
      },
      pulse() {
        if (reducedMotion) return;
        gsap.timeline()
          .to(coreMesh.scale, { x: 1.14, y: 1.14, z: 1.14, duration: 0.16, ease: 'power2.out' })
          .to(coreMesh.scale, { x: 1, y: 1, z: 1, duration: 0.85, ease: 'elastic.out(1, 0.45)' })
          .to(pMat, { size: 0.085, duration: 0.14 }, 0)
          .to(pMat, { size: 0.052, duration: 0.7 }, 0.14);
      },
    };
  }

  // ============ 场景 2：Nebula「粒子星云」 ============
  function buildNebula() {
    const group = new THREE.Group();
    group.position.set(2.6, 1.5, -1);

    // 双臂旋涡星尘：对数螺旋薄盘 + 内亮外深渐变
    const N = 1100;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const cInner = new THREE.Color(0xcfe0ff);
    const cOuter = new THREE.Color(0x3f7dd8);
    for (let i = 0; i < N; i++) {
      const arm = i % 2;
      const r = 0.35 + Math.pow(Math.random(), 0.65) * 4.4;
      const theta = r * 1.25 + arm * Math.PI + (Math.random() - 0.5) * 0.6;
      pos[i * 3] = Math.cos(theta) * r;
      pos[i * 3 + 1] = (Math.random() - 0.5) * (0.22 + r * 0.055);
      pos[i * 3 + 2] = Math.sin(theta) * r;
      const c = cInner.clone().lerp(cOuter, Math.min(r / 4.8, 1));
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const dustMat = new THREE.PointsMaterial({
      size: 0.07,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const swirl = new THREE.Points(geo, dustMat);
    swirl.rotation.x = 0.42; // 倾斜盘面，制造纵深
    group.add(swirl);

    // 中心光核 + 加法光晕
    const heart = new THREE.Mesh(
      new THREE.SphereGeometry(0.36, 24, 24),
      new THREE.MeshStandardMaterial({
        color: 0x2a4a8f, emissive: 0x4a78f0, emissiveIntensity: 2.0,
        metalness: 0.6, roughness: 0.35,
      })
    );
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(1.25, 24, 24),
      new THREE.MeshBasicMaterial({
        color: 0x5b8cff, transparent: true, opacity: 0.16,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    group.add(heart, halo);

    return {
      group,
      tick(t) {
        if (reducedMotion) return;
        swirl.rotation.y = t * 0.05;
        heart.rotation.y = t * 0.12;
        heart.scale.setScalar(1 + Math.sin(t * 1.2) * 0.04); // 光核微呼吸
      },
      pulse() {
        if (reducedMotion) return;
        gsap.timeline()
          .to(halo.scale, { x: 1.55, y: 1.55, z: 1.55, duration: 0.18, ease: 'power2.out' })
          .to(halo.scale, { x: 1, y: 1, z: 1, duration: 0.9, ease: 'elastic.out(1, 0.45)' })
          .to(halo.material, { opacity: 0.36, duration: 0.15 }, 0)
          .to(halo.material, { opacity: 0.16, duration: 0.8 }, 0.15);
      },
    };
  }

  const impls = { core: buildCore(), nebula: buildNebula() };
  stage.add(impls.core.group, impls.nebula.group);
  let active = impls.core;

  // ============ 场景切换（设置联动） ============
  function setScene(name) {
    const next = impls[name] || null;
    for (const [k, impl] of Object.entries(impls)) impl.group.visible = impl === next;
    active = next;
    if (next && !reducedMotion) {
      // 弹入过渡（以各组基准缩放为终点，避免覆盖 core 的 1.22 基准）
      const base = next.group.scale.x || 1;
      gsap.fromTo(next.group.scale,
        { x: base * 0.85, y: base * 0.85, z: base * 0.85 },
        { x: base, y: base, z: base, duration: 0.6, ease: 'power3.out' });
    }
  }
  // 双通道取初始值：dataset（启动）+ 事件（运行时切换）
  setScene(document.documentElement.dataset.scene3d || 'core');
  window.addEventListener('usbguard-scene', (e) => setScene(e.detail));

  // ============ GSAP 联动 1：鼠标视差（惯性阻尼） ============
  const camX = gsap.quickTo(camera.position, 'x', { duration: 1.25, ease: 'power3.out' });
  const camY = gsap.quickTo(camera.position, 'y', { duration: 1.25, ease: 'power3.out' });
  window.addEventListener('mousemove', (e) => {
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = (e.clientY / window.innerHeight) * 2 - 1;
    camX(nx * 0.95);
    camY(-ny * 0.6);
  });

  // ============ GSAP 联动 2：ScrollTrigger 滚动驱动 ============
  gsap.to(stage.rotation, {
    y: Math.PI * 1.55,
    x: 0.5,
    ease: 'none',
    scrollTrigger: {
      scroller: '#eventList',
      trigger: '#eventList',
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.8,
    },
  });
  gsap.to(pMat, {
    opacity: 0.85,
    ease: 'none',
    scrollTrigger: {
      scroller: '#eventList',
      trigger: '#eventList',
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.8,
    },
  });
  gsap.to(camera.position, {
    z: 7.2,
    ease: 'none',
    scrollTrigger: {
      scroller: '#eventList',
      trigger: '#eventList',
      start: 'top top',
      end: 'bottom bottom',
      scrub: 1,
    },
  });

  // 事件日志内容动态增长 → 防抖刷新 ScrollTrigger 的滚动测量
  setInterval(() => ScrollTrigger.refresh(), 3000);

  // ============ GSAP 联动 3：业务事件脉冲 ============
  window.addEventListener('usbguard-evt', () => {
    if (reducedMotion) return;
    if (active) active.pulse();
    // 共用灯光脉冲
    gsap.timeline()
      .to(rim, { intensity: 210, duration: 0.14 }, 0)
      .to(rim, { intensity: 110, duration: 0.9 }, 0.14);
  });

  // ============ 渲染循环 ============
  const clock = new THREE.Clock();
  function tick() {
    const t = clock.getElapsedTime();
    if (!reducedMotion) dust.rotation.y = t * 0.012;
    if (active) active.tick(t);
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();

  // ============ 尺寸自适应 ============
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    ScrollTrigger.refresh();
  });
}
