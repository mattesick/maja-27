// world.js – Maja-expressen 3D world: terrain, track, train, 19 stops, fx, time of day.
// Agent B. Plain ES module, depends only on three + vendored addons.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp, smooth = THREE.MathUtils.smoothstep;
const TAU = Math.PI * 2;
const ease = {
  linear: p => p,
  inOut: p => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2,
  out: p => 1 - Math.pow(1 - p, 3),
  in: p => p * p * p,
  back: p => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); },
  bounce: p => { const n = 7.5625, d = 2.75; if (p < 1 / d) return n * p * p; if (p < 2 / d) return n * (p -= 1.5 / d) * p + .75; if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + .9375; return n * (p -= 2.625 / d) * p + .984375; },
};
// deterministic RNG so the world looks the same every load
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = rng(27);
const rr = (a, b) => a + (b - a) * R();
const pick = arr => arr[Math.floor(R() * arr.length)];

const C = {
  night: '#24122b', paper: '#f8f0e3', wine: '#8c1d40', gold: '#f0b43c', rose: '#ff8fa3', sage: '#5f8466', falu: '#9e2a22',
  white: '#fbf6ee', trim: '#f4ece0', roof: '#4a3640', dark: '#2e2229', steel: '#8e8a92', wood: '#a8774f', woodD: '#7a5236',
  woodL: '#d3a878', stone: '#cfc6b8', stoneD: '#a99f92', grass: '#7f9a62', grassD: '#5d7a4c', hay: '#e2bd6a', straw: '#d9b25e',
  yellow: '#f2cf63', mint: '#bfe3d0', sky: '#bcdcf0', plum: '#4a2a4f', cream: '#fff4dc', black: '#2a2628', pink: '#f7a9bc',
  orange: '#e8833a', red: '#d23c36', blue: '#5b8fc7', brown: '#7b5236', ginger: '#b5642c', lamb: '#2a2628', grey: '#b9b4b0',
};
const PALETTE_AUTUMN = ['#e8833a', '#f0b43c', '#d6532e', '#f2cf63', '#c9442c', '#e9a23b', '#b8b04a'];

// ---------------------------------------------------------------------------------------------- materials
// One Lambert material family with vertex colours. Station materials get a uSat uniform (locked = desaturated).
function makeVCMaterial(extra = {}) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, ...extra });
  m.userData.uSat = { value: 1 };
  m.onBeforeCompile = sh => {
    sh.uniforms.uSat = m.userData.uSat;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSat;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n{ float l = dot(diffuseColor.rgb, vec3(.299,.587,.114)); diffuseColor.rgb = mix(vec3(l)*vec3(1.02,1.0,.98), diffuseColor.rgb, uSat) * mix(.8, 1., uSat); }');
  };
  m.customProgramCacheKey = () => 'vcsat';
  return m;
}

// ---------------------------------------------------------------------------------------------- geometry builder
// Collect coloured primitives in a local frame, merge into one BufferGeometry (one draw call).
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
function prep(geo, color, matrix) {
  let g = geo.index ? geo : geo; // keep
  g = g.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.index) { const n = g.attributes.position.count, idx = new (n > 65535 ? Uint32Array : Uint16Array)(n); for (let i = 0; i < n; i++) idx[i] = i; g.setIndex(new THREE.BufferAttribute(idx, 1)); }
  if (matrix) g.applyMatrix4(matrix);
  const col = new THREE.Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
function mat4(p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  _e.set(r[0], r[1], r[2]); _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_v.set(p[0], p[1], p[2]), _q, _s.set(s[0], s[1], s[2]));
}
const G = {
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  rbox: (w, h, d, r = .08, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - .001, h / 2 - .001, d / 2 - .001)),
  cyl: (rt, rb, h, seg = 12, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open),
  cone: (r, h, seg = 10) => new THREE.ConeGeometry(r, h, seg),
  sph: (r, ws = 12, hs = 9, ...a) => new THREE.SphereGeometry(r, ws, hs, ...a),
  ico: (r, d = 1) => new THREE.IcosahedronGeometry(r, d),
  tor: (r, t, rs = 8, ts = 20, arc = TAU) => new THREE.TorusGeometry(r, t, rs, ts, arc),
  plane: (w, h) => new THREE.PlaneGeometry(w, h),
  circ: (r, s = 20) => new THREE.CircleGeometry(r, s),
};
class Builder {
  constructor() { this.parts = []; }
  // add(geometry, colour, position[], rotation[], scale[])
  add(geo, color, p, r, s) { this.parts.push(prep(geo, color, mat4(p, r, s))); return this; }
  addM(geo, color, matrix) { this.parts.push(prep(geo, color, matrix)); return this; }
  get empty() { return this.parts.length === 0; }
  geometry() { const g = mergeGeometries(this.parts, false); g.computeBoundingSphere(); return g; }
  mesh(material, { cast = true, receive = true } = {}) {
    const m = new THREE.Mesh(this.geometry(), material); m.castShadow = cast; m.receiveShadow = receive; return m;
  }
}

// common little models (added into a builder at an offset)
function bAddHouse(b, { x = 0, z = 0, w = 4, d = 3, h = 2.6, ry = 0, wall = C.falu, roof = C.roof, trim = C.white, glow, door = C.white, chimney = true, windows = 2 }) {
  const M = mat4([x, 0, z], [0, ry, 0]);
  const add = (geo, col, p, r, s) => b.addM(geo, col, M.clone().multiply(mat4(p, r, s)));
  add(G.box(w, h, d), wall, [0, h / 2, 0]);
  // gable roof as a 3-sided prism (extruded triangle)
  const rh = d * .45, sh = new THREE.Shape([new THREE.Vector2(-d / 2 - .25, 0), new THREE.Vector2(d / 2 + .25, 0), new THREE.Vector2(0, rh + .1)]);
  const roofG = new THREE.ExtrudeGeometry(sh, { depth: w + .4, bevelEnabled: false });
  add(roofG, roof, [-(w + .4) / 2, h, 0], [0, Math.PI / 2, 0]);
  const gab = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, rh - .05)]);
  const gabG = new THREE.ExtrudeGeometry(gab, { depth: w - .02, bevelEnabled: false });
  add(gabG, wall, [-(w - .02) / 2, h, 0], [0, Math.PI / 2, 0]);
  // white corner trims
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(G.box(.14, h, .14), trim, [sx * w / 2, h / 2, sz * d / 2]);
  add(G.box(w + .1, .12, d + .1), trim, [0, h, 0]);
  if (chimney) add(G.box(.4, .9, .4), C.stoneD, [w * .25, h + rh * .7, -d * .1]);
  // front (+z) door and windows
  add(G.box(.8, 1.5, .1), door, [-w * .18, .75, d / 2 + .02]);
  add(G.box(.95, .1, .14), trim, [-w * .18, 1.52, d / 2 + .03]);
  const wins = [];
  const wx = windows === 2 ? [w * .22] : windows === 3 ? [w * .2, w * .38] : [w * .26];
  for (const xx of wx) wins.push([xx, h * .55, d / 2 + .02, 0]);
  wins.push([-w * .3, h * .55, -d / 2 - .02, Math.PI], [w * .25, h * .55, -d / 2 - .02, Math.PI]);
  wins.push([w / 2 + .02, h * .55, 0, Math.PI / 2], [-w / 2 - .02, h * .55, 0, -Math.PI / 2]);
  for (const [xx, yy, zz, rot] of wins) {
    add(G.box(.86, .86, .08), trim, [xx, yy, zz], [0, rot, 0]);
    if (glow) glow.addM(G.plane(.64, .64), '#ffffff', M.clone().multiply(mat4([xx + Math.sin(rot) * .05, yy, zz + Math.cos(rot) * .05], [0, rot, 0])));
    add(G.box(.06, .7, .1), trim, [xx + Math.sin(rot) * .03, yy, zz + Math.cos(rot) * .03], [0, rot, 0]);
  }
}
function bAddTree(b, x, z, { h = 3.2, kind = 'birch', col, s = 1 } = {}) {
  if (kind === 'spruce') {
    b.add(G.cyl(.12 * s, .16 * s, .8 * s, 6), C.woodD, [x, .4 * s, z]);
    const green = col || '#3f6447';
    b.add(G.cone(1.15 * s, 1.7 * s, 8), green, [x, 1.4 * s, z]);
    b.add(G.cone(.9 * s, 1.4 * s, 8), green, [x, 2.2 * s, z]);
    b.add(G.cone(.6 * s, 1.1 * s, 8), green, [x, 2.95 * s, z]);
  } else {
    b.add(G.cyl(.1 * s, .14 * s, h * .6 * s, 6), '#efeae2', [x, h * .3 * s, z]);
    b.add(G.box(.05 * s, .08 * s, .3 * s), '#3a3335', [x + .1 * s, h * .3 * s, z]);
    const c = col || pick(PALETTE_AUTUMN);
    b.add(G.ico(1.0 * s, 1), c, [x, h * .72 * s, z], [0, 0, 0], [1, 1.15, 1]);
    b.add(G.ico(.62 * s, 1), c, [x + .55 * s, h * .62 * s, z + .2 * s]);
  }
}
function bAddBush(b, x, z, s = 1, col = '#6f8f55') {
  b.add(G.ico(.55 * s, 1), col, [x, .4 * s, z]);
  b.add(G.ico(.42 * s, 1), col, [x + .45 * s, .3 * s, z + .1 * s]);
  b.add(G.ico(.38 * s, 1), col, [x - .4 * s, .28 * s, z + .15 * s]);
}
function bAddFence(b, x0, z0, x1, z1, { h = .9, col = C.white, step = 1.1 } = {}) {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / step)), ang = Math.atan2(-(z1 - z0), x1 - x0);
  for (let i = 0; i <= n; i++) { const t = i / n; b.add(G.box(.12, h, .12), col, [lerp(x0, x1, t), h / 2, lerp(z0, z1, t)], [0, ang, 0]); }
  for (const yy of [h * .45, h * .85]) b.add(G.box(len, .08, .06), col, [(x0 + x1) / 2, yy, (z0 + z1) / 2], [0, ang, 0]);
}
function bAddLamp(b, glow, x, z, h = 2.6) {
  b.add(G.cyl(.05, .07, h, 6), C.dark, [x, h / 2, z]);
  b.add(G.cyl(.16, .12, .08, 8), C.dark, [x, .04, z]);
  b.add(G.cone(.24, .2, 8), C.dark, [x, h + .32, z]);
  glow.add(G.sph(.15, 8, 6), '#fff', [x, h + .12, z]);
}
function bAddBench(b, x, z, ry = 0, col = C.wood) {
  const M = mat4([x, 0, z], [0, ry, 0]);
  const add = (g, c, p, r) => b.addM(g, c, M.clone().multiply(mat4(p, r)));
  add(G.box(1.5, .08, .45), col, [0, .45, 0]);
  add(G.box(1.5, .4, .07), col, [0, .75, -.22], [-.15, 0, 0]);
  for (const sx of [-.65, .65]) { add(G.box(.07, .45, .4), C.dark, [sx, .22, 0]); }
}
function bAddBalloon(b, x, y, z, col) {
  b.add(G.sph(.28, 12, 10), col, [x, y, z], [0, 0, 0], [1, 1.18, 1]);
  b.add(G.cone(.06, .1, 6), col, [x, y - .36, z], [Math.PI, 0, 0]);
  b.add(G.cyl(.008, .008, 1.2, 3), '#eeeeee', [x, y - 1.0, z]);
}

// ---------------------------------------------------------------------------------------------- canvas text
const FONT = '"Fredoka", "Shantell Sans", system-ui, sans-serif';
const redrawers = [];
function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const redraw = () => { const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, w, h); draw(ctx, w, h); tex.needsUpdate = true; };
  redraw(); redrawers.push(redraw);
  return { tex, canvas: cv, redraw, setDraw(fn) { draw = fn; redraw(); } };
}
function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
function fitText(ctx, text, maxW, size, weight = 600, font = FONT) {
  let s = size; ctx.font = `${weight} ${s}px ${font}`;
  while (ctx.measureText(text).width > maxW && s > 8) { s -= 2; ctx.font = `${weight} ${s}px ${font}`; }
  return s;
}
// A flat sign board: plane with canvas texture. Material glows a bit at dusk (registered in signMats).
const signMats = [];
function makeSignMesh(w, h, draw, { px = 256, double = false } = {}) {
  const cw = Math.round(px * w), ch = Math.round(px * h);
  const ct = canvasTex(cw, ch, draw);
  const mat = new THREE.MeshLambertMaterial({ map: ct.tex, emissive: '#ffffff', emissiveMap: ct.tex, emissiveIntensity: .12, transparent: true, alphaTest: .02, side: double ? THREE.DoubleSide : THREE.FrontSide });
  signMats.push(mat);
  const mesh = new THREE.Mesh(G.plane(w, h), mat);
  mesh.userData.ct = ct;
  return mesh;
}
function drawBoard(text, { bg = C.wine, fg = C.paper, border = C.gold, size = .62, font = FONT, weight = 600, radius = .18, sub, subCol } = {}) {
  return (ctx, w, h) => {
    const r = Math.min(w, h) * radius, bw = Math.max(4, h * .07);
    if (bg) { rrect(ctx, bw / 2, bw / 2, w - bw, h - bw, r); ctx.fillStyle = bg; ctx.fill(); if (border) { ctx.lineWidth = bw; ctx.strokeStyle = border; ctx.stroke(); } }
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const main = sub ? h * .58 : h; const s = fitText(ctx, text, w * .86, Math.round(main * size), weight, font);
    ctx.fillText(text, w / 2, (sub ? h * .4 : h * .53) + s * .02);
    if (sub) { ctx.fillStyle = subCol || fg; fitText(ctx, sub, w * .86, Math.round(h * .26), 500, font); ctx.fillText(sub, w / 2, h * .76); }
  };
}

// ---------------------------------------------------------------------------------------------- tween system
const tasks = new Set();
function anim(dur, fn, ez = ease.linear) {
  return new Promise(res => { const t = { t: 0, dur: Math.max(1e-4, dur), fn, ez, res }; tasks.add(t); fn(0, 0); });
}
const wait = s => anim(s, () => {});
function runTasks(dt) {
  for (const t of [...tasks]) {
    t.t += dt; const p = Math.min(1, t.t / t.dur);
    try { t.fn(t.ez(p), p); } catch (e) { console.error(e); }
    if (p >= 1) { tasks.delete(t); t.res(); }
  }
}

// ---------------------------------------------------------------------------------------------- layout
// 19 stop anchors (track point where the loco nose stops). Headings in degrees; meandering snake, ~27 m apart.
const SPACING = 27;
const DELTAS = [0, 25, 30, 35, 35, 30, 0, -35, -45, -45, -40, -30, 0, 35, 45, 45, 35, 15];
function computeAnchors() {
  let th = 0, x = -80, z = 40 - 148; const out = [{ x, z, th }];
  for (const d of DELTAS) {
    const a = th + d * Math.PI / 360; x += SPACING * Math.cos(a); z += SPACING * Math.sin(a); th += d * Math.PI / 180;
    out.push({ x, z, th });
  }
  return out;
}
const FLAT_BACK = 10.5, FLAT_FWD = 3, LEAD_IN = 22, LEAD_OUT = 14;
function buildTrack(anchors) {
  const path = new THREE.CurvePath();
  const dir = a => V3(Math.cos(a.th), 0, Math.sin(a.th)), P = a => V3(a.x, 0, a.z);
  const sAnchor = []; let s = 0;
  const addLine = (p0, p1) => { const c = new THREE.LineCurve3(p0, p1); path.add(c); s += p0.distanceTo(p1); };
  anchors.forEach((a, k) => {
    const back = k === 0 ? LEAD_IN : FLAT_BACK, fwd = k === anchors.length - 1 ? LEAD_OUT : FLAT_FWD;
    const p0 = P(a).addScaledVector(dir(a), -back), p1 = P(a).addScaledVector(dir(a), fwd);
    addLine(p0, P(a)); sAnchor.push(s); addLine(P(a), p1);
    if (k < anchors.length - 1) {
      const b = anchors[k + 1], q0 = P(b).addScaledVector(dir(b), -FLAT_BACK), hl = p1.distanceTo(q0) / 3;
      const c = new THREE.CubicBezierCurve3(p1, p1.clone().addScaledVector(dir(a), hl), q0.clone().addScaledVector(dir(b), -hl), q0);
      path.add(c); s += c.getLength();
    }
  });
  // dense arc-length table
  const N = 6000, pts = path.getSpacedPoints(N), L = path.getLength();
  // re-normalise anchor arc lengths against three's own length estimate
  const k = L / s; for (let i = 0; i < sAnchor.length; i++) sAnchor[i] *= k;
  return { path, pts, N, L, sAnchor };
}

// ---------------------------------------------------------------------------------------------- noise
function hash2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
const fbm = (x, z) => vnoise(x, z) * .55 + vnoise(x * 2.1 + 5, z * 2.1 - 3) * .3 + vnoise(x * 4.3 - 7, z * 4.3 + 1) * .15;

// ---------------------------------------------------------------------------------------------- sky
function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uBot: { value: new THREE.Color() }, uSun: { value: V3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uSunAmt: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w*.9999; }',
    fragmentShader: `uniform vec3 uTop,uHor,uBot,uSun,uSunCol; uniform float uSunAmt; varying vec3 vP;
      void main(){ float y=vP.y; vec3 c = y>0. ? mix(uHor,uTop,pow(clamp(y*1.6,0.,1.),.7)) : mix(uHor,uBot,clamp(-y*5.,0.,1.));
        float d = max(dot(normalize(vP), normalize(uSun)),0.); c += uSunCol*(pow(d,12.)*.45+pow(d,400.)*1.2)*uSunAmt;
        gl_FragColor = vec4(c,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 16), mat); m.frustumCulled = false; m.renderOrder = -10;
  return m;
}

// ---------------------------------------------------------------------------------------------- time of day keys
// f: 0 = 08:00 crisp morning … .44 noon … .78 15:00 golden … .89 16:00 amber sunset … 1 = 17:00 plum dusk
const TOD = [
  { f: 0, top: '#8fc3ea', hor: '#f3e6d6', bot: '#cfd9c8', fog: '#d8e4ea', sun: '#ffe2b8', sunI: 2.3, hemiS: '#d6e9ff', hemiG: '#7b6a48', hemiI: 1.25, el: 9, az: 125, glow: 0, stars: 0, sunAmt: .7, exp: 1 },
  { f: .25, top: '#79b5e6', hor: '#e8f0f2', bot: '#cfd9c8', fog: '#dbe7ec', sun: '#fff0d8', sunI: 2.7, hemiS: '#dcebff', hemiG: '#7e6c4a', hemiI: 1.3, el: 15, az: 155, glow: 0, stars: 0, sunAmt: .5, exp: 1 },
  { f: .5, top: '#7cb1e0', hor: '#f4ecdc', bot: '#d4d6c0', fog: '#e4e6e0', sun: '#ffeccc', sunI: 2.7, hemiS: '#e2ecf6', hemiG: '#806b48', hemiI: 1.3, el: 14, az: 185, glow: 0, stars: 0, sunAmt: .5, exp: 1 },
  { f: .72, top: '#86a8d6', hor: '#ffd9a6', bot: '#d6c8a8', fog: '#ecd9bf', sun: '#ffcf8a', sunI: 2.5, hemiS: '#e8dcd0', hemiG: '#7a6040', hemiI: 1.15, el: 8, az: 212, glow: .05, stars: 0, sunAmt: .9, exp: 1 },
  { f: .86, top: '#6c6fa8', hor: '#f3a35b', bot: '#b88870', fog: '#d9a07a', sun: '#ffa060', sunI: 2.2, hemiS: '#d6bcd0', hemiG: '#6a5450', hemiI: 1.2, el: 2.5, az: 228, glow: .55, stars: .1, sunAmt: 1.2, exp: 1 },
  { f: .93, top: '#3e3a72', hor: '#c96a62', bot: '#5c4058', fog: '#7a5068', sun: '#ffa486', sunI: 1.7, hemiS: '#b0a4d8', hemiG: '#54445a', hemiI: 1.6, el: -1, az: 235, glow: .85, stars: .45, sunAmt: .8, exp: 1 },
  { f: 1, top: '#1d1b44', hor: '#6a4276', bot: '#2a2036', fog: '#43345a', sun: '#c0c8ff', sunI: 1.5, hemiS: '#9a9ce0', hemiG: '#4a3c58', hemiI: 1.9, el: 30, az: 120, glow: 1, stars: 1, sunAmt: 0, exp: 1 },
];
const _ca = new THREE.Color(), _cb = new THREE.Color();
function todAt(f) {
  f = clamp(f, 0, 1); let i = 0; while (i < TOD.length - 2 && TOD[i + 1].f < f) i++;
  const a = TOD[i], b = TOD[i + 1], t = clamp((f - a.f) / (b.f - a.f), 0, 1), o = {};
  for (const k of Object.keys(a)) {
    if (typeof a[k] === 'string') o[k] = new THREE.Color(a[k]).lerp(_cb.set(b[k]), t);
    else o[k] = lerp(a[k], b[k], t);
  }
  return o;
}

// ---------------------------------------------------------------------------------------------- train
// Car local frame: +X forward, Y up, -Z = left (platform/scene side). Origin = car centre at rail-bed level.
const RAIL_TOP = .27, PH = .3; // platform height
function buildTrain(trainMat, glowMat) {
  const group = new THREE.Group(); group.name = 'train';
  const wheels = [], rods = [];
  const wheelGeo = (() => {
    const b = new Builder();
    b.add(G.cyl(1, 1, .16, 16), C.night, [0, 0, 0], [Math.PI / 2, 0, 0]);
    b.add(G.tor(.86, .08, 6, 18), C.gold, [0, 0, .09]); b.add(G.tor(.86, .08, 6, 18), C.gold, [0, 0, -.09]);
    b.add(G.box(1.7, .14, .2), C.gold, [0, 0, 0]); b.add(G.box(.14, 1.7, .2), C.gold, [0, 0, 0]);
    b.add(G.cyl(.25, .25, .24, 10), C.gold, [0, 0, 0], [Math.PI / 2, 0, 0]);
    return b.geometry();
  })();
  const addWheel = (car, x, r) => {
    for (const side of [-1, 1]) {
      const w = new THREE.Mesh(wheelGeo, trainMat); w.position.set(x, RAIL_TOP + r, side * .62); w.scale.setScalar(r); w.castShadow = true;
      w.userData.r = r; car.add(w); wheels.push(w);
    }
  };
  // --- loco (3.6 m)
  const loco = new THREE.Group(); loco.name = 'loco';
  {
    const b = new Builder();
    b.add(G.rbox(3.5, .34, 1.5, .1), C.night, [0, .72, 0]);
    // boiler
    b.add(G.cyl(.6, .6, 2.1, 20), C.wine, [.75, 1.42, 0], [0, 0, Math.PI / 2]);
    for (const x of [.15, .85, 1.55]) b.add(G.cyl(.625, .625, .14, 20), C.gold, [x, 1.42, 0], [0, 0, Math.PI / 2]);
    b.add(G.cyl(.62, .62, .32, 20), C.night, [1.9, 1.42, 0], [0, 0, Math.PI / 2]);
    b.add(G.cyl(.45, .45, .06, 20), '#3c2a35', [2.07, 1.42, 0], [0, 0, Math.PI / 2]);
    b.add(G.sph(.12, 10, 8), C.gold, [2.1, 1.42, 0]);
    // chimney + dome + whistle
    b.add(G.cyl(.2, .2, .5, 12), C.night, [1.55, 2.15, 0]);
    b.add(G.cyl(.34, .2, .36, 12), C.night, [1.55, 2.5, 0]);
    b.add(G.tor(.33, .05, 6, 16), C.gold, [1.55, 2.68, 0], [Math.PI / 2, 0, 0]);
    b.add(G.sph(.3, 12, 8, 0), C.gold, [.75, 2.0, 0], [0, 0, 0], [1, .8, 1]);
    b.add(G.cyl(.06, .06, .3, 8), C.gold, [.25, 2.12, 0]);
    // lamp
    b.add(G.cyl(.17, .17, .26, 12), C.night, [1.92, 2.08, 0], [0, 0, Math.PI / 2]);
    // cab
    b.add(G.rbox(1.45, 1.55, 1.62, .12), C.wine, [-.95, 1.65, 0]);
    b.add(G.box(1.49, .12, 1.66), C.gold, [-.95, 1.25, 0]);
    b.add(G.rbox(1.85, .2, 1.95, .09), C.night, [-.95, 2.5, 0]);
    b.add(G.box(1.55, .08, 1.7), C.gold, [-.95, 2.38, 0]);
    // cowcatcher + buffer beam
    b.add(G.box(.22, .32, 1.5), C.red, [1.82, .72, 0]);
    const cc = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(.55, 0), new THREE.Vector2(0, .45)]);
    b.add(new THREE.ExtrudeGeometry(cc, { depth: 1.3, bevelEnabled: false }), C.night, [1.9, .3, -.65]);
    for (const z of [-.5, .5]) b.add(G.cyl(.1, .1, .2, 10), C.gold, [2.0, .82, z], [0, 0, Math.PI / 2]);
    // gold side rods housing
    for (const z of [-.8, .8]) b.add(G.box(3.1, .1, .06), C.gold, [.1, .92, z]);
    const m = b.mesh(trainMat); loco.add(m);
    const g = new Builder();
    for (const z of [-.82, .82]) g.add(G.plane(.75, .55), '#fff', [-.95, 1.9, z], [0, z < 0 ? Math.PI : 0, 0]);
    g.add(G.plane(.95, .5), '#fff', [-.21, 1.9, 0], [0, Math.PI / 2, 0]);
    g.add(G.circ(.13, 14), '#fff', [2.06, 2.08, 0], [0, Math.PI / 2, 0]);
    loco.add(g.mesh(glowMat, { cast: false, receive: false }));
    // number plates "27"
    for (const side of [-1, 1]) {
      const plate = makeSignMesh(.6, .38, drawBoard('27', { bg: C.gold, fg: C.night, border: C.night, size: .8 }), { px: 160 });
      plate.position.set(-.95, 1.42, side * .83); plate.rotation.y = side < 0 ? Math.PI : 0; loco.add(plate);
    }
    addWheel(loco, 1.2, .36); addWheel(loco, .1, .5); addWheel(loco, -1.05, .5);
    for (const side of [-1, 1]) {
      const rod = new THREE.Mesh(G.box(1.3, .08, .05), new THREE.MeshLambertMaterial({ color: C.gold }));
      rod.userData.side = side; rod.position.set(-.48, .8, side * .74); loco.add(rod); rods.push(rod);
    }
  }
  // --- carriage (4.6 m) with big open windows; Maja rides here
  const carriage = new THREE.Group(); carriage.name = 'carriage';
  const seat = new THREE.Object3D(); seat.name = 'seat';
  {
    const b = new Builder(), L = 4.4, W = 1.9;
    b.add(G.rbox(L + .1, .3, 1.5, .08), C.night, [0, .66, 0]);
    b.add(G.box(L, .08, W - .1), C.woodL, [0, .78, 0]);       // floor (top at .82)
    // lower body: walls only (open interior), door gap on the left between x=.55 and 1.25
    b.add(G.rbox(L, .62, .12, .04), C.wine, [0, 1.12, W / 2 - .06]);
    b.add(G.rbox(3.45, .62, .12, .04), C.wine, [-2.2 + 1.725, 1.12, -W / 2 + .06]);
    for (const x of [-L / 2 + .06, L / 2 - .06]) b.add(G.box(.12, .62, W), C.wine, [x, 1.12, 0]);
    b.add(G.box(L + .04, .1, .16), C.gold, [0, 1.45, W / 2 - .06]);
    b.add(G.box(3.49, .1, .16), C.gold, [-2.2 + 1.725, 1.45, -W / 2 + .06]);
    // window posts (cream) – left side open with big windows
    for (const x of [-2.1, -.75, .55, 1.25, 2.1]) for (const z of [-W / 2 + .05, W / 2 - .05]) b.add(G.box(.16, 1.0, .1), C.cream, [x, 1.95, z]);
    // door at front-left: gap between posts .55 and 1.25 on the left, a little gold step
    b.add(G.box(.75, .06, .35), C.gold, [1.68, .45, -W / 2 - .12]);
    for (const z of [-W / 2 + .05, W / 2 - .05]) b.add(G.box(L, .2, .1), C.cream, [0, 2.48, z]);
    for (const x of [-L / 2 + .05, L / 2 - .05]) b.add(G.box(.1, 1.0, W), C.cream, [x, 1.95, 0]);
    b.add(G.rbox(L + .4, .22, W + .3, .1), C.wine, [0, 2.66, 0]);
    b.add(G.rbox(L, .16, W - .2, .07), C.gold, [0, 2.82, 0]);
    // bench along the right wall (Maja sits here facing left windows)
    b.add(G.rbox(2.9, .14, .5, .05), C.rose, [-.55, 1.27, -.62]);
    b.add(G.rbox(2.9, .5, .12, .05), C.rose, [-.55, 1.62, -.86]);
    b.add(G.box(2.7, .4, .4), C.woodD, [-.55, 1.0, -.64]);
    // buffers
    for (const x of [-L / 2 - .1, L / 2 + .1]) b.add(G.cyl(.1, .1, .2, 8), C.gold, [x, .7, 0], [0, 0, Math.PI / 2]);
    // little bunting garland along the roof edge
    const flags = [C.rose, C.gold, C.paper, C.sage];
    for (let i = 0; i < 9; i++) for (const z of [-W / 2 - .17, W / 2 + .17]) b.add(G.cone(.09, .2, 3), flags[i % 4], [-2 + i * .5, 2.43, z], [Math.PI, 0, 0]);
    carriage.add(b.mesh(trainMat));
    const g = new Builder();
    g.add(G.box(.3, .3, .02), '#fff', [-L / 2 - .02, 2.0, 0], [0, Math.PI / 2, 0]);
    carriage.add(g.mesh(glowMat, { cast: false, receive: false }));
    addWheel(carriage, 1.5, .34); addWheel(carriage, -1.5, .34);
    seat.position.set(-.4, .82, -.45); seat.rotation.y = 0; // faces the right-hand windows (camera side)
    carriage.add(seat);
  }
  // --- gift wagon (3 m): open wagon with wrapped presents
  const wagon = new THREE.Group(); wagon.name = 'wagon';
  {
    const b = new Builder();
    b.add(G.rbox(3.0, .3, 1.5, .08), C.night, [0, .66, 0]);
    b.add(G.rbox(2.9, .55, 1.8, .07), C.gold, [0, 1.08, 0]);
    b.add(G.box(2.7, .5, 1.6), C.woodD, [0, 1.12, 0]);
    const gifts = [[-.8, .3, .55, C.rose, C.gold], [.1, -.35, .7, C.sage, C.paper], [.85, .25, .5, C.wine, C.gold], [-.2, .35, .4, C.paper, C.rose], [.9, -.4, .45, C.gold, C.wine]];
    for (const [x, z, s, c1, c2] of gifts) {
      const y = 1.36 + s / 2;
      b.add(G.rbox(s, s, s, .05), c1, [x, y, z], [0, x, 0]);
      b.add(G.box(s + .02, s + .02, .1), c2, [x, y, z], [0, x, 0]);
      b.add(G.box(.1, s + .02, s + .02), c2, [x, y, z], [0, x, 0]);
      b.add(G.tor(.1, .035, 5, 10), c2, [x, y + s / 2 + .06, z], [0, x, 0]);
    }
    for (const x of [-1.6, 1.6]) b.add(G.cyl(.1, .1, .2, 8), C.gold, [x, .7, 0], [0, 0, Math.PI / 2]);
    wagon.add(b.mesh(trainMat));
    addWheel(wagon, .9, .34); addWheel(wagon, -.9, .34);
  }
  group.add(loco, carriage, wagon);
  for (const car of [loco, carriage, wagon]) car.traverse(o => { if (o.isMesh) o.castShadow = true; });
  // car centre offsets (behind loco centre, arc length) and half bogie spans
  const cars = [
    { obj: loco, off: 0, half: 1.2 },
    { obj: carriage, off: 4.4, half: 1.6 },
    { obj: wagon, off: 8.3, half: 1.0 },
  ];
  return { group, loco, carriage, wagon, seat, wheels, rods, cars, NOSE: 2.15 };
}

// ---------------------------------------------------------------------------------------------- particles
function spriteTex(kind) {
  const s = 128, cv = document.createElement('canvas'); cv.width = cv.height = s; const x = cv.getContext('2d');
  x.fillStyle = '#fff'; x.strokeStyle = '#fff';
  if (kind === 'heart') {
    x.beginPath(); x.moveTo(64, 112); x.bezierCurveTo(10, 72, 4, 34, 34, 22); x.bezierCurveTo(52, 15, 62, 28, 64, 38);
    x.bezierCurveTo(66, 28, 76, 15, 94, 22); x.bezierCurveTo(124, 34, 118, 72, 64, 112); x.fill();
  } else if (kind === 'note') {
    x.font = `700 110px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('♪', 64, 70);
  } else if (kind === 'puff') {
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 62); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.55, 'rgba(255,255,255,.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
  } else if (kind === 'star') {
    x.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? 14 : 62; x.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } x.fill();
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 30); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, s, s);
  } else if (kind === 'spark') {
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 62); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,255,255,.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
class Particles {
  constructor(parent, { geo, mat, max = 300, billboard = true }) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max); this.mesh.frustumCulled = false; this.mesh.count = 0;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.renderOrder = 5; parent.add(this.mesh); this.max = max; this.list = []; this.billboard = billboard;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._qz = new THREE.Quaternion(); this._s = V3(); this._z = V3(0, 0, 1);
  }
  spawn(o) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ p: o.pos.clone(), v: o.vel ? o.vel.clone() : V3(), age: -(o.delay || 0), life: o.life || 2, size: o.size || .3, color: new THREE.Color(o.color || '#fff'),
      rot: o.rot ?? R() * TAU, rv: o.rv ?? rr(-3, 3), grav: o.grav ?? 0, drag: o.drag ?? 0, grow: o.grow ?? 0, wob: o.wob || 0, ph: R() * TAU,
      axis: o.axis || V3(R() - .5, R() - .5, R() - .5).normalize(), pop: o.pop ?? .15 });
  }
  update(dt, cam) {
    const L = this.list; let n = 0;
    for (let i = L.length - 1; i >= 0; i--) { const p = L[i]; p.age += dt; if (p.age > p.life) L.splice(i, 1); }
    for (const p of L) {
      if (p.age < 0) continue;
      p.v.y -= p.grav * dt; if (p.drag) p.v.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.p.addScaledVector(p.v, dt); p.rot += p.rv * dt;
      const t = p.age / p.life, sz = p.size * (1 + p.grow * t) * Math.min(1, p.age / p.pop) * (t > .7 ? 1 - (t - .7) / .3 : 1);
      if (p.wob) p.p.x += Math.sin(p.age * 5 + p.ph) * p.wob * dt;
      if (this.billboard) { this._qz.setFromAxisAngle(this._z, p.rot); this._q.copy(cam.quaternion).multiply(this._qz); }
      else this._q.setFromAxisAngle(p.axis, p.rot);
      this._m.compose(p.p, this._q, this._s.setScalar(Math.max(1e-4, sz)));
      this.mesh.setMatrixAt(n, this._m); this.mesh.setColorAt(n, p.color); n++;
    }
    this.mesh.count = n; this.mesh.visible = n > 0;
    if (n) { this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true; }
  }
}
function makeFX(parent) {
  const tex = k => spriteTex(k);
  const basic = (map, add = false, opacity = 1) => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, opacity, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false });
  const sys = {
    confetti: new Particles(parent, { geo: G.plane(.16, .1), mat: new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), max: 400, billboard: false }),
    heart: new Particles(parent, { geo: G.plane(1, 1), mat: basic(tex('heart')), max: 80 }),
    note: new Particles(parent, { geo: G.plane(1, 1), mat: basic(tex('note')), max: 60 }),
    puff: new Particles(parent, { geo: G.plane(1, 1), mat: basic(tex('puff'), false, .8), max: 160 }),
    star: new Particles(parent, { geo: G.plane(1, 1), mat: basic(tex('star'), true), max: 160 }),
    spark: new Particles(parent, { geo: G.plane(1, 1), mat: basic(tex('spark'), true), max: 500 }),
  };
  const CONF = [C.rose, C.gold, C.wine, C.sage, C.paper, '#7fc4e8', '#ffd36e'];
  const api = {
    confetti(pos, n = 90) {
      for (let i = 0; i < n; i++) sys.confetti.spawn({ pos: pos.clone().add(V3(rr(-.3, .3), rr(0, .3), rr(-.3, .3))), vel: V3(rr(-3, 3), rr(4, 8), rr(-3, 3)), grav: 6, drag: 1.6, life: rr(2.4, 3.6), size: rr(1.3, 1.9), color: pick(CONF), rv: rr(-9, 9), wob: 1.5 });
    },
    hearts(pos, n = 9) {
      for (let i = 0; i < n; i++) sys.heart.spawn({ pos: pos.clone().add(V3(rr(-.4, .4), rr(-.1, .3), rr(-.4, .4))), vel: V3(rr(-.5, .5), rr(1, 1.9), rr(-.5, .5)), life: rr(1.6, 2.4), size: rr(.38, .6), color: pick([C.rose, '#ff5f7e', C.wine, '#ffb3c1']), rot: rr(-.3, .3), rv: rr(-.6, .6), wob: 1.2, delay: i * .06 });
    },
    notes(pos, n = 10) {
      for (let i = 0; i < n; i++) sys.note.spawn({ pos: pos.clone().add(V3(rr(-.8, .8), rr(0, .6), rr(-.5, .5))), vel: V3(rr(-.8, .8), rr(1, 1.8), rr(-.3, .3)), life: rr(1.8, 2.6), size: rr(.55, .85), color: pick([C.gold, C.rose, '#8fd3c1', '#b7a0ff', C.paper]), rot: rr(-.4, .4), rv: rr(-1, 1), wob: 2, delay: i * .12 });
    },
    sneeze(pos, dir) {
      const d = (dir || V3(0, 0, 1)).clone().setY(0).normalize();
      for (let i = 0; i < 16; i++) sys.puff.spawn({ pos: pos.clone(), vel: d.clone().multiplyScalar(rr(2, 4.5)).add(V3(rr(-1.2, 1.2), rr(-.2, 1.2), rr(-1.2, 1.2))), drag: 3, life: rr(.8, 1.4), size: rr(.25, .5), grow: 1.4, color: '#ffffff', pop: .05 });
      for (let i = 0; i < 10; i++) sys.spark.spawn({ pos: pos.clone(), vel: d.clone().multiplyScalar(rr(2, 4)).add(V3(rr(-1, 1), rr(0, 1.5), rr(-1, 1))), grav: 6, life: rr(.5, .9), size: .12, color: '#bfe6ff' });
    },
    sparkle(pos, n = 14, r = .7) {
      for (let i = 0; i < n; i++) sys.star.spawn({ pos: pos.clone().add(V3(rr(-r, r), rr(-r, r), rr(-r, r))), vel: V3(0, rr(.1, .5), 0), life: rr(.7, 1.3), size: rr(.32, .62), color: pick(['#fff6c8', C.gold, '#ffffff', '#ffd6e0']), rv: rr(-2, 2), delay: rr(0, .6), pop: .2 });
    },
    fireworks(pos, bursts = 5) {
      for (let k = 0; k < bursts; k++) {
        const c = pos.clone().add(V3(rr(-3, 3), rr(2.5, 4.5), rr(-2, 2))), delay = k * rr(.35, .55), col = pick([C.gold, C.rose, '#8fd3ff', '#b7ff9f', '#ffffff', '#ff6f91']);
        // rocket trail
        for (let j = 0; j < 8; j++) sys.spark.spawn({ pos: V3(lerp(pos.x, c.x, j / 8), lerp(pos.y, c.y, j / 8), lerp(pos.z, c.z, j / 8)), life: .35, size: .18, color: '#ffe9b0', delay: Math.max(0, delay - .4 + j * .05) });
        const n = 90;
        for (let i = 0; i < n; i++) {
          const v = V3(R() - .5, R() - .5, R() - .5).normalize().multiplyScalar(rr(3.5, 5));
          sys.spark.spawn({ pos: c.clone(), vel: v, grav: 2.2, drag: 1.4, life: rr(1.2, 1.9), size: rr(.6, 1.0), color: R() < .2 ? '#ffffff' : col, delay });
        }
        for (let i = 0; i < 10; i++) sys.star.spawn({ pos: c.clone().add(V3(rr(-2.5, 2.5), rr(-2.5, 2), rr(-2, 2))), life: .5, size: .35, color: '#fff3c0', delay: delay + rr(.6, 1.1) });
      }
    },
    // internal helpers (also exposed)
    steam(pos, n = 1, s = 1, col = '#ffffff') {
      for (let i = 0; i < n; i++) sys.puff.spawn({ pos: pos.clone().add(V3(rr(-.1, .1), 0, rr(-.1, .1))), vel: V3(rr(-.25, .25), rr(1.1, 1.8), rr(-.25, .25)), drag: .6, life: rr(1.3, 2), size: .35 * s, grow: 2.2, color: col, pop: .1 });
    },
    dust(pos, n = 12, col = '#d8c6a6') {
      for (let i = 0; i < n; i++) { const a = R() * TAU; sys.puff.spawn({ pos: pos.clone(), vel: V3(Math.cos(a) * rr(1.5, 3), rr(.2, 1), Math.sin(a) * rr(1.5, 3)), drag: 3, life: rr(.8, 1.4), size: rr(.3, .5), grow: 1.6, color: col }); }
    },
    fog(pos, n = 10) {
      for (let i = 0; i < n; i++) sys.puff.spawn({ pos: pos.clone().add(V3(rr(-1.5, 1.5), 0, rr(-.5, .5))), vel: V3(rr(-.8, .8), rr(.1, .5), rr(.2, 1)), drag: .8, life: rr(2, 3), size: rr(.6, 1), grow: 1.5, color: '#e9dcf7', delay: rr(0, .4) });
    },
    leaves(pos, n = 40) {
      for (let i = 0; i < n; i++) { const a = R() * TAU, r = rr(.5, 2.5); sys.confetti.spawn({ pos: pos.clone().add(V3(Math.cos(a) * r, rr(0, 1), Math.sin(a) * r)), vel: V3(-Math.sin(a) * 2.5, rr(1.5, 3.5), Math.cos(a) * 2.5), grav: 1.6, drag: 1.2, life: rr(2.5, 3.5), size: rr(2.6, 3.6), color: pick(PALETTE_AUTUMN), rv: rr(-6, 6), wob: 1 }); }
    },
    steamHeart(pos) {
      for (let i = 0; i < 26; i++) { const t = i / 26 * TAU, hx = 16 * Math.pow(Math.sin(t), 3) / 16, hy = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16;
        sys.puff.spawn({ pos: pos.clone().add(V3(hx * 1.1, hy * 1.1 + 1.2, 0)), vel: V3(0, .5, 0), life: 2.2, size: .32, grow: .4, color: '#ffe0ea', delay: i * .015 }); }
    },
  };
  return { api, update(dt, cam) { for (const k in sys) sys[k].update(dt, cam); }, sys };
}

// speech-bubble sprites ("BÄÄ", "TIMBER!", "?", …)
const bubbleCache = new Map();
function bubbleTexture(text, { bg = C.paper, fg = C.night, size = 64 } = {}) {
  const key = text + bg + fg + size; if (bubbleCache.has(key)) return bubbleCache.get(key);
  const cv = document.createElement('canvas'), x = cv.getContext('2d'); x.font = `600 ${size}px ${FONT}`;
  const lines = text.split('\n'), tw = Math.max(...lines.map(l => x.measureText(l).width));
  const w = Math.ceil(tw + size * 1.1), lh = size * 1.15, h = Math.ceil(lines.length * lh + size * .7 + size * .45);
  cv.width = w; cv.height = h;
  const bh = h - size * .45;
  x.fillStyle = 'rgba(36,18,43,.18)'; rrect(x, 4, 8, w - 8, bh - 6, size * .45); x.fill();
  x.fillStyle = bg; rrect(x, 2, 2, w - 6, bh - 6, size * .45); x.fill();
  x.beginPath(); x.moveTo(w * .42, bh - 6); x.lineTo(w * .5, h - 2); x.lineTo(w * .58, bh - 6); x.fill();
  x.font = `600 ${size}px ${FONT}`; x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
  lines.forEach((l, i) => x.fillText(l, w / 2, size * .35 + lh * (i + .5) + 2));
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const out = { tex: t, aspect: w / h }; bubbleCache.set(key, out); return out;
}
function makeBubbles(parent) {
  return function bubble(text, pos, { dur = 2.2, h = .7, bg, fg, rise = .35 } = {}) {
    const { tex, aspect } = bubbleTexture(text, { bg, fg });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, fog: false }));
    sp.center.set(.5, 0); sp.renderOrder = 20; parent.add(sp);
    const base = pos.clone(), sx = h * aspect;
    return anim(dur, (_, p) => {
      const pop = p < .12 ? ease.back(p / .12) : p > .85 ? 1 - ease.in((p - .85) / .15) : 1;
      sp.scale.set(sx * pop, h * pop, 1); sp.position.copy(base).y += rise * p;
    }).then(() => { parent.remove(sp); sp.material.dispose(); });
  };
}

// ---------------------------------------------------------------------------------------------- animals & vehicles
function eyes(b, x, y, z, sep, r = .07, ry = 0) {
  for (const s of [-1, 1]) {
    const ox = Math.cos(ry) * s * sep, oz = -Math.sin(ry) * s * sep;
    b.add(G.sph(r, 10, 8), '#ffffff', [x + ox, y, z + oz]);
    b.add(G.sph(r * .62, 8, 6), '#1c1418', [x + ox + Math.sin(ry) * r * .55, y - r * .05, z + oz + Math.cos(ry) * r * .55]);
    b.add(G.sph(r * .22, 6, 4), '#ffffff', [x + ox + Math.sin(ry) * r * .9 + r * .15, y + r * .25, z + oz + Math.cos(ry) * r * .9]);
  }
}
// Gotland-ish sheep: grey curls, black face, big fluffy mutton-chop sideburns. Faces +Z.
function makeSheep(mat, s = 1) {
  const g = new THREE.Group(), b = new Builder(), wool = '#b9b3ae', woolL = '#d6d0ca';
  b.add(G.ico(.5, 1), wool, [0, .78, 0], [0, 0, 0], [1, .9, 1.25]);
  for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; b.add(G.ico(.24, 1), i % 2 ? wool : woolL, [Math.cos(a) * .42, .8 + Math.sin(i * 2.3) * .2, Math.sin(a) * .5]); }
  b.add(G.ico(.26, 1), woolL, [0, 1.15, .05]);
  for (const [x, z] of [[-.22, .3], [.22, .3], [-.22, -.32], [.22, -.32]]) b.add(G.cyl(.06, .055, .5, 6), '#26201f', [x, .25, z]);
  b.add(G.sph(.12, 8, 6), woolL, [0, .85, -.66]);
  g.add(b.mesh(mat));
  const head = new THREE.Group(); head.position.set(0, 1.0, .58);
  const h = new Builder();
  h.add(G.sph(.22, 12, 10), '#2a2427', [0, 0, .08], [0, 0, 0], [1, 1.05, 1.25]);
  h.add(G.sph(.12, 10, 8), '#3a3236', [0, -.08, .3]);
  h.add(G.ico(.2, 1), woolL, [0, .2, 0]);
  for (const sx of [-1, 1]) {
    h.add(G.sph(.1, 8, 6), '#2a2427', [sx * .26, .08, -.02], [0, 0, sx * .6], [1.6, .5, .9]);
    // mutton chops!
    h.add(G.ico(.16, 1), '#e9e3dc', [sx * .2, -.1, .12], [0, 0, 0], [1, 1.35, 1]);
    h.add(G.ico(.12, 1), '#d8d1ca', [sx * .2, -.27, .16]);
    h.add(G.ico(.1, 1), '#e9e3dc', [sx * .15, -.34, .22]);
  }
  eyes(h, 0, .05, .3, .1, .055);
  const hm = h.mesh(mat); head.add(hm); g.add(head);
  g.scale.setScalar(s); g.userData.head = head;
  return g;
}
function makeLamb(mat) {
  const g = new THREE.Group(), b = new Builder(), c = '#2f2a2c', c2 = '#3d3639';
  b.add(G.ico(.3, 1), c, [0, .5, 0], [0, 0, 0], [1, .9, 1.3]);
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; b.add(G.ico(.15, 1), c2, [Math.cos(a) * .25, .55, Math.sin(a) * .3]); }
  for (const [x, z] of [[-.13, .18], [.13, .18], [-.13, -.2], [.13, -.2]]) b.add(G.cyl(.04, .04, .36, 6), '#1f1a1c', [x, .18, z]);
  b.add(G.sph(.2, 12, 10), c, [0, .72, .38], [0, 0, 0], [1, 1, 1.15]);
  for (const sx of [-1, 1]) b.add(G.sph(.07, 6, 5), c2, [sx * .19, .76, .33], [0, 0, sx * .5], [1.7, .5, .8]);
  b.add(G.sph(.06, 6, 5), '#5a4a50', [0, .66, .58]);
  eyes(b, 0, .78, .56, .085, .05);
  g.add(b.mesh(mat)); return g;
}
function makeCow(mat) {
  const g = new THREE.Group(), b = new Builder(), c = C.ginger, c2 = '#c8773a', c3 = '#9a5222';
  b.add(G.rbox(1.0, .8, 1.7, .3), c, [0, 1.0, 0]);
  for (let i = 0; i < 14; i++) b.add(G.cone(.12, .42, 5), i % 2 ? c2 : c3, [rr(-.5, .5), rr(.65, .75), rr(-.75, .75)], [Math.PI, 0, rr(-.4, .4)]);
  for (const [x, z] of [[-.32, .55], [.32, .55], [-.32, -.55], [.32, -.55]]) { b.add(G.cyl(.1, .09, .65, 6), c3, [x, .33, z]); b.add(G.cyl(.1, .1, .1, 6), '#2a2020', [x, .04, z]); }
  b.add(G.cone(.08, .5, 5), c3, [0, .9, -.95], [-.4, 0, 0]);
  g.add(b.mesh(mat));
  const head = new THREE.Group(); head.position.set(0, 1.12, .95);
  const h = new Builder();
  h.add(G.rbox(.5, .5, .55, .18), c, [0, 0, 0]);
  h.add(G.rbox(.42, .28, .25, .1), '#d9a27b', [0, -.15, .3]);
  h.add(G.sph(.04, 6, 4), '#3a2020', [-.09, -.12, .43]); h.add(G.sph(.04, 6, 4), '#3a2020', [.09, -.12, .43]);
  // fringe over the eyes
  for (let i = 0; i < 9; i++) h.add(G.cone(.09, .34, 5), i % 2 ? c2 : c, [-.24 + i * .06, .1, .27], [Math.PI + .25, 0, rr(-.25, .25)]);
  // horns
  for (const sx of [-1, 1]) {
    h.add(G.cyl(.06, .04, .5, 6), '#efe2c4', [sx * .45, .18, 0], [0, 0, sx * -1.25]);
    h.add(G.cone(.045, .3, 6), '#efe2c4', [sx * .72, .38, 0], [0, 0, sx * -.3]);
    h.add(G.sph(.1, 6, 5), c, [sx * .3, .05, -.05], [0, 0, 0], [1.4, .6, .8]);
  }
  head.add(h.mesh(mat)); g.add(head); g.userData.head = head;
  return g;
}
function makeHen(mat, brown = false) {
  const g = new THREE.Group(), b = new Builder(), c = brown ? '#b0673a' : '#f4efe6';
  b.add(G.sph(.22, 10, 8), c, [0, .32, 0], [0, 0, 0], [1, .95, 1.25]);
  b.add(G.cone(.14, .3, 6), c, [0, .45, -.25], [-.9, 0, 0]);
  b.add(G.sph(.13, 10, 8), c, [0, .56, .18]);
  b.add(G.box(.04, .1, .14), C.red, [0, .7, .18]);
  b.add(G.sph(.04, 6, 4), C.red, [0, .47, .3]);
  b.add(G.cone(.04, .1, 5), '#f0b43c', [0, .55, .33], [Math.PI / 2, 0, 0]);
  for (const x of [-.07, .07]) b.add(G.cyl(.015, .015, .16, 4), '#f0b43c', [x, .1, 0]);
  eyes(b, 0, .6, .27, .07, .03);
  g.add(b.mesh(mat)); return g;
}
function makeHorseHead(mat) {
  const g = new THREE.Group(), b = new Builder(), c = '#8a5232';
  b.add(G.rbox(.42, 1.0, .5, .18), c, [0, .5, 0], [.35, 0, 0]);
  b.add(G.rbox(.4, .4, .75, .17), c, [0, 1.05, .32]);
  b.add(G.rbox(.34, .3, .3, .12), '#6e3f26', [0, .96, .65]);
  b.add(G.box(.1, .2, .5), '#fbf6ee', [0, 1.24, .4]);
  for (const sx of [-1, 1]) { b.add(G.cone(.07, .22, 5), c, [sx * .13, 1.33, .1]); b.add(G.sph(.03, 5, 4), '#2a1a12', [sx * .07, .93, .8]); }
  for (let i = 0; i < 6; i++) b.add(G.box(.12, .22, .14), '#3a2418', [0, 1.2 - i * .17, -.1 - i * .05], [.35, 0, 0]);
  eyes(b, 0, 1.12, .52, .2, .06, 0);
  g.add(b.mesh(mat)); return g;
}
function makeTractor(mat, { driver = false } = {}) {
  const g = new THREE.Group(), b = new Builder(), red = '#c8302a';
  b.add(G.rbox(1.0, .7, 2.0, .15), red, [0, 1.0, .3]);
  b.add(G.rbox(.9, .5, .9, .12), red, [0, .95, 1.1]);
  b.add(G.box(.8, .25, .05), '#2a2628', [0, .95, 1.56]);
  for (const sx of [-.25, .25]) b.add(G.sph(.08, 8, 6), '#fff4c0', [sx, 1.08, 1.56]);
  b.add(G.cyl(.06, .06, .9, 8), '#3a3638', [.3, 1.7, .95]);
  // cab
  for (const [x, z] of [[-.55, -.25], [.55, -.25], [-.55, -1.05], [.55, -1.05]]) b.add(G.box(.08, 1.25, .08), C.dark, [x, 1.95, z]);
  b.add(G.rbox(1.3, .12, 1.0, .05), red, [0, 2.6, -.65]);
  b.add(G.rbox(1.1, .5, 1.0, .1), red, [0, 1.15, -.65]);
  b.add(G.box(.5, .1, .45), C.dark, [0, 1.45, -.75]);
  b.add(G.cyl(.18, .18, .05, 10), C.dark, [0, 1.7, -.38], [-.8, 0, 0]);
  b.add(G.box(.06, .06, .5), '#888', [.2, 1.4, -1.3]);
  if (driver) {
    b.add(G.rbox(.42, .5, .3, .12), '#a7473e', [0, 1.75, -.72]);
    b.add(G.sph(.2, 10, 8), '#f1c7a5', [0, 2.15, -.7]);
    b.add(G.cyl(.22, .24, .1, 10), '#6b5a48', [0, 2.3, -.68]);
    b.add(G.box(.32, .04, .2), '#6b5a48', [0, 2.27, -.52]);
  }
  g.add(b.mesh(mat));
  const wheels = [];
  const wg = new Builder(); wg.add(G.cyl(1, 1, .9, 16), '#2a2628', [0, 0, 0], [0, 0, Math.PI / 2]); wg.add(G.cyl(.55, .55, .92, 12), C.gold, [0, 0, 0], [0, 0, Math.PI / 2]);
  for (let i = 0; i < 8; i++) wg.add(G.box(.95, .12, .2), '#2a2628', [0, Math.cos(i / 8 * TAU), Math.sin(i / 8 * TAU)], [i / 8 * TAU, 0, 0]);
  const wgeo = wg.geometry();
  for (const [x, z, r] of [[-.75, -.7, .62], [.75, -.7, .62], [-.6, 1.1, .38], [.6, 1.1, .38]]) {
    const w = new THREE.Mesh(wgeo, mat); w.position.set(x, r, z); w.scale.set(r < .5 ? .3 / .9 * 1.6 : .4 / .9 * 1.6, r, r); w.castShadow = true; g.add(w); wheels.push(w);
  }
  g.userData.wheels = wheels;
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function makeBird(mat, col = '#4a3a44') {
  const b = new Builder();
  b.add(G.sph(.08, 8, 6), col, [0, 0, 0], [0, 0, 0], [1, 1, 1.6]);
  b.add(G.cone(.03, .07, 4), C.gold, [0, 0, .14], [Math.PI / 2, 0, 0]);
  const g = new THREE.Group(); g.add(b.mesh(mat));
  const wings = [];
  for (const s of [-1, 1]) { const w = new THREE.Mesh(G.box(.22, .02, .1), mat); w.geometry = prep(G.box(.22, .02, .1), col, mat4([s * .11, 0, 0])); const piv = new THREE.Group(); piv.add(w); g.add(piv); wings.push(piv); }
  g.userData.wings = wings; return g;
}

// ---------------------------------------------------------------------------------------------- stations
// Local frame per stop: origin = track centre where the loco nose stops, +X = travel direction,
// -Z = scene side (platform + scene), +Z = camera side. Ground y = 0, platform top y = PH.
const DEF_CAM = { p: [2.5, 3.0, 8.6], t: [-.1, 2.15, -4.8] };
const STOPS = [
  // ------------------------------------------------------------------ 0 Korsberga
  { id: 'korsberga', kind: 'main', t: '08:00', name: 'Korsberga',
    stand: [0.9, -2.7], 
    mattias: { p: [.1, 0, -7.5], pose: 'peek' },
    build(c) {
      const { b, g } = c;
      bAddHouse(b, { x: -2.6, z: -8.6, w: 4, d: 3, h: 2.6, ry: .12, glow: g });
      bAddHouse(b, { x: 3.4, z: -11.2, w: 4.6, d: 3.4, h: 3.1, ry: -.18, glow: g, windows: 3 });
      bAddHouse(b, { x: -6.6, z: -12, w: 3.6, d: 3, h: 2.4, ry: .3, glow: g, wall: '#a8322a' });
      bAddTree(b, -5.2, -6.2, { h: 3.6 }); bAddTree(b, 6.3, -7.8, { h: 3.8, col: C.gold }); bAddTree(b, .6, -14.5, { kind: 'spruce', s: 1.5 });
      bAddTree(b, 7.5, -13.5, { kind: 'spruce', s: 1.3 }); bAddTree(b, -3.8, -15, { h: 4.2, col: '#d6532e' });
      bAddFence(b, -.2, -6.4, 3.4, -6.4, { h: .7 }); bAddFence(b, -4.8, -6.6, -3.8, -6.6, { h: .7 });
      bAddBush(b, .7, -7, .8, '#7c8f4f'); bAddBush(b, -4.6, -9.8, .9);
      // flower boxes
      for (const x of [-3.0, -1.5]) b.add(G.box(.7, .2, .25), C.white, [x, 1.0, -7.0]).add(G.ico(.12, 0), C.rose, [x - .15, 1.15, -6.95]).add(G.ico(.12, 0), C.gold, [x + .15, 1.15, -6.95]);
      // flagpole with Swedish flag
      b.add(G.cyl(.05, .07, 6.2, 8), C.white, [1.5, 3.1, -7.6]).add(G.sph(.1, 8, 6), C.gold, [1.5, 6.25, -7.6]);
      const flag = c.mesh(f => { f.add(G.box(1.2, .75, .03), '#2f6db5', [.6, 0, 0]); f.add(G.box(1.2, .14, .035), '#f6cd38', [.6, 0, 0]); f.add(G.box(.14, .75, .035), '#f6cd38', [.45, 0, 0]); });
      flag.position.set(1.5, 5.75, -7.6); c.flag = flag;
      // banner poles + banner
      for (const x of [-2.2, 2.5]) b.add(G.cyl(.06, .08, 4.9, 8), C.wood, [x, 2.45, -5.0]).add(G.sph(.12, 8, 6), C.gold, [x, 4.95, -5.0]);
      const banner = c.sign(4.5, .9, (x, w, h) => {
        x.fillStyle = C.paper; rrect(x, 4, 14, w - 8, h - 22, 18); x.fill(); x.lineWidth = 8; x.strokeStyle = C.gold; x.stroke();
        const cols = [C.rose, C.gold, C.wine, C.sage];
        for (let i = 0; i < 18; i++) { x.fillStyle = cols[i % 4]; x.beginPath(); const fx = 20 + i * (w - 40) / 17; x.moveTo(fx - 16, 0); x.lineTo(fx + 16, 0); x.lineTo(fx, 26); x.fill(); }
        x.fillStyle = C.wine; x.textAlign = 'center'; x.textBaseline = 'middle'; fitText(x, 'GRATTIS MAJA 27', w * .86, h * .52, 700); x.fillText('GRATTIS MAJA 27', w / 2, h * .6);
      }, { x: .15, y: 4.4, z: -4.95, double: true });
      c.banner = banner;
      b.add(G.cyl(.012, .012, 4.7, 3), '#7a6a5a', [.15, 4.87, -5.0], [0, 0, Math.PI / 2]);
      // balloon bunch
      c.balloons = c.group(-2.2, 0, -4.8);
      const cols = [C.rose, C.gold, C.wine, '#7fc4e8', C.sage, C.paper];
      cols.forEach((col, i) => {
        const bl = c.mesh(m => bAddBalloon(m, 0, 0, 0, col), c.balloons);
        bl.position.set(Math.cos(i * 1.1) * .45, 2.7 + (i % 3) * .35, Math.sin(i * 1.1) * .3);
        bl.userData.base = bl.position.clone(); bl.userData.ph = i;
      });
    },
    idle(c, t) {
      c.flag.rotation.y = Math.sin(t * 2.1) * .18; c.flag.scale.x = 1 + Math.sin(t * 3.3) * .04;
      if (!c.flying) for (const bl of c.balloons.children) { bl.position.y = bl.userData.base.y + Math.sin(t * 1.6 + bl.userData.ph) * .07; bl.rotation.z = Math.sin(t * 1.2 + bl.userData.ph) * .08; }
    },
    async event(c) {
      c.flying = true; c.fx.sparkle(c.L(.15, 4.4, -4.9), 18, 1.5);
      anim(.6, p => c.banner.scale.set(1 + Math.sin(p * Math.PI) * .12, 1 + Math.sin(p * Math.PI) * .12, 1));
      await anim(2.6, p => { c.balloons.children.forEach((bl, i) => { bl.position.y = bl.userData.base.y + p * p * (9 + i); bl.position.x = bl.userData.base.x + Math.sin(p * 6 + i) * .4 * p; }); }, ease.linear);
      c.fx.confetti(c.L(-.2, 3.2, -3.5), 110); c.fx.confetti(c.L(1.8, 3.2, -4.5), 70);
      await wait(.8);
      c.balloons.children.forEach(bl => { bl.position.copy(bl.userData.base); bl.scale.setScalar(0); });
      anim(.8, p => c.balloons.children.forEach(bl => bl.scale.setScalar(p)), ease.back).then(() => { c.flying = false; });
    },
  },
  // ------------------------------------------------------------------ 1 Spackel (mini)
  { id: 'spackel', kind: 'mini', t: '08:30', name: 'Spackel',
    stand: [0.6, -2.5], camFix: { p: [2.4, 1.05, 9.4], t: [.9, 2.75, -6] },
    mattias: { p: [1.75, 2.12, -6.9], pose: 'stand' },
    spots: { film: [1.0, -4.75, .16] },
    build(c) {
      const { b, g } = c, wall = '#f3dfc4', wall2 = '#f6e6cf';
      b.add(G.box(5.4, .16, 4.4), '#c99b6b', [1, .08, -7]);
      for (let i = 0; i < 9; i++) b.add(G.box(.04, .005, 4.4), '#b58758', [-1.4 + i * .6, .162, -7]);
      b.add(G.box(5.4, 3.1, .2), wall2, [1, 1.7, -9.2]);
      for (let i = 0; i < 9; i++) b.add(G.box(.18, 3.0, .02), '#f0d3b4', [-1.4 + i * .6, 1.7, -9.09]);
      for (let i = 0; i < 24; i++) b.add(G.circ(.05, 6), C.rose, [-1.5 + (i % 8) * .62 + (Math.floor(i / 8) % 2) * .3, .9 + Math.floor(i / 8) * .8, -9.08]);
      b.add(G.box(.2, 3.1, 4.4), wall, [-1.7, 1.7, -7]);
      b.add(G.box(5.6, .1, .24), C.white, [1, .2, -9.05]);
      // ceiling with a hatch opening around (1.75, -6.9)
      const cy = 3.2;
      b.add(G.box(5.4, .2, 1.65), C.white, [1, cy, -8.37]);
      b.add(G.box(5.4, .2, 1.65), C.white, [1, cy, -5.63]);
      b.add(G.box(2.35, .2, 1.1), C.white, [-.53, cy, -7]);
      b.add(G.box(2.15, .2, 1.1), C.white, [2.85, cy, -7]);
      // the hole in the ceiling to be spackled
      b.add(G.circ(.28, 14), '#6b6158', [-.1, cy - .105, -5.6], [Math.PI / 2, 0, 0]);
      // window + curtains on back wall
      b.add(G.box(1.4, 1.2, .1), C.white, [2.4, 1.9, -9.1]); g.add(G.plane(1.15, .95), '#fff', [2.4, 1.9, -9.04]);
      b.add(G.box(.45, 1.7, .12), C.rose, [1.55, 1.8, -9.0]); b.add(G.box(.45, 1.7, .12), C.rose, [3.25, 1.8, -9.0]);
      // A-ladder
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(G.box(.08, 2.3, .08), '#c9cfd6', [1.75 + sx * .35, 1.1, -6.9 + sz * .55], [sz * .24, 0, 0]);
      for (let i = 0; i < 5; i++) b.add(G.box(.75, .05, .14), '#aab1ba', [1.75, .35 + i * .42, -6.9 + .5 - i * .1]);
      b.add(G.box(.8, .08, .5), '#aab1ba', [1.75, 2.08, -6.9]);
      // paint tray, roller, bucket, dust sheet, photo frames, plant
      b.add(G.box(2.2, .02, 1.6), '#cfe3ef', [.2, .17, -6.4]);
      b.add(G.box(.6, .06, .45), '#eeeeee', [-.4, .2, -6.0]).add(G.box(.5, .02, .35), '#f5f2ea', [-.4, .23, -6.0]);
      b.add(G.cyl(.06, .06, .35, 10), '#f6f1e6', [-.1, .3, -6.0], [0, 0, Math.PI / 2]).add(G.cyl(.015, .015, .6, 4), C.dark, [.1, .5, -6.0], [0, 0, .9]);
      b.add(G.cyl(.25, .22, .4, 14), C.white, [.9, .37, -5.5]).add(G.cyl(.26, .26, .08, 14), C.gold, [.9, .58, -5.5]);
      b.add(G.box(.7, .5, .05), C.gold, [-.3, 2.0, -9.08]).add(G.box(.6, .4, .06), C.sage, [-.3, 2.0, -9.06]);
      b.add(G.cyl(.18, .14, .35, 10), C.falu, [3.2, .33, -8.6]); bAddBush(b, 3.2, -8.6, .55, '#5f8466');
      c.patch = c.mesh(m => { m.add(G.circ(.42, 18), '#f4efe6', [0, 0, 0], [Math.PI / 2, 0, 0]); m.add(G.sph(.12, 8, 6), '#f4efe6', [.1, -.03, .05], [0, 0, 0], [1.5, .3, 1]); });
      c.patch.position.set(-.1, cy - .11, -5.6); c.patch.scale.setScalar(0);
      c.osynligt = c.sign(2.3, .62, drawBoard('Nästan osynligt!', { bg: C.paper, fg: C.wine, border: C.gold, size: .55 }), { x: .2, y: 2.55, z: -5.0, double: true });
      c.osynligt.scale.setScalar(0);
    },
    idle(c, t) { if (c.osynligt.scale.x > .5) c.osynligt.rotation.z = Math.sin(t * 2) * .04; },
    async event(c) {
      c.patch.scale.setScalar(0); c.osynligt.scale.setScalar(0);
      await anim(.35, p => c.patch.scale.set(p * 1.25, 1, p * 1.25), ease.back);
      c.fx.dust(c.L(-.1, 3.0, -5.6), 10, '#ffffff');
      await anim(.25, p => c.patch.scale.set(1.25 - p * .25, 1, 1.25 - p * .25));
      c.fx.sparkle(c.L(-.1, 2.9, -5.6), 18, .6);
      await anim(.5, p => c.osynligt.scale.setScalar(p), ease.back);
      await wait(1.2);
    },
  },
  // ------------------------------------------------------------------ 2 Neurokirurgen
  { id: 'neuro', kind: 'main', t: '09:00', name: 'Neurokirurgen',
    stand: [0.9, -2.7], 
    mattias: { p: [-1.25, 0, -6.9], pose: 'crouch' },
    npcs: [{ who: 'nurse', p: [2.4, 0, -6.0] }],
    build(c) {
      const { b, g } = c, W = '#f6f2ec', mint = '#9fd3c0';
      b.add(G.rbox(6.6, 4.2, 4, .12), W, [1.5, 2.1, -9.6]);
      b.add(G.box(6.7, .35, 4.1), mint, [1.5, 1.2, -9.6]);
      b.add(G.box(6.9, .3, 4.3), '#d9d2c8', [1.5, 4.25, -9.6]);
      // entrance canopy + doors
      b.add(G.rbox(2.6, .18, 1.5, .06), C.rose, [1.5, 2.55, -7.0]);
      for (const x of [.4, 2.6]) b.add(G.cyl(.06, .06, 2.5, 8), C.white, [x, 1.25, -6.4]);
      g.add(G.plane(1.7, 2.0), '#fff', [1.5, 1.0, -7.58]);
      b.add(G.box(.08, 2.0, .06), '#cfd8d8', [1.5, 1.0, -7.56]);
      // windows
      for (const x of [-.9, 3.9]) for (const y of [1.9, 3.3]) { b.add(G.box(1.1, .9, .08), mint, [x, y, -7.58]); g.add(G.plane(.9, .7), '#fff', [x, y, -7.53]); }
      for (const x of [.6, 2.4]) { b.add(G.box(1.1, .8, .08), mint, [x, 3.3, -7.58]); g.add(G.plane(.9, .6), '#fff', [x, 3.3, -7.53]); }
      // sign on facade
      c.sign(4.2, .62, drawBoard('Neurokirurgen', { bg: C.wine, fg: C.paper, border: C.gold }), { x: 1.5, y: 2.75, z: -7.18 });
      // round bushes + potted plants
      bAddBush(b, -1.1, -6.25, .9, '#6d8f58'); bAddBush(b, 4.2, -6.9, .8, '#6d8f58');
      bAddTree(b, -3.6, -8, { h: 3.8 }); bAddTree(b, 6, -9.5, { h: 4, col: C.gold }); bAddTree(b, -2.8, -12.5, { kind: 'spruce', s: 1.4 });
      for (const x of [.2, 2.8]) { b.add(G.cyl(.22, .17, .4, 10), C.wine, [x, .2, -6.3]); b.add(G.ico(.3, 1), '#6d8f58', [x, .6, -6.3]); }
      // heart monitor sign on post
      b.add(G.cyl(.05, .05, 1.6, 6), C.dark, [3.7, .8, -5.0]);
      b.add(G.rbox(1.25, .8, .12, .06), C.dark, [3.7, 2.0, -5.0]);
      c.ecg = c.sign(1.1, .66, (x, w, h) => drawECG(x, w, h, 0), { x: 3.7, y: 2.0, z: -4.93, px: 200 });
      // brain mascot on the roof
      const brain = c.group(1.5, 4.4, -9.0); c.brain = brain;
      const body = c.mesh(m => {
        const pk = '#f59ab0', pk2 = '#ee86a0';
        for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; m.add(G.ico(.42, 1), i % 2 ? pk : pk2, [Math.cos(a) * .72, .95 + Math.sin(a * 2) * .1 + Math.sin(a) * .45, Math.sin(a) * .35 - .1]); }
        m.add(G.sph(.95, 16, 12), pk, [0, 1.0, -.05], [0, 0, 0], [1.1, .82, .8]);
        for (let i = 0; i < 6; i++) m.add(G.tor(.3, .06, 5, 10, Math.PI), pk2, [-.6 + i * .24, 1.35 + (i % 2) * .15, .55], [0, 0, i % 2 ? 0 : Math.PI]);
        m.add(G.box(.05, .9, .1), '#e07894', [0, 1.4, .6]);
        m.add(G.sph(.12, 8, 6), '#ff6f8f', [-.55, .7, .62], [0, 0, 0], [1, .6, .4]); m.add(G.sph(.12, 8, 6), '#ff6f8f', [.55, .7, .62], [0, 0, 0], [1, .6, .4]);
        m.add(G.tor(.16, .04, 5, 10, Math.PI), '#5a2030', [0, .66, .66], [0, 0, Math.PI]);
        m.add(G.cyl(.08, .1, .5, 6), '#e07894', [-.5, .2, 0]); m.add(G.cyl(.08, .1, .5, 6), '#e07894', [.5, .2, 0]);
        m.add(G.sph(.13, 8, 6), C.wine, [-.5, .0, .05], [0, 0, 0], [1.2, .6, 1.4]); m.add(G.sph(.13, 8, 6), C.wine, [.5, .0, .05], [0, 0, 0], [1.2, .6, 1.4]);
      }, brain);
      c.eyes = [-1, 1].map(s => { const e = c.mesh(m => { m.add(G.sph(.17, 12, 10), '#ffffff', [0, 0, 0]); m.add(G.sph(.1, 10, 8), '#1c1418', [0, -.01, .1]); m.add(G.sph(.035, 6, 4), '#ffffff', [.04, .04, .19]); }, brain); e.position.set(s * .3, .98, .6); return e; });
      c.pick(brain, 'brain');
      c.wink = async () => {
        c.winking = true; c.fx.sparkle(c.L(1.5, 6, -8.6), 10, 1);
        await anim(.9, p => { c.brain.scale.set(1 + Math.sin(p * Math.PI * 3) * .12 * (1 - p), 1 - Math.sin(p * Math.PI * 3) * .12 * (1 - p), 1); c.brain.position.y = 4.4 + Math.sin(p * Math.PI) * 1.0; });
        await anim(.5, p => { c.eyes[1].scale.y = p < .5 ? 1 - p * 1.8 : .1 + (p - .5) * 1.8; });
        c.eyes[1].scale.y = 1; c.winking = false;
      };
    },
    idle(c, t, dt, st) {
      c.brain.position.y = 4.4 + Math.abs(Math.sin(t * 2.2)) * (st === 'visited' ? .12 : .04);
      c.brain.rotation.y = Math.sin(t * .8) * .15;
      const blink = (t % 4.2) < .12; c.eyes.forEach(e => { if (!c.winking) e.scale.y = blink ? .1 : 1; });
      c._ecgT = (c._ecgT || 0) + dt; if (c._ecgT > .07) { c._ecgT = 0; c.ecg.userData.ct.setDraw((x, w, h) => drawECG(x, w, h, t)); }
    },
    async react(c) { await c.wink(); },
    async event(c) {
      const w = c.wink();
      for (let i = 0; i < 3; i++) { await wait(.45); c.fx.hearts(c.L(3.7, 2.6, -4.8), 4); }
      await w;
    },
  },
  // ------------------------------------------------------------------ 3 Spelkväll (mini)
  { id: 'spelkvall', kind: 'mini', t: '09:30', name: 'Spelkväll',
    stand: [0.6, -2.5], 
    mattias: { p: [2.25, .15, -9.15], pose: 'peek' },
    npcs: [{ who: 'friend1', p: [.6, .15, -7.0], face: [-.9, -6.4] }, { who: 'friend2', p: [1.6, .15, -7.5], face: [-.9, -6.4] }, { who: 'friend3', p: [2.6, .15, -6.6], face: [-.9, -6.4] }],
    // sofa = Maja (front edge, middle-left); sofaL/sofaR = the outer cushions for two friends. Seat top y = .81.
    spots: { sofa: [1.45, -8.13, .15], sofaL: [.7, -8.5, .15], sofaR: [2.23, -7.76, .15] },
    build(c) {
      const { b, g } = c;
      b.add(G.box(6.4, .15, 5.2), '#b98a5e', [1, .075, -7.2]);
      b.add(G.cyl(1.8, 1.8, .02, 28), C.rose, [1.3, .16, -7.1]);
      b.add(G.box(6.4, 3.0, .2), '#f1e2c4', [1, 1.6, -9.8]);
      for (let i = 0; i < 10; i++) b.add(G.box(.12, 2.8, .02), '#ead5ae', [-1.8 + i * .62, 1.6, -9.69]);
      b.add(G.box(.2, 3.0, 5.2), '#e6d2b0', [-1.4, 1.6, -7.2]);
      // sofa facing the TV on the left wall
      const sofa = mat4([1.6, .15, -8.4], [0, -.45, 0]);
      const S = (geo, col, p, r) => b.addM(geo, col, sofa.clone().multiply(mat4(p, r)));
      S(G.rbox(2.8, .45, 1.0, .12), '#8c3a5a', [0, .3, 0]); S(G.rbox(2.8, .8, .3, .12), '#8c3a5a', [0, .75, -.42]);
      S(G.rbox(.3, .6, 1.0, .12), '#7a2f4d', [-1.4, .45, 0]); S(G.rbox(.3, .6, 1.0, .12), '#7a2f4d', [1.4, .45, 0]);
      for (const x of [-.85, 0, .85]) S(G.rbox(.8, .16, .8, .07), '#a24a6c', [x, .58, .05]);
      S(G.rbox(.5, .4, .15, .07), C.gold, [-.7, .85, -.25], [-.2, 0, .2]); S(G.rbox(.45, .4, .15, .07), C.sage, [.75, .85, -.25], [-.2, 0, -.15]);
      // coffee table + snacks
      b.add(G.rbox(1.3, .1, .7, .04), C.woodL, [.6, .55, -6.6]); for (const [x, z] of [[.05, -6.35], [1.15, -6.35], [.05, -6.85], [1.15, -6.85]]) b.add(G.box(.06, .4, .06), C.woodD, [x, .35, z]);
      b.add(G.sph(.25, 12, 8, 0, TAU, Math.PI / 2, Math.PI / 2), '#e9edf2', [.45, .85, -6.6]); for (let i = 0; i < 9; i++) b.add(G.ico(.06, 0), '#fff3c4', [.45 + rr(-.12, .12), .68 + rr(0, .05), -6.6 + rr(-.12, .12)]);
      for (const x of [.95, 1.1]) b.add(G.cyl(.05, .05, .2, 8), x > 1 ? C.rose : C.gold, [x, .7, -6.55]);
      // TV on low cabinet against the left wall, screen faces +x
      b.add(G.box(.6, .5, 2.0), C.woodD, [-.95, .4, -6.6]);
      b.add(G.rbox(.12, 1.15, 2.0, .04), '#1d1a20', [-1.05, 1.35, -6.6], [0, .35, 0]);
      c.tv = c.sign(1.85, 1.02, (x, w, h) => drawKart(x, w, h, 0), { x: -.98, y: 1.35, z: -6.6, ry: Math.PI / 2 + .35, px: 220 });
      c.tv.material.emissiveIntensity = .9;
      // floor lamp, plant, frames
      b.add(G.cyl(.03, .03, 1.7, 6), C.dark, [3.7, 1.0, -9.2]).add(G.cyl(.25, .25, .04, 12), C.dark, [3.7, .17, -9.2]);
      b.add(G.cyl(.18, .3, .35, 14, true), C.cream, [3.7, 1.95, -9.2]); g.add(G.sph(.1, 8, 6), '#fff', [3.7, 1.85, -9.2]);
      b.add(G.cyl(.2, .16, .45, 10), C.sage, [-.8, .37, -9.3]); bAddBush(b, -.8, -9.3, .6, '#5f8466');
      for (const [x, y, col] of [[0, 2.2, C.gold], [.9, 2.4, C.rose], [2.6, 2.25, C.sage]]) b.add(G.box(.6, .5, .04), C.woodD, [x, y, -9.68]).add(G.box(.5, .4, .05), col, [x, y, -9.67]);
      bAddTree(b, -4, -8, { h: 3.6 }); bAddTree(b, 5.6, -9.4, { kind: 'spruce', s: 1.3 });
    },
    idle(c, t, dt) { c._tvT = (c._tvT || 0) + dt; if (c._tvT > .08 && !c.flash) { c._tvT = 0; c.tv.userData.ct.setDraw((x, w, h) => drawKart(x, w, h, t)); } },
    async event(c) {
      c.flash = true;
      for (let i = 0; i < 6; i++) { c.tv.userData.ct.setDraw((x, w, h) => drawVinst(x, w, h, i % 2)); await wait(.22); }
      c.fx.confetti(c.L(.9, 2.6, -6.6), 120); c.bubble('VINST!', [-.6, 2.4, -6.3], { h: .9, bg: C.gold });
      await wait(1.6); c.flash = false;
    },
  },
  // ------------------------------------------------------------------ 4 Zara-scenen
  { id: 'zara', kind: 'main', t: '10:00', name: 'Zara-scenen',
    stand: [0.9, -2.7], 
    mattias: { p: [2.7, 0, -4.9], pose: 'stand', face: 'cam' },
    npcs: [{ who: 'fan', p: [1.7, 0, -5.1], face: [1.5, -9] }, { who: 'fan', p: [3.5, 0, -5.2], face: [1.5, -9] }],
    build(c) {
      const { b, g } = c;
      b.add(G.rbox(6.4, .8, 3.6, .08), C.night, [1.5, .4, -8.6]); b.add(G.box(6.5, .08, .1), C.gold, [1.5, .8, -6.82]);
      for (let i = 0; i < 16; i++) b.add(G.box(.42, 4.2, .2), i % 2 ? '#7a1838' : C.wine, [-1.6 + i * .41, 2.9, -10.3]);
      // truss
      for (const x of [-1.8, 4.8]) { b.add(G.box(.25, 5.6, .25), '#9a9aa4', [x, 2.8, -7.2]); for (let i = 0; i < 6; i++) b.add(G.box(.05, .5, .05), '#9a9aa4', [x, .5 + i * .9, -7.07], [0, 0, .7]); }
      b.add(G.box(6.85, .25, .25), '#9a9aa4', [1.5, 5.55, -7.2]);
      // speakers
      for (const x of [-1.6, 4.6]) for (let k = 0; k < 2; k++) { b.add(G.rbox(1.0, 1.1, .8, .05), '#232026', [x, .55 + k * 1.12, -6.3]); b.add(G.cyl(.3, .3, .05, 14), '#4a4650', [x, .5 + k * 1.12, -5.88], [Math.PI / 2, 0, 0]); b.add(G.cyl(.12, .12, .05, 10), '#4a4650', [x, .9 + k * 1.12, -5.88], [Math.PI / 2, 0, 0]); }
      // mic stand
      b.add(G.cyl(.02, .02, 1.3, 6), '#bbb', [1.5, 1.45, -7.6]).add(G.sph(.06, 8, 6), '#333', [1.5, 2.12, -7.6]);
      // neon sign
      const neon = c.sign(3.6, .9, (x, w, h) => { x.fillStyle = '#1b1020'; rrect(x, 0, 0, w, h, 30); x.fill(); x.shadowColor = '#ff8fa3'; x.shadowBlur = 24; x.fillStyle = '#ffd6e0'; x.textAlign = 'center'; x.textBaseline = 'middle'; fitText(x, 'ZARA-SCENEN', w * .85, h * .6, 700); x.fillText('ZARA-SCENEN', w / 2, h * .54); }, { x: 1.5, y: 4.65, z: -10.15 });
      neon.material.emissiveIntensity = .8;
      // spot cans + beams
      c.beams = [];
      [[-.4, C.rose], [1.5, '#ffe28a'], [3.4, '#8fd3ff']].forEach(([x, col], i) => {
        b.add(G.cyl(.18, .24, .4, 10), '#2a2830', [x, 5.25, -7.2]);
        const pivot = c.group(x, 5.15, -7.2);
        const beam = new THREE.Mesh(new THREE.ConeGeometry(.9, 5.2, 20, 1, true).translate(0, -2.6, 0), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
        pivot.add(beam); pivot.userData.ph = i * 2.1; c.beams.push(pivot);
      });
      bAddTree(b, -4.2, -8.5, { h: 3.8, col: '#d6532e' }); bAddTree(b, 7, -9, { kind: 'spruce', s: 1.4 });
    },
    idle(c, t, dt, st) {
      const k = c.party ? 3 : st === 'visited' ? 1 : .4;
      c.beams.forEach((p, i) => { p.rotation.z = Math.sin(t * .9 * k + p.userData.ph) * .5; p.rotation.x = Math.cos(t * .7 * k + p.userData.ph) * .35 + .25; p.children[0].material.opacity = (c.party ? .32 : .14) * (st === 'locked' ? .3 : 1) * (1 + c.glowAmt * .8); });
    },
    async event(c) {
      c.party = true;
      for (let i = 0; i < 4; i++) { c.fx.notes(c.L(1.5, 2.2, -7.5), 6); await wait(.6); }
      c.fx.sparkle(c.L(1.5, 3.5, -7), 20, 2); await wait(.8); c.party = false;
    },
  },
];

// canvas animations
function drawECG(x, w, h, t) {
  x.fillStyle = '#10261f'; rrect(x, 0, 0, w, h, 14); x.fill();
  x.strokeStyle = '#7dffb5'; x.lineWidth = 5; x.shadowColor = '#7dffb5'; x.shadowBlur = 10; x.beginPath();
  for (let i = 0; i <= 60; i++) {
    const u = i / 60, ph = (u * 2 - t * .6) % 1, q = ph < 0 ? ph + 1 : ph;
    let y = .55; if (q > .4 && q < .45) y = .55 - (q - .4) * 8; else if (q >= .45 && q < .5) y = .15 + (q - .45) * 16; else if (q >= .5 && q < .55) y = .95 - (q - .5) * 8;
    x.lineTo(u * w, y * h);
  }
  x.stroke(); x.shadowBlur = 0; x.fillStyle = '#ff6f8f'; x.font = `600 ${h * .3}px ${FONT}`; x.textAlign = 'right'; x.textBaseline = 'top'; x.fillText('♥ 72', w - 10, 6);
  x.fillStyle = '#7dffb5'; x.textAlign = 'left'; x.font = `600 ${h * .2}px ${FONT}`; x.fillText('GCS 15', 10, 8);
}
function drawKart(x, w, h, t) {
  x.fillStyle = '#7cc56a'; x.fillRect(0, 0, w, h); x.fillStyle = '#a7d7f5'; x.fillRect(0, 0, w, h * .22);
  x.strokeStyle = '#6b6b70'; x.lineWidth = h * .2; x.beginPath(); x.ellipse(w / 2, h * .6, w * .36, h * .25, 0, 0, TAU); x.stroke();
  x.strokeStyle = '#fff'; x.lineWidth = 3; x.setLineDash([10, 10]); x.stroke(); x.setLineDash([]);
  ['#ff4f6d', '#ffd23f', '#4fa3ff', '#b46bff'].forEach((col, i) => { const a = t * (1.6 + i * .17) + i * .9; x.fillStyle = col; x.beginPath(); x.arc(w / 2 + Math.cos(a) * w * .36, h * .6 + Math.sin(a) * h * .25, h * .07, 0, TAU); x.fill(); });
  x.fillStyle = '#fff'; x.font = `700 ${h * .14}px ${FONT}`; x.textAlign = 'left'; x.textBaseline = 'top'; x.fillText(`VARV ${1 + Math.floor(t / 4) % 3}/3`, 10, 6);
}
function drawVinst(x, w, h, on) {
  x.fillStyle = on ? C.gold : C.wine; x.fillRect(0, 0, w, h); x.fillStyle = on ? C.wine : C.paper; x.textAlign = 'center'; x.textBaseline = 'middle';
  fitText(x, 'VINST!', w * .8, h * .55, 700); x.fillText('VINST!', w / 2, h * .48); x.font = `600 ${h * .16}px ${FONT}`; x.fillText('🏆 1:a plats', w / 2, h * .8);
}

STOPS.push(
  // ------------------------------------------------------------------ 5 Fårhagen (mini)
  { id: 'farhagen', kind: 'mini', t: '10:30', name: 'Fårhagen',
    stand: [0.4, -2.5], 
    mattias: { p: [.35, 0, -7.9], pose: 'crouch' },
    spots: { lamb: [.1, -3.35, PH] },
    build(c) {
      const { b } = c;
      b.add(G.box(10, .02, 9), '#8aa66a', [1, .01, -9]);
      gardsgard(b, -3.6, -4.6, -3.6, -13.5); gardsgard(b, -3.6, -13.5, 6.4, -13.5); gardsgard(b, 6.4, -13.5, 6.4, -4.6);
      // shelter + hay rack
      b.add(G.box(2.6, 1.6, .15), C.woodD, [-1.8, .8, -12.6]); b.add(G.box(.15, 1.6, 1.6), C.woodD, [-3.0, .8, -11.8]);
      b.add(G.box(2.9, .12, 2.0), C.falu, [-1.8, 1.7, -11.9], [.25, 0, 0]);
      b.add(G.box(1.6, .7, .7), C.hay, [4.6, .6, -11.8]); for (let i = 0; i < 6; i++) b.add(G.box(.05, .9, .05), C.woodD, [3.9 + i * .28, .6, -11.45]);
      bAddTree(b, -5.5, -10, { h: 4, col: C.gold }); bAddTree(b, 8, -11, { h: 3.5 }); bAddTree(b, 2, -16, { kind: 'spruce', s: 1.5 }); bAddTree(b, -1, -17, { kind: 'spruce', s: 1.3 });
      for (let i = 0; i < 14; i++) b.add(G.cone(.08, .25, 4), '#6f8f4f', [rr(-3, 6), .12, rr(-5, -13)]);
      c.sheep = [];
      [[-1.9, -7.5, .2], [-.6, -8.1, .05], [1.25, -8.15, -.05], [2.6, -7.6, -.2], [4.0, -8.3, -.35]].forEach(([x, z, ry], i) => {
        const s = makeSheep(c.mat, i === 2 ? 1.05 : .95); s.position.set(x, 0, z); s.rotation.y = ry; c.root.add(s); c.sheep.push(s); c.pick(s, 'sheep'); s.userData.ph = i * 1.3;
      });
      c.lambs = [];
      [[-.9, -4.3, .5], [1.15, -4.7, -.4]].forEach(([x, z, ry], i) => { const l = makeLamb(c.mat); l.position.set(x, 0, z); l.rotation.y = ry; c.root.add(l); c.lambs.push(l); c.pick(l, 'lamb'); l.userData.ph = i; });
    },
    idle(c, t) {
      c.sheep.forEach(s => { if (!s.userData.busy) { s.userData.head.rotation.x = Math.sin(t * .7 + s.userData.ph) * .08 + .05; s.userData.head.rotation.y = Math.sin(t * .5 + s.userData.ph) * .15; } });
      c.lambs.forEach(l => { if (!l.userData.busy) l.rotation.z = Math.sin(t * 3 + l.userData.ph) * .03; });
    },
    async react(c, id, obj) {
      if (id === 'sheep') {
        const list = obj ? [findRoot(obj, c.sheep)] : c.sheep;
        list.forEach((s, i) => wiggleSheep(c, s, i * .25));
      } else if (id === 'lamb') {
        const list = obj ? [findRoot(obj, c.lambs)] : c.lambs;
        list.forEach(l => hop(l, 2)); list.forEach(l => c.fx.hearts(l.getWorldPosition(V3()).add(V3(0, 1, 0)), 4));
      }
    },
    async event(c) {
      c.sheep.forEach((s, i) => wiggleSheep(c, s, i * .32, i % 2 ? 'BÄÄ' : 'BÄÄÄ'));
      await wait(.6); c.lambs.forEach((l, i) => setTimeout(() => hop(l, 3), i * 200));
      await wait(1.8);
    },
  },
  // ------------------------------------------------------------------ 6 Skäftesfall
  { id: 'skaftesfall', kind: 'main', t: '11:00', name: 'Skäftesfall', cdx: -1.0, tdx: -.9, sign: [.15, -3.95],
    stand: [1.9, -2.7], 
    mattias: { p: [4.45, 0, -6.35], pose: 'peek' },
    build(c) {
      const { b, g } = c;
      // barn
      const bx = .5, bz = -10.2, W = 6.4, D = 5, H = 3.4;
      b.add(G.box(W, H, D), C.falu, [bx, H / 2, bz]);
      const rh = 2.4, sh = new THREE.Shape([new THREE.Vector2(-D / 2 - .3, 0), new THREE.Vector2(-D / 2 + .5, rh * .65), new THREE.Vector2(0, rh), new THREE.Vector2(D / 2 - .5, rh * .65), new THREE.Vector2(D / 2 + .3, 0)]);
      b.add(new THREE.ExtrudeGeometry(sh, { depth: W + .4, bevelEnabled: false }), '#4a3a3e', [bx - W / 2 - .2, H, bz], [0, Math.PI / 2, 0]);
      const gab = new THREE.Shape([new THREE.Vector2(-D / 2, 0), new THREE.Vector2(-D / 2 + .5, rh * .65 - .1), new THREE.Vector2(0, rh - .15), new THREE.Vector2(D / 2 - .5, rh * .65 - .1), new THREE.Vector2(D / 2, 0)]);
      b.add(new THREE.ExtrudeGeometry(gab, { depth: W - .05, bevelEnabled: false }), C.falu, [bx - W / 2 + .025, H, bz], [0, Math.PI / 2, 0]);
      for (const sx of [-1, 1]) b.add(G.box(.18, H, .18), C.white, [bx + sx * W / 2, H / 2, bz + D / 2]);
      b.add(G.box(W + .1, .16, .2), C.white, [bx, H, bz + D / 2]);
      // door opening (dark) + open doors with white X
      const dx = bx - .9, dw = 2.1, dh = 2.6;
      b.add(G.box(dw, dh, .1), '#2a1a18', [dx, dh / 2, bz + D / 2 + .01]);
      for (const sx of [-1, 1]) {
        const ox = dx + sx * (dw / 2 + .55);
        b.add(G.box(1.05, dh, .1), C.falu, [ox, dh / 2, bz + D / 2 + .08]);
        b.add(G.box(1.05, .12, .12), C.white, [ox, dh - .06, bz + D / 2 + .14]); b.add(G.box(1.05, .12, .12), C.white, [ox, .06, bz + D / 2 + .14]);
        for (const r of [-.95, .95]) b.add(G.box(.1, 2.7, .12), C.white, [ox, dh / 2, bz + D / 2 + .14], [0, 0, r * .38]);
      }
      b.add(G.box(1.0, 1.0, .1), C.white, [bx, H + .9, bz + D / 2 + .02]); b.add(G.box(.8, .8, .1), '#4a2a22', [bx, H + .9, bz + D / 2 + .04]);
      g.add(G.plane(.6, .6), '#fff', [bx + 2.1, 2.0, bz + D / 2 + .06]); b.add(G.box(.8, .8, .08), C.white, [bx + 2.1, 2.0, bz + D / 2 + .02]);
      // bales
      const bale = (x, z, col, r = .7, rot = 0) => { b.add(G.cyl(r, r, 1.2, 16), col, [x, r, z], [0, rot, Math.PI / 2]); b.add(G.cyl(r * .7, r * .7, 1.22, 14), col === C.straw ? '#c99f4f' : '#e9eef0', [x, r, z], [0, rot, Math.PI / 2]); };
      bale(4.4, -5.6, C.straw); bale(5.4, -7.8, '#f4f6f6', .65, .4); bale(6.6, -7.1, '#f4f6f6', .65, -.2); bale(-3.6, -7.0, '#f4f6f6', .65, .1);
      // plowed field + fence
      for (let i = 0; i < 8; i++) b.add(G.box(7, .08, .5), i % 2 ? '#7b5a3c' : '#8e6a46', [8.5, .04, -11 - i * .8]);
      bAddFence(b, 4.6, -10.5, 11, -10.5, { col: C.white, h: .8 });
      bAddTree(b, -5.4, -7.5, { h: 4.2 }); bAddTree(b, 9, -8, { h: 3.6, col: C.gold }); bAddTree(b, -4, -14.5, { kind: 'spruce', s: 1.6 }); bAddTree(b, 4.2, -15.5, { kind: 'spruce', s: 1.4 });
      // horse inside the door
      c.horse = makeHorseHead(c.mat); c.horse.position.set(dx, .6, bz + D / 2 - 1.2); c.horseX = dx; c.root.add(c.horse); c.pick(c.horse, 'horse');
      // HÄSTFRI ZON sign (drops in)
      const hs = c.group(2.7, 9, -5.0); c.hsign = hs; hs.visible = false;
      c.mesh(m => { m.add(G.cyl(.06, .06, 2.2, 8), C.dark, [0, 1.1, -.05]); }, hs);
      const face = c.sign(1.25, 1.25, (x, w, h) => {
        x.fillStyle = '#fff'; x.beginPath(); x.arc(w / 2, h / 2, w * .46, 0, TAU); x.fill(); x.lineWidth = w * .08; x.strokeStyle = '#d92d3a'; x.stroke();
        x.font = `${w * .5}px system-ui, "Apple Color Emoji"`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('🐴', w / 2, h * .53);
        x.beginPath(); x.moveTo(w * .2, h * .2); x.lineTo(w * .8, h * .8); x.lineWidth = w * .08; x.stroke();
      }, { x: 0, y: 2.7, z: 0, parent: hs, px: 200, double: false });
      c.sign(1.7, .45, drawBoard('HÄSTFRI ZON', { bg: '#d92d3a', fg: '#fff', border: '#fff', size: .62 }), { x: 0, y: 1.75, z: .02, parent: hs });
      void face;
    },
    idle(c, t) { if (!c.busy) c.horse.rotation.y = Math.sin(t * .6) * .1; },
    reset(c) { c.hsign.visible = false; c.hsign.position.y = 9; },
    async react(c) {
      if (c.busy) return; c.busy = true;
      await anim(.5, p => { c.horse.position.z = -8.9 + p * .9; c.horse.position.y = .6 + Math.sin(p * Math.PI) * .2; }, ease.back);
      await wait(.5); await anim(.4, p => { c.horse.position.z = -8.0 - p * .9; }, ease.inOut); c.busy = false;
    },
    async event(c) {
      c.busy = true; c.hsign.visible = false;
      await anim(.7, p => { c.horse.position.z = -8.9 + p * 2.0; c.horse.position.y = .6 + p * .15; c.horse.rotation.x = -p * .2; }, ease.back);
      c.bubble('?', [-.4, 3.4, -7.2], { h: .7 }); await wait(1.0);
      await anim(.6, p => { c.horse.position.z = -6.9 - p * 2.0; c.horse.position.y = .75 - p * .15; c.horse.rotation.x = -.2 + p * .2; }, ease.inOut);
      c.hsign.visible = true;
      await anim(.9, p => { c.hsign.position.y = 9 * (1 - p); }, ease.bounce);
      c.fx.dust(c.L(2.7, .1, -5.0), 10); c.fx.sparkle(c.L(2.7, 2.6, -4.9), 10, .8);
      c.busy = false;
    },
  },
  // ------------------------------------------------------------------ 7 Patriks gård (mini)
  { id: 'patrik', kind: 'mini', t: '11:30', name: 'Patriks gård', sign: [3.25, -3.35], cdx: -1.6, tdx: -1.6,
    stand: [2.4, -2.5], 
    mattias: { p: [2.42, 1.05, -9.87], pose: 'sit', face: .7 },
    npcs: [{ who: 'patrik', p: [1.95, 0, -7.3], face: [.9, -6.3] }],
    build(c) {
      const { b, g } = c;
      b.add(G.box(10, .02, 8), '#b39c78', [1, .01, -9]);
      // Maskinhall
      const mx = 4.0, mz = -12.6;
      b.add(G.box(6.4, 3.4, 4), '#8c3a30', [mx, 1.7, mz]);
      for (let i = 0; i < 21; i++) b.add(G.box(.08, 3.4, .06), '#7a3028', [mx - 3.15 + i * .315, 1.7, mz + 2.02]);
      b.add(G.box(3.2, 2.7, .1), '#2a2224', [mx - 1.2, 1.35, mz + 2.06]);
      b.add(G.box(6.8, .25, 4.6), '#6a6a72', [mx, 3.5, mz], [0, 0, .06]);
      c.sign(2.6, .5, drawBoard('MASKINHALL', { bg: C.paper, fg: C.night, border: C.night, size: .6 }), { x: mx - 1.2, y: 3.05, z: mz + 2.12 });
      c.sign(1.2, 1.55, (x, w, h) => {
        x.fillStyle = '#fbe9b8'; x.fillRect(0, 0, w, h); x.fillStyle = C.wine; x.fillRect(0, 0, w, h * .18); x.fillStyle = C.paper; x.textAlign = 'center'; x.textBaseline = 'middle';
        fitText(x, 'KONSERT', w * .85, h * .12, 700); x.fillText('KONSERT', w / 2, h * .09);
        x.fillStyle = C.night; fitText(x, 'Patrik', w * .8, h * .2, 700); x.fillText('Patrik', w / 2, h * .34);
        x.fillStyle = C.wine; fitText(x, '60', w * .8, h * .3, 700); x.fillText('60', w / 2, h * .57);
        x.fillStyle = C.night; fitText(x, 'konsert kl 19', w * .86, h * .11, 600); x.fillText('konsert kl 19', w / 2, h * .8);
        x.font = `${h * .1}px system-ui`; x.fillText('🎸 🚜 🎤', w / 2, h * .92);
      }, { x: mx + 1.6, y: 1.6, z: mz + 2.13, px: 220 });
      // log stack
      for (let r = 0; r < 3; r++) for (let i = 0; i < 4 - r; i++) { b.add(G.cyl(.22, .22, 1.6, 10), '#9a6a42', [-1.4 + i * .44 + r * .22, .22 + r * .38, -11.0], [Math.PI / 2, 0, 0]); b.add(G.cyl(.18, .18, 1.62, 10), '#d9b07a', [-1.4 + i * .44 + r * .22, .22 + r * .38, -11.0], [Math.PI / 2, 0, 0]); }
      // paddock fence + cows
      bAddFence(b, 3.8, -4.4, 8, -4.4, { col: C.woodD, h: .9 }); bAddFence(b, 3.8, -4.4, 3.8, -8.6, { col: C.woodD, h: .9 }); bAddFence(b, 3.8, -8.6, 8, -8.6, { col: C.woodD, h: .9 });
      c.cows = [];
      [[4.7, -5.5, -.7], [6.6, -7.4, -1.0]].forEach(([x, z, ry]) => { const k = makeCow(c.mat); k.position.set(x, 0, z); k.rotation.y = ry; c.root.add(k); c.cows.push(k); c.pick(k, 'cow'); });
      c.hens = [];
      [[3.3, -5.0, 0, false], [2.4, -5.6, 1, true], [1.3, -4.9, 2, false], [3.2, -6.3, 3, true]].forEach(([x, z, ry, br]) => { const h = makeHen(c.mat, br); h.position.set(x, 0, z); h.rotation.y = ry; c.root.add(h); c.hens.push(h); c.pick(h, 'hen'); h.userData.ph = ry; });
      // parked tractor (Mattias sits in the cab)
      const tr = makeTractor(c.mat); tr.position.set(2.9, 0, -9.3); tr.rotation.y = .7; c.root.add(tr); c.tractor = tr; c.pick(tr, 'tractor');
      // the tree Patrik is about to fell
      const tree = c.group(.9, 0, -6.3); c.tree = tree;
      c.mesh(m => { m.add(G.cyl(.16, .22, 3.0, 8), '#efeae2', [0, 1.5, 0]); for (const y of [.6, 1.3, 2.1]) m.add(G.box(.05, .08, .34), '#3a3335', [.15, y, 0]); m.add(G.ico(1.1, 1), C.gold, [0, 3.4, 0], [0, 0, 0], [1, 1.2, 1]); m.add(G.ico(.7, 1), C.orange, [.5, 2.9, .3]); }, tree);
      b.add(G.cyl(.22, .24, .25, 8), '#d9b07a', [.9, .12, -6.3]);
      bAddTree(b, -4.4, -9, { kind: 'spruce', s: 1.5 }); bAddTree(b, 8, -10, { h: 4 }); bAddTree(b, -4.4, -14, { h: 4.2, col: '#d6532e' });
      void g;
    },
    idle(c, t, dt) {
      c.hens.forEach((h, i) => { if (h.userData.busy) return; const k = Math.max(0, Math.sin(t * 2.4 + h.userData.ph * 2)); h.rotation.x = k > .8 ? (k - .8) * 2.5 : 0; });
      c.cows.forEach((k, i) => { k.userData.head.rotation.z = Math.sin(t * .9 + i) * .08; });
    },
    reset(c) { c.tree.rotation.set(0, 0, 0); c.tree.scale.setScalar(1); },
    async react(c, id, obj) {
      if (id === 'hen') { const h = obj ? findRoot(obj, c.hens) : pick(c.hens); layEgg(c, h); }
      else if (id === 'cow') { const list = obj ? [findRoot(obj, c.cows)] : c.cows; list.forEach(k => { c.fx.hearts(k.getWorldPosition(V3()).add(V3(0, 2, 0)), 6); anim(1.2, p => { k.userData.head.rotation.x = Math.sin(p * Math.PI * 4) * .15 * (1 - p); }); }); }
      else if (id === 'tractor') tractorHonk(c, c.tractor);
    },
    async event(c) {
      const tr = c.tree; tr.rotation.set(0, 0, 0); tr.scale.setScalar(1);
      c.bubble('BRRRMM!', [2.0, 2.5, -7.0], { h: .6, dur: 1.4 });
      await anim(.9, (_, p) => { tr.rotation.x = Math.sin(p * 45) * .02; R() < .3 && c.fx.dust(c.L(1.05, .4, -6.2), 1, '#e8cf9a'); });
      c.bubble('TIMBER!', [1.1, 4.4, -6.2], { h: .85, bg: C.gold, dur: 2 });
      await anim(1.0, p => { tr.rotation.z = p * 1.48; }, ease.in);
      await anim(.3, p => { tr.rotation.z = 1.48 + Math.sin(p * Math.PI) * .06; });
      c.fx.dust(c.L(-1.6, .3, -6.3), 18); c.fx.leaves(c.L(-1.8, .5, -6.3), 30);
      await wait(.3);
      c.bubble('?', [1.95, 2.1, -7.3], { h: 1.0, dur: 2.4 });
      await wait(1.4);
      setTimeout(() => { anim(1.0, p => { tr.rotation.z = 0; tr.scale.setScalar(p); }, ease.back); }, 9000);
    },
  },
  // ------------------------------------------------------------------ 8 Sparade recept
  { id: 'recept', kind: 'main', t: '12:00', name: 'Sparade recept',
    stand: [0.8, -2.7], 
    mattias: { p: [2.55, .55, -7.6], pose: 'stand' },
    build(c) {
      const { b, g } = c;
      // food truck (faces +z)
      const T = mat4([2.5, 0, -7.6], [0, -.12, 0]);
      const A = (geo, col, p, r) => b.addM(geo, col, T.clone().multiply(mat4(p, r)));
      A(G.rbox(4.4, 2.4, 2.1, .25), '#bfe3d0', [0, 1.75, 0]); A(G.rbox(1.4, 1.7, 2.0, .25), '#bfe3d0', [2.7, 1.4, 0]);
      A(G.box(1.0, .8, .05), '#cfe8f4', [3.0, 1.85, 1.0]);
      A(G.box(2.6, 1.0, .08), '#2a2224', [-.3, 2.0, 1.02]); A(G.box(2.9, .12, .5), C.woodL, [-.3, 1.45, 1.25]);
      for (let i = 0; i < 7; i++) A(G.box(.42, .08, .8), i % 2 ? C.paper : C.rose, [-1.56 + i * .42, 2.72, 1.38], [.35, 0, 0]);
      for (const x of [-1.4, 1.4, 2.6]) A(G.cyl(.38, .38, .3, 14), '#2a2628', [x, .38, x > 2 ? .85 : 1.0], [Math.PI / 2, 0, 0]);
      A(G.box(4.5, .1, 2.15), C.gold, [0, .6, 0]);
      const tsign = c.sign(3.4, .62, drawBoard('Sparade recept', { bg: C.wine, fg: C.paper, border: C.gold, size: .56 }), { x: 2.25, y: 3.33, z: -6.55, ry: -.12 });
      void tsign;
      // outdoor kitchen
      b.add(G.box(1.5, .85, .8), C.woodL, [-.3, .43, -5.3]).add(G.box(1.6, .06, .9), '#e5ddd0', [-.3, .88, -5.3]);
      b.add(G.cyl(.32, .28, .42, 14), '#9aa0a8', [-.6, 1.12, -5.3]).add(G.tor(.32, .03, 5, 14), '#9aa0a8', [-.6, 1.33, -5.3], [Math.PI / 2, 0, 0]);
      b.add(G.box(.5, .04, .35), C.woodD, [.1, .92, -5.2]); b.add(G.sph(.09, 8, 6), C.red, [.05, .99, -5.2]); b.add(G.sph(.09, 8, 6), '#7fae52', [.25, .99, -5.25]);
      // giant phone billboard
      b.add(G.box(.18, 2.4, .18), C.dark, [-.3, 1.2, -11.2]).add(G.box(.18, 2.4, .18), C.dark, [1.7, 1.2, -11.2]);
      b.add(G.rbox(3.3, 5.8, .3, .35), '#1d1a20', [.7, 5.1, -11.2]);
      b.add(G.rbox(.9, .14, .1, .05), '#3a3640', [.7, 7.75, -11.03]);
      c.tilesState = { list: ['🍝', '🥗', '🌮', '🍜', '🥘', '🍕', '🍰', '🥞', '🍣'], spin: null };
      c.phone = c.sign(2.95, 5.2, (x, w, h) => drawTiles(x, w, h, c.tilesState), { x: .7, y: 5.05, z: -11.04, px: 150 });
      c.phone.material.emissiveIntensity = .5;
      bAddTree(b, -4, -9, { h: 4 }); bAddTree(b, 6.6, -10, { h: 3.6, col: C.gold }); bAddTree(b, -2.5, -14.5, { kind: 'spruce', s: 1.5 });
      // bistro table
      b.add(G.cyl(.45, .45, .05, 14), C.paper, [5.4, .8, -6.0]).add(G.cyl(.04, .04, .8, 6), C.dark, [5.4, .4, -6.0]);
      void g;
    },
    idle(c, t, dt) { c._st = (c._st || 0) + dt; if (c._st > .9) { c._st = 0; c.fx.steam(c.L(-.6, 1.4, -5.3), 1, .7); } },
    async event(c) {
      const S = c.tilesState, E = ['🍝', '🥗', '🌮', '🍜', '🥘', '🍕', '🍰', '🥞', '🍣', '🍲', '🥙', '🍛', '🧆', '🍤', '🥧', '🍱'];
      for (let k = 0; k < 18; k++) {
        const stopCol = Math.floor(k / 6);
        S.list = S.list.map((e, i) => (i % 3) < stopCol ? e : pick(E));
        c.phone.userData.ct.redraw(); if (k % 3 === 0) c.fx.steam(c.L(-.6, 1.4, -5.3), 2, .8);
        await wait(.12);
      }
      S.list = ['🍝', '🥘', '🍰', '🌮', '🍝', '🍜', '🥗', '🍝', '🍕']; S.win = true; c.phone.userData.ct.redraw();
      c.fx.sparkle(c.L(.7, 5, -10.8), 20, 1.6); c.fx.steam(c.L(-.6, 1.4, -5.3), 6, 1.1);
      await wait(1.2); S.win = false; c.phone.userData.ct.redraw();
    },
  },
  // ------------------------------------------------------------------ 9 Rockbaren (mini)
  { id: 'shuffle', kind: 'mini', t: '12:30', name: 'Rockbaren',
    stand: [1.4, -2.5], 
    mattias: { p: [-1.9, .15, -8.45], pose: 'peek' },
    spots: { throw: [3.6, -4.6, .15] },
    build(c) {
      const { b, g } = c;
      b.add(G.box(7, .15, 5.4), '#6b4a34', [1, .075, -7.1]);
      b.add(G.box(7, 3.5, .2), '#3a1f3a', [1, 1.9, -9.8]);
      b.add(G.box(.2, 3.5, 5.4), '#2e1a30', [-2.5, 1.9, -7.1]);
      // shuffleboard table along x
      b.add(G.box(6.0, .14, .9), C.woodD, [.8, .82, -5.6]).add(G.box(5.8, .04, .62), '#e8cf9a', [.8, .9, -5.6]);
      for (const z of [-5.12, -6.08]) b.add(G.box(6.0, .1, .08), C.woodD, [.8, .95, z]);
      for (const x of [-2, 3.6]) for (const z of [-5.25, -5.95]) b.add(G.box(.12, .76, .12), C.dark, [x, .45, z]);
      for (const [x, col] of [[-1.75, C.red], [-1.35, C.gold], [-.95, C.sage]]) b.add(G.box(.04, .005, .62), col, [x, .925, -5.6]);
      b.add(G.box(.3, .005, .62), C.red, [-2.05, .925, -5.6]);
      // posters + neon BAR
      c.sign(1.1, 1.5, (x, w, h) => { x.fillStyle = '#141014'; x.fillRect(0, 0, w, h); x.fillStyle = '#e8312f'; x.textAlign = 'center'; x.textBaseline = 'middle'; fitText(x, 'ROCK', w * .85, h * .26, 700); x.fillText('ROCK', w / 2, h * .3); x.fillStyle = C.paper; fitText(x, 'NIGHT', w * .8, h * .16, 700); x.fillText('NIGHT', w / 2, h * .52); x.font = `${h * .2}px system-ui`; x.fillText('🤘', w / 2, h * .78); }, { x: -1.2, y: 2.4, z: -9.68, px: 200 });
      c.sign(1.1, 1.5, (x, w, h) => { x.fillStyle = C.gold; x.fillRect(0, 0, w, h); x.fillStyle = C.night; x.textAlign = 'center'; x.textBaseline = 'middle'; fitText(x, 'LIVE', w * .8, h * .26, 700); x.fillText('LIVE', w / 2, h * .32); fitText(x, 'fredag', w * .8, h * .14, 600); x.fillText('fredag', w / 2, h * .56); x.font = `${h * .2}px system-ui`; x.fillText('🎸', w / 2, h * .8); }, { x: .2, y: 2.3, z: -9.68, px: 200 });
      const bar = c.sign(1.6, .7, (x, w, h) => { x.shadowColor = '#ff4f6d'; x.shadowBlur = 22; x.strokeStyle = '#ffd0da'; x.lineWidth = 7; x.font = `700 ${h * .62}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.strokeText('BAR', w / 2, h * .55); }, { x: 2.0, y: 3.0, z: -9.68 });
      bar.material.emissiveIntensity = 1;
      // scoreboard
      b.add(G.box(.12, 2.4, .12), C.dark, [3.6, 1.2, -8.6]);
      b.add(G.rbox(1.9, 1.0, .2, .06), '#111', [3.6, 2.85, -8.6]);
      c.score = c.sign(1.75, .85, (x, w, h) => drawScore(x, w, h, c.scoreVal), { x: 3.6, y: 2.85, z: -8.48, px: 200 });
      c.scoreVal = '64'; c.score.userData.ct.redraw(); c.score.material.emissiveIntensity = 1;
      // jukebox (Mattias peeks behind)
      b.add(G.rbox(1.0, 1.6, .7, .2), C.wine, [-1.6, .95, -8.6]).add(G.cyl(.5, .5, .7, 16, false), C.gold, [-1.6, 1.75, -8.6], [Math.PI / 2, 0, 0]);
      g.add(G.plane(.7, .6), '#fff', [-1.6, 1.2, -8.24]);
      // bar stools + counter
      b.add(G.box(.8, 1.1, 3), '#4a2a22', [4.7, .7, -7.6]).add(G.box(1, .08, 3.2), C.woodL, [4.7, 1.28, -7.6]);
      for (const z of [-6.6, -7.6, -8.6]) b.add(G.cyl(.22, .22, .08, 12), C.red, [4.0, .9, z]).add(G.cyl(.04, .04, .8, 6), '#bbb', [4.0, .5, z]);
      for (let i = 0; i < 5; i++) g.add(G.cyl(.05, .05, .3, 6), '#fff', [4.6 + (i % 2) * .15, 1.45, -6.6 - i * .45]);
      // the puck
      c.puck = c.mesh(m => { m.add(G.cyl(.13, .13, .06, 16), C.red, [0, 0, 0]); m.add(G.cyl(.07, .07, .07, 12), '#bbb', [0, .01, 0]); });
      c.puck.position.set(3.5, .95, -5.6);
      bAddTree(b, -4.5, -8, { h: 3.8 }); bAddTree(b, 7, -9, { kind: 'spruce', s: 1.4 });
    },
    async event(c) {
      c.puck.position.set(3.5, .95, -5.6);
      await anim(1.6, p => { c.puck.position.x = 3.5 - p * 5.55; c.puck.rotation.y = p * 9; }, ease.out);
      c.fx.sparkle(c.L(-2.0, 1.2, -5.6), 12, .4);
      for (const v of ['71', '79', '83', '88']) { c.scoreVal = v; c.score.userData.ct.redraw(); await wait(.18); }
      c.fx.sparkle(c.L(3.6, 2.9, -8.4), 18, .9); c.bubble('🤘', [3.6, 3.5, -8.4], { h: .6 });
      await wait(1.2);
    },
    reset(c) { c.puck.position.set(3.5, .95, -5.6); c.scoreVal = '64'; c.score.userData.ct.redraw(); },
  },
  // ------------------------------------------------------------------ 10 Maria
  { id: 'maria', kind: 'main', t: '13:00', name: 'Maria',
    stand: [0.9, -2.7], 
    mattias: { p: [3.9, 0, -7.0], pose: 'crouch' },
    npcs: [{ who: 'maria', p: [1.6, 0, -5.5] }],
    build(c) {
      const { b, g } = c;
      bAddHouse(b, { x: 1.9, z: -9.8, w: 4.8, d: 3.4, h: 2.8, wall: C.yellow, roof: '#8a3a32', glow: g, door: C.wine, windows: 3 });
      bAddFence(b, -1.4, -6.4, .9, -6.4, { h: .85 }); bAddFence(b, 2.3, -6.4, 5.4, -6.4, { h: .85 });
      for (let i = 0; i < 10; i++) b.add(G.ico(.1, 0), pick([C.rose, C.gold, '#fff', C.wine]), [rr(-1.2, 5), .35, rr(-6.9, -7.6)]);
      for (let i = 0; i < 10; i++) b.add(G.cone(.08, .35, 4), '#6f8f4f', [rr(-1.2, 5), .17, rr(-6.9, -7.6)]);
      // mailbox
      b.add(G.box(.08, 1.0, .08), C.dark, [-.7, .5, -6.0]).add(G.rbox(.45, .35, .6, .1), '#e3c24f', [-.7, 1.15, -6.0]);
      bAddTree(b, -3.2, -9.8, { h: 4.2, col: '#d6532e' }); bAddTree(b, 6.6, -9.0, { h: 3.8 }); bAddTree(b, 1.5, -15, { kind: 'spruce', s: 1.6 });
      // giant phone on a post
      b.add(G.cyl(.09, .11, 3.6, 8), C.dark, [-.3, 1.8, -7.0]);
      const ph = c.group(-.3, 4.6, -7.0); c.phone = ph; ph.rotation.y = .15;
      c.mesh(m => { m.add(G.rbox(1.5, 2.7, .2, .22), C.night, [0, 0, 0]); m.add(G.box(.5, .08, .05), '#3a3640', [0, 1.2, .11]); }, ph);
      c.phoneScreen = c.sign(1.32, 2.45, (x, w, h) => drawCall(x, w, h, c.calls || 3), { x: 0, y: -.03, z: .11, parent: ph, px: 170 });
      c.phoneScreen.material.emissiveIntensity = .6;
      c.pick(ph, 'phone');
    },
    idle(c, t, dt, st) { if (!c.ringing) c.phone.rotation.z = st === 'visited' ? Math.sin(t * 30) * .03 * (Math.sin(t * .8) > .7 ? 1 : 0) : 0; },
    async react(c) { c.calls = (c.calls || 3) + 1; c.phoneScreen.userData.ct.redraw(); await ring(c, 1.0); },
    async event(c) {
      c.calls = 3; c.phoneScreen.userData.ct.redraw();
      const r = ring(c, 2.8);
      const lines = ['Ring när du kan ❤️', 'Har du fått något fint?', 'Vad ska ni äta?'];
      for (let i = 0; i < 3; i++) { c.bubble(lines[i], [.6 + (i % 2) * .9, 6.3 + i * .6, -6.6 + i * .3], { h: .5, dur: 3.4 - i * .5 }); c.calls++; c.phoneScreen.userData.ct.redraw(); await wait(.8); }
      await r; c.fx.hearts(c.L(1.6, 2.2, -5.5), 6);
    },
  },
  // ------------------------------------------------------------------ 11 Hester (mini)
  { id: 'hester', kind: 'mini', t: '13:30', name: 'Hester',
    stand: [0.9, -2.5], 
    mattias: { p: [-.6, 0, -8.75], pose: 'peek' },
    npcs: [{ who: 'syster', p: [.7, 0, -6.7] }, { who: 'sebastian', p: [3.1, 0, -6.4] }],
    build(c) {
      const { b } = c, wd = '#e0bf86', wd2 = '#c99f62';
      const hx = 2.0, hz = -10.2, W = 5.4, D = 3.6, H = 2.6;
      b.add(G.box(W + .4, .3, D + .4), '#bdb6ac', [hx, .15, hz]);
      for (let i = 0; i <= 6; i++) for (const sz of [-1, 1]) b.add(G.box(.14, H, .14), wd, [hx - W / 2 + i * W / 6, .3 + H / 2, hz + sz * D / 2]);
      for (let i = 0; i <= 4; i++) for (const sx of [-1, 1]) b.add(G.box(.14, H, .14), wd, [hx + sx * W / 2, .3 + H / 2, hz - D / 2 + i * D / 4]);
      for (const sz of [-1, 1]) b.add(G.box(W + .14, .14, .16), wd2, [hx, .3 + H, hz + sz * D / 2]);
      for (const sx of [-1, 1]) b.add(G.box(.16, .14, D + .14), wd2, [hx + sx * W / 2, .3 + H, hz]);
      b.add(G.box(W * .45, H, .06), '#d8b878', [hx + W * .26, .3 + H / 2, hz - D / 2]);
      b.add(G.box(.06, H, D), '#d8b878', [hx - W / 2, .3 + H / 2, hz]);
      // trusses
      for (let i = 0; i <= 4; i++) { const x = hx - W / 2 + i * W / 4; for (const s of [-1, 1]) b.add(G.box(.1, .1, D * .62), wd, [x, .3 + H + .62, hz + s * D * .25], [s * -.62, 0, 0]); b.add(G.box(.1, 1.3, .1), wd, [x, .3 + H + .6, hz]); }
      // scaffolding front-left
      for (const x of [-1.1, .3]) for (const z of [-7.7, -8.5]) b.add(G.cyl(.04, .04, 3.4, 6), '#9aa2ab', [x, 1.7, z]);
      for (const y of [1.2, 2.5]) { b.add(G.box(1.7, .07, 1.0), C.woodL, [-.4, y, -8.1]); for (const z of [-7.7, -8.5]) b.add(G.cyl(.03, .03, 1.6, 5), '#9aa2ab', [-.4, y + .5, z], [0, 0, Math.PI / 2]); }
      b.add(G.box(.12, 1.9, .03), '#9aa2ab', [-.4, 1.85, -7.7], [0, 0, .7]);
      b.add(G.box(1.6, .3, .06), C.woodL, [-.45, 1.75, -7.62]);
      // timber stack, sawhorse
      for (let i = 0; i < 5; i++) b.add(G.box(2.6, .12, .14), i % 2 ? wd : wd2, [4.9, .1 + Math.floor(i / 2) * .13, -7.2 + (i % 3) * .2]);
      b.add(G.box(1.2, .1, .12), wd, [-1.6, .7, -6.3]); for (const s of [-1, 1]) b.add(G.box(.08, .7, .08), wd2, [-1.6 + s * .45, .35, -6.3], [s * .2, 0, 0]);
      bAddTree(b, -4.4, -9.5, { h: 4 }); bAddTree(b, 7.2, -11, { h: 3.8, col: C.gold }); bAddTree(b, 3, -15.5, { kind: 'spruce', s: 1.6 });
      // the roof piece that drops in
      const roof = c.group(hx, 12, hz); c.roof = roof; roof.visible = false;
      c.mesh(m => { for (const s of [-1, 1]) m.add(G.box(W + .5, .14, D * .7), s < 0 ? '#5e4648' : '#6a5052', [0, .62, s * D * .26], [s * -.62, 0, 0]); }, roof);
      // HESTER sign (pickable, flips to show the translation)
      const hs = c.group(2.0, 0, -7.7); c.hsign = hs;
      c.mesh(m => { for (const s of [-1, 1]) m.add(G.box(.12, 3.6, .12), C.woodD, [s * 1.2, 1.8, 0]); }, hs);
      const board = c.group(0, 3.4, 0, 0, hs); c.hboard = board;
      c.sign(2.7, .85, (x, w, h) => { x.fillStyle = '#c9925a'; rrect(x, 0, 0, w, h, 14); x.fill(); x.strokeStyle = '#8a5a32'; x.lineWidth = 8; x.stroke(); for (let i = 1; i < 3; i++) { x.fillStyle = '#b98250'; x.fillRect(8, i * h / 3, w - 16, 3); } x.fillStyle = C.night; x.textAlign = 'center'; x.textBaseline = 'middle'; fitText(x, 'HESTER', w * .8, h * .62, 700); x.fillText('HESTER', w / 2, h * .55); }, { x: 0, y: 0, z: .07, parent: board });
      c.sign(2.7, .85, drawBoard('= HÄSTAR (NO)', { bg: C.paper, fg: C.wine, border: '#8a5a32', size: .48 }), { x: 0, y: 0, z: -.07, ry: Math.PI, parent: board });
      c.mesh(m => m.add(G.box(2.75, .9, .1), '#8a5a32', [0, 0, 0]), board);
      c.pick(hs, 'hester');
    },
    reset(c) { c.roof.visible = false; c.roof.position.y = 12; },
    async react(c) { if (c.flip) return; c.flip = true; await anim(.5, p => { c.hboard.rotation.y = p * Math.PI; }, ease.back); await wait(1.6); await anim(.5, p => { c.hboard.rotation.y = Math.PI * (1 - p); }, ease.inOut); c.flip = false; },
    async event(c) {
      for (let i = 0; i < 4; i++) { c.fx.dust(c.L(i % 2 ? 3.1 : .7, .9, i % 2 ? -6.9 : -7.2), 4, '#e8cf9a'); c.bubble(i % 2 ? 'dunk!' : 'pang!', [i % 2 ? 3.1 : .7, 2.0, i % 2 ? -6.6 : -6.9], { h: .4, dur: .9 }); await wait(.38); }
      c.roof.visible = true;
      await anim(1.0, p => { c.roof.position.y = 12 - (12 - 2.9) * p; }, ease.bounce);
      c.fx.dust(c.L(2, 2.9, -10.2), 14, '#e8cf9a');
      await anim(1.2, p => { c.hboard.rotation.z = Math.sin(p * Math.PI * 6) * .2 * (1 - p); });
      c.fx.sparkle(c.L(2.0, 3.5, -7.6), 10, 1.2);
    },
  },
);

// ---- station helpers
function gardsgard(b, x0, z0, x1, z1) {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / .55), ang = Math.atan2(-(z1 - z0), x1 - x0);
  for (let i = 0; i <= n; i++) { const t = i / n, x = lerp(x0, x1, t), z = lerp(z0, z1, t); b.add(G.cyl(.04, .04, 1.4, 5), '#8a6a4a', [x, .55, z], [0, ang, .75]); }
  for (let i = 0; i <= Math.round(len / 2); i++) { const t = i / Math.round(len / 2); b.add(G.cyl(.05, .05, 1.3, 5), '#6f5238', [lerp(x0, x1, t), .65, lerp(z0, z1, t)]); }
}
function findRoot(obj, list) { let o = obj; while (o && !list.includes(o)) o = o.parent; return o || list[0]; }
function hop(o, n = 2) { if (o.userData.busy) return; o.userData.busy = true; const y0 = 0; anim(.42 * n, (_, p) => { o.position.y = y0 + Math.abs(Math.sin(p * Math.PI * n)) * .45; }).then(() => { o.position.y = y0; o.userData.busy = false; }); }
function wiggleSheep(c, s, delay = 0, text) {
  const lines = ['BÄÄ', 'BÄÄÄ', 'BÄÄ!', 'bää?'];
  setTimeout(() => {
    s.userData.busy = true; const h = s.userData.head;
    c.bubble(text || pick(lines), s.getWorldPosition(V3()).add(V3(0, 1.75 * s.scale.y, 0)), { h: .62, dur: 1.8, world: true });
    anim(1.0, p => { h.rotation.z = Math.sin(p * Math.PI * 6) * .25 * (1 - p); h.scale.set(1 + Math.sin(p * Math.PI * 8) * .08, 1, 1); h.rotation.x = -.25 * Math.sin(p * Math.PI); }).then(() => { s.userData.busy = false; h.scale.set(1, 1, 1); });
  }, delay * 1000);
}
function layEgg(c, h) {
  if (!h) return; h.userData.busy = true;
  anim(.4, p => { h.scale.set(1 + Math.sin(p * Math.PI) * .25, 1 - Math.sin(p * Math.PI) * .2, 1 + Math.sin(p * Math.PI) * .25); }).then(() => { h.scale.set(1, 1, 1); h.userData.busy = false; });
  const egg = new THREE.Mesh(prep(G.sph(.09, 10, 8), '#f6ecd8', mat4([0, 0, 0], [0, 0, 0], [1, 1.3, 1])), c.mat); egg.castShadow = true;
  const start = h.position.clone().add(V3(0, .25, 0)); egg.position.copy(start); h.parent.add(egg);
  const dir = V3(Math.sin(h.rotation.y + Math.PI), 0, Math.cos(h.rotation.y + Math.PI));
  anim(1.2, p => { egg.position.copy(start).addScaledVector(dir, p * .8); egg.position.y = .09 + Math.abs(Math.sin(p * Math.PI * 2)) * .25 * (1 - p); egg.rotation.z = p * 8; }, ease.out)
    .then(() => { c.fx.sparkle(egg.getWorldPosition(V3()), 6, .2); return wait(2.5); }).then(() => anim(.3, p => egg.scale.setScalar(1 - p))).then(() => egg.parent.remove(egg));
}
function tractorHonk(c, tr) {
  c.bubble('TUT-TUT!', tr.getWorldPosition(V3()).add(V3(0, 3.1, 0)), { h: .5, dur: 1.6, world: true });
  const y0 = tr.position.y; anim(.6, p => { tr.position.y = y0 + Math.abs(Math.sin(p * Math.PI * 3)) * .12; tr.scale.set(1, 1 + Math.sin(p * Math.PI * 3) * .04, 1); }).then(() => { tr.position.y = y0; tr.scale.set(1, 1, 1); });
}
async function ring(c, dur) {
  c.ringing = true; c.bubble('RING RING', [-.3, 6.2, -6.8], { h: .45, dur: 1.2, bg: C.gold });
  await anim(dur, (_, p) => { c.phone.rotation.z = Math.sin(p * dur * 50) * .12 * Math.min(1, (1 - p) * 4); c.phone.position.y = 4.6 + Math.abs(Math.sin(p * dur * 25)) * .05; });
  c.phone.rotation.z = 0; c.ringing = false;
}
function drawTiles(x, w, h, S) {
  x.fillStyle = '#fff9f0'; rrect(x, 0, 0, w, h, 24); x.fill();
  x.fillStyle = C.wine; x.fillRect(0, 0, w, h * .12); x.fillStyle = C.paper; x.textAlign = 'center'; x.textBaseline = 'middle';
  fitText(x, 'Sparade ❤️ 4 000+', w * .9, h * .055, 700); x.fillText('Sparade ❤️ 4 000+', w / 2, h * .065);
  const pad = w * .05, cell = (w - pad * 4) / 3, top = h * .16;
  S.list.forEach((e, i) => {
    const cx = pad + (i % 3) * (cell + pad), cy = top + Math.floor(i / 3) * (cell + pad);
    x.fillStyle = S.win && e === '🍝' ? '#ffe28a' : ['#ffe3e3', '#e3f4e8', '#fff1d6'][(i + Math.floor(i / 3)) % 3]; rrect(x, cx, cy, cell, cell, 14); x.fill();
    x.font = `${cell * .62}px system-ui, "Apple Color Emoji"`; x.fillStyle = '#000'; x.fillText(e, cx + cell / 2, cy + cell * .55);
  });
  x.fillStyle = C.night; fitText(x, S.win ? 'Dagens: pasta! 🍝' : 'Vad blir det idag?', w * .9, h * .05, 600); x.fillText(S.win ? 'Dagens: pasta! 🍝' : 'Vad blir det idag?', w / 2, h * .93);
}
function drawScore(x, w, h, v) {
  x.fillStyle = '#0c0a0c'; x.fillRect(0, 0, w, h); x.shadowColor = '#ff3030'; x.shadowBlur = 18; x.fillStyle = '#ff4a3a';
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `700 ${h * .72}px "DM Mono", ui-monospace, monospace`; x.fillText(v || '00', w * .6, h * .55);
  x.font = `600 ${h * .18}px ${FONT}`; x.fillStyle = '#ff8a7a'; x.fillText('POÄNG', w * .17, h * .5);
}
function drawCall(x, w, h, n) {
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#5b3a6e'); g.addColorStop(1, '#2a1a3a'); x.fillStyle = g; rrect(x, 0, 0, w, h, 26); x.fill();
  x.fillStyle = C.paper; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `${w * .3}px system-ui, "Apple Color Emoji"`; x.fillText('👩🏼', w / 2, h * .26);
  fitText(x, 'Mamma ❤️', w * .85, h * .085, 700); x.fillText('Mamma ❤️', w / 2, h * .44);
  x.globalAlpha = .8; fitText(x, 'ringer…', w * .8, h * .05, 500); x.fillText('ringer…', w / 2, h * .52); x.globalAlpha = 1;
  x.fillStyle = '#ff5f5f'; x.beginPath(); x.arc(w * .28, h * .8, w * .11, 0, TAU); x.fill(); x.fillStyle = '#4cd964'; x.beginPath(); x.arc(w * .72, h * .8, w * .11, 0, TAU); x.fill();
  x.fillStyle = C.gold; rrect(x, w * .62, h * .03, w * .34, h * .07, 20); x.fill(); x.fillStyle = C.night; x.font = `700 ${h * .045}px ${FONT}`; x.fillText(`${n} missade`, w * .79, h * .067);
}

STOPS.push(
  // ------------------------------------------------------------------ 12 178 cm över havet
  { id: 'langd', kind: 'main', t: '14:00', name: '178 cm över havet', sign: [3.15, -3.95],
    stand: [1.0, -2.75], 
    mattias: { p: [2.45, 0, -7.35], pose: 'stand' },
    build(c) {
      const { b } = c;
      // ruler on the platform, real scale from platform top
      const RH = 6.6, rx = .05, rz = -3.75;
      b.add(G.rbox(.9, .2, .6, .05), C.dark, [rx, PH + .1, rz]);
      c.ruler = c.sign(.78, RH, (x, w, h) => drawRuler(x, w, h, RH), { x: rx, y: PH + RH / 2 + .05, z: rz + .07, px: 110 });
      b.add(G.box(.86, RH + .1, .1), '#c9962e', [rx, PH + RH / 2 + .05, rz]);
      b.add(G.cyl(.08, .08, .3, 8), C.gold, [rx, PH + RH + .25, rz]); b.add(G.sph(.14, 10, 8), C.red, [rx, PH + RH + .45, rz]);
      // the 178 marker
      const mk = c.group(rx, PH + 1.78, rz + .12); c.marker = mk;
      c.mesh(m => { const s = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(.25, .16), new THREE.Vector2(.25, -.16)]); m.add(new THREE.ExtrudeGeometry(s, { depth: .06, bevelEnabled: false }), C.wine, [.42, 0, -.03]); }, mk);
      c.sign(.82, .42, drawBoard('178', { bg: C.wine, fg: C.paper, border: C.gold, size: .72 }), { x: 1.08, y: 0, z: .04, parent: mk, px: 200 });
      // podium + trophy
      const px = 2.5, pz = -6.4;
      b.add(G.rbox(1.0, .9, 1.0, .06), C.gold, [px, .45, pz]); b.add(G.rbox(1.0, .6, 1.0, .06), '#d7d7dc', [px - 1.0, .3, pz + .05]); b.add(G.rbox(1.0, .4, 1.0, .06), '#d39a62', [px + 1.0, .2, pz + .05]);
      c.sign(.5, .5, drawBoard('1', { bg: null, fg: C.night, size: .8 }), { x: px, y: .55, z: pz + .51, px: 120 });
      c.sign(.4, .4, drawBoard('2', { bg: null, fg: C.night, size: .8 }), { x: px - 1, y: .35, z: pz + .56, px: 120 });
      c.sign(.36, .3, drawBoard('3', { bg: null, fg: C.night, size: .8 }), { x: px + 1, y: .2, z: pz + .56, px: 120 });
      const tro = c.group(px, .9, pz); c.trophy = tro;
      c.mesh(m => {
        const pts = [[0, 0], [.28, 0], [.28, .08], [.12, .12], [.07, .3], [.07, .45], [.22, .55], [.34, .8], [.36, 1.05], [.33, 1.06], [0, .7]].map(([x, y]) => new THREE.Vector2(x, y));
        m.add(new THREE.LatheGeometry(pts, 18), C.gold, [0, 0, 0]);
        for (const s of [-1, 1]) m.add(G.tor(.14, .035, 6, 12), C.gold, [s * .38, .82, 0], [0, 0, s * .3]);
      }, tro);
      c.sign(.55, .26, drawBoard('11/10', { bg: C.night, fg: C.gold, border: C.gold, size: .7 }), { x: 0, y: .2, z: .2, parent: tro, px: 200 });
      // mountain "över havet" + sea strip
      b.add(G.cone(4.5, 6.5, 7), '#8a9aa6', [-.5, 3.25, -17]).add(G.cone(1.6, 2.3, 7), '#fbfbff', [-.5, 5.38, -17]);
      b.add(G.cone(3.6, 4.8, 7), '#7d8f9c', [4.5, 2.4, -16]).add(G.cone(1.2, 1.6, 7), '#fbfbff', [4.5, 4.0, -16]);
      b.add(G.box(14, .05, 3.2), '#6fa8cf', [1.5, .03, -12]);
      for (let i = 0; i < 7; i++) b.add(G.tor(.25, .05, 4, 8, Math.PI), '#e6f3fb', [-4 + i * 1.6, .07, -12 + (i % 2) * .8], [-Math.PI / 2, 0, 0]);
      b.add(G.box(.7, .3, .3), C.paper, [3.5, .15, -12.4]).add(G.cone(.3, .8, 3), C.rose, [3.5, .75, -12.4]);
      bAddTree(b, -4.5, -7.5, { h: 3.9 }); bAddTree(b, 6.8, -8.5, { h: 3.6, col: C.gold }); bAddTree(b, -3.2, -10.2, { kind: 'spruce', s: 1.2 });
    },
    idle(c, t) { c.trophy.rotation.y = Math.sin(t * .8) * .3; if (!c.busy) c.marker.position.y = PH + 1.78 + Math.sin(t * 2) * .015; },
    async event(c) {
      c.busy = true;
      await anim(.3, p => { c.marker.position.y = PH + 1.78 - p * .15; });
      await anim(.9, p => { c.marker.position.y = PH + 1.63 + p * 5.6; c.marker.rotation.z = Math.sin(p * 20) * .05; }, ease.out);
      c.fx.sparkle(c.L(-.6, PH + 7.1, -3.6), 18, .7); c.bubble('!!', [-.2, PH + 7.6, -3.5], { h: .55 });
      await anim(.5, p => { c.marker.position.y = PH + 7.23 + Math.sin(p * Math.PI * 3) * .12 * (1 - p); });
      c.fx.sparkle(c.L(2.5, 1.9, -6.2), 22, .7);
      await wait(1.0);
      anim(2.2, p => { c.marker.position.y = PH + 7.23 - p * 5.45; }, ease.inOut).then(() => { c.busy = false; });
    },
  },
  // ------------------------------------------------------------------ 13 Fågelboet (mini)
  { id: 'fagelbo', kind: 'mini', t: '14:30', name: 'Fågelboet',
    stand: [0.6, -2.5], camFix: { p: [2.3, 2.3, 9.6], t: [.9, 1.4, -6] },
    mattias: { p: [4.35, 0, -13.4], pose: 'peek' },
    spots: { nest: [.9, -5.5] },
    build(c) {
      const { b } = c, hay = ['#c9a25a', '#b88d47', '#d9b56e', '#a87c3c'];
      b.add(G.circ(7, 24), '#6d8a52', [.9, .015, -7.5], [-Math.PI / 2, 0, 0]);
      const nx = .9, nz = -7.0, Rn = 2.0;
      for (let i = 0; i < 12; i++) {
        const y = .15 + i * .2, r = Rn * Math.sqrt(Math.max(.05, 1 - Math.pow(y / 2.5, 2))), gap = y < 1.55 ? 1.1 : 0;
        const tor = G.tor(r, .17, 5, 26, TAU - gap); b.add(tor, hay[i % 4], [nx, y, nz], [Math.PI / 2, 0, Math.PI / 2 + gap / 2]);
      }
      b.add(G.sph(1.75, 14, 10), '#3a2a1c', [nx, .2, nz], [0, 0, 0], [1, 1.2, 1]);
      for (let i = 0; i < 34; i++) { const a = R() * TAU, y = rr(.3, 2.2); if (Math.abs(((a % TAU) + TAU) % TAU - Math.PI / 2) < .7 && y < 1.6) continue; const r = Rn * Math.sqrt(Math.max(.05, 1 - Math.pow(y / 2.5, 2))) + .1; b.add(G.cyl(.025, .025, rr(.8, 1.4), 4), pick(hay), [nx + Math.cos(a) * r, y, nz + Math.sin(a) * r], [rr(-1, 1), a, rr(.6, 1.4)]); }
      b.add(G.sph(.6, 10, 8), '#b88d47', [nx, 2.45, nz], [0, 0, 0], [1, .4, 1]);
      // mushrooms, ferns, stones
      for (const [x, z, s] of [[-1.3, -5.4, 1], [-1.0, -5.9, .7], [3.2, -5.6, .8], [3.5, -6.2, 1.1]]) { b.add(G.cyl(.05 * s, .06 * s, .25 * s, 6), '#f4efe6', [x, .12 * s, z]); b.add(G.sph(.17 * s, 10, 6), '#d23c36', [x, .26 * s, z], [0, 0, 0], [1, .55, 1]); for (let k = 0; k < 3; k++) b.add(G.sph(.025 * s, 4, 3), '#fff', [x + rr(-.08, .08) * s, .33 * s, z + rr(-.08, .08) * s]); }
      for (let i = 0; i < 12; i++) b.add(G.cone(.25, .6, 4), '#4f7a46', [rr(-3, 5), .3, rr(-4.8, -11)], [rr(-.4, .4), R() * 3, rr(-.4, .4)]);
      for (let i = 0; i < 5; i++) b.add(G.ico(rr(.2, .4), 0), '#9a9692', [rr(-3, 5), .12, rr(-4.8, -10)]);
      // dense glade trees
      [[-2.8, -9, 'spruce', 1.5], [4.4, -9.8, 'birch', 1.1], [-3.4, -12.5, 'birch', 1.2], [2.4, -12.8, 'spruce', 1.7], [4.4, -12.9, 'birch', 1.0], [6.4, -11.5, 'spruce', 1.3], [-.8, -14, 'spruce', 1.8], [-5, -7, 'birch', 1.1]]
        .forEach(([x, z, k, s]) => bAddTree(b, x, z, { kind: k, s, h: 4 }));
      c.birds = [];
      for (let i = 0; i < 5; i++) { const bd = makeBird(c.mat, pick(['#5a4a56', '#8a5a3a', '#4a5a6a'])); const a = i / 5 * TAU; bd.position.set(nx + Math.cos(a) * .4, 2.55, nz + Math.sin(a) * .4); bd.rotation.y = a; bd.userData.home = bd.position.clone(); c.root.add(bd); c.birds.push(bd); }
    },
    idle(c, t) { c.birds.forEach((bd, i) => { if (bd.userData.fly) return; bd.position.y = bd.userData.home.y + Math.abs(Math.sin(t * 3 + i)) * .05; bd.userData.wings.forEach((w, k) => { w.rotation.z = (k ? -1 : 1) * (Math.sin(t * 20 + i) > .9 ? .6 : 0); }); }); },
    async event(c) {
      c.fx.leaves(c.L(.9, .5, -6.5), 50);
      await Promise.all(c.birds.map((bd, i) => {
        bd.userData.fly = true; const h = bd.userData.home, a = i / 5 * TAU + .3;
        return anim(2.6, (_, p) => { bd.position.set(h.x + Math.cos(a) * p * 9, h.y + p * 6 + Math.sin(p * 9) * .3, h.z + Math.sin(a) * p * 6 - p * 3); bd.rotation.y = a + Math.PI / 2; bd.userData.wings.forEach((w, k) => { w.rotation.z = (k ? -1 : 1) * Math.sin(p * 80 + i) * .9; }); });
      }));
      c.birds.forEach(bd => { bd.position.copy(bd.userData.home); bd.scale.setScalar(0); });
      setTimeout(() => c.birds.forEach(bd => { bd.userData.fly = false; anim(.5, p => bd.scale.setScalar(p), ease.back); }), 5000);
    },
  },
  // ------------------------------------------------------------------ 14 Fika & egentid
  { id: 'fika', kind: 'main', t: '15:00', name: 'Fika & egentid',
    stand: [0.8, -2.7], 
    mattias: { p: [5.0, 0, -7.65], pose: 'crouch' },
    spots: { bench: [.7, -5.15] },
    build(c) {
      const { b, g } = c;
      bAddHouse(b, { x: 2.6, z: -10.2, w: 5.2, d: 3.6, h: 2.9, wall: '#f4c3cb', roof: '#7a4652', glow: g, door: C.sage, windows: 1 });
      b.add(G.box(2.2, 1.4, .1), C.white, [3.6, 1.45, -8.38]); g.add(G.plane(2.0, 1.2), '#fff', [3.6, 1.45, -8.3]);
      for (let i = 0; i < 8; i++) b.add(G.box(.42, .06, .9), i % 2 ? C.paper : C.rose, [2.15 + i * .41, 2.45, -8.05], [.45, 0, 0]);
      c.sign(1.8, .7, (x, w, h) => { x.fillStyle = C.paper; rrect(x, 0, 0, w, h, 24); x.fill(); x.strokeStyle = C.wine; x.lineWidth = 6; x.stroke(); x.fillStyle = C.wine; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `700 ${h * .72}px Caveat, ${FONT}`; x.fillText('Fika', w / 2, h * .55); }, { x: 1.4, y: 2.55, z: -8.32 });
      // bench + side table + cup
      bAddBench(b, .7, -5.35, 0, C.woodD);
      b.add(G.cyl(.25, .25, .05, 12), C.paper, [1.85, .55, -5.35]).add(G.cyl(.04, .04, .55, 6), C.dark, [1.85, .27, -5.35]);
      b.add(G.cyl(.08, .07, .14, 10), C.white, [1.85, .65, -5.35]).add(G.tor(.045, .015, 4, 8), C.white, [1.95, .66, -5.35]);
      b.add(G.cyl(.12, .12, .02, 10), C.white, [1.85, .58, -5.35]);
      b.add(G.tor(.08, .04, 6, 10), '#c98a4a', [1.75, .62, -5.2], [Math.PI / 2, 0, 0]);
      // Stör ej sign on a stake
      b.add(G.box(.05, 1.0, .05), C.woodD, [-.35, .5, -5.0]);
      c.sign(.7, .45, drawBoard('Stör ej', { bg: C.paper, fg: C.wine, border: C.wine, size: .55 }), { x: -.35, y: 1.12, z: -4.96, ry: .2, px: 220 });
      // kanelbulle sign on a pole
      b.add(G.cyl(.08, .1, 4.4, 8), C.dark, [.5, 2.2, -7.6]);
      const bulle = c.group(.5, 5.15, -7.6); c.bulle = bulle;
      c.mesh(m => {
        const pts = []; for (let i = 0; i <= 80; i++) { const a = i / 80 * 3.2 * TAU, r = .1 + i / 80 * .78; pts.push(V3(Math.cos(a) * r, Math.sin(a) * r, Math.sin(i * .4) * .03)); }
        m.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, .17, 8, false), '#c98a4a', [0, 0, 0]);
        m.add(G.cyl(.95, .95, .12, 24), '#a86a34', [0, 0, -.12], [Math.PI / 2, 0, 0]);
        for (let i = 0; i < 26; i++) { const a = R() * TAU, r = rr(.1, .85); for (const s of [1, -1]) m.add(G.box(.06, .06, .06), '#ffffff', [Math.cos(a) * r, Math.sin(a) * r, s * .17], [R(), R(), R()]); }
        m.add(G.sph(.16, 10, 8), '#c98a4a', [0, 0, 0]);
      }, bulle);
      c.pick(bulle, 'bulle');
      bAddTree(b, 5.1, -6.9, { h: 4.2, col: C.gold }); bAddTree(b, -4, -9.6, { h: 3.9 }); bAddTree(b, 7.2, -11, { kind: 'spruce', s: 1.4 }); bAddTree(b, -2.2, -14, { kind: 'spruce', s: 1.6 });
      bAddBush(b, -.6, -8.2, .8, '#6d8f58');
    },
    idle(c, t, dt, st) { c.bulle.rotation.y += dt * (c.spin || (st === 'locked' ? .2 : .8)); c._st = (c._st || 0) + dt; if (c._st > 1.3) { c._st = 0; c.fx.steam(c.L(1.85, .8, -5.35), 1, .35); } },
    async react(c) { c.spin = 14; c.fx.hearts(c.L(1.85, 1.0, -5.35), 5); await wait(1.2); c.spin = 0; },
    async event(c) {
      c.spin = 10; c.fx.sparkle(c.L(.5, 5.15, -7.4), 14, .9);
      for (let i = 0; i < 4; i++) { c.fx.hearts(c.L(1.85, .85, -5.35), 3); await wait(.5); }
      c.spin = 0; await wait(.4);
    },
  },
  // ------------------------------------------------------------------ 15 Tittut (mini)
  { id: 'tittut', kind: 'mini', t: '15:30', name: 'Tittut',
    stand: [.0, -2.6], camFix: { p: [2.2, 2.7, 9.4], t: [.6, 1.3, -8] },
    mattias: { p: [.05, .22, -5.75], pose: 'peek' },
    spots: { bench: [.45, -5.05, .22] },
    lake: true,
    build(c) {
      const { b, g } = c;
      b.add(G.box(5.4, .2, 3.4), '#b88a5e', [.8, .1, -5.6]);
      for (let i = 0; i < 9; i++) b.add(G.box(5.4, .01, .04), '#a07650', [.8, .205, -4.05 - i * .37]);
      for (let i = 0; i <= 6; i++) b.add(G.box(.08, .9, .08), C.woodD, [-1.9 + i * .9, .65, -7.25]);
      b.add(G.box(5.4, .08, .1), C.woodD, [.8, 1.1, -7.25]);
      bAddBench(b, .65, -5.15, 0, C.wood);
      bAddLamp(b, g, 3.1, -6.6, 2.4);
      for (let i = 0; i < 16; i++) b.add(G.cyl(.02, .02, rr(.8, 1.4), 4), '#9a8a4a', [rr(-3, 4.5), .5, rr(-7.6, -8.4)], [rr(-.2, .2), 0, rr(-.2, .2)]);
      bAddTree(b, -3.6, -6, { h: 4, col: '#d6532e' }); bAddTree(b, 5.2, -5.6, { h: 3.6, col: C.gold });
      // heart cloud puffs
      c.heart = [];
      for (let i = 0; i < 18; i++) {
        const p = c.mesh(m => { m.add(G.ico(1, 1), '#ffffff', [0, 0, 0]); m.add(G.ico(.7, 1), '#fdf3f6', [.7, -.2, .2]); }, c.root);
        p.castShadow = false; const t = i / 18 * TAU, hx = 16 * Math.pow(Math.sin(t), 3), hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        p.userData.heart = V3(.8 + hx * .32, 13 + hy * .32, -38); p.userData.loose = V3(.8 + rr(-16, 16), rr(10, 17), -38 + rr(-8, 4)); p.position.copy(p.userData.loose); p.scale.setScalar(rr(.9, 1.3)); c.heart.push(p);
      }
      c.heartP = 0;
    },
    idle(c, t, dt) { c.heart.forEach((p, i) => { const k = c.heartP; p.position.lerpVectors(p.userData.loose, p.userData.heart, k); p.position.x += Math.sin(t * .2 + i) * .3 * (1 - k); }); if (!c.busy && c.heartP > 0) c.heartP = Math.max(0, c.heartP - dt * .03); },
    async event(c) {
      c.busy = true; const k0 = c.heartP;
      await anim(2.8, p => { c.heartP = lerp(k0, 1, p); }, ease.inOut);
      c.fx.sparkle(c.L(.8, 13, -37), 30, 5); c.busy = false;
    },
  },
  // ------------------------------------------------------------------ 16 Logen
  { id: 'logen', kind: 'main', t: '16:00', name: 'Logen',
    stand: [0.9, -2.7], 
    mattias: { p: [-2.15, 0, -6.95], pose: 'peek' },
    build(c) {
      const { b, g } = c;
      const lx = 1.5, lz = -11, W = 7.4, D = 5, H = 4.6;
      b.add(G.box(W, H, .3), '#3a2040', [lx, H / 2, lz - D / 2]);
      for (const sx of [-1, 1]) b.add(G.box(.4, H, D), '#7a2e4a', [lx + sx * W / 2, H / 2, lz]);
      const bd = c.sign(6.6, 3.6, (x, w, h) => { const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#3a1a5a'); gr.addColorStop(1, '#a8326a'); x.fillStyle = gr; x.fillRect(0, 0, w, h); for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(255,${200 + (i % 50)},${220},${.4 + (i % 5) * .1})`; x.beginPath(); x.arc((i * 97) % w, (i * 53) % (h * .8), 2 + (i % 3) * 2, 0, TAU); x.fill(); } x.globalAlpha = .25; x.fillStyle = '#ffd6e0'; for (let i = 0; i < 7; i++) { x.beginPath(); x.moveTo(w / 2, -10); x.lineTo(i * w / 6 - 40, h); x.lineTo(i * w / 6 + 40, h); x.fill(); } }, { x: lx, y: H / 2 + .2, z: lz - D / 2 + .17, px: 60 });
      bd.material.emissiveIntensity = .55;
      const sh = new THREE.Shape([new THREE.Vector2(-W / 2 - .4, 0), new THREE.Vector2(W / 2 + .4, 0), new THREE.Vector2(0, 2.4)]);
      b.add(new THREE.ExtrudeGeometry(sh, { depth: D + .6, bevelEnabled: false }), '#3a2a34', [lx, H, lz - D / 2 - .3]);
      b.add(G.box(W + .8, .3, .4), '#4a1f36', [lx, H, lz + D / 2]);
      b.add(G.box(6.4, .7, 3.4), '#1d141f', [lx, .35, lz + .9]); b.add(G.box(6.5, .08, .08), C.gold, [lx, .7, lz + 2.6]);
      // speaker stacks
      for (const x of [-1.6, 4.6]) for (let k = 0; k < 3; k++) { b.add(G.rbox(1.0, .9, .8, .05), '#18151a', [x, .45 + k * .92, -6.5]); b.add(G.cyl(.28, .28, .05, 14), '#3e3a44', [x, .45 + k * .92, -6.08], [Math.PI / 2, 0, 0]); }
      // neon sign over the hall
      const neon = c.sign(3.4, 1.0, (x, w, h) => { x.shadowColor = '#7df9ff'; x.shadowBlur = 26; x.strokeStyle = '#d8fdff'; x.lineWidth = 9; x.font = `700 ${h * .72}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.strokeText('LOGEN', w / 2, h * .55); x.shadowColor = '#ff8fa3'; x.strokeStyle = '#ffd6e0'; x.lineWidth = 3; x.strokeText('LOGEN', w / 2, h * .55); }, { x: lx, y: H + .9, z: lz + D / 2 + .25 });
      neon.material.emissiveIntensity = 1.2;
      // string bulbs on facade
      for (let i = 0; i < 13; i++) g.add(G.sph(.07, 6, 4), '#fff', [lx - W / 2 + .3 + i * (W - .6) / 12, H - .25 - Math.sin(i / 12 * Math.PI) * .35, lz + D / 2 + .25]);
      // truss for the disco ball
      b.add(G.box(.08, 1.4, .08), '#9a9aa4', [lx, 4.0, lz + 2.2]);
      const ball = c.mesh(m => {
        const geo = new THREE.IcosahedronGeometry(.7, 2) /* already non-indexed */, pos = geo.attributes.position, n = pos.count, col = [];
        for (let i = 0; i < n; i += 3) { const v = .6 + R() * .4; for (let k = 0; k < 3; k++) col.push(v, v, v * 1.02); }
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
        m.parts.push((() => { const gg = geo; gg.deleteAttribute('uv'); const idx = []; for (let i = 0; i < n; i++) idx.push(i); gg.setIndex(idx); return gg; })());
      });
      ball.material = new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 90, specular: '#ffffff', color: '#d8d4e8', emissive: '#5a5478' });
      ball.position.set(lx, 3.3, lz + 2.2); c.ball = ball; c.pick(ball, 'disco');
      // lasers
      c.lasers = [];
      [[-1.5, C.rose], [-.5, '#7dffb5'], [3.5, '#ffd36e'], [4.5, '#8fd3ff']].forEach(([x, col], i) => {
        const pv = c.group(x, .8, lz - 1.8);
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 16, 5, 1, true).translate(0, 8, 0), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
        pv.add(beam); pv.userData.ph = i * 1.7; c.lasers.push(pv);
      });
      bAddTree(b, -4.6, -8.5, { h: 4 }); bAddTree(b, 7.6, -9.8, { h: 3.8, col: '#d6532e' });
    },
    idle(c, t, dt, st) {
      c.ball.rotation.y += dt * (c.party ? 2.5 : .5);
      const on = st !== 'locked'; const k = c.party ? 2.6 : 1;
      c.lasers.forEach((l, i) => { l.visible = on && (c.party || st === 'visited' || c.glowAmt > .4); l.rotation.z = Math.sin(t * .8 * k + l.userData.ph) * .7; l.rotation.x = .9 + Math.sin(t * .6 * k + l.userData.ph) * .25; });
      if (on && (c.party || (st === 'visited' && R() < dt * 2))) c.fx.sparkle(c.ball.getWorldPosition(V3()), c.party ? 2 : 1, .8);
    },
    async react(c) { c.party = true; c.fx.sparkle(c.ball.getWorldPosition(V3()), 30, 1.2); await wait(2); c.party = false; },
    async event(c) {
      c.party = true;
      for (let i = 0; i < 3; i++) { c.fx.fog(c.L(1.5, .8, -8.5), 6); c.fx.sparkle(c.ball.getWorldPosition(V3()), 14, 1.4); await wait(.8); }
      await wait(.6); c.party = false;
    },
  },
  // ------------------------------------------------------------------ 17 Snart framme (mini)
  { id: 'snart', kind: 'mini', t: '16:30', name: 'Snart framme',
    stand: [.9, -2.6], standFace: Math.PI, camFix: { p: [2.2, 5.0, 8.6], t: [1.0, .2, -12] },
    mattias: { p: [2.75, 0, -17.6], pose: 'stand' },
    build(c) {
      const { b, g } = c;
      // gravel avenue + bridge over a stream
      b.add(G.box(2.4, .04, 22), '#d8ccb8', [1.0, .02, -15]);
      b.add(G.box(16, .05, 2.6), '#5d8fb8', [1.0, .02, -9]);
      for (let i = 0; i < 12; i++) b.add(G.ico(rr(.2, .35), 0), '#9a9692', [rr(-6, 8), .05, -9 + (i % 2 ? 1.4 : -1.4) + rr(-.2, .2)]);
      for (let i = 0; i < 7; i++) { const z = -7.2 - i * .6, y = .25 + Math.sin(i / 6 * Math.PI) * .35; b.add(G.box(2.6, .12, .58), C.wood, [1.0, y, z]); }
      for (const s of [-1, 1]) { for (let i = 0; i < 4; i++) b.add(G.box(.08, .7, .08), C.woodD, [1.0 + s * 1.25, .55 + Math.sin(i / 3 * Math.PI) * .35, -7.2 - i * 1.2]); b.add(G.box(.08, .08, 3.8), C.woodD, [1.0 + s * 1.25, 1.05 + .2, -9], [0, 0, 0]); }
      // lanterns (instanced so they can light one by one)
      const Z = [-4.6, -7.0, -11.3, -13.6, -15.9, -18.2, -20.5];
      const lpos = [];
      Z.forEach((z, i) => { for (const s of [-1, 1]) { const x = 1.0 + s * 1.75; b.add(G.cyl(.05, .07, 1.9, 6), C.dark, [x, .95, z]); b.add(G.box(.32, .06, .32), C.dark, [x, 2.32, z]); b.add(G.cone(.24, .2, 4), C.dark, [x, 2.42, z], [0, Math.PI / 4, 0]); b.add(G.box(.26, .05, .26), C.dark, [x, 1.92, z]); lpos.push([x, 2.12, z, i]); } });
      const lg = new THREE.InstancedMesh(G.box(.24, .36, .24), new THREE.MeshBasicMaterial({ color: '#ffffff' }), lpos.length);
      lpos.forEach(([x, y, z], i) => { lg.setMatrixAt(i, mat4([x, y, z])); lg.setColorAt(i, new THREE.Color('#6a6058')); });
      c.root.add(lg); c.lanterns = lg; c.lpos = lpos; c.lit = new Array(lpos.length).fill(0);
      // distant restaurant glow at the end of the avenue
      bAddHouse(b, { x: 1.0, z: -27, w: 4.5, d: 3, h: 2.8, wall: C.cream, roof: C.wine, glow: g, windows: 3, chimney: false });
      [[-1.8, -6], [3.8, -6.5], [-1.9, -14], [3.9, -13], [-2, -21], [4, -22]].forEach(([x, z], i) => bAddTree(b, x, z, { h: 3.6, col: i % 2 ? C.gold : '#d6532e' }));
      void g;
    },
    idle(c, t, dt, st) {
      const auto = c.glowAmt > .5 && st === 'visited';
      for (let i = 0; i < c.lpos.length; i++) {
        const target = c.lit[i] || (auto ? 1 : 0), fl = .9 + Math.sin(t * 9 + i * 1.7) * .1;
        _ca.set('#6a6058').lerp(_cb.set('#ffcf6e'), target * fl); c.lanterns.setColorAt(i, _ca);
      }
      c.lanterns.instanceColor.needsUpdate = true;
    },
    reset(c) { c.lit.fill(0); },
    async event(c) {
      c.lit.fill(0);
      const Z = [...new Set(c.lpos.map(p => p[3]))];
      for (const zi of Z) { c.lpos.forEach((p, i) => { if (p[3] === zi) { c.lit[i] = 1; c.fx.sparkle(c.L(p[0], p[1], p[2]), 4, .2); } }); await wait(.32); }
      c.fx.sparkle(c.L(1.0, 2.5, -27), 20, 2);
    },
  },
  // ------------------------------------------------------------------ 18 Cin cin – finale
  { id: 'cincin', kind: 'main', t: '17:00', name: 'Cin cin 🥂',
    stand: [0.8, -2.7], 
    mattias: { p: [1.95, .2, -6.25], pose: 'stand', face: [.15, -6.0] },
    spots: { table: [.25, -5.95, .2] },
    build(c) {
      const { b, g } = c;
      const rx = 1.6, rz = -11.2;
      b.add(G.box(6.4, 3.6, 4.2), C.cream, [rx, 1.8, rz]);
      b.add(G.box(6.6, .3, 4.4), C.wine, [rx, 3.6, rz]);
      const sh = new THREE.Shape([new THREE.Vector2(-2.5, 0), new THREE.Vector2(2.5, 0), new THREE.Vector2(0, 2.0)]);
      b.add(new THREE.ExtrudeGeometry(sh, { depth: 6.8, bevelEnabled: false }), C.roof, [rx - 3.4, 3.75, rz], [0, Math.PI / 2, 0]);
      for (const x of [-1.6, 0, 1.6]) { b.add(G.box(1.2, 1.8, .1), C.wine, [rx + x, 1.5, rz + 2.12]); g.add(G.plane(1.0, 1.6), '#fff', [rx + x, 1.5, rz + 2.19]); b.add(G.box(.06, 1.6, .06), C.wine, [rx + x, 1.5, rz + 2.2]); }
      b.add(G.box(1.0, .1, .7), C.gold, [rx + 2.6, 2.6, rz + 2.4]);
      c.sign(3.0, .8, (x, w, h) => { x.fillStyle = C.wine; rrect(x, 0, 0, w, h, 22); x.fill(); x.strokeStyle = C.gold; x.lineWidth = 6; x.stroke(); x.fillStyle = C.gold; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `700 ${h * .62}px Caveat, ${FONT}`; x.fillText('Cin cin 🥂', w / 2, h * .56); }, { x: rx, y: 3.05, z: rz + 2.25 });
      // terrace deck + railing + planters
      b.add(G.box(6.6, .2, 4.4), '#9a6a48', [1.3, .1, -6.5]);
      for (let i = 0; i < 11; i++) b.add(G.box(6.6, .01, .04), '#845a3c', [1.3, .205, -4.5 - i * .4]);
      for (const x of [-1.8, 4.4]) { b.add(G.box(.7, .5, .7), C.wine, [x, .45, -4.6]); bAddBush(b, x, -4.6, .5, '#5f8466'); }
      // string light poles
      const poles = [[-1.9, -4.4], [4.5, -4.4], [-1.9, -8.6], [4.5, -8.6]];
      for (const [x, z] of poles) b.add(G.cyl(.05, .06, 3.2, 6), C.dark, [x, 1.7, z]);
      const bulbs = []; const span = (a, bb, n) => { for (let i = 0; i <= n; i++) { const t = i / n; bulbs.push([lerp(a[0], bb[0], t), 3.25 - Math.sin(t * Math.PI) * .55, lerp(a[1], bb[1], t)]); } };
      span(poles[0], poles[1], 14); span(poles[2], poles[3], 14); span(poles[0], poles[3], 16); span(poles[1], poles[2], 16);
      span([-1.9, -4.4], [rx - 3.2, rz + 2.1], 6); span([4.5, -4.4], [rx + 3.2, rz + 2.1], 6);
      const bm = new THREE.InstancedMesh(G.sph(.07, 6, 4), new THREE.MeshBasicMaterial({ color: '#fff' }), bulbs.length);
      bulbs.forEach((p, i) => { bm.setMatrixAt(i, mat4(p)); bm.setColorAt(i, new THREE.Color('#fff')); });
      c.root.add(bm); c.bulbs = bm; c.nb = bulbs.length;
      // table for two
      const tx = 1.1, tz = -6.1;
      b.add(G.cyl(.55, .55, .04, 18), '#ffffff', [tx, 1.0, tz]).add(G.cyl(.57, .5, .25, 18, true), '#f6f1ea', [tx, .88, tz]).add(G.cyl(.05, .05, .8, 6), C.dark, [tx, .6, tz]).add(G.cyl(.25, .25, .04, 10), C.dark, [tx, .22, tz]);
      for (const s of [-1, 1]) { const cx = tx + s * .9; b.add(G.box(.45, .06, .45), C.wine, [cx, .65, tz]); b.add(G.box(.06, .6, .45), C.wine, [cx + s * .22, .95, tz]); for (const dx of [-.18, .18]) for (const dz of [-.18, .18]) b.add(G.box(.04, .45, .04), C.dark, [cx + dx, .43, tz + dz]); }
      for (const s of [-1, 1]) {
        const gx = tx + s * .25;
        b.add(new THREE.LatheGeometry([[0, 0], [.07, 0], [.07, .01], [.01, .02], [.01, .14], [.06, .18], [.07, .26], [.0, .26]].map(([x, y]) => new THREE.Vector2(x, y)), 10), '#f4e6ea', [gx, 1.02, tz + .1]);
        b.add(G.cyl(.055, .04, .06, 10), '#8c1d40', [gx, 1.2, tz + .1]);
        b.add(G.cyl(.035, .035, .25, 8), C.cream, [tx + s * .12, 1.14, tz - .12]);
      }
      b.add(G.cyl(.06, .06, .3, 8), '#2f4a32', [tx, 1.17, tz - .05]).add(G.cyl(.025, .025, .12, 6), '#2f4a32', [tx, 1.38, tz - .05]);
      c.flames = c.group(0, 0, 0);
      for (const s of [-1, 1]) { const fl = new THREE.Mesh(prep(G.sph(.035, 8, 6), '#fff', mat4([0, 0, 0], [0, 0, 0], [1, 1.8, 1])), c.glowMat); fl.position.set(tx + s * .12, 1.32, tz - .12); c.flames.add(fl); }
      bAddTree(b, -4.4, -9, { h: 4, col: C.gold }); bAddTree(b, 7, -10, { kind: 'spruce', s: 1.5 }); bAddTree(b, 6.3, -6.6, { h: 3.5, col: '#d6532e' });
    },
    idle(c, t, dt, st) {
      const k = Math.max(.15, c.glowAmt), fast = c.party ? 8 : 1.5;
      for (let i = 0; i < c.nb; i++) { const tw = .75 + .25 * Math.sin(t * fast * (1 + (i % 5) * .3) + i * 2.1); _ca.set('#5a5048').lerp(_cb.set(i % 3 === 0 ? '#ffe7a8' : '#ffcf6e'), k * tw * (st === 'locked' ? .3 : 1)); c.bulbs.setColorAt(i, _ca); }
      c.bulbs.instanceColor.needsUpdate = true;
      c.flames.children.forEach((f, i) => { f.scale.set(1, 1 + Math.sin(t * 17 + i * 3) * .15, 1); f.visible = st !== 'locked'; });
    },
    async event(c) {
      c.party = true;
      c.fx.fireworks(c.L(1.6, 2.0, -10), 4); await wait(1.4);
      c.fx.fireworks(c.L(1.6, 2.0, -10), 4); c.fx.hearts(c.L(1.1, 1.6, -6.1), 8);
      await wait(1.6); c.party = false;
    },
  },
);

function drawRuler(x, w, h, RH) {
  x.fillStyle = '#f2cf63'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#5a3a14'; x.textAlign = 'left'; x.textBaseline = 'middle';
  const pxm = h / RH;
  for (let cm = 0; cm <= RH * 100; cm += 10) {
    const y = h - cm / 100 * pxm, big = cm % 50 === 0;
    x.fillRect(0, y - 1.5, big ? w * .45 : w * .25, 3);
    if (cm % 50 === 0 && cm > 0) { x.font = `700 ${w * .28}px ${FONT}`; x.fillText(String(cm), w * .5, y); }
  }
  x.fillStyle = '#5a3a14'; x.font = `600 ${w * .2}px ${FONT}`; x.fillText('cm', w * .55, h - 20);
}

// ---------------------------------------------------------------------------------------------- createWorld
export async function createWorld({ scene, renderer, camera } = {}) {
  // fonts first so canvas signs draw in Fredoka (redrawn again if fonts arrive later)
  try {
    if (document.fonts) {
      await Promise.race([Promise.all(['600 40px Fredoka', '700 40px Fredoka', '700 40px Caveat'].map(f => document.fonts.load(f))), new Promise(r => setTimeout(r, 2500))]);
      document.fonts.ready.then(() => setTimeout(() => redrawers.forEach(fn => fn()), 50));
    }
  } catch (e) { /* ignore */ }

  const world = new THREE.Group(); world.name = 'world'; scene.add(world);
  const worldMat = makeVCMaterial();
  const glowMat = new THREE.MeshBasicMaterial({ color: '#b9ccd4', fog: true });
  const trainMat = makeVCMaterial();

  // ---------------- layout + track
  const anchors = computeAnchors();
  const T = buildTrack(anchors);
  const tmpP = V3(), tmpT = V3();
  function sampleS(s, outP = V3(), outT = V3()) {
    const f = clamp(s / T.L, 0, 1) * T.N, i = Math.min(T.N - 1, Math.floor(f)), k = f - i;
    outP.lerpVectors(T.pts[i], T.pts[i + 1], k); outT.subVectors(T.pts[i + 1], T.pts[i]).normalize();
    return { position: outP, tangent: outT };
  }
  const trackPoint = u => { const r = sampleS(u * T.L); return { position: r.position.clone(), tangent: r.tangent.clone() }; };
  // coarse polyline for distance queries
  const coarse = []; for (let s = 0; s <= T.L; s += 3) coarse.push(sampleS(s).position.clone());
  const distTrack = (x, z) => { let m = 1e9; for (const p of coarse) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < m) m = d; } return Math.sqrt(m); };

  // ---------------- station frames (no geometry yet)
  const stations = [], ctxs = [];
  const exclusions = []; // {x,z,r}
  STOPS.forEach((def, k) => {
    const a = anchors[k], root = new THREE.Group(); root.position.set(a.x, 0, a.z); root.rotation.y = -a.th; root.updateMatrixWorld(true);
    root.name = 'stop-' + def.id; world.add(root);
    const L = (x, y, z) => root.localToWorld(V3(x, y, z));
    const yawTo = (fx, fz, tx, tz) => Math.atan2(tx - fx, tz - fz) - a.th;
    const sx0 = def.stand[0];
    def.cam = def.camFix || { p: [sx0 + 2.0 + (def.cdx || 0), 4.4 + (def.cdy || 0), 10.5 + (def.cdz || 0)], t: [sx0 + .5 + (def.tdx || 0), .35 + (def.tdy || 0), -5.2] };
    const camP = def.cam.p, camT = def.cam.t;
    const face = (p, f) => typeof f === 'number' ? f - a.th : Array.isArray(f) ? yawTo(p[0], p[2], f[0], f[1]) : yawTo(p[0], p[2], camP[0], camP[2]);
    const sp = [def.stand[0], PH, def.stand[1]];
    const st = {
      idx: k, id: def.id, kind: def.kind, t: def.t, h: +def.t.slice(0, 2) + (+def.t.slice(3) / 60), name: def.name,
      trainU: (T.sAnchor[k] - 2.15) / T.L,
      standPos: L(...sp), standFacing: def.standFace !== undefined ? def.standFace - a.th : face(sp, 'cam'),
      cameraPos: L(...camP), cameraTarget: L(...camT),
      npcSpots: [{ who: 'conductor', pos: L(-4.5, PH, -2.45), facing: yawTo(-4.5, -2.45, sp[0], sp[2] + 1.5) }],
      mattiasSpot: { pos: L(...def.mattias.p), facing: face(def.mattias.p, def.mattias.face), pose: def.mattias.pose },
      spots: {},
      state: 'locked',
    };
    // sheet-up framing: same view but target pushed down so Maja sits in the top ~40 %
    const dir = V3(camT[0] - camP[0], 0, camT[2] - camP[2]).normalize();
    st.sheetCameraPos = L(camP[0] - dir.x * 1.5, camP[1] + .9, camP[2] - dir.z * 1.5);
    st.sheetCameraTarget = L(camT[0], camT[1] - 2.4, camT[2]);
    for (const n of def.npcs || []) st.npcSpots.push({ who: n.who, pos: L(...n.p), facing: face(n.p, n.face) });
    for (const [key, v] of Object.entries(def.spots || {})) { const p = [v[0], v[2] ?? 0, v[1]]; st.spots[key] = { pos: L(...p), facing: face(p, 'cam') }; }
    stations.push(st);
    exclusions.push({ ...xz(L(1, 0, -9)), r: 12 }, { ...xz(L(...camP)), r: 4.5 }, { ...xz(L((camP[0] + camT[0]) / 2, 0, (camP[2] + camT[2]) / 2)), r: 5 }, { ...xz(L(-4, 0, -2.5)), r: 9 }, { ...xz(L(sx0 + 1.5, 0, 4.5)), r: 6.5 });
    ctxs.push({ def, root, L, st, a });
  });
  function xz(v) { return { x: v.x, z: v.z }; }

  // ---------------- lake (behind Tittut)
  const lakeStop = ctxs.find(c => c.def.lake);
  let lake = null;
  {
    let Rl = 15; const c0 = lakeStop.L(.8, 0, -(Rl + 9.5));
    const dT = distTrack(c0.x, c0.z); Rl = Math.min(Rl, dT - 9.5);
    lake = { x: c0.x, z: c0.z, r: Rl };
  }
  const inExcl = (x, z, pad = 0) => exclusions.some(e => (e.x - x) ** 2 + (e.z - z) ** 2 < (e.r + pad) ** 2);
  const lakeD = (x, z) => Math.hypot(x - lake.x, z - lake.z);

  // ---------------- terrain
  const stationD = (x, z) => { let m = 1e9; for (const c of ctxs) { const p = c.L(1, 0, -7); const d = Math.hypot(p.x - x, p.z - z); if (d < m) m = d; } return m; };
  const heightAt = (x, z, dT = distTrack(x, z)) => {
    let h = (fbm(x * .016 + 10, z * .016 - 4) - .38) * 12 + (fbm(x * .05 + 3, z * .05) - .5) * 2.5;
    h = Math.max(-.2, h) * smooth(dT, 8, 30) * smooth(stationD(x, z), 16, 30);
    const r = Math.hypot(x, z - 0); h += smooth(r, 140, 260) * 30 * (.6 + fbm(x * .02, z * .02) * .8);
    const dl = lakeD(x, z); if (dl < lake.r + 8) h = lerp(-1.6 * (1 - Math.pow(Math.min(1, dl / lake.r), 3)), h, smooth(dl, lake.r - 2, lake.r + 8));
    return h;
  };
  {
    const S = 560, SEG = 112, geo = new THREE.PlaneGeometry(S, S, SEG, SEG); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color(), cA = new THREE.Color(C.grass), cB = new THREE.Color('#8fa66c'), cH = new THREE.Color('#5f7a4c'), cSand = new THREE.Color('#d8c49a'), cAut = new THREE.Color('#b99a4a'), cTr = new THREE.Color('#9a9a70');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), dT = distTrack(x, z), h = heightAt(x, z, dT); pos.setY(i, h);
      c.copy(cA).lerp(cB, fbm(x * .06, z * .06)).lerp(cH, clamp(h / 14, 0, .8)).lerp(cAut, smooth(fbm(x * .09 + 7, z * .09), .55, .8) * .55);
      if (dT < 3.5) c.lerp(cTr, .35);
      const dl = lakeD(x, z); if (dl < lake.r + 2.5) c.lerp(cSand, smooth(dl, lake.r - 2, lake.r) * (1 - smooth(dl, lake.r + 1, lake.r + 2.5)) + (dl < lake.r - 2 ? .6 : 0));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.deleteAttribute('uv'); geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, worldMat); ground.receiveShadow = true; ground.name = 'ground'; world.add(ground);
    // water
    const water = new THREE.Mesh(new THREE.CircleGeometry(lake.r + .5, 48), new THREE.MeshLambertMaterial({ color: '#6aa3c9', emissive: '#1f4a66', emissiveIntensity: .25 }));
    water.rotation.x = -Math.PI / 2; water.position.set(lake.x, -.28, lake.z); water.receiveShadow = true; world.add(water);
    const lb = new Builder();
    for (let i = 0; i < 9; i++) { const a = R() * TAU, r = rr(lake.r * .3, lake.r * .8); lb.add(G.cyl(.45, .45, .03, 10), '#5f8a4a', [lake.x + Math.cos(a) * r, -.25, lake.z + Math.sin(a) * r]); }
    // little row boat
    lb.add(G.rbox(2.2, .35, .9, .15), C.falu, [lake.x + 3, -.1, lake.z - 2], [0, .6, 0]).add(G.box(.2, .06, .8), C.woodL, [lake.x + 3, .1, lake.z - 2], [0, .6, 0]);
    world.add(lb.mesh(worldMat));
  }

  // ---------------- track mesh + sleepers + buffer stops
  {
    const prof = [
      { pts: [[-1.2, 0], [-.88, .12], [.88, .12], [1.2, 0]], col: '#a89a8a' },
      { pts: [[-.67, .17], [-.67, .27], [-.57, .27], [-.57, .17]], col: '#6f6870', top: '#cfc9d1' },
      { pts: [[.57, .17], [.57, .27], [.67, .27], [.67, .17]], col: '#6f6870', top: '#cfc9d1' },
    ];
    const step = .5, n = Math.floor(T.L / step);
    const P = [], N = [];
    for (let i = 0; i <= n; i++) { const r = sampleS(i * step); P.push(r.position.clone()); N.push(V3(-r.tangent.z, 0, r.tangent.x)); }
    const position = [], color = [], index = []; let base = 0; const cc = new THREE.Color(), ct = new THREE.Color();
    for (const pr of prof) {
      cc.set(pr.col); ct.set(pr.top || pr.col); const m = pr.pts.length;
      for (let i = 0; i <= n; i++) for (let j = 0; j < m; j++) {
        const [lx, ly] = pr.pts[j]; position.push(P[i].x + N[i].x * lx, ly, P[i].z + N[i].z * lx);
        const isTop = pr.top && ly > .26; const cl = isTop ? ct : cc; color.push(cl.r, cl.g, cl.b);
      }
      for (let i = 0; i < n; i++) for (let j = 0; j < m - 1; j++) { const a0 = base + i * m + j, a1 = a0 + 1, b0 = a0 + m, b1 = b0 + 1; index.push(a0, b0, a1, a1, b0, b1); }
      base += (n + 1) * m;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(color, 3)); g.setIndex(index); g.computeVertexNormals();
    const tm = new THREE.Mesh(g, worldMat); tm.receiveShadow = true; tm.name = 'track'; world.add(tm);
    const sl = Math.floor(T.L / .8), sleepers = new THREE.InstancedMesh(prep(G.box(.26, .06, 1.7), '#7a5a42'), worldMat, sl);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = V3(0, 1, 0), one = V3(1, 1, 1);
    for (let i = 0; i < sl; i++) { const r = sampleS(i * .8 + .4); q.setFromAxisAngle(up, Math.atan2(-r.tangent.z, r.tangent.x)); m4.compose(V3(r.position.x, .145, r.position.z), q, one); sleepers.setMatrixAt(i, m4); }
    sleepers.receiveShadow = true; world.add(sleepers);
    const bs = new Builder();
    for (const s of [.3, T.L - .3]) { const r = sampleS(s), yaw = Math.atan2(-r.tangent.z, r.tangent.x); bs.add(G.box(.5, .7, 1.8), C.falu, [r.position.x, .35, r.position.z], [0, yaw, 0]); bs.add(G.box(.52, .14, 1.82), C.white, [r.position.x, .55, r.position.z], [0, yaw, 0]); }
    world.add(bs.mesh(worldMat));
  }

  // ---------------- scenery (instanced)
  // instanced scenery, bucketed into 70 m cells so frustum culling skips what is off-screen
  const instances = (geo, n, place, { cast = true, mat = worldMat } = {}) => {
    const cells = new Map(); let k = 0; const q = new THREE.Quaternion(), s = V3(), p = V3(), e = new THREE.Euler(), cl = new THREE.Color();
    for (let i = 0; i < n * 8 && k < n; i++) {
      const r = place(p, e, s, cl); if (!r) continue; q.setFromEuler(e);
      const key = Math.floor(p.x / 70) + ',' + Math.floor(p.z / 70); if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push({ m: new THREE.Matrix4().compose(p, q, s), c: cl.clone() }); k++;
    }
    for (const list of cells.values()) {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((it, j) => { im.setMatrixAt(j, it.m); im.setColorAt(j, it.c); });
      im.castShadow = cast; im.receiveShadow = true; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); world.add(im);
    }
  };
  const freeSpot = (minTrack, pad = 0, maxR = 200) => {
    const x = rr(-maxR, maxR), z = rr(-maxR, maxR); if (Math.hypot(x, z) > maxR) return null;
    const dT = distTrack(x, z); if (dT < minTrack) return null; if (inExcl(x, z, pad)) return null; if (lakeD(x, z) < lake.r + 1.5) return null;
    return { x, z, dT, h: heightAt(x, z, dT) };
  };
  {
    // birches: trunk + crown, autumn coloured per instance
    const treeSpots = [];
    for (let i = 0; i < 4000 && treeSpots.length < 420; i++) { const f = freeSpot(8.5, 1, 210); if (!f) continue; if (fbm(f.x * .03 + 2, f.z * .03) < .42 && R() > .25) continue; treeSpots.push({ ...f, s: rr(.8, 1.5), spruce: f.h > 3 ? R() < .75 : R() < .3 }); }
    const birch = treeSpots.filter(t => !t.spruce), spruce = treeSpots.filter(t => t.spruce);
    let bi = 0; instances(prep(G.cyl(.1, .15, 2.2, 6), '#efeae2', mat4([0, 1.1, 0])), birch.length, (p, e, s, cl) => { const t = birch[bi++]; if (!t) return false; p.set(t.x, t.h - .1, t.z); e.set(0, R() * 6, 0); s.setScalar(t.s); cl.set('#ffffff'); return true; });
    bi = 0; const crown = new Builder(); crown.add(G.ico(1, 1), '#ffffff', [0, 2.6, 0], [0, 0, 0], [1, 1.2, 1]).add(G.ico(.62, 0), '#ffffff', [.55, 2.2, .25]).add(G.ico(.5, 0), '#f2f2f2', [-.5, 2.35, -.2]);
    instances(crown.geometry(), birch.length, (p, e, s, cl) => { const t = birch[bi++]; if (!t) return false; p.set(t.x, t.h - .1, t.z); e.set(0, R() * 6, 0); s.setScalar(t.s); cl.set(R() < .12 ? '#8aa05a' : pick(PALETTE_AUTUMN)); return true; });
    let si = 0; const sp = new Builder(); sp.add(G.cyl(.12, .16, .8, 6), '#8a6a52', [0, .4, 0]); sp.add(G.cone(1.15, 1.7, 8), '#ffffff', [0, 1.4, 0]).add(G.cone(.9, 1.4, 8), '#ffffff', [0, 2.2, 0]).add(G.cone(.6, 1.1, 8), '#ffffff', [0, 2.95, 0]);
    instances(sp.geometry(), spruce.length, (p, e, s, cl) => { const t = spruce[si++]; if (!t) return false; p.set(t.x, t.h - .1, t.z); e.set(0, R() * 6, 0); s.set(t.s, t.s * rr(1, 1.4), t.s); cl.set(pick(['#3f6447', '#46704c', '#365a40', '#4d6f48'])); return true; });
    // rocks
    instances(prep(G.ico(1, 0), '#ffffff'), 70, (p, e, s, cl) => { const f = freeSpot(5, 0, 190); if (!f) return false; p.set(f.x, f.h, f.z); e.set(R(), R(), R()); s.set(rr(.3, 1.2), rr(.25, .7), rr(.3, 1.1)); cl.set(pick(['#a39e98', '#8f8a86', '#b5afa6'])); return true; });
    // grass tufts
    const tuft = new Builder(); for (let i = 0; i < 4; i++) tuft.add(new THREE.ConeGeometry(.07, .45, 3, 1, true), '#ffffff', [Math.cos(i * 1.6) * .1, .2, Math.sin(i * 1.6) * .1], [Math.cos(i) * .3, 0, Math.sin(i) * .3]);
    instances(tuft.geometry(), 800, (p, e, s, cl) => { const f = freeSpot(2.4, -2, 160); if (!f) return false; p.set(f.x, f.h, f.z); e.set(0, R() * 6, 0); s.setScalar(rr(.7, 1.4)); cl.set(pick(['#6f8f4f', '#839a55', '#a8a05a', '#5f7f46'])); return true; }, { cast: false });
    // flowers + fallen leaves
    const fl = new Builder(); fl.add(G.cyl(.012, .012, .3, 3, true), '#6f8f4f', [0, .15, 0]).add(new THREE.OctahedronGeometry(.08, 0), '#ffffff', [0, .32, 0]);
    instances(fl.geometry(), 420, (p, e, s, cl) => { const f = freeSpot(2.6, -2, 140); if (!f) return false; p.set(f.x, f.h, f.z); e.set(0, 0, 0); s.setScalar(rr(.8, 1.3)); cl.set(pick(['#ffffff', '#f2cf63', '#ff8fa3', '#c9a0ff', '#ffffff'])); return true; }, { cast: false });
    instances(prep(G.circ(.12, 5), '#ffffff', mat4([0, 0, 0], [-Math.PI / 2, 0, 0])), 900, (p, e, s, cl) => { const f = freeSpot(2.2, -3, 150); if (!f) return false; p.set(f.x, f.h + .02, f.z); e.set(0, R() * 6, 0); s.set(rr(.8, 1.6), 1, rr(.6, 1.1)); cl.set(pick(PALETTE_AUTUMN)); return true; }, { cast: false });
    // a few distant red cottages on the hills
    const cb = new Builder(), cg = new Builder();
    for (let i = 0, k = 0; i < 400 && k < 14; i++) { const f = freeSpot(16, 4, 170); if (!f || f.h > 5) continue; bAddHouse(cb, { x: f.x, z: f.z, w: rr(3, 4), d: 3, h: 2.4, ry: R() * 6, glow: cg }); k++; }
    // houses need y offset to terrain: built at y=0, so only place on near-flat ground (h<5 → sink a little)
    world.add(cb.mesh(worldMat)); world.add(cg.mesh(glowMat, { cast: false, receive: false }));
  }
  // clouds
  const clouds = new THREE.Group(); world.add(clouds);
  {
    const cb = new Builder();
    for (let i = 0; i < 14; i++) { const a = R() * TAU, r = rr(30, 170), cx = Math.cos(a) * r, cz = Math.sin(a) * r, cy = rr(32, 52), s = rr(2.5, 5); for (let k = 0; k < 5; k++) cb.add(G.ico(s * rr(.6, 1), 1), '#ffffff', [cx + (k - 2) * s * .8, cy + rr(-.3, .6) * s, cz + rr(-.5, .5) * s], [0, 0, 0], [1, .7, 1]); }
    const cm = cb.mesh(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#ffffff', emissiveIntensity: .25 }), { cast: false, receive: false }); clouds.add(cm);
  }
  // bird flock
  const flock = new THREE.InstancedMesh((() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, .15, -.6, .25, -.1, 0, 0, -.15, 0, 0, .15, 0, 0, -.15, .6, .25, -.1], 3)); g.computeVertexNormals(); return g; })(), new THREE.MeshBasicMaterial({ color: '#3a2e3a', side: THREE.DoubleSide }), 14);
  flock.frustumCulled = false; world.add(flock);
  const birdsData = Array.from({ length: 14 }, (_, i) => ({ ph: R() * TAU, r: rr(-4, 4), y: rr(-2, 2), sp: rr(.9, 1.1) }));

  // ---------------- sky, stars, moon, lights, fog
  const sky = makeSky(); scene.add(sky);
  const starGeo = new THREE.BufferGeometry(), sp = [];
  for (let i = 0; i < 420; i++) { const a = R() * TAU, e = Math.asin(rr(.08, 1)); sp.push(Math.cos(a) * Math.cos(e) * 380, Math.sin(e) * 380, Math.sin(a) * Math.cos(e) * 380); }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#fff6dd', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  stars.frustumCulled = false; scene.add(stars);
  const moonTex = canvasTex(256, 256, (x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, w * .2, w / 2, h / 2, w * .5); g.addColorStop(0, 'rgba(255,240,200,.5)'); g.addColorStop(1, 'rgba(255,240,200,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); x.fillStyle = '#fff3cf'; x.beginPath(); x.arc(w / 2, h / 2, w * .22, 0, TAU); x.fill(); x.fillStyle = '#e8d9b0'; for (const [a, b, r] of [[.44, .44, .04], [.56, .55, .03], [.47, .6, .025]]) { x.beginPath(); x.arc(w * a, h * b, w * r, 0, TAU); x.fill(); } });
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshBasicMaterial({ map: moonTex.tex, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  moon.name = 'moon'; scene.add(moon);
  const hemi = new THREE.HemisphereLight('#ffffff', '#776655', 1.2); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffffff', 2.5); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 140 });
  sun.shadow.bias = -.0005; sun.shadow.normalBias = .04; scene.add(sun, sun.target);
  scene.fog = new THREE.Fog('#d8e4ea', 110, 400);
  if (renderer) { renderer.shadowMap.enabled = true; }

  // ---------------- train
  const train = buildTrain(trainMat, glowMat); world.add(train.group);

  // ---------------- fx + bubbles
  const fxSys = makeFX(scene); const fx = fxSys.api; const bubble = makeBubbles(scene);

  // ---------------- stations geometry
  const pickables = [];
  const stateSat = { locked: .3, ready: 1, visited: 1 };
  ctxs.forEach(c => {
    const { def, root, st } = c;
    const mat = makeVCMaterial(); c.mat = mat; c.glowMat = glowMat; c.fx = fx; c.glowAmt = 0;
    c.b = new Builder(); c.g = new Builder();
    c.group = (x = 0, y = 0, z = 0, ry = 0, parent = root) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g); return g; };
    c.mesh = (fn, parent = root) => { const bb = new Builder(); fn(bb); const m = bb.mesh(mat); parent.add(m); return m; };
    c.sign = (w, h, draw, { x = 0, y = 0, z = 0, ry = 0, parent = root, px = 256, double = false } = {}) => { const m = makeSignMesh(w, h, draw, { px, double }); m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m; };
    c.pick = (object, id) => pickables.push({ object, id, stationId: def.id });
    c.bubble = (text, pos, o = {}) => bubble(text, Array.isArray(pos) ? c.L(...pos) : pos, o);
    // platform
    const main = def.kind === 'main', x0 = -12.6, x1 = main ? 5.6 : 3.6, z0 = -1.28, z1 = main ? -4.2 : -3.6;
    c.b.add(G.rbox(x1 - x0, PH, z0 - z1, .06), C.stone, [(x0 + x1) / 2, PH / 2, (z0 + z1) / 2]);
    c.b.add(G.box(x1 - x0 - .1, .012, .14), C.gold, [(x0 + x1) / 2, PH + .006, z0 - .22]);
    for (let x = x0 + 1; x < x1 - .5; x += 1.5) c.b.add(G.box(.02, .008, z0 - z1 - .5), C.stoneD, [x, PH + .004, (z0 + z1) / 2 - .1]);
    bAddLamp(c.b, c.g, x0 + 2.5, z1 + .35); bAddLamp(c.b, c.g, -6.8, z1 + .35);
    bAddBench(c.b, -8.8, z1 + .45, 0, C.wine);
    // name + departure sign
    const sx = def.sign ? def.sign[0] : def.stand[0] - (main ? .75 : .95), sz = def.sign ? def.sign[1] : z1 + .2;
    const sry = Math.atan2(def.cam.p[0] - sx, def.cam.p[2] - sz) * .8;
    const sg = c.group(sx, PH, sz, sry);
    if (main) {
      c.mesh(m => { for (const s of [-1, 1]) m.add(G.cyl(.05, .06, 3.9, 8), C.dark, [s * .82, 1.95, -.05]); m.add(G.sph(.08, 8, 6), C.gold, [-.82, 3.93, -.05]); m.add(G.sph(.08, 8, 6), C.gold, [.82, 3.93, -.05]); m.add(G.box(1.9, .6, .06), C.dark, [0, 3.35, -.06]); m.add(G.box(1.5, .4, .06), C.dark, [0, 2.82, -.06]); }, sg);
      c.nameSign = c.sign(1.82, .54, drawBoard(def.name, { bg: C.wine, fg: C.paper, border: C.gold, size: .62 }), { x: 0, y: 3.35, z: -.02, parent: sg, px: 320 });
      c.board = c.sign(1.42, .34, drawDeparture(def.t, ''), { x: 0, y: 2.82, z: -.02, parent: sg, px: 300 });
      c.beaconY = 4.4;
    } else {
      c.mesh(m => { m.add(G.cyl(.05, .06, 3.8, 8), C.dark, [-.62, 1.9, -.05]); m.add(G.cyl(.05, .06, 3.8, 8), C.dark, [.62, 1.9, -.05]); m.add(G.cyl(.34, .34, .06, 24), C.dark, [0, 3.55, -.07], [Math.PI / 2, 0, 0]); m.add(G.box(1.5, .6, .06), C.dark, [0, 2.85, -.07]); m.add(G.box(1.24, .34, .06), C.dark, [0, 2.4, -.07]); }, sg);
      c.sign(.66, .66, (x, w, h) => { x.fillStyle = C.gold; x.beginPath(); x.arc(w / 2, h / 2, w * .47, 0, TAU); x.fill(); x.lineWidth = w * .05; x.strokeStyle = C.paper; x.stroke(); x.fillStyle = C.wine; x.font = `700 ${h * .62}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('H', w / 2, h * .55); }, { x: 0, y: 3.55, z: -.02, parent: sg, px: 200 });
      c.nameSign = c.sign(1.42, .54, drawMini(def.name), { x: 0, y: 2.85, z: -.02, parent: sg, px: 320 });
      c.board = c.sign(1.18, .3, drawDeparture(def.t, ''), { x: 0, y: 2.4, z: -.02, parent: sg, px: 300 });
      c.beaconY = 4.0;
    }
    c.board.material.emissiveIntensity = .7;
    c.signGroup = sg;
    // barrier (closed when locked)
    const bx = x1 - .3, bz = z1 + .25;
    c.b.add(G.box(.22, 1.1, .22), C.white, [bx, PH + .55, bz]).add(G.box(.24, .2, .24), C.falu, [bx, PH + .9, bz]);
    const arm = c.group(bx, PH + .95, bz + .14); c.arm = arm;
    c.mesh(m => { for (let i = 0; i < 5; i++) m.add(G.box(.48, .1, .06), i % 2 ? C.white : '#d92d3a', [-.24 - i * .48, 0, 0]); m.add(G.sph(.07, 8, 6), '#ff5544', [-2.35, .1, 0]); }, arm);
    // ready beacon: spinning star ring + balloons on the sign
    const beacon = c.group(0, c.beaconY, 0, 0, sg); c.beacon = beacon;
    const bm = new THREE.Mesh(prep(G.tor(.32, .06, 6, 24), '#ffffff'), new THREE.MeshBasicMaterial({ color: '#ffd36e', vertexColors: true })); beacon.add(bm);
    const star = new THREE.Mesh(prep(new THREE.OctahedronGeometry(.2, 0), '#ffffff', mat4([0, 0, 0], [0, 0, 0], [1, 1.4, .5])), new THREE.MeshBasicMaterial({ color: '#fff1b0', vertexColors: true })); beacon.add(star);
    const bal = c.group(main ? -1.25 : -.55, .3, -.05, 0, sg); c.readyBalloons = bal;
    [[C.rose, -.25, 3.45], [C.gold, .15, 3.75], ['#7fc4e8', .45, 3.35]].forEach(([col, x, y], i) => { const m = c.mesh(m => bAddBalloon(m, 0, 0, 0, col), bal); m.position.set(x - .1, y - .3, 0); m.userData.ph = i; m.userData.y = y - .3; });
    // foreground dressing on the camera side of the track (flowers, tufts, a stone or two)
    for (let i = 0; i < 22; i++) { const fx_ = def.stand[0] + rr(-2.5, 4.5), fz = rr(2.2, 6); c.b.add(G.circ(.1, 5), pick(PALETTE_AUTUMN), [fx_ - .3, .015, fz - .2], [-Math.PI / 2, 0, R() * 6]); if (i % 2) c.b.add(G.cyl(.012, .012, .3, 3, true), '#6f8f4f', [fx_ + .1, .15, fz + .05]).add(new THREE.OctahedronGeometry(.08, 0), pick(['#ffffff', '#f2cf63', '#ff8fa3', '#c9a0ff']), [fx_ + .1, .32, fz + .05]); }
    bAddBush(c.b, def.stand[0] - 1.8, 4.6, .7, '#7c8f4f'); c.b.add(G.ico(.35, 0), '#a39e98', [def.stand[0] + 3.6, .15, 3.4], [.3, .5, 0], [1.3, .6, 1]);
    for (const [px_, pz_, ps] of [[def.stand[0] + 2.9, 2.6, .32], [def.stand[0] + 3.4, 2.9, .22], [def.stand[0] - 1.0, 3.2, .26]]) { c.b.add(G.sph(ps, 12, 8), C.orange, [px_, ps * .8, pz_], [0, 0, 0], [1.15, .85, 1.15]); c.b.add(G.cyl(.03, .04, .14, 5), '#5d6b3a', [px_, ps * 1.55, pz_]); }
    def.build(c);
    root.add(c.b.mesh(mat)); if (!c.g.empty) root.add(c.g.mesh(glowMat, { cast: false, receive: false }));
    root.traverse(o => { if (o.isMesh && o.material === mat) { o.castShadow = true; o.receiveShadow = true; } });
    c.state = 'locked'; mat.userData.uSat.value = stateSat.locked; c.armT = 0;
  });
  // cameo tractor with driver ("Patrik") driving a loop behind Skäftesfall
  const cameo = makeTractor(worldMat, { driver: true }); world.add(cameo);
  const cameoStop = ctxs.find(c => c.def.id === 'skaftesfall');
  const cameoC = cameoStop.L(7.5, 0, -13.5);
  pickables.push({ object: cameo, id: 'tractor', stationId: 'skaftesfall' });
  pickables.push({ object: train.loco, id: 'loco' });
  pickables.push({ object: moon, id: 'moon' });

  function drawMini(name) {
    return (x, w, h) => {
      x.fillStyle = C.paper; rrect(x, 3, 3, w - 6, h - 6, h * .2); x.fill(); x.lineWidth = 6; x.strokeStyle = C.wine; x.stroke();
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = C.night; fitText(x, 'HÅLLPLATS', w * .6, h * .2, 600); x.fillText('HÅLLPLATS', w / 2, h * .25);
      x.fillStyle = C.wine; fitText(x, name, w * .88, h * .44, 700); x.fillText(name, w / 2, h * .64);
    };
  }
  function drawDeparture(t, text) {
    return (x, w, h) => {
      x.fillStyle = '#1d1420'; rrect(x, 0, 0, w, h, h * .18); x.fill();
      x.fillStyle = C.gold; x.textBaseline = 'middle'; x.textAlign = 'left';
      fitText(x, t, w * .3, h * .55, 600, `"DM Mono", ui-monospace, ${FONT}`); x.fillText(t, w * .05, h * .54);
      x.textAlign = 'right'; x.fillStyle = '#ffe9b0'; fitText(x, text || '', w * .6, h * .5, 600); x.fillText(text || '', w * .95, h * .54);
    };
  }

  // ---------------- train API
  let trainS = stations[0].trainU * T.L, lastS = trainS, speed = 0, wheelAngle = 0;
  const _f = V3(), _r = V3(), _tf = V3(), _tr = V3();
  function placeTrain(s) {
    for (const car of train.cars) {
      const sc = s - car.off; sampleS(sc + car.half, _f, _tf); sampleS(sc - car.half, _r, _tr);
      car.obj.position.set((_f.x + _r.x) / 2, 0, (_f.z + _r.z) / 2);
      car.obj.rotation.set(0, Math.atan2(-(_f.z - _r.z), _f.x - _r.x), 0);
    }
  }
  function setTrainU(u) {
    const s = clamp(u, 0, 1) * T.L, ds = s - trainS; trainS = s;
    wheelAngle -= ds;
    for (const w of train.wheels) w.rotation.z = wheelAngle / w.userData.r;
    const th = wheelAngle / .5; for (const r of train.rods) r.position.set(-.48 + Math.cos(th) * .16, .8 + Math.sin(th) * .16, r.userData.side * .74);
    placeTrain(s);
  }
  setTrainU(stations[0].trainU);
  // a pleasant chase camera for travel: ahead-right of the loco looking back at the train (3/4 front view)
  function travelCamera(u, lead = 0) {
    const s = clamp(u, 0, 1) * T.L, a = sampleS(s + 1.5 + lead), P = a.position.clone(), Tn = a.tangent.clone(), Sd = V3(-Tn.z, 0, Tn.x);
    return { position: P.clone().addScaledVector(Tn, 7.5).addScaledVector(Sd, 6.2).add(V3(0, 3.8, 0)), target: P.clone().addScaledVector(Tn, -2.5).addScaledVector(Sd, .4).add(V3(0, 1.6, 0)) };
  }
  const doorPos = () => { const p = train.carriage.localToWorld(V3(1.68, 0, -1.55)); p.y = PH; return p; };

  // ---------------- station state + signs + events
  function setStationState(i, state) {
    const c = ctxs[i]; if (!c) return; const prev = c.state; c.state = state; c.st.state = state;
    c.targetSat = stateSat[state] ?? 1;
    if ((state === 'locked' || state === 'ready') && prev === 'visited') c.def.reset?.(c);
    if (state === 'locked' && prev !== 'locked') c.def.reset?.(c);
  }
  function setSign(i, text) { const c = ctxs[i]; if (!c) return; c.board.userData.ct.setDraw(drawDeparture(c.def.t, String(text ?? ''))); }
  const running = new Map();
  function playStationEvent(i) {
    const c = ctxs[i]; if (!c) return Promise.resolve();
    if (running.has(i)) return running.get(i);
    const p = Promise.race([Promise.resolve().then(() => c.def.event(c)).catch(e => console.error('[world] event', c.def.id, e)), new Promise(r => setTimeout(r, 7000))])
      .finally(() => running.delete(i));
    running.set(i, p); return p;
  }

  // ---------------- reactions (easter eggs)
  const reactMap = { sheep: 'farhagen', lamb: 'farhagen', cow: 'patrik', hen: 'patrik', horse: 'skaftesfall', hester: 'hester', brain: 'neuro', phone: 'maria', bulle: 'fika', disco: 'logen' };
  let locoTaps = [];
  function react(id, object) {
    try {
      if (id === 'tractor') { if (object && isChild(object, cameo)) tractorHonk({ bubble: (t, p, o) => bubble(t, p, o) }, cameo); else { const c = ctxs.find(c => c.def.id === 'patrik'); c.def.react(c, 'tractor', object); } return; }
      if (id === 'loco' || id === 'loco-heart') {
        const chim = train.loco.localToWorld(V3(1.55, 2.9, 0)); const now = performance.now();
        locoTaps = locoTaps.filter(t => now - t < 4000); locoTaps.push(now);
        fx.steam(chim, 3, 1.2); squash(train.loco);
        if (id === 'loco-heart' || locoTaps.length >= 5) { locoTaps = []; fx.steamHeart(chim); bubble('TUUUT!', chim.clone().add(V3(0, 2.6, 0)), { h: .6, dur: 1.8 }); }
        return;
      }
      if (id === 'moon') { const p = moon.position.clone(); fx.hearts(camera.position.clone().lerp(p, .04), 8); anim(.8, q => moon.scale.setScalar(1 + Math.sin(q * Math.PI) * .3)); return; }
      const sid = reactMap[id]; if (!sid) return;
      const c = ctxs.find(c => c.def.id === sid); c?.def.react?.(c, id, object);
      if (id === 'horse') fx.sneeze(c.L(c.horseX ?? -.4, 1.6, -7.2));
    } catch (e) { console.error('[world] react', id, e); }
  }
  function isChild(o, root) { while (o) { if (o === root) return true; o = o.parent; } return false; }
  function squash(o) { anim(.35, p => o.scale.set(1 + Math.sin(p * Math.PI) * .06, 1 - Math.sin(p * Math.PI) * .08, 1 + Math.sin(p * Math.PI) * .06)).then(() => o.scale.set(1, 1, 1)); }

  // ---------------- time of day
  let todF = 0, tod = todAt(0), glowAmt = 0;
  const glowDay = new THREE.Color('#b9ccd4'), glowNight = new THREE.Color('#ffc865');
  function setTimeOfDay(f) {
    todF = clamp(+f || 0, 0, 1); tod = todAt(todF); glowAmt = tod.glow;
    sky.material.uniforms.uTop.value.copy(tod.top); sky.material.uniforms.uHor.value.copy(tod.hor); sky.material.uniforms.uBot.value.copy(tod.bot);
    sky.material.uniforms.uSunCol.value.copy(tod.sun); sky.material.uniforms.uSunAmt.value = tod.sunAmt;
    scene.fog.color.copy(tod.fog);
    hemi.color.copy(tod.hemiS); hemi.groundColor.copy(tod.hemiG); hemi.intensity = tod.hemiI;
    sun.color.copy(tod.sun); sun.intensity = tod.sunI;
    glowMat.color.copy(glowDay).lerp(glowNight, glowAmt);
    for (const m of signMats) m.emissiveIntensity = Math.max(m.userData.baseEm ?? (m.userData.baseEm = m.emissiveIntensity), m.userData.baseEm + glowAmt * .45);
    stars.material.opacity = tod.stars; moon.material.opacity = smooth(todF, .82, .97);
    ctxs.forEach(c => { c.glowAmt = glowAmt; });
  }
  setTimeOfDay(0);

  // ---------------- per-frame
  const camDir = V3(), focus = V3(), lightDir = V3(), sunYaw = { v: null };
  let steamAcc = 0, chug = 0;
  function update(dt = 0, elapsed = 0) {
    dt = Math.min(dt, .1);
    runTasks(dt);
    const t = elapsed;
    // train speed, steam, bob
    const v = dt > 0 ? (trainS - lastS) / dt : 0; lastS = trainS; speed = lerp(speed, Math.abs(v), Math.min(1, dt * 4));
    chug += dt * (4 + speed * 2.2);
    train.loco.children[0].position.y = Math.abs(Math.sin(chug * 2)) * .025 * Math.min(1, speed / 2 + .2);
    steamAcc += dt * (.7 + speed * .9);
    while (steamAcc > 1) { steamAcc -= 1; fx.steam(train.loco.localToWorld(V3(1.55, 2.8, 0)), 1, .8 + Math.min(1, speed / 6) * .6); }
    // stations
    const cp = camera.position;
    ctxs.forEach((c, i) => {
      const mu = c.mat.userData.uSat; if (c.targetSat !== undefined) mu.value = lerp(mu.value, c.targetSat, Math.min(1, dt * 3));
      const d2 = c.root.position.distanceToSquared(cp); c.root.visible = d2 < 135 * 135; const near = d2 < 95 * 95; if (!near) return;
      const st = c.state;
      c.armT = lerp(c.armT, st === 'locked' ? 0 : 1, Math.min(1, dt * 3)); c.arm.rotation.z = -c.armT * Math.PI / 2; // open = raised upright (never lies across the platform)
      const ready = st === 'ready'; c.beacon.visible = ready; c.readyBalloons.visible = ready;
      if (ready) {
        c.beacon.rotation.y += dt * 2; c.beacon.position.y = c.beaconY + Math.sin(t * 2.5) * .08; c.beacon.scale.setScalar(1 + Math.sin(t * 5) * .08);
        c.readyBalloons.children.forEach(b => { b.position.y = b.userData.y + Math.sin(t * 1.8 + b.userData.ph) * .08; b.rotation.z = Math.sin(t * 1.3 + b.userData.ph) * .1; });
        if (R() < dt * 1.5) fx.sparkle(c.signGroup.localToWorld(V3(rr(-1, 1), c.beaconY, 0)), 2, .4);
      }
      c.def.idle?.(c, t, dt, st);
    });
    // cameo tractor loop
    { const a = t * .12, x = Math.cos(a) * 7, z = Math.sin(a) * 3.5, p = cameoStop.root.localToWorld(V3(7.5 + x, 0, -13.5 + z)); const p2 = cameoStop.root.localToWorld(V3(7.5 + Math.cos(a + .01) * 7, 0, -13.5 + Math.sin(a + .01) * 3.5));
      cameo.position.copy(p); cameo.rotation.y = Math.atan2(p2.x - p.x, p2.z - p.z); cameo.userData.wheels.forEach(w => { w.rotation.x += dt * 1.8; }); cameo.children[0].position.y = Math.abs(Math.sin(t * 9)) * .02; }
    void cameoC;
    // clouds + birds
    clouds.rotation.y = t * .004;
    { const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = V3(), p = V3();
      birdsData.forEach((b, i) => { const a = t * .05 * b.sp + i * .07, R0 = 70 + b.r; p.set(Math.cos(a) * R0, 32 + b.y + Math.sin(t + i) * .5, Math.sin(a) * R0); e.set(0, -a, 0); q.setFromEuler(e); s.set(1.2, Math.sin(t * 9 + b.ph) * 1.2, 1.2); m4.compose(p, q, s); flock.setMatrixAt(i, m4); });
      flock.instanceMatrix.needsUpdate = true; flock.visible = todF < .95; }
    // light follows the view so every stop is pleasantly front-lit; shadow box follows the focus point
    camera.getWorldDirection(camDir);
    const tt = camDir.y < -.05 ? Math.min(40, cp.y / -camDir.y) : 20; focus.copy(cp).addScaledVector(camDir, tt); focus.y = 0;
    const yawTarget = Math.atan2(camDir.x, camDir.z) + Math.PI + lerp(-.75, .75, todF);
    if (sunYaw.v === null) sunYaw.v = yawTarget; let dy = yawTarget - sunYaw.v; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); sunYaw.v += dy * Math.min(1, dt * 1.5 + (dt === 0 ? 1 : 0));
    const el = THREE.MathUtils.degToRad(lerp(38, 22, smooth(todF, .55, .92)) + (todF > .93 ? (todF - .93) * 200 : 0));
    lightDir.set(Math.sin(sunYaw.v) * Math.cos(el), Math.sin(el), Math.cos(sunYaw.v) * Math.cos(el));
    const texel = 40 / 2048; focus.x = Math.round(focus.x / texel) * texel; focus.z = Math.round(focus.z / texel) * texel;
    sun.position.copy(focus).addScaledVector(lightDir, 70); sun.target.position.copy(focus); sun.target.updateMatrixWorld();
    // sky sun glow: low over the horizon, on the side of the light but a bit off-view
    sky.material.uniforms.uSun.value.set(-lightDir.x, Math.max(.02, Math.sin(THREE.MathUtils.degToRad(tod.el))), -lightDir.z).normalize();
    sky.position.copy(cp); stars.position.copy(cp);
    // moon: upper right of the current view (dusk only)
    if (moon.material.opacity > 0) { const yaw = Math.atan2(camDir.x, camDir.z) - .2; moon.position.set(cp.x + Math.sin(yaw) * 300 * .9, cp.y + 300 * .42, cp.z + Math.cos(yaw) * 300 * .9); moon.lookAt(cp); stars.rotation.y = t * .002; }
    moon.visible = moon.material.opacity > .01;
    fxSys.update(dt, camera);
  }

  return {
    stations, train: { group: train.group, seat: train.seat, loco: train.loco, carriage: train.carriage, doorPos },
    trackPoint, travelCamera, setTrainU, setStationState, setSign, playStationEvent, setTimeOfDay, fx, update, pickables, react,
    get timeOfDay() { return todF; }, bubble,
    debug: { T, anchors, ctxs, lake },
  };
}
