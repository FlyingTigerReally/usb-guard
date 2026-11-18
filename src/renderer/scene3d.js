import * as THREE from "./vendor/three.module.js";
import { createScreenPaint, pointerInput } from "./pointer-paint.js";
import { shaderSources } from "./shader-sources.js";

// One renderer and one RAF chain. Geometry is original and generated locally.
const canvas = document.getElementById("hero3d"),
  host = document.getElementById("visualStage"),
  html = document.documentElement;
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
let mode = html.dataset.scene3d || "core",
  quality = html.dataset.quality || "balanced",
  paused = html.dataset.motion === "paused",
  experience = false,
  progress = 0,
  teamTarget = 0;
let renderer,
  frame = 0,
  last = 0,
  time = 0,
  dirty = true,
  pulse = 0,
  width = 1,
  height = 1;
const pointer = new THREE.Vector2(),
  targetPointer = new THREE.Vector2(),
  flowPointer = new THREE.Vector2(0.5, 0.5),
  velocity = new THREE.Vector2();
const presets = { core: 0, nebula: 1, tunnel: 2, glass: 4 };
let dashboardPreview = presets[mode] || 0;
const resources = [];
const keep = (x) => (resources.push(x), x);
let shaders;
try {
  shaders = await shaderSources;
} catch (error) {
  console.warn("Local shaders unavailable", error);
  fallback();
}

const source = (name) =>
  shaders[name].replace("#include <guard_noise>", shaders["noise.glsl"]);
function fallback() {
  canvas.hidden = true;
  document.body.classList.add("no-webgl");
  html.dataset.sceneReady = "fallback";
  html.dataset.sceneAnimating = "false";
}
const probe = document.createElement("canvas"),
  context = probe.getContext("webgl2");
if (!context || !shaders) {
  fallback();
} else {
  context.getExtension("WEBGL_lose_context")?.loseContext();
  try {
    await start();
  } catch (error) {
    console.error("Guard universe:", error);
    fallback();
    renderer?.dispose();
  }
}
async function start() {
  mode = html.dataset.scene3d || mode;
  quality = html.dataset.quality || quality;
  paused = html.dataset.motion === "paused";
  dashboardPreview = presets[mode] || 0;
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "low-power",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x071f26);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x071f26);
  scene.fog = new THREE.FogExp2(0x071f26, 0.025);
  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 180);
  camera.position.set(0, 1, 12);
  scene.add(new THREE.HemisphereLight(0xe5ffe5, 0x153a51, 3));
  const key = new THREE.DirectionalLight(0xd8eee1, 4);
  key.position.set(-4, 7, 7);
  scene.add(key);
  const blue = new THREE.PointLight(0x4385ff, 65);
  blue.position.set(4, 1, 4);
  scene.add(blue);
  const groups = Array.from({ length: 7 }, () => {
    const g = new THREE.Group();
    scene.add(g);
    return g;
  });
  const common = () => ({
    uTime: { value: 0 },
    uPixel: { value: 1 },
    uPulse: { value: 0 },
    uAlpha: { value: 1 },
    uPointer: { value: pointer },
    uColor: { value: new THREE.Color(0x74a795) },
  });
  const shaderMaterials = [];
  function shader(vert, frag, uniforms, extra = {}) {
    const m = keep(
      new THREE.ShaderMaterial({
        vertexShader: source(vert),
        fragmentShader: source(frag),
        uniforms,
        ...extra,
      }),
    );
    shaderMaterials.push(m);
    return m;
  }
  function points(positions, material, attributes = {}) {
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    for (const [name, array] of Object.entries(attributes))
      g.setAttribute(
        name,
        new THREE.Float32BufferAttribute(
          array,
          ["aSeed", "aShade"].includes(name) ? 1 : 3,
        ),
      );
    const mesh = new THREE.Points(g, material);
    mesh.frustumCulled = false;
    return mesh;
  }
  const valleyPositions = [];
  const n = quality === "low" ? 120 : 190;
  for (let z = 0; z < n; z++)
    for (let x = 0; x < n; x++)
      valleyPositions.push(
        (x / (n - 1) - 0.5) * 30,
        -3,
        (z / (n - 1) - 0.5) * 44,
      );
  const valleyMat = shader("valley.vert.glsl", "points.frag.glsl", common(), {
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const valley = points(valleyPositions, valleyMat);
  valley.rotation.y = 0.15;
  valley.position.z = -8;
  groups[0].add(valley);
  // Sample sphere and capsule surfaces to create a humanoid signal guardian.
  const personPositions = [];
  let seed = 7231;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  function sampleEllipsoid(out, c, r, count) {
    for (let i = 0; i < count; i++) {
      const y = random() * 2 - 1,
        a = random() * Math.PI * 2,
        s = Math.sqrt(1 - y * y);
      out.push(
        c[0] + Math.cos(a) * s * r[0],
        c[1] + y * r[1],
        c[2] + Math.sin(a) * s * r[2],
      );
    }
  }
  sampleEllipsoid(personPositions, [0, 1.7, 0], [0.38, 0.47, 0.35], 1300);
  sampleEllipsoid(personPositions, [0, 0.5, 0], [0.65, 0.85, 0.34], 2400);
  for (const sign of [-1, 1]) {
    sampleEllipsoid(
      personPositions,
      [sign * 0.76, 0.2, 0],
      [0.2, 0.82, 0.21],
      1100,
    );
    sampleEllipsoid(
      personPositions,
      [sign * 0.3, -1.05, 0],
      [0.24, 1, 0.25],
      1400,
    );
  }
  const personU = common();
  personU.uTeam = { value: 0 };
  personU.uColor.value.set(0xa9d8b9);
  const person = points(
    personPositions,
    shader("morph.vert.glsl", "morph.frag.glsl", personU, {
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    {
      aFace1: personPositions,
      aFace2: personPositions,
      aSeed: Array.from({ length: personPositions.length / 3 }, () => random()),
      aShade: Array.from({ length: personPositions.length / 3 }, () => 1),
    },
  );
  person.position.set(1.6, -0.3, -0.6);
  person.scale.setScalar(0.78);
  groups[0].add(person);
  // Three distinct portrait surfaces share sample coordinates, so every point morphs coherently.

  const faces = [[], [], []],
    seeds = [],
    shades = [];
  const faceCount = quality === "low" ? 13000 : 26000;
  for (let i = 0; i < faceCount; i++) {
    const angle = (random() - 0.5) * Math.PI,
      v = random() * 2 - 1,
      s = Math.sqrt(1 - v * v);
    const x = Math.sin(angle) * s,
      y = v,
      z = Math.cos(angle) * s;
    const body = i > faceCount * 0.82,
      neck = i > faceCount * 0.72 && !body;
    const eyeShape = Math.exp(
      -((Math.abs(x) - 0.37) ** 2 * 85 + (y - 0.18) ** 2 * 200),
    );
    const brow = Math.exp(
      -((Math.abs(x) - 0.37) ** 2 * 65 + (y - 0.33) ** 2 * 600),
    );
    const mouth = Math.exp(-(x * x * 20 + (y + 0.43) ** 2 * 700));
    const nostril = Math.exp(
      -((Math.abs(x) - 0.11) ** 2 * 450 + (y + 0.17) ** 2 * 1000),
    );
    const shade = body
      ? 0.45
      : neck
        ? 0.6
        : Math.max(
            0.015,
            1 - eyeShape * 0.94 - brow * 0.87 - mouth * 0.8 - nostril * 0.9,
          );
    seeds.push(random());
    shades.push(shade);
    for (let j = 0; j < 3; j++) {
      if (body) {
        const bx = (random() - 0.5) * 4;
        faces[j].push(
          bx,
          -1.55 - Math.abs(bx) * 0.18 - random() * 0.6,
          Math.cos(bx * 0.8) * 0.3 - 0.25,
        );
        continue;
      }
      if (neck) {
        faces[j].push(x * 0.45, -1.1 - (y + 1) * 0.38, z * 0.45 - 0.05);
        continue;
      }
      const front = Math.max(0, z);
      const noseBridge =
        Math.exp(-(x * x * 75 + (y + 0.01) ** 2 * 9)) * 0.44 * front;
      const noseTip =
        Math.exp(-(x * x * 55 + (y + 0.12) ** 2 * 85)) * 0.55 * front;
      const cheeks =
        Math.exp(-((Math.abs(x) - 0.5) ** 2 * 25 + (y + 0.16) ** 2 * 30)) *
        0.14 *
        front;
      const eyeSocket = eyeShape * 0.24 * front;
      const lips =
        Math.exp(-(x * x * 17 + (y + 0.4) ** 2 * 180)) * 0.16 * front;
      const jaw = 1 - Math.max(0, -y) * (0.22 + j * 0.04);
      const hair = Math.max(0, y - 0.58) * (j === 1 ? 0.18 : 0.5);
      faces[j].push(
        x * (1.23 + j * 0.08) * jaw,
        y * (1.65 - j * 0.08) + hair,
        z * (0.91 + j * 0.08) +
          noseBridge +
          noseTip +
          cheeks -
          eyeSocket +
          lips,
      );
    }
  }
  const faceU = common();
  faceU.uTeam = { value: 0 };
  faceU.uColor.value.set(0xb3d9ac);
  const face = points(
    faces[0],
    shader("morph.vert.glsl", "morph.frag.glsl", faceU, {
      transparent: true,
      depthWrite: true,
      blending: THREE.NormalBlending,
    }),
    { aFace1: faces[1], aFace2: faces[2], aSeed: seeds, aShade: shades },
  );
  face.position.set(2.5, 0.2, 0);
  face.scale.setScalar(1.45);
  groups[1].add(face);
  const orbitMat = keep(
    new THREE.LineBasicMaterial({
      color: 0x81b49b,
      transparent: true,
      opacity: 0.28,
    }),
  );
  function orbit(radius, y, group) {
    const pts = [];
    for (let i = 0; i <= 180; i++) {
      const a = (i / 180) * Math.PI * 2;
      pts.push(
        new THREE.Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius),
      );
    }
    const line = new THREE.Line(
      keep(new THREE.BufferGeometry().setFromPoints(pts)),
      orbitMat,
    );
    group.add(line);
    return line;
  }
  orbit(2.3, -2.5, groups[1]).position.x = 2.5;
  // A physically deep cylinder with shader ring and rail animation.
  const tunnelU = {
    uTime: { value: 0 },
    uScroll: { value: 0 },
    uAlpha: { value: 1 },
  };
  const tunnel = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(5, 5, 100, 96, 1, true)),
    shader("tunnel.vert.glsl", "tunnel.frag.glsl", tunnelU, {
      side: THREE.BackSide,
      transparent: true,
    }),
  );
  tunnel.rotation.x = Math.PI / 2;
  tunnel.position.z = -34;
  groups[2].add(tunnel);
  const tunnelEnd = new THREE.Mesh(
    keep(new THREE.SphereGeometry(0.65, 24, 16)),
    keep(new THREE.MeshBasicMaterial({ color: 0xd1e7ad })),
  );
  tunnelEnd.position.z = -70;
  groups[2].add(tunnelEnd);
  // Original stylized astronaut: articulated suit, visor, oxygen pack, boot soles.
  const astronaut = new THREE.Group();
  astronaut.position.set(2.5, -0.1, 0);
  groups[3].add(astronaut);
  const suit = keep(
    new THREE.MeshStandardMaterial({
      color: 0xdce9d7,
      roughness: 0.38,
      metalness: 0.18,
    }),
  );
  const seam = keep(
    new THREE.MeshStandardMaterial({
      color: 0x214842,
      roughness: 0.55,
      metalness: 0.4,
    }),
  );
  const visor = keep(
    new THREE.MeshPhysicalMaterial({
      color: 0x102f39,
      metalness: 0.9,
      roughness: 0.12,
      clearcoat: 1,
    }),
  );
  const blueMat = keep(
    new THREE.MeshStandardMaterial({
      color: 0x668df3,
      emissive: 0x214ca2,
      emissiveIntensity: 0.4,
      metalness: 0.5,
      roughness: 0.3,
    }),
  );
  function ellipsoid(parent, c, r, mat) {
    const mesh = new THREE.Mesh(keep(new THREE.SphereGeometry(1, 40, 28)), mat);
    mesh.position.set(...c);
    mesh.scale.set(...r);
    parent.add(mesh);
    return mesh;
  }
  function capsule(parent, c, r, len, mat, angle = 0) {
    const mesh = new THREE.Mesh(
      keep(new THREE.CapsuleGeometry(r, len, 8, 18)),
      mat,
    );
    mesh.position.set(...c);
    mesh.rotation.z = angle;
    parent.add(mesh);
    return mesh;
  }
  ellipsoid(astronaut, [0, 0.25, 0], [0.74, 0.95, 0.48], suit);
  ellipsoid(astronaut, [0, 1.45, 0], [0.79, 0.8, 0.72], suit);
  ellipsoid(astronaut, [0, 1.48, 0.39], [0.66, 0.57, 0.43], visor);
  ellipsoid(astronaut, [-0.26, 1.75, 0.74], [0.19, 0.06, 0.02], blueMat);
  capsule(astronaut, [0, 0.9, 0], 0.57, 0.1, seam, Math.PI / 2);
  const pack = new THREE.Mesh(keep(new THREE.BoxGeometry(1.1, 1.3, 0.6)), seam);
  pack.position.set(0, 0.3, -0.55);
  astronaut.add(pack);
  for (const sign of [-1, 1]) {
    capsule(astronaut, [sign * 0.95, 0.25, 0], 0.25, 0.75, suit, sign * 0.35);
    ellipsoid(astronaut, [sign * 1.14, -0.35, 0.07], [0.26, 0.3, 0.27], seam);
    capsule(astronaut, [sign * 0.37, -1.02, 0], 0.31, 0.85, suit, sign * -0.1);
    ellipsoid(astronaut, [sign * 0.43, -1.7, 0.19], [0.35, 0.23, 0.48], seam);
    ellipsoid(astronaut, [sign * 0.37, -1.15, 0.29], [0.2, 0.2, 0.08], blueMat);
  }
  const chest = new THREE.Mesh(
    keep(new THREE.BoxGeometry(0.6, 0.43, 0.12)),
    blueMat,
  );
  chest.position.set(0, 0.42, 0.48);
  astronaut.add(chest);
  for (let i = 0; i < 3; i++)
    ellipsoid(
      astronaut,
      [-0.18 + i * 0.18, 0.42, 0.56],
      [0.035, 0.035, 0.02],
      suit,
    );
  const tetherCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(2, -1, -0.5),
    new THREE.Vector3(4, -2, -1),
    new THREE.Vector3(5, 0, -3),
    new THREE.Vector3(8, 1, -5),
  ]);
  groups[3].add(
    new THREE.Mesh(
      keep(new THREE.TubeGeometry(tetherCurve, 64, 0.022, 8, false)),
      blueMat,
    ),
  );
  // Render the environment first, then use it for chromatically separated refraction.
  const backdrop = keep(
    new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true }),
  );
  const sceneTarget = keep(
    new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true }),
  );
  const glassU = {
    uBackdrop: { value: backdrop.texture },
    uTime: { value: 0 },
    uAlpha: { value: 1 },
  };
  const glassMat = shader("glass.vert.glsl", "glass.frag.glsl", glassU, {
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const glassGroup = new THREE.Group();
  glassGroup.position.set(2.5, 0, 0);
  groups[4].add(glassGroup);

  const shards = [];
  const shieldOutline = [
    [0, 2.1],
    [1.2, 1.68],
    [1.65, 1.2],
    [1.5, 0.1],
    [1.1, -0.9],
    [0, -2.05],
    [-1.1, -0.9],
    [-1.5, 0.1],
    [-1.65, 1.2],
    [-1.2, 1.68],
  ];
  for (let i = 0; i < shieldOutline.length; i++) {
    const p = shieldOutline[i],
      q = shieldOutline[(i + 1) % shieldOutline.length],
      cx = (p[0] + q[0]) / 3,
      cy = (p[1] + q[1]) / 3;
    const shape = new THREE.Shape();
    shape.moveTo(-cx, -cy);
    shape.lineTo(p[0] - cx, p[1] - cy);
    shape.lineTo(q[0] - cx, q[1] - cy);
    shape.closePath();
    const geometry = keep(
      new THREE.ExtrudeGeometry(shape, {
        depth: 0.12,
        bevelEnabled: true,
        bevelSegments: 1,
        steps: 1,
        bevelSize: 0.014,
        bevelThickness: 0.015,
      }),
    );
    const shard = new THREE.Mesh(geometry, glassMat);
    const base = new THREE.Vector3(cx, cy, 0.12 + Math.cos(i * 2) * 0.06);
    shard.position.copy(base);
    glassGroup.add(shard);
    const edge = new THREE.LineSegments(
      keep(new THREE.EdgesGeometry(geometry)),
      keep(
        new THREE.LineBasicMaterial({
          color: 0xb3e4dc,
          transparent: true,
          opacity: 0.4,
        }),
      ),
    );
    shard.add(edge);
    shards.push({ shard, base, a: Math.atan2(cy, cx) });
  }
  const glassCore = new THREE.Mesh(
    keep(new THREE.IcosahedronGeometry(0.72, 0)),
    keep(blueMat.clone()),
  );
  glassCore.position.z = -0.4;
  glassGroup.add(glassCore);
  const glassOrbit = orbit(2.7, 0, groups[4]);
  glassOrbit.rotation.x = Math.PI / 2;
  glassOrbit.position.set(2.5, 0, -2);
  // A sparse field gives the capability and badge chapters a quiet depth layer.
  for (let g = 3; g < 7; g++) {
    const dust = [];
    for (let i = 0; i < 550; i++)
      dust.push(
        (random() - 0.5) * 35,
        (random() - 0.5) * 20,
        -random() * 35 - 5,
      );
    groups[g].add(
      points(
        dust,
        keep(
          new THREE.PointsMaterial({
            size: 0.035,
            color: 0x8dbba7,
            transparent: true,
            opacity: 0.45,
            depthWrite: false,
          }),
        ),
      ),
    );
  }
  const halo = new THREE.Mesh(
    keep(new THREE.TorusGeometry(3, 0.018, 8, 128)),
    keep(blueMat.clone()),
  );
  halo.position.set(3, 0, -3);
  groups[5].add(halo);
  orbit(5, -2, groups[6]);
  orbit(6, -2.1, groups[6]);
  const screenScene = new THREE.Scene(),
    screenCamera = new THREE.Camera();
  const pointerPaint = createScreenPaint(renderer, shaders);
  let paintWasActive = false;
  const screenU = {
    uScene: { value: sceneTarget.texture },
    uPaint: { value: pointerPaint.texture },
    uPaintTexel: { value: pointerPaint.texel },
    uPaintRect: { value: new THREE.Vector4() },
    uTime: { value: 0 },
    uStrength: { value: 1 },
  };
  const screenMat = shader("screen.vert.glsl", "screen.frag.glsl", screenU);
  const quad = new THREE.Mesh(keep(new THREE.PlaneGeometry(2, 2)), screenMat);
  screenScene.add(quad);
  function resize() {
    const r = host.getBoundingClientRect();
    width = Math.max(1, r.width);
    height = Math.max(1, r.height);
    const ratio =
      quality === "low"
        ? 1
        : Math.min(devicePixelRatio, quality === "high" ? 2 : 1.5);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    sceneTarget.setSize(Math.round(width * ratio), Math.round(height * ratio));
    backdrop.setSize(
      Math.round(width * ratio * 0.7),
      Math.round(height * ratio * 0.7),
    );
    pointerPaint.resize(innerWidth, Math.max(1, innerHeight - 36), quality);
    screenU.uPaintRect.value.set(
      r.left / innerWidth,
      (innerHeight - r.bottom) / Math.max(1, innerHeight - 36),
      r.width / innerWidth,
      r.height / Math.max(1, innerHeight - 36),
    );
    for (const mat of shaderMaterials)
      if (mat.uniforms.uPixel) mat.uniforms.uPixel.value = ratio;
    dirty = true;
    wake();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  function render(now) {
    frame = 0;
    if (document.hidden || mode === "off") return;

    if (!dirty && now - last < 1000 / (quality === "high" ? 60 : 30) - 1) {
      frame = requestAnimationFrame(render);
      return;
    }
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    const animate = !paused && !reduced.matches;
    if (animate) {
      time += dt;
      pulse *= Math.exp(-dt * 2.5);
    }
    const activeProgress = experience ? progress : dashboardPreview;
    const chapter = Math.max(0, Math.min(6, Math.round(activeProgress)));
    html.dataset.chapter = String(chapter);

    groups.forEach((g, i) => {
      const distance = activeProgress - i,
        weight = Math.max(0, 1 - Math.abs(distance));
      g.visible = weight > 0.005;
      g.position.z = -Math.abs(distance) * 8;
      g.position.x = -distance * 2;
      if (g.visible)
        g.traverse((object) => {
          const m = object.material;
          if (!m) return;
          if (m.uniforms?.uAlpha) m.uniforms.uAlpha.value = weight;
          else {
            m.transparent = true;
            m.userData.guardOpacity ??= m.opacity;
            m.opacity = weight * m.userData.guardOpacity;
          }
        });
    });
    pointer.lerp(targetPointer, reduced.matches ? 1 : 0.1);
    camera.position.set(pointer.x * 0.42, pointer.y * 0.3 + 1, 12);
    camera.lookAt(experience ? 0 : 0.4, 0.1, -2);
    const wide = width / height > 1.2;
    const offset = experience && wide ? 2.8 : experience ? 1.7 : 1;
    face.position.x = offset;
    astronaut.position.x = offset;
    glassGroup.position.x = offset;
    person.position.x = experience ? offset : 1.4;
    if (!experience) {
      face.scale.setScalar(1.1);
      face.position.y = -1;
      astronaut.scale.setScalar(0.9);
      glassGroup.scale.setScalar(0.85);
    } else {
      face.scale.setScalar(1.45);
      face.position.y = 0.2;
      astronaut.scale.setScalar(1.1);
      glassGroup.scale.setScalar(1.15);
    }
    for (const mat of shaderMaterials) {
      if (mat.uniforms.uTime) mat.uniforms.uTime.value = time;
      if (mat.uniforms.uPulse) mat.uniforms.uPulse.value = pulse;
    }
    faceU.uTeam.value +=
      (teamTarget - faceU.uTeam.value) * (reduced.matches ? 1 : 0.09);
    face.rotation.y = pointer.x * 0.25 + Math.sin(time * 0.18) * 0.1;
    person.rotation.y = Math.sin(time * 0.2) * 0.3;
    person.position.y = -0.2 + Math.sin(time * 0.7) * 0.08;
    valley.position.z = -8 + (experience ? Math.min(1, activeProgress) * 3 : 0);
    tunnelU.uScroll.value = activeProgress;
    tunnel.rotation.z = pointer.x * 0.05 + time * 0.018;
    astronaut.rotation.set(
      Math.sin(time * 0.7) * 0.08,
      pointer.x * 0.25 - 0.2,
      Math.sin(time * 0.4) * 0.1 + 0.12,
    );
    astronaut.position.y = Math.sin(time * 0.75) * 0.18;
    glassGroup.rotation.y = pointer.x * 0.3 + time * 0.08;
    glassGroup.rotation.z = Math.sin(time * 0.25) * 0.08;
    const opening = experience
      ? Math.max(0, Math.min(1, activeProgress - 4)) * 4
      : 0.03;
    for (const { shard, base, a } of shards) {
      shard.position.set(
        base.x + Math.cos(a) * opening,
        base.y + Math.sin(a) * opening,
        base.z + opening * 0.35,
      );
      shard.rotation.y = opening * Math.cos(a) * 0.5;
      shard.rotation.x = opening * Math.sin(a) * 0.3;
    }
    halo.rotation.set(time * 0.08, time * 0.12, 0.2);
    const paintActive =
      html.dataset.pointerEffect !== "off" &&
      !reduced.matches &&
      now - pointerInput.lastMove < 3200;
    if (paintActive) pointerPaint.update(dt);
    else if (paintWasActive) pointerPaint.clear();
    paintWasActive = paintActive;
    screenU.uPaint.value = pointerPaint.texture;
    velocity.multiplyScalar(0.65);
    if (groups[4].visible) {
      glassGroup.visible = false;
      renderer.setRenderTarget(backdrop);
      renderer.render(scene, camera);
      glassGroup.visible = true;
    }
    renderer.setRenderTarget(sceneTarget);
    renderer.render(scene, camera);
    quad.material = screenMat;
    screenU.uTime.value = time;
    screenU.uStrength.value =
      reduced.matches || html.dataset.pointerEffect === "off" ? 0 : 1;
    renderer.setRenderTarget(null);
    renderer.render(screenScene, screenCamera);
    html.dataset.sceneReady = "true";
    dirty = false;

    const settling =
      (html.dataset.pointerEffect !== "off" &&
        !reduced.matches &&
        now - pointerInput.lastMove < 3200) ||
      velocity.lengthSq() > 0.00001 ||
      pointer.distanceToSquared(targetPointer) > 0.00001 ||
      (groups[1].visible && Math.abs(teamTarget - faceU.uTeam.value) > 0.002);
    html.dataset.sceneAnimating = String(animate || settling);
    if (animate || settling) frame = requestAnimationFrame(render);
  }
  function wake() {
    dirty = true;
    if (!frame && !document.hidden && mode !== "off") {
      html.dataset.sceneAnimating = "true";
      last = performance.now();
      frame = requestAnimationFrame(render);
    }
  }
  host.addEventListener("pointermove", (e) => {
    const r = host.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width,
      y = 1 - (e.clientY - r.top) / r.height;
    velocity.set(x - flowPointer.x, y - flowPointer.y).clampLength(0, 0.15);
    flowPointer.set(x, y);
    targetPointer.set((x - 0.5) * 2, (y - 0.5) * 2);
    wake();
  });
  host.addEventListener("pointerleave", () => {
    targetPointer.set(0, 0);
    wake();
  });
  // Experience text overlays the canvas, so capture its pointer events on the parent.
  document
    .getElementById("experienceView")
    .addEventListener("pointermove", (e) => {
      const r = host.getBoundingClientRect();
      if (!experience) return;
      const x = (e.clientX - r.left) / r.width,
        y = 1 - (e.clientY - r.top) / r.height;
      velocity.set(x - flowPointer.x, y - flowPointer.y).clampLength(0, 0.15);
      flowPointer.set(x, y);
      targetPointer.set((x - 0.5) * 2, (y - 0.5) * 2);
      wake();
    });
  window.addEventListener("usbguard-view", (e) => {
    experience = e.detail === "experience";
    resize();
  });
  window.addEventListener("usbguard-progress", (e) => {
    progress = e.detail;
    wake();
  });
  window.addEventListener("usbguard-preview", (e) => {
    dashboardPreview = e.detail;
    wake();
  });
  window.addEventListener("usbguard-pointer-input", wake);
  window.addEventListener("usbguard-pointer-toggle", () => {
    pointerPaint.clear();
    wake();
  });
  window.addEventListener("usbguard-team", (e) => {
    teamTarget = e.detail;
    wake();
  });
  window.addEventListener("usbguard-scene", (e) => {
    mode = e.detail;
    dashboardPreview = presets[mode] || 0;
    canvas.hidden = mode === "off";
    if (mode === "off") {
      cancelAnimationFrame(frame);
      frame = 0;
    } else wake();
  });
  window.addEventListener("usbguard-quality", (e) => {
    quality = e.detail;
    resize();
  });
  window.addEventListener("usbguard-motion", (e) => {
    paused = e.detail;
    if (paused) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    wake();
  });
  window.addEventListener("usbguard-evt", () => {
    pulse = 1.5;
    wake();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else wake();
  });
  reduced.addEventListener("change", wake);
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    cancelAnimationFrame(frame);
    frame = 0;
    fallback();
  });
  window.addEventListener(
    "beforeunload",
    () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      pointerPaint.dispose();
      resources.forEach((r) => r.dispose());
      renderer.dispose();
    },
    { once: true },
  );
  canvas.hidden = mode === "off";
  resize();
  wake();
}
