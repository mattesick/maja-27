// maja.js – procedural chibi characters for "Maja-expressen" (Agent A)
//
// API (see CONTRACT.md):
//   createMaja(overrides?) / createPerson(opts | presetName | {preset, ...overrides}) → Character
//   presets: maja, mattias, conductor, maria, patrik, syster (=sister), sebastian, friend1..3, nurse, fan
//   Character: group (feet at y=0, faces +Z), height (m), sitHeight (m, seat surface for play('sit')),
//     update(dt), play(name, {loop, speed, side, style, seated}) → Promise, setProp(hand, name),
//     setHat(name), setOutfit({top, bottom, coat}), setExpression(name), lookAt(v3|null),
//     walkTo(worldPos, speed=1.1 m/s, {anim:'walk'|'run'|'tiptoe'}) → Promise,
//     setHair('long'|'ponytail'|'bun'|'short'), getHeadTop(v3) (bubble anchor), getHandPosition(hand, v3),
//     hitProxy (invisible picking box, raycast it or the group), shadow (blob shadow mesh – hide if you use real shadows)
//   Extra animations: selfie, scroll, film (= phone styles), pointSelf, hammer, chop, gaming({seated}), slide
//   Extra expressions: calm (eyes closed), pout, sneaky, confused, determined, neutral, talk
//   Extra hat: conductorCap.  Props pop in with a 0→1.15→1 scale bounce.
// Everything is built from three.js primitives. One shared vertex-coloured material per cloth pattern,
// static parts merged per bone (≈14–17 draw calls per character), canvas-drawn expressive faces,
// spring-driven hair / ponytail, keyframe + IK poses with squash & stretch.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const V3 = THREE.Vector3;
const PI = Math.PI, TAU = PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const bump = (t, a, b) => Math.sin(seg(t, a, b) * PI);
const env = (t, a, b, c, d) => sstep(seg(t, a, b)) * (1 - sstep(seg(t, c, d)));
const wrapPi = a => { a = (a + PI) % TAU; if (a < 0) a += TAU; return a - PI; };
const EASE = {
  s: sstep,
  lin: t => t,
  out: t => 1 - (1 - t) ** 3,
  in: t => t * t * t,
  back: t => { const c = 1.9; const u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; },
};

/* ------------------------------------------------------------------ paint / geometry helpers */

const REG = [], REGMAP = new Map();
function kid(spec) {
  let id = REGMAP.get(spec);
  if (id !== undefined) return id;
  const [base, mul] = spec.split('*');
  REG.push({ base, mul: mul ? parseFloat(mul) : 1, fixed: base[0] === '#' ? new THREE.Color(base) : null });
  id = REG.length - 1; REGMAP.set(spec, id);
  return id;
}
const PAT_U = 0.875, WHITE_UV = [0.95, 0.5];
// paint(geo, 'top', {pat:true}) | paint(geo, '#ffcc00') | paint(geo, 'hair', {mix:(x,y,z)=>m})
function paint(geo, spec, o = {}) {
  const n = geo.attributes.position.count;
  const k = new Float32Array(n).fill(kid(spec));
  const m = new Float32Array(n);
  if (o.mix) { const p = geo.attributes.position; for (let i = 0; i < n; i++) m[i] = o.mix(p.getX(i), p.getY(i), p.getZ(i)); }
  else if (o.m) m.fill(o.m);
  geo.setAttribute('ckey', new THREE.BufferAttribute(k, 1));
  geo.setAttribute('cmix', new THREE.BufferAttribute(m, 1));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  const uv = geo.attributes.uv;
  if (o.pat) { const rv = o.pat === true ? 1 : o.pat; for (let i = 0; i < n; i++) uv.setXY(i, uv.getX(i) * PAT_U, uv.getY(i) * rv); }
  else for (let i = 0; i < n; i++) uv.setXY(i, WHITE_UV[0], WHITE_UV[1]);
  return geo;
}
const _m4 = new THREE.Matrix4(), _q0 = new THREE.Quaternion(), _e0 = new THREE.Euler();
function xf(geo, p = [0, 0, 0], r = [0, 0, 0], s = 1) {
  _e0.set(r[0], r[1], r[2], r[3] || 'XYZ'); _q0.setFromEuler(_e0);
  const sv = typeof s === 'number' ? new V3(s, s, s) : new V3(s[0], s[1], s[2]);
  _m4.compose(new V3(p[0], p[1], p[2]), _q0, sv);
  geo.applyMatrix4(_m4);
  return geo;
}
function merge(list) {
  list = list.filter(Boolean);
  if (list.some(g => !g.index)) list = list.map(g => (g.index ? g.toNonIndexed() : g));
  for (const g of list) for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'ckey', 'cmix', 'color'].includes(a)) g.deleteAttribute(a);
  const g = mergeGeometries(list, false);
  if (!g) throw new Error('maja.js: merge failed');
  g.computeBoundingSphere();
  return g;
}
const G = {
  sph: (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h),
  cyl: (rt, rb, h, s = 14, hs = 1, open = false, ts = 0, tl = TAU) => new THREE.CylinderGeometry(rt, rb, h, s, hs, open, ts, tl),
  cap: (r, l, cs = 4, rs = 12) => new THREE.CapsuleGeometry(r, l, cs, rs),
  box: (w, h, d, r = 0.01, s = 2) => new RoundedBoxGeometry(w, h, d, s, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)),
  tor: (R, t, rs = 8, ts = 20, arc = TAU) => new THREE.TorusGeometry(R, t, rs, ts, arc),
  cone: (r, h, s = 14, open = false) => new THREE.ConeGeometry(r, h, s, 1, open),
  lathe: (pts, s = 20) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), s),
  ico: (r, d = 1) => new THREE.IcosahedronGeometry(r, d),
};

// a tapered, flattened hair lock swept along a curve
const defaultProf = t => (0.55 + 0.45 * Math.sin(Math.min(1, t * 1.7) * PI * 0.5)) * (1 - Math.pow(t, 2.6) * 0.86);
function lockGeo(pts, o = {}) {
  const { r = 0.22, flat = 0.55, tub = 16, rad = 7, prof = defaultProf } = o;
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new V3(p[0], p[1], p[2])), false, 'centripetal');
  const g = new THREE.TubeGeometry(curve, tub, 1, rad, false);
  const pos = g.attributes.position;
  const c = new V3(), v = new V3(), d = new V3(), tg = new V3(), sd = new V3();
  for (let i = 0; i <= tub; i++) {
    const t = i / tub;
    curve.getPointAt(t, c); curve.getTangentAt(t, tg);
    const rr = r * prof(t);
    if (o.dir) d.set(o.dir[0], o.dir[1], o.dir[2]);
    else d.set(c.x, c.y > 0 ? c.y : c.y * 0.15, c.z);
    d.addScaledVector(tg, -d.dot(tg));
    if (d.lengthSq() < 1e-6) d.set(0, 0, -1);
    d.normalize();
    if (o.wave) { sd.crossVectors(tg, d).normalize(); c.addScaledVector(sd, o.wave * Math.sin(t * (o.waveK || 3) * PI + (o.wavePh || 0)) * Math.min(1, t * 3)); }
    const c0 = curve.getPointAt(t);
    for (let j = 0; j <= rad; j++) {
      const idx = i * (rad + 1) + j;
      v.fromBufferAttribute(pos, idx).sub(c0);
      const along = v.dot(d);
      v.addScaledVector(d, -along).multiplyScalar(rr).addScaledVector(d, along * rr * flat);
      pos.setXYZ(idx, c.x + v.x, c.y + v.y, c.z + v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------ materials & textures */

function rimify(m) {
  m.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      { float rimF = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
        gl_FragColor.rgb += vec3(1.0, 0.93, 0.86) * pow(rimF, 3.0) * 0.2; }`);
  };
  m.customProgramCacheKey = () => 'majaRim';
  return m;
}
function patternTexture(kind) {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const x = cv.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, S, S);
  const PW = Math.round(S * PAT_U);
  if (kind === 'knit') {
    x.fillStyle = '#f2f2f2'; x.fillRect(0, 0, PW, S);
    const cols = 7, cw = PW / cols, rows = 10, rh = S / rows;
    for (let i = 0; i < cols; i++) {
      const x0 = i * cw;
      x.fillStyle = 'rgba(0,0,0,0.07)'; x.fillRect(x0, 0, cw * 0.14, S); // purl groove between cables
      for (let j = 0; j < rows; j++) {
        const y0 = j * rh, cx = x0 + cw * 0.57;
        for (const sd of [-1, 1]) { // a "V" stitch
          x.save(); x.translate(cx + sd * cw * 0.17, y0 + rh * 0.5); x.rotate(sd * 0.55);
          const g = x.createLinearGradient(0, -rh * 0.4, 0, rh * 0.4);
          g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#f0f0f0'); g.addColorStop(1, '#d2d2d2');
          x.fillStyle = g; x.beginPath(); x.ellipse(0, 0, cw * 0.16, rh * 0.46, 0, 0, TAU); x.fill(); x.restore();
        }
      }
    }
  } else if (kind === 'check') {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, PW, S);
    const n = 7, w = PW / n, h = S / 8;
    x.fillStyle = 'rgba(20,10,10,0.38)';
    for (let i = 0; i < n; i++) x.fillRect(i * w + w * 0.5, 0, w * 0.32, S);
    for (let j = 0; j < 8; j++) x.fillRect(0, j * h + h * 0.5, PW, h * 0.32);
    x.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < n; i++) x.fillRect(i * w + w * 0.15, 0, w * 0.05, S);
    for (let j = 0; j < 8; j++) x.fillRect(0, j * h + h * 0.15, PW, h * 0.05);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
const MATS = {};
function bodyMat(pattern = 'none') {
  if (MATS[pattern]) return MATS[pattern];
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
  if (pattern !== 'none') m.map = patternTexture(pattern);
  return (MATS[pattern] = rimify(m));
}
let GLASS_MAT, PUFF_MAT, SHADOW_TEX;
function glassMat() { return GLASS_MAT || (GLASS_MAT = new THREE.MeshStandardMaterial({ color: '#eaf6ff', transparent: true, opacity: 0.38, roughness: 0.08, metalness: 0.1, depthWrite: false })); }
function puffMat() { return PUFF_MAT || (PUFF_MAT = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, roughness: 1, emissive: '#ffffff', emissiveIntensity: 0.25 })); }
function shadowTex() {
  if (SHADOW_TEX) return SHADOW_TEX;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const x = cv.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(40,20,30,0.55)'); g.addColorStop(0.55, 'rgba(40,20,30,0.25)'); g.addColorStop(1, 'rgba(40,20,30,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return (SHADOW_TEX = new THREE.CanvasTexture(cv));
}

/* ------------------------------------------------------------------ pose layout */

const KEYS = ['x', 'y', 'z', 'ry', 'rx', 'rz', 'sq', 'hpY', 'spX', 'spY', 'spZ', 'hdX', 'hdY', 'hdZ',
  'lsX', 'lsY', 'lsZ', 'leX', 'rsX', 'rsY', 'rsZ', 'reX', 'llX', 'llZ', 'lkX', 'rlX', 'rlZ', 'rkX',
  'lpX', 'lpY', 'lpZ', 'rpX', 'rpY', 'rpZ', 'bic', 'fing'];
const I = {}; KEYS.forEach((k, i) => (I[k] = i));
const NK = KEYS.length;
const NEU = new Float32Array(NK);
NEU[I.sq] = 1;
NEU[I.lsX] = -0.05; NEU[I.lsZ] = 0.14; NEU[I.leX] = -0.18;
NEU[I.rsX] = -0.05; NEU[I.rsZ] = -0.14; NEU[I.reX] = -0.18;

/* ------------------------------------------------------------------ dims, anchors & IK */

function makeDims(cfg) {
  const torsoW = cfg.torsoW ?? 1, headR = cfg.headR ?? 0.19, hipY = cfg.hipY ?? 0.33, torsoLen = 0.27;
  const d = {
    torsoW, headR, hipY, torsoLen,
    thigh: hipY * 0.46, armU: 0.12, armF: 0.115,
    shX: 0.098 * torsoW, shY: 0.218, neckY: torsoLen + 0.02,
  };
  d.shin = hipY - d.thigh - 0.03;
  d.headC = d.neckY + headR * 0.92;
  d.key = [torsoW, headR, hipY].join('|');
  return d;
}
// anchors in spine-local space; x is "outward" (towards the hand's own side), mirrored per side
function anchors(d) {
  const hc = d.headC, R = d.headR, W = d.torsoW;
  return {
    mouth: [0, hc - R * 0.5, R * 0.86 + 0.035],
    chin: [0, hc - R * 0.85, R * 0.55 + 0.04],
    nose: [0, hc - R * 0.2, R + 0.04],
    forehead: [0, hc + R * 0.22, R * 0.97 + 0.035],
    eye: [R * 0.42, hc - R * 0.1, R * 0.92 + 0.03],
    ear: [R * 1.1, hc - 0.025, 0.03],
    headSide: [R * 1.02, hc + R * 0.15, -R * 0.15],
    chest: [0.0, d.torsoLen * 0.72, 0.105 * W],
    belly: [0.0, d.torsoLen * 0.3, 0.1 * W],
    hip: [0.11 * W, 0.03, 0.02],
    knee: [0.06, 0.07, 0.17],
  };
}
const _ik = { S: new V3(), d: new V3(), p: new V3(), pp: new V3(), u: new V3(), E: new V3(), f: new V3(), b: new V3(), X: new V3(), Y: new V3(), H: new V3(), m: new THREE.Matrix4(), e: new THREE.Euler() };
function ikArm(d, side, T, pole) {
  const k = _ik;
  k.S.set(side * d.shX, d.shY, 0);
  k.d.set(T[0], T[1], T[2]).sub(k.S);
  const L1 = d.armU, L2 = d.armF;
  const dist = clamp(k.d.length(), Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
  k.d.normalize();
  const A = Math.acos(clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1));
  const bend = PI - Math.acos(clamp((L1 * L1 + L2 * L2 - dist * dist) / (2 * L1 * L2), -1, 1));
  k.p.set(pole ? pole[0] : side, pole ? pole[1] : -0.6, pole ? pole[2] : -0.45).normalize();
  k.pp.copy(k.p).addScaledVector(k.d, -k.p.dot(k.d));
  if (k.pp.lengthSq() < 1e-6) k.pp.set(0, -1, 0).addScaledVector(k.d, -k.d.y);
  k.pp.normalize();
  k.u.copy(k.d).multiplyScalar(Math.cos(A)).addScaledVector(k.pp, Math.sin(A));
  k.E.copy(k.S).addScaledVector(k.u, L1);
  k.H.copy(k.S).addScaledVector(k.d, dist);
  k.f.copy(k.H).sub(k.E).normalize();
  k.b.copy(k.f).addScaledVector(k.u, -k.f.dot(k.u));
  if (k.b.lengthSq() < 1e-5) { k.b.set(0, 0, 1).addScaledVector(k.u, -k.u.z); }
  k.b.normalize();
  k.Y.copy(k.u).negate();
  k.X.crossVectors(k.Y, k.b).normalize();
  k.m.makeBasis(k.X, k.Y, k.b);
  k.e.setFromRotationMatrix(k.m, 'ZXY');
  return [k.e.x, k.e.y, k.e.z, -bend];
}

/* ------------------------------------------------------------------ keyframe compiler */

function compileKey(o, d) {
  const p = new Float32Array(NK).fill(NaN);
  const A = anchors(d);
  const setArm = (pre, s, v) => { p[I[pre + 'sX']] = -v[0]; p[I[pre + 'sZ']] = s * v[1]; p[I[pre + 'sY']] = s * (v[2] || 0); p[I[pre + 'eX']] = -(v[3] || 0); };
  const setHand = (pre, s, v) => {
    let pos;
    if (typeof v[0] === 'string') { const a = A[v[0]]; pos = [a[0] + (v[1] || 0), a[1] + (v[2] || 0), a[2] + (v[3] || 0)]; }
    else pos = [v[0], v[1], v[2]];
    const poleSpec = typeof v[0] === 'string' ? v[4] : v[3];
    const pole = poleSpec ? [s * poleSpec[0], poleSpec[1], poleSpec[2]] : null;
    const r = ikArm(d, s, [s * pos[0], pos[1], pos[2]], pole);
    p[I[pre + 'sX']] = r[0]; p[I[pre + 'sY']] = r[1]; p[I[pre + 'sZ']] = r[2]; p[I[pre + 'eX']] = r[3];
  };
  const setLeg = (pre, s, v) => { p[I[pre + 'lX']] = -v[0]; p[I[pre + 'lZ']] = s * (v[1] || 0); p[I[pre + 'kX']] = v[2] || 0; };
  for (const k in o) {
    const v = o[k];
    switch (k) {
      case 't': case 'e': break;
      case 'L': setArm('l', 1, v); break;
      case 'R': setArm('r', -1, v); break;
      case 'ARMS': setArm('l', 1, v); setArm('r', -1, v); break;
      case 'LH': setHand('l', 1, v); break;
      case 'RH': setHand('r', -1, v); break;
      case 'HANDS': setHand('l', 1, v); setHand('r', -1, v); break;
      case 'LL': setLeg('l', 1, v); break;
      case 'RL': setLeg('r', -1, v); break;
      case 'LEGS': setLeg('l', 1, v); setLeg('r', -1, v); break;
      case 'sp': p[I.spX] = v[0]; p[I.spY] = v[1] || 0; p[I.spZ] = v[2] || 0; break;
      case 'hd': p[I.hdX] = v[0]; p[I.hdY] = v[1] || 0; p[I.hdZ] = v[2] || 0; break;
      case 'rp': p[I.rpX] = v[0]; p[I.rpY] = v[1] || 0; p[I.rpZ] = v[2] || 0; break;
      case 'lp': p[I.lpX] = v[0]; p[I.lpY] = v[1] || 0; p[I.lpZ] = v[2] || 0; break;
      default: if (k in I) p[I[k]] = v;
    }
  }
  return p;
}
function evalKeys(keys, t, out) {
  const n = keys.length;
  let a = keys[0], b = keys[0], u = 0;
  if (t >= keys[n - 1].t) a = b = keys[n - 1];
  else if (t > keys[0].t) {
    for (let i = 0; i < n - 1; i++) if (t < keys[i + 1].t) { a = keys[i]; b = keys[i + 1]; break; }
    u = (EASE[b.e] || sstep)((t - a.t) / (b.t - a.t));
  }
  for (let k = 0; k < NK; k++) {
    const va = Number.isNaN(a.p[k]) ? NEU[k] : a.p[k];
    const vb = Number.isNaN(b.p[k]) ? NEU[k] : b.p[k];
    out[k] = va + (vb - va) * u;
  }
}
function mixInto(out, A, B, u) { // blend two compiled keys into out
  for (let k = 0; k < NK; k++) {
    const va = Number.isNaN(A[k]) ? NEU[k] : A[k], vb = Number.isNaN(B[k]) ? NEU[k] : B[k];
    out[k] = va + (vb - va) * u;
  }
}

/* ------------------------------------------------------------------ animation library */
// def: { dur, loop?, hold?, idle, blendIn, blendOut, keys:[{t,..}], pose(p,t,c,a), face:[[t,name]], ev:[[t,fn]], prop:['right','coffee'] }

function faceAt(list, t) { let f = null; if (list) for (const [ft, n] of list) { if (t >= ft) f = n; else break; } return f; }

const ANIM_SRC = {
  idle: { loop: true, dur: 4, idle: 1 },

  walk: {
    loop: true, dur: 2.4, idle: 0.15, natural: 1.0,
    pose(p, t) {
      const ph = t * 2.0 * TAU, s = Math.sin(ph), c = Math.cos(ph);
      p[I.llX] = -0.4 * s; p[I.rlX] = 0.4 * s;
      p[I.lkX] = 0.1 + 0.75 * Math.max(0, c) * Math.max(0, s + 0.6);
      p[I.rkX] = 0.1 + 0.75 * Math.max(0, -c) * Math.max(0, -s + 0.6);
      p[I.lsX] = 0.42 * s - 0.05; p[I.rsX] = -0.42 * s - 0.05;
      p[I.leX] = -0.35 - 0.25 * Math.max(0, -s); p[I.reX] = -0.35 - 0.25 * Math.max(0, s);
      p[I.lsZ] = 0.16; p[I.rsZ] = -0.16;
      p[I.y] = 0.024 * Math.abs(c);
      p[I.sq] = 1 + 0.04 * (Math.abs(c) - 0.5);
      p[I.spX] = 0.07; p[I.spY] = 0.1 * s; p[I.hpY] = -0.12 * s; p[I.rz] = 0.04 * s;
      p[I.hdZ] = -0.05 * s; p[I.hdX] = -0.05 + 0.03 * Math.abs(c);
    },
  },
  run: {
    loop: true, dur: 1.6, idle: 0.1, natural: 2.2,
    pose(p, t) {
      const ph = t * 2.8 * TAU, s = Math.sin(ph), c = Math.cos(ph);
      p[I.llX] = -0.75 * s; p[I.rlX] = 0.75 * s;
      p[I.lkX] = 0.3 + 1.3 * Math.max(0, c); p[I.rkX] = 0.3 + 1.3 * Math.max(0, -c);
      p[I.lsX] = 0.8 * s - 0.2; p[I.rsX] = -0.8 * s - 0.2;
      p[I.leX] = -1.5; p[I.reX] = -1.5; p[I.lsZ] = 0.2; p[I.rsZ] = -0.2;
      p[I.y] = 0.055 * Math.abs(c);
      p[I.sq] = 1 + 0.07 * (Math.abs(c) - 0.5);
      p[I.spX] = 0.22; p[I.spY] = 0.18 * s; p[I.hpY] = -0.2 * s; p[I.rz] = 0.05 * s; p[I.hdX] = -0.12;
    },
  },

  wave: {
    dur: 1.9, idle: 0.3, blendIn: 0.18,
    keys: [
      { t: 0 },
      { t: 0.25, e: 'back', R: [0.15, 2.6, 0, 0.3], LH: ['hip', 0.0, 0.03, 0.0, [1, 0, -1]], sp: [0, -0.1, 0.1], hd: [0, -0.1, 0.12], y: 0.015, sq: 1.05 },
      { t: 1.55, R: [0.15, 2.6, 0, 0.3], LH: ['hip', 0.0, 0.03, 0.0, [1, 0, -1]], sp: [0, -0.1, 0.1], hd: [0, -0.1, 0.12], y: 0.015, sq: 1.03 },
      { t: 1.9 },
    ],
    pose(p, t) { const w = env(t, 0.15, 0.3, 1.45, 1.6); p[I.rsZ] += 0.32 * Math.sin(t * 11) * w; p[I.reX] += -0.25 * (0.5 + 0.5 * Math.sin(t * 11 + 0.9)) * w; p[I.y] += 0.012 * Math.abs(Math.sin(t * 5.5)) * w; p[I.hdZ] += 0.05 * Math.sin(t * 5.5) * w; },
    face: [[0, 'happy'], [0.3, 'laugh'], [1.3, 'happy']],
  },

  jump: {
    dur: 1.3, idle: 0, blendIn: 0.12,
    keys: [
      { t: 0 },
      { t: 0.28, y: -0.05, sq: 0.84, sp: [0.25], hd: [-0.18], ARMS: [-0.7, 0.35, 0, 0.3], LEGS: [0.6, 0.05, 1.1] },
      { t: 0.4, e: 'out', y: 0.07, sq: 1.2, sp: [-0.1], hd: [-0.1], ARMS: [0.6, 2.5, 0, 0.2], LEGS: [-0.1, 0.03, 0.15] },
      { t: 0.62, e: 'out', y: 0.3, sq: 1.04, sp: [-0.05], ARMS: [0.4, 2.75, 0, 0.35], LL: [0.6, 0.12, 1.3], RL: [0.25, 0.12, 0.8] },
      { t: 0.86, e: 'in', y: 0.03, sq: 1.08, ARMS: [0.3, 2.2, 0, 0.3], LEGS: [0.15, 0.05, 0.25] },
      { t: 0.95, e: 'out', y: -0.045, sq: 0.8, sp: [0.2], ARMS: [0.3, 1.0, 0, 0.6], LEGS: [0.55, 0.06, 1.05] },
      { t: 1.12, y: 0.005, sq: 1.04 },
      { t: 1.3 },
    ],
    face: [[0, 'happy'], [0.3, 'laugh'], [1.15, 'happy']],
  },

  cheer: {
    dur: 1.8, idle: 0.1, blendIn: 0.12,
    keys: [
      { t: 0 },
      { t: 0.2, y: -0.04, sq: 0.86, sp: [0.18], ARMS: [0.4, 0.35, 0, 1.5], LEGS: [0.45, 0.05, 0.85] },
      { t: 0.32, e: 'out', y: 0.05, sq: 1.2, ARMS: [0.3, 2.7, 0, 0.1], LEGS: [-0.05, 0.05, 0.1] },
      { t: 0.55, e: 'out', y: 0.22, sq: 1.05, ARMS: [0.3, 2.8, 0, 0.2], LL: [0.5, 0.18, 1.2], RL: [0.2, 0.18, 0.7] },
      { t: 0.78, e: 'in', y: -0.04, sq: 0.84, ARMS: [0.3, 2.6, 0, 0.3], LEGS: [0.45, 0.05, 0.85] },
      { t: 0.95, y: 0, sq: 1.04, ARMS: [0.3, 2.6, 0, 0.3] },
      { t: 1.5, ARMS: [0.3, 2.5, 0, 0.4] },
      { t: 1.8 },
    ],
    pose(p, t) { const w = env(t, 0.85, 1.0, 1.45, 1.6); p[I.lsZ] += 0.18 * Math.sin(t * 17) * w; p[I.rsZ] += 0.18 * Math.sin(t * 17) * w; p[I.hdZ] += 0.12 * Math.sin(t * 8.5) * w; p[I.y] += 0.025 * Math.abs(Math.sin(t * 8.5)) * w; },
    face: [[0, 'happy'], [0.15, 'laugh']],
  },

  dance: {
    loop: true, dur: 4, idle: 0, blendIn: 0.25,
    keys: {
      pointUp: { R: [0.3, 2.35, 0, 0.0], LH: ['hip', 0.02, 0.02, 0.0, [1, 0, -1]], fing: 1 },
      pointDown: { R: [0.55, -0.35, 0, 0.0], LH: ['hip', 0.02, 0.02, 0.0, [1, 0, -1]], fing: 1 },
      micR: { RH: ['mouth', 0.03, -0.02, 0.06], rp: [-0.5] },
      spinArms: { ARMS: [0.15, 1.35, 0, 0.15] },
    },
    pose(p, t, c, a, K) {
      const T = t % 4, b = T * 2; // beats
      const mic = c.props.right === 'mic';
      // section weights
      const wA = 1 - sstep(seg(T, 1.85, 2.05)) + sstep(seg(T, 3.9, 4.0));
      const wB = sstep(seg(T, 1.85, 2.05)) * (1 - sstep(seg(T, 2.9, 3.05)));
      const wC = sstep(seg(T, 2.9, 3.05)) * (1 - sstep(seg(T, 3.9, 4.0)));
      // A: bouncy side steps, arms pumping
      const sA = Math.sin(b * PI / 2), bounce = Math.abs(Math.sin(b * PI));
      const A = new Float32Array(NEU);
      A[I.x] = 0.035 * sA; A[I.y] = 0.03 * bounce; A[I.sq] = 1 + 0.06 * (bounce - 0.5);
      A[I.rz] = -0.1 * sA; A[I.spZ] = 0.08 * sA; A[I.hdZ] = 0.12 * Math.sin(b * PI); A[I.hdX] = -0.06 + 0.1 * bounce;
      A[I.llX] = -0.2 * Math.max(0, sA); A[I.lkX] = 0.5 * Math.max(0, sA) + 0.15; A[I.rlX] = -0.2 * Math.max(0, -sA); A[I.rkX] = 0.5 * Math.max(0, -sA) + 0.15;
      A[I.lsX] = -0.5 - 0.45 * Math.sin(b * PI); A[I.leX] = -1.6; A[I.lsZ] = 0.35;
      A[I.rsX] = -0.5 + 0.45 * Math.sin(b * PI); A[I.reX] = -1.6; A[I.rsZ] = -0.35;
      if (mic) { const M = K.micR; for (const k of ['rsX', 'rsY', 'rsZ', 'reX', 'rpX']) A[I[k]] = M[I[k]]; }
      // B: disco point up / down on the beat
      const B = new Float32Array(NEU);
      const up = (Math.floor(b) % 2) === 0;
      mixInto(B, K.pointDown, K.pointUp, sstep(up ? seg(b % 1, 0, 0.35) : 1 - seg(b % 1, 0, 0.35)));
      if (mic) { const M = K.micR; for (const k of ['rsX', 'rsY', 'rsZ', 'reX', 'rpX']) B[I[k]] = M[I[k]]; B[I.fing] = 0; }
      B[I.rz] = up ? 0.14 : -0.1; B[I.spZ] = up ? -0.12 : 0.1; B[I.hdZ] = up ? -0.15 : 0.1; B[I.hdY] = up ? -0.3 : 0.2;
      B[I.y] = 0.02 * Math.abs(Math.sin(b * PI)); B[I.rlX] = -0.15; B[I.rkX] = 0.35; B[I.lkX] = 0.1;
      // C: twirl with arms out
      const C = new Float32Array(NEU);
      mixInto(C, K.spinArms, K.spinArms, 0);
      if (mic) { const M = K.micR; for (const k of ['rsX', 'rsY', 'rsZ', 'reX', 'rpX']) C[I[k]] = M[I[k]]; }
      const u = EASE.s(seg(T, 3.0, 3.85));
      C[I.ry] = u * TAU; C[I.y] = 0.03 + 0.05 * bump(T, 3.0, 3.9); C[I.sq] = 1.05 - 0.12 * bump(T, 3.85, 4.0); C[I.hdZ] = 0.18; C[I.lkX] = 0.15; C[I.rkX] = 0.15;
      const tot = wA + wB + wC || 1;
      for (let k = 0; k < NK; k++) p[k] = (A[k] * wA + B[k] * wB + C[k] * wC) / tot;
      p[I.ry] = T < 3.0 ? 0 : C[I.ry]; // full turn; 2π ≡ 0 at the loop seam
    },
    faceFn(t) { const T = t % 4; return T < 2 ? 'laugh' : T < 3 ? 'wink' : 'happy'; },
  },

  sneeze: {
    dur: 3.0, idle: 0, blendIn: 0.25,
    keys: [
      { t: 0 },
      { t: 0.35, sp: [-0.12], hd: [-0.25, 0, 0.05], sq: 1.04, ARMS: [0.2, 0.35, 0, 0.6] },
      { t: 0.75, sp: [-0.28], hd: [-0.42, 0, -0.05], sq: 1.1, y: 0.02, ARMS: [0.35, 0.55, 0, 0.9] },
      { t: 1.12, sp: [-0.38], hd: [-0.55, 0, 0.06], sq: 1.16, y: 0.035, ARMS: [0.45, 0.7, 0, 1.1], LEGS: [-0.05, 0, 0.05] },
      { t: 1.22, e: 'out', sp: [0.52], hd: [0.12], sq: 0.72, y: -0.03, z: -0.03, ARMS: [-0.9, 0.85, 0, 0.2], LEGS: [0.35, 0.08, 0.7] },
      { t: 1.42, e: 'out', sp: [0.25], hd: [-0.05], sq: 1.12, y: 0.07, z: -0.1, ARMS: [-0.4, 1.2, 0, 0.3], LL: [0.4, 0.1, 0.9] },
      { t: 1.62, e: 'in', sp: [0.15], hd: [0, 0, 0.12], sq: 0.9, y: -0.01, z: -0.11 },
      { t: 1.9, sp: [0.05], hd: [-0.05, 0, -0.15], sq: 1, z: -0.11 },
      { t: 2.25, sp: [0.12], hd: [0.18, 0, 0.1], z: -0.08, RH: ['nose', 0.04, -0.03, 0.02, [1, -0.5, 0]] },
      { t: 2.6, sp: [0.05], hd: [0.05, 0, 0.05], z: -0.04, RH: ['nose', 0.05, -0.04, 0.02, [1, -0.5, 0]] },
      { t: 3.0 },
    ],
    pose(p, t, c) {
      const shiver = env(t, 0.75, 0.9, 1.1, 1.18);
      p[I.hdZ] += 0.06 * Math.sin(t * 50) * shiver; p[I.sq] += 0.02 * Math.sin(t * 43) * shiver;
      const daze = env(t, 1.6, 1.7, 1.95, 2.1);
      p[I.hdZ] += 0.12 * Math.sin(t * 14) * daze; p[I.rz] += 0.05 * Math.sin(t * 14) * daze;
      p[I.rsX] += 0.12 * Math.sin(t * 22) * env(t, 2.15, 2.25, 2.5, 2.6);
    },
    face: [[0, 'preSneeze'], [1.16, 'sneeze'], [1.6, 'surprised'], [2.05, 'sniff'], [2.65, 'happy']],
    ev: [[1.18, c => { c.puff(14, 1); }]],
  },

  sip: {
    dur: 2.6, idle: 0.3, prop: ['right', 'coffee'],
    keys: [
      { t: 0 },
      { t: 0.45, RH: ['chin', 0.025, -0.08, 0.06, [1, -0.8, 0.2]], hd: [0.05, 0, 0.06], rp: [-0.25] },
      { t: 0.75, RH: ['chin', 0.02, -0.055, 0.03, [1, -0.8, 0.2]], hd: [-0.3], sp: [-0.08], rp: [-1.0] },
      { t: 1.4, RH: ['chin', 0.02, -0.05, 0.03, [1, -0.8, 0.2]], hd: [-0.34], sp: [-0.1], rp: [-1.1] },
      { t: 1.75, RH: ['chest', 0.03, 0.0, 0.07, [1, -0.8, 0.2]], hd: [0.05, 0, 0.14], sq: 1.04, rp: [0] },
      { t: 2.25, RH: ['chest', 0.03, -0.01, 0.07, [1, -0.8, 0.2]], hd: [0.0, 0, 0.1], sq: 0.97 },
      { t: 2.6 },
    ],
    face: [[0, 'happy'], [0.6, 'calm'], [1.65, 'love'], [2.4, 'happy']],
  },

  phone: {
    loop: true, dur: 3.2, idle: 0.4, prop: ['right', 'phone'],
    keys: {
      call: { RH: ['ear', 0.01, -0.05, 0.1, [1, -0.6, 0.2]], hd: [0, 0.15, 0.2], rp: [0.2, -1.1, 0.15] },
      callL: { LH: ['hip', 0.0, 0.03, 0.0, [1, 0, -1]] },
      callL2: { LH: ['chest', 0.07, -0.02, 0.07] },
      selfie: { R: [1.75, 0.8, 0, 0.12], rp: [0.15, PI - 0.5, 0], hd: [-0.1, 0, 0.18], LH: ['hip', 0, 0.02, 0, [1, 0, -1]], sp: [0, 0.1, 0.06] },
      scroll: { RH: ['chest', 0.0, 0.0, 0.1, [1, -1, 0]], LH: ['chest', 0.02, -0.03, 0.09, [1, -1, 0]], hd: [0.38], rp: [1.1, PI, 0] },
      film: { RH: ['chin', 0.02, 0.05, 0.12, [1, -0.8, 0]], LH: ['chest', 0.05, 0.02, 0.06], rp: [-0.3, PI, 0], hd: [-0.15] },
    },
    pose(p, t, c, a, K) {
      const st = a.opts.style || 'call';
      if (st === 'call') {
        mixInto(p, K.call, K.call, 0);
        const g = sstep(0.5 + 0.5 * Math.sin(t * 1.9));
        const L = new Float32Array(NK); mixInto(L, K.callL, K.callL2, g);
        for (const k of ['lsX', 'lsY', 'lsZ', 'leX']) p[I[k]] = L[I[k]];
        p[I.leX] += -0.25 * Math.sin(t * 5.2) * g;
        p[I.hdX] += 0.08 * Math.sin(t * 3.1); p[I.rz] += 0.03 * Math.sin(t * 0.9);
        p[I.lkX] = 0.12 + 0.12 * Math.max(0, Math.sin(t * 0.9)); p[I.rlX] = -0.1;
      } else {
        mixInto(p, K[st] || K.scroll, K[st] || K.scroll, 0);
        if (st === 'scroll') { p[I.rpY] += 0; p[I.reX] += 0.05 * Math.sin(t * 7); p[I.hdZ] = 0.08 * Math.sin(t * 0.8); }
        if (st === 'selfie') { p[I.hdZ] += 0.05 * Math.sin(t * 1.3); p[I.y] = 0.01 * Math.sin(t * 3); }
        if (st === 'film') { p[I.hdY] = 0.1 * Math.sin(t * 0.6); }
      }
    },
    faceFn(t, c, a) {
      const st = a.opts.style || 'call';
      if (st === 'call') { const k = Math.floor(t * 7) % 7; return k === 1 || k === 3 || k === 4 ? 'talk' : k === 6 ? 'laugh' : 'happy'; }
      if (st === 'selfie') return t % 3 < 1.5 ? 'pout' : 'wink';
      return null;
    },
  },

  sigh: {
    dur: 2.3, idle: 0.2,
    keys: [
      { t: 0 },
      { t: 0.65, sp: [-0.14], hd: [-0.22], sq: 1.07, y: 0.012, ARMS: [0.05, 0.4, 0, 0.3] },
      { t: 1.25, e: 'out', sp: [0.36], hd: [0.38, 0, 0.1], sq: 0.91, y: -0.012, ARMS: [0.35, 0.05, 0, 0.05], LEGS: [0.12, 0, 0.22] },
      { t: 1.85, sp: [0.32], hd: [0.32, 0, 0.12], sq: 0.93, y: -0.01, ARMS: [0.3, 0.05, 0, 0.05], LEGS: [0.1, 0, 0.18] },
      { t: 2.3 },
    ],
    face: [[0, 'sleepy'], [0.6, 'sigh']],
  },

  flex: {
    dur: 3.1, idle: 0, blendIn: 0.15,
    keys: [
      { t: 0 },
      { t: 0.28, sq: 0.88, y: -0.02, sp: [0.15], ARMS: [0.3, 0.3, 0, 1.6], LEGS: [0.25, 0.1, 0.4] },
      { t: 0.5, e: 'back', sq: 1.08, sp: [-0.12], hd: [-0.12, 0, 0.08], ARMS: [0.0, 1.75, 1.55, 2.0], LEGS: [0, 0.22, 0.05], bic: 1.18 },
      { t: 1.15, sq: 1.02, sp: [-0.14], hd: [-0.14, 0, 0.08], ARMS: [0.0, 1.8, 1.55, 2.1], LEGS: [0, 0.22, 0.05], bic: 1.31 },
      { t: 1.35, e: 'out', sq: 0.95, y: -0.01, sp: [-0.1], hd: [-0.1, 0, 0.12], ARMS: [0.0, 1.7, 1.55, 2.25], LEGS: [0.05, 0.22, 0.1], bic: 1.54 },
      { t: 1.75, sq: 1.03, sp: [-0.12], hd: [-0.1, 0, 0.08], ARMS: [0.0, 1.8, 1.55, 2.1], LEGS: [0, 0.22, 0.05], bic: 1.36 },
      { t: 2.05, sp: [-0.05, -0.2, 0.08], hd: [0.0, -0.75, -0.15], L: [0.0, 1.8, 1.55, 2.1], R: [0.25, 1.5, 1.55, 2.3], LEGS: [0, 0.2, 0.05], bic: 1.36 },
      { t: 2.55, sp: [-0.05, -0.2, 0.08], hd: [0.08, -0.8, -0.18], L: [0.0, 1.8, 1.55, 2.1], R: [0.3, 1.45, 1.55, 2.35], LEGS: [0, 0.2, 0.05], bic: 1.41 },
      { t: 3.1, bic: 0 },
    ],
    pose(p, t) { const w = env(t, 0.5, 0.6, 1.9, 2.0); p[I.bic] += 0.18 * Math.sin(t * 22) * w * Math.exp(-(t - 0.5) * 2); p[I.y] += 0.015 * Math.abs(Math.sin(t * 9)) * w; },
    face: [[0, 'happy'], [0.35, 'determined'], [1.95, 'pout'], [2.6, 'wink']],
  },

  sit: {
    hold: true, dur: 0.7, idle: 0.35, blendIn: 0.45,
    keys: { s: { sp: [0.06], LEGS: [1.55, 0.1, 1.55], HANDS: ['knee', 0.0, 0.02, 0.0, [1, -0.2, -1]] } },
    pose(p, t, c, a, K) {
      mixInto(p, K.s, K.s, 0);
      p[I.y] = -c.dims.thigh;
      const sw = sstep(seg(t, 0.8, 1.6));
      p[I.lkX] += 0.22 * Math.sin(t * 2.4) * sw; p[I.rkX] += 0.22 * Math.sin(t * 2.4 + 2.2) * sw;
      p[I.hdZ] += 0.06 * Math.sin(t * 1.2) * sw;
    },
  },

  clink: {
    dur: 2.4, idle: 0.2, prop: ['right', 'glass'],
    keys: [
      { t: 0 },
      { t: 0.4, RH: ['chest', 0.05, 0.14, 0.17, [1, -0.8, 0]], sp: [0.1], hd: [-0.08], sq: 1.03 },
      { t: 0.55, e: 'out', RH: ['chest', 0.03, 0.15, 0.21, [1, -0.8, 0]], sp: [0.16], hd: [-0.05], sq: 1.06, y: 0.01 },
      { t: 0.72, RH: ['chest', 0.05, 0.13, 0.16, [1, -0.8, 0]], sp: [0.08], sq: 0.98 },
      { t: 1.15, RH: ['chin', 0.025, -0.07, 0.04, [1, -0.8, 0.2]], hd: [-0.3], sp: [-0.06], rp: [-0.9] },
      { t: 1.65, RH: ['chin', 0.025, -0.07, 0.04, [1, -0.8, 0.2]], hd: [-0.32], sp: [-0.08], rp: [-1.0] },
      { t: 2.0, RH: ['chest', 0.04, 0.0, 0.07], hd: [0, 0, 0.12], rp: [0] },
      { t: 2.4 },
    ],
    face: [[0, 'happy'], [0.45, 'laugh'], [1.0, 'calm'], [1.8, 'love']],
  },

  bow: {
    dur: 1.9, idle: 0.1,
    keys: [
      { t: 0 },
      { t: 0.45, sp: [0.55], hd: [0.22], y: -0.01, HANDS: ['belly', -0.025, -0.02, 0.03, [1, -0.3, -0.5]], RL: [-0.25, 0, 0.35], LL: [0.05, 0, 0.25], sq: 0.98 },
      { t: 1.0, sp: [0.58], hd: [0.24], y: -0.01, HANDS: ['belly', -0.025, -0.02, 0.03, [1, -0.3, -0.5]], RL: [-0.25, 0, 0.35], LL: [0.05, 0, 0.25], sq: 0.97 },
      { t: 1.32, e: 'out', sp: [-0.08], hd: [-0.1, 0, 0.1], y: 0.05, sq: 1.08, ARMS: [0.1, 0.7, 0, 0.3] },
      { t: 1.55, y: -0.01, sq: 0.95 },
      { t: 1.9 },
    ],
    face: [[0, 'happy'], [0.25, 'calm'], [1.15, 'wink'], [1.75, 'happy']],
  },

  spin: {
    dur: 1.5, idle: 0, blendIn: 0.12,
    keys: [
      { t: 0 },
      { t: 0.2, ry: -0.35, sq: 0.9, y: -0.01, ARMS: [0.3, 0.4, 0, 1.3], LEGS: [0.2, 0, 0.4] },
      { t: 0.45, e: 'in', ry: 1.4, sq: 1.06, y: 0.03, ARMS: [0.15, 1.35, 0, 0.15], hd: [-0.05, 0, 0.16] },
      { t: 0.95, e: 'lin', ry: 5.4, sq: 1.06, y: 0.035, ARMS: [0.15, 1.4, 0, 0.15], hd: [-0.05, 0, 0.18], LL: [0, 0, 0], RL: [0.3, 0.2, 0.8] },
      { t: 1.15, e: 'out', ry: TAU, sq: 0.9, y: -0.01, R: [0.2, 2.3, 0, 0.3], LH: ['hip', 0.02, 0.03, 0.0, [1, 0, -1]], hd: [-0.08, 0, -0.15] },
      { t: 1.5, ry: TAU, R: [0.2, 2.2, 0, 0.35], LH: ['hip', 0.02, 0.03, 0.0, [1, 0, -1]], hd: [-0.05, 0, -0.12] },
    ],
    face: [[0, 'happy'], [0.25, 'laugh'], [1.1, 'wink']],
  },

  tiptoe: {
    loop: true, dur: 3.2, idle: 0.1, natural: 0.35,
    keys: { s: { sp: [0.22], hd: [-0.18], ARMS: [0.85, 0.3, 0.3, 1.9], sq: 0.97 } },
    pose(p, t, c, a, K) {
      mixInto(p, K.s, K.s, 0);
      const ph = t * 1.25 * TAU, s = Math.sin(ph);
      p[I.llX] = -0.65 * Math.max(0, s) + 0.05; p[I.lkX] = 1.2 * Math.max(0, s) + 0.25;
      p[I.rlX] = -0.65 * Math.max(0, -s) + 0.05; p[I.rkX] = 1.2 * Math.max(0, -s) + 0.25;
      p[I.y] = -0.012 + 0.035 * Math.abs(s);
      p[I.rz] = 0.05 * s; p[I.hdY] = 0.45 * Math.sin(t * 1.1); p[I.hdZ] = -0.06 * s;
      p[I.lsX] += 0.12 * s; p[I.rsX] -= 0.12 * s;
    },
    faceFn() { return 'sneaky'; },
  },

  yawn: {
    dur: 2.7, idle: 0.1,
    keys: [
      { t: 0 },
      { t: 0.35, sp: [-0.05], hd: [-0.12], sq: 1.02 },
      { t: 0.85, sp: [-0.2], hd: [-0.32], sq: 1.13, y: 0.025, ARMS: [0.35, 2.85, 0, 0.35], LEGS: [-0.03, 0.05, 0] },
      { t: 1.35, sp: [-0.22], hd: [-0.34, 0, 0.1], sq: 1.14, y: 0.028, ARMS: [0.3, 2.95, 0, 0.25], LEGS: [-0.03, 0.05, 0] },
      { t: 1.75, e: 'out', sp: [0.1], hd: [0.1], sq: 0.94, ARMS: [0.1, 0.25, 0, 0.2] },
      { t: 2.1, RH: ['eye', 0.0, -0.02, 0.03, [1, -0.6, 0]], hd: [0.08, 0, 0.12] },
      { t: 2.45, RH: ['eye', 0.01, -0.025, 0.03, [1, -0.6, 0]], hd: [0.06, 0, 0.1] },
      { t: 2.7 },
    ],
    pose(p, t) { const w = env(t, 0.85, 0.95, 1.3, 1.4); p[I.sq] += 0.015 * Math.sin(t * 40) * w; p[I.rsX] += 0.1 * Math.sin(t * 25) * env(t, 2.0, 2.1, 2.4, 2.5); },
    face: [[0, 'sleepy'], [0.3, 'yawn'], [1.6, 'sleepy']],
  },

  laugh: {
    dur: 2.3, idle: 0,
    keys: [
      { t: 0 },
      { t: 0.25, sp: [-0.22], hd: [-0.35], sq: 1.07, LH: ['belly', 0.03, 0.0, 0.02], R: [0.4, 0.5, 0, 1.0] },
      { t: 0.65, sp: [0.28], hd: [-0.05], sq: 0.94, LH: ['belly', 0.03, 0.0, 0.02], RH: ['knee', -0.0, 0.0, 0.02, [1, -0.2, -1]], LEGS: [0.2, 0.05, 0.35], y: -0.012 },
      { t: 1.6, sp: [0.26], hd: [-0.05], sq: 0.95, LH: ['belly', 0.03, 0.0, 0.02], RH: ['knee', 0.0, 0.0, 0.02, [1, -0.2, -1]], LEGS: [0.2, 0.05, 0.35], y: -0.012 },
      { t: 1.95, sp: [-0.05], hd: [-0.08, 0, 0.12], RH: ['eye', 0.03, -0.02, 0.04, [1, -0.6, 0]] },
      { t: 2.3 },
    ],
    pose(p, t) {
      const w = env(t, 0.2, 0.35, 1.7, 1.9);
      p[I.sq] += 0.045 * Math.sin(t * 31) * w; p[I.spX] += 0.06 * Math.sin(t * 15.5) * w; p[I.y] += 0.012 * Math.abs(Math.sin(t * 15.5)) * w;
      p[I.reX] += 0.25 * Math.sin(t * 9) * env(t, 0.6, 0.7, 1.5, 1.6);
      p[I.hdZ] += 0.08 * Math.sin(t * 7) * w;
    },
    face: [[0, 'laugh'], [1.95, 'happy']],
  },

  point: {
    dur: 1.7, idle: 0.2, blendIn: 0.15,
    keys: [
      { t: 0 },
      { t: 0.22, e: 'back', R: [1.45, 0.3, 0, 0.0], LH: ['hip', 0.02, 0.03, 0.0, [1, 0, -1]], sp: [0.12, -0.18], hd: [-0.08, -0.12], sq: 1.06, fing: 1, LL: [0.0, 0.05, 0.15], RL: [-0.1, 0, 0] },
      { t: 1.35, R: [1.45, 0.3, 0, 0.0], LH: ['hip', 0.02, 0.03, 0.0, [1, 0, -1]], sp: [0.1, -0.18], hd: [-0.06, -0.12], fing: 1, LL: [0.0, 0.05, 0.15] },
      { t: 1.7 },
    ],
    pose(p, t, c) {
      const w = env(t, 0.15, 0.25, 1.3, 1.45);
      p[I.rsX] += 0.06 * Math.sin(t * 18) * Math.exp(-(t - 0.25) * 4) * w;
      if (c.lookTarget && w > 0) {
        const yp = c.aimAngles(); // yaw / pitch toward look target in root space
        p[I.rsX] = lerp(p[I.rsX], -(PI / 2 - yp.pitch * 0.9), w);
        p[I.rsZ] = lerp(p[I.rsZ], clamp(-yp.yaw, -1.6, 0.5), w);
      }
    },
    face: [[0, 'surprised'], [0.4, 'happy']],
  },

  hug: {
    dur: 2.5, idle: 0.1,
    keys: [
      { t: 0 },
      { t: 0.4, e: 'back', ARMS: [0.6, 1.2, 0, 0.2], sp: [-0.08], hd: [-0.1], sq: 1.06, y: 0.01 },
      { t: 0.75, HANDS: ['chest', -0.02, 0.05, 0.12, [1, -0.2, 0]], sp: [0.14], hd: [0.05, 0, 0.18], sq: 0.97 },
      { t: 1.95, HANDS: ['chest', -0.02, 0.05, 0.12, [1, -0.2, 0]], sp: [0.14], hd: [0.05, 0, 0.18], sq: 0.98 },
      { t: 2.5 },
    ],
    pose(p, t) { const w = env(t, 0.7, 0.85, 1.85, 2.0); p[I.rz] += 0.08 * Math.sin((t - 0.75) * 4.5) * w; p[I.hdZ] += 0.1 * Math.sin((t - 0.75) * 4.5) * w; p[I.sq] += 0.025 * Math.sin(t * 9) * w; },
    face: [[0, 'love']],
  },

  // ---- amendment 1
  fistPump: {
    dur: 1.5, idle: 0, blendIn: 0.12,
    keys: [
      { t: 0 },
      { t: 0.22, R: [0.4, 2.65, 0, 0.35], sp: [-0.1], hd: [-0.15], sq: 1.08, y: 0.015 },
      { t: 0.4, e: 'out', RH: ['hip', 0.02, 0.12, 0.06, [1, -0.7, -0.3]], sp: [0.25, -0.1], hd: [0.05], sq: 0.9, LL: [0.85, 0.1, 1.5], y: 0.02 },
      { t: 0.6, R: [0.4, 2.3, 0, 0.6], sp: [-0.05], sq: 1.04, y: 0.0 },
      { t: 0.78, e: 'out', RH: ['hip', 0.02, 0.12, 0.06, [1, -0.7, -0.3]], sp: [0.22, -0.1], sq: 0.92, LL: [0.7, 0.1, 1.3], y: 0.015 },
      { t: 1.15, RH: ['hip', 0.02, 0.1, 0.05, [1, -0.7, -0.3]], sp: [0.1], sq: 1.0 },
      { t: 1.5 },
    ],
    face: [[0, 'determined'], [0.35, 'laugh']],
  },
  crouch: {
    loop: true, dur: 2.6, idle: 0.3, blendIn: 0.35,
    keys: { s: { sp: [0.35], hd: [-0.3], LEGS: [1.75, 0.25, 2.35], HANDS: ['knee', 0.0, 0.05, -0.01, [1, -0.3, -1]] } },
    pose(p, t, c, a, K) {
      mixInto(p, K.s, K.s, 0);
      const d = c.dims; // keep feet on the ground: drop root by leg lift
      const th = 1.75, kn = 2.35;
      const fy = d.thigh * Math.cos(th) + (d.shin + 0.03) * Math.cos(kn - th);
      p[I.y] = -(d.hipY - fy) + 0.008 * Math.sin(t * 2.2);
      p[I.hdY] = 0.4 * Math.sin(t * 0.9); p[I.hdZ] = 0.08 * Math.sin(t * 0.9 + 1);
      p[I.sq] = 1 + 0.015 * Math.sin(t * 2.2);
    },
  },
  peek: {
    loop: true, dur: 3.4, idle: 0.2, blendIn: 0.35,
    keys: {
      outR: { RH: ['ear', -0.01, 0.0, 0.14, [1, -0.8, -0.2]], LH: ['chin', -0.07, 0.0, 0.1, [1, -0.6, -0.4]], LEGS: [0.15, 0, 0.3] },
      outL: { LH: ['ear', -0.01, 0.0, 0.14, [1, -0.8, -0.2]], RH: ['chin', -0.07, 0.0, 0.1, [1, -0.6, -0.4]], LEGS: [0.15, 0, 0.3] },
      up: { sp: [0.2], LEGS: [1.5, 0.22, 2.0], HANDS: ['chin', 0.07, -0.03, 0.05, [1, -0.5, -0.6]] },
    },
    pose(p, t, c, a, K) {
      const side = a.opts.side || 'right';
      const T = t % 3.4;
      const out = sstep(seg(T, 0, 0.45)) * (1 - sstep(seg(T, 2.25, 2.45))) + sstep(seg(T, 2.8, 3.3));
      if (side === 'up') {
        mixInto(p, K.up, K.up, 0);
        const d = c.dims, th = 1.5, kn = 2.0;
        const fy = d.thigh * Math.cos(th) + (d.shin + 0.03) * Math.cos(kn - th);
        const low = -(d.hipY - fy);
        p[I.y] = low + (0.06 + 0.04 * out) * 1;
        p[I.hdX] = -0.15 - 0.1 * out; p[I.hdY] = 0.3 * Math.sin(t * 1.3) * out; p[I.hdZ] = 0.1 * Math.sin(t * 1.3);
        p[I.sq] = 0.98 + 0.03 * out;
        return;
      }
      const s = side === 'left' ? 1 : -1;
      mixInto(p, s < 0 ? K.outR : K.outL, s < 0 ? K.outR : K.outL, 0);
      const lean = 0.05 + 0.13 * out;
      p[I.rz] = -s * lean; p[I.x] = s * 0.03 * out; p[I.spZ] = -s * 0.28 * out; p[I.hdZ] = -s * (0.2 * out + 0.06 * Math.sin(t * 2.1));
      p[I.hdY] = s * 0.25 * out; p[I.y] = -0.015 + 0.006 * Math.sin(t * 4);
      p[I.sq] = 1 + 0.02 * Math.sin(t * 4);
    },
    faceFn(t) { const T = t % 3.4; return T < 0.5 ? 'sneaky' : T < 1.5 ? 'happy' : T < 2.2 ? 'sneaky' : T < 2.8 ? 'surprised' : 'sneaky'; },
  },
  facepalm: {
    dur: 1.9, idle: 0.1,
    keys: [
      { t: 0 },
      { t: 0.32, e: 'out', RH: ['forehead', -0.005, -0.06, 0.02, [1, -0.6, 0]], hd: [0.32], sp: [0.18], sq: 0.94 },
      { t: 1.45, RH: ['forehead', -0.005, -0.06, 0.02, [1, -0.6, 0]], hd: [0.36], sp: [0.2], sq: 0.95 },
      { t: 1.9 },
    ],
    pose(p, t) { const w = env(t, 0.4, 0.5, 1.35, 1.45); p[I.hdY] += 0.18 * Math.sin(t * 7) * w; p[I.spY] += 0.06 * Math.sin(t * 7) * w; },
    face: [[0, 'surprised'], [0.3, 'facepalm'], [1.5, 'laugh']],
  },
  scratchHead: {
    dur: 2.0, idle: 0.1,
    keys: [
      { t: 0 },
      { t: 0.35, RH: ['headSide', 0.02, -0.02, 0.0, [1, 0.1, 0.2]], hd: [-0.08, 0.15, 0.2], sp: [0, 0, -0.06], LH: ['hip', 0.0, 0.03, 0.0, [1, 0, -1]] },
      { t: 1.6, RH: ['headSide', 0.02, -0.02, 0.0, [1, 0.1, 0.2]], hd: [-0.1, 0.2, 0.22], sp: [0, 0, -0.06], LH: ['hip', 0.0, 0.03, 0.0, [1, 0, -1]] },
      { t: 2.0 },
    ],
    pose(p, t) { const w = env(t, 0.35, 0.45, 1.5, 1.6); p[I.reX] += 0.22 * Math.sin(t * 24) * w; p[I.rsY] += 0.15 * Math.sin(t * 24) * w; },
    face: [[0, 'confused']],
  },

  // ---- extras (not in the contract, used by STORY.md staging)
  selfie: { alias: 'phone', opts: { style: 'selfie' } },
  scroll: { alias: 'phone', opts: { style: 'scroll' } },
  film: { alias: 'phone', opts: { style: 'film' } },
  pointSelf: {
    dur: 1.6, idle: 0.2,
    keys: [
      { t: 0 },
      { t: 0.25, e: 'back', RH: ['chest', 0.02, 0.0, 0.035, [1, -0.6, -0.2]], fing: 1, sp: [-0.1], hd: [-0.12, 0, 0.12], sq: 1.05, LH: ['hip', 0.02, 0.03, 0, [1, 0, -1]] },
      { t: 1.25, RH: ['chest', 0.02, 0.0, 0.035, [1, -0.6, -0.2]], fing: 1, sp: [-0.12], hd: [-0.14, 0, 0.12], LH: ['hip', 0.02, 0.03, 0, [1, 0, -1]] },
      { t: 1.6 },
    ],
    pose(p, t) { p[I.rsX] += 0.05 * Math.sin(t * 16) * env(t, 0.25, 0.3, 1.0, 1.2); },
    face: [[0, 'laugh']],
  },
  hammer: {
    loop: true, dur: 2.4, idle: 0.2, prop: ['right', 'hammer'],
    keys: {
      up: { R: [1.4, 0.35, 0, 1.9], sp: [0.12], hd: [0.15], LH: ['chest', 0.08, -0.05, 0.12], rp: [-0.6] },
      down: { R: [0.95, 0.25, 0, 0.6], sp: [0.25], hd: [0.25], LH: ['chest', 0.08, -0.05, 0.12], rp: [0.9], sq: 0.97 },
    },
    pose(p, t, c, a, K) { const ph = (t * 1.6) % 1; const u = ph < 0.6 ? EASE.s(ph / 0.6) : 1 - EASE.in((ph - 0.6) / 0.4); mixInto(p, K.down, K.up, u); p[I.lkX] = 0.15; p[I.rkX] = 0.15; },
    faceFn() { return 'determined'; },
  },
  chop: {
    loop: true, dur: 2.5, idle: 0.1, prop: ['right', 'chainsaw'],
    keys: { s: { HANDS: ['belly', -0.02, 0.0, 0.1, [1, -0.6, -0.2]], sp: [0.22], hd: [0.1], LEGS: [0.3, 0.2, 0.55] } },
    pose(p, t, c, a, K) {
      mixInto(p, K.s, K.s, 0);
      const d = c.dims; p[I.y] = -0.025 + 0.004 * Math.sin(t * 60);
      p[I.spX] += 0.02 * Math.sin(t * 47); p[I.hdZ] = 0.03 * Math.sin(t * 53); p[I.ry] = 0.15 * Math.sin(t * 1.2);
    },
    faceFn() { return 'determined'; },
  },
  gaming: {
    loop: true, dur: 3, idle: 0.2, prop: ['right', 'controller'],
    keys: { s: { HANDS: ['belly', -0.025, 0.02, 0.07, [1, -0.6, -0.2]], hd: [0.18] } },
    pose(p, t, c, a, K) {
      mixInto(p, K.s, K.s, 0);
      const lean = Math.sin(t * 1.7) * 0.6 + Math.sin(t * 3.1) * 0.4;
      p[I.rz] += 0.12 * lean; p[I.spZ] += 0.1 * lean; p[I.hdZ] += 0.1 * lean;
      p[I.leX] += 0.08 * Math.sin(t * 12); p[I.reX] += 0.08 * Math.sin(t * 13.3);
      if (c.anim && c.anim.def.name === 'gaming' && c.anim.opts.seated) { p[I.y] = -c.dims.thigh; p[I.llX] = -1.55; p[I.rlX] = -1.55; p[I.lkX] = 1.55; p[I.rkX] = 1.55; }
    },
    faceFn(t) { return (t % 3) < 2.2 ? 'determined' : 'surprised'; },
  },
  slide: {
    dur: 1.6, idle: 0, prop: ['right', 'puck'],
    keys: [
      { t: 0 },
      { t: 0.4, RH: ['hip', 0.03, -0.02, -0.08, [1, -0.3, -1]], sp: [0.45], hd: [-0.35], LEGS: [0.5, 0.15, 0.8], LH: ['chest', 0.15, 0.05, 0.05], y: -0.03, sq: 0.93 },
      { t: 0.65, e: 'out', R: [1.25, 0.15, 0, 0.0], sp: [0.55], hd: [-0.4], LL: [0.6, 0.15, 0.9], RL: [-0.5, 0.1, 0.4], L: [0.2, 1.2, 0, 0.2], y: -0.035, sq: 1.02 },
      { t: 1.2, R: [1.2, 0.15, 0, 0.0], sp: [0.5], hd: [-0.45], LL: [0.6, 0.15, 0.9], RL: [-0.5, 0.1, 0.4], L: [0.2, 1.2, 0, 0.2], y: -0.035 },
      { t: 1.6 },
    ],
    ev: [[0.62, c => { if (c.props.right === 'puck' && c._temp.right) c.setProp('right', null); }]],
    face: [[0, 'determined'], [0.7, 'surprised']],
  },
};

const ANIM_CACHE = new Map();
function compileAnims(d) {
  if (ANIM_CACHE.has(d.key)) return ANIM_CACHE.get(d.key);
  const out = {};
  for (const [name, src] of Object.entries(ANIM_SRC)) {
    const def = { ...src, name };
    if (Array.isArray(src.keys)) def.keyList = src.keys.map(k => ({ t: k.t, e: k.e, p: compileKey(k, d) }));
    else if (src.keys) { def.K = {}; for (const [kn, kv] of Object.entries(src.keys)) def.K[kn] = compileKey(kv, d); }
    out[name] = def;
  }
  ANIM_CACHE.set(d.key, out);
  return out;
}

/* ------------------------------------------------------------------ faces */

const FW = 540, FH = 342, PXD = 3.6; // canvas covers phi ∈ [-75°, 75°], theta ∈ [50°, 145°]
const fxp = phi => (phi + 75) * PXD, fyp = th => (th - 50) * PXD;
const EXPR = {
  happy: { eyes: 'open', mouth: 'smile', brows: 'soft', blush: 1 },
  neutral: { eyes: 'open', mouth: 'smallSmile', brows: 'soft', blush: 0.8 },
  laugh: { eyes: 'arc', mouth: 'laugh', brows: 'up', blush: 1.3 },
  surprised: { eyes: 'wide', mouth: 'o', brows: 'high', blush: 0.8 },
  wink: { eyes: 'wink', mouth: 'grin', brows: 'soft', blush: 1.15 },
  sneeze: { eyes: 'squeeze', mouth: 'sneeze', brows: 'furrow', blush: 1.6 },
  preSneeze: { eyes: 'half', mouth: 'ah', brows: 'worried', blush: 1.35 },
  love: { eyes: 'heart', mouth: 'smile', brows: 'soft', blush: 1.6 },
  sleepy: { eyes: 'sleepy', mouth: 'smallO', brows: 'relaxed', blush: 0.9 },
  sigh: { eyes: 'down', mouth: 'wobble', brows: 'worried', blush: 0.6 },
  yawn: { eyes: 'squeeze', mouth: 'yawn', brows: 'up', blush: 1 },
  calm: { eyes: 'closed', mouth: 'smallSmile', brows: 'relaxed', blush: 1.15 },
  pout: { eyes: 'wink', mouth: 'pout', brows: 'soft', blush: 1.35 },
  sneaky: { eyes: 'sneaky', mouth: 'cat', brows: 'furrow', blush: 0.9 },
  confused: { eyes: 'open', mouth: 'wobble', brows: 'confused', blush: 0.7 },
  determined: { eyes: 'open', mouth: 'grin', brows: 'furrow', blush: 1.1 },
  talk: { eyes: 'open', mouth: 'talk', brows: 'up', blush: 1 },
  sniff: { eyes: 'squeeze', mouth: 'wobble', brows: 'worried', blush: 1.6 },
  facepalm: { eyes: 'closed', mouth: 'wobble', brows: 'worried', blush: 1.2 },
};
const OPEN_EYES = new Set(['open', 'wide', 'sleepy', 'half', 'down', 'sneaky']);

function hexA(hex, a) { const c = new THREE.Color(hex); return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`; }
// NB: THREE.Color(hex) converts to linear; get sRGB back for canvas
function srgbA(hex, a) { const c = new THREE.Color(hex); const s = c.getStyle(THREE.SRGBColorSpace); const m = s.match(/\d+/g); return `rgba(${m[0]},${m[1]},${m[2]},${a})`; }

function drawEye(x, cx, cy, rx, ry, kind, outer, f) {
  const lash = f.lashColor;
  x.lineCap = 'round'; x.lineJoin = 'round';
  if (OPEN_EYES.has(kind)) {
    const wide = kind === 'wide';
    if (wide) { rx *= 1.08; ry *= 1.1; }
    let lidY = cy - ry * 1.3;
    if (kind === 'sleepy') lidY = cy + ry * 0.02;
    if (kind === 'half') lidY = cy - ry * 0.3;
    if (kind === 'down') lidY = cy - ry * 0.1;
    if (kind === 'sneaky') lidY = cy - ry * 0.25;
    x.save();
    x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, TAU); x.clip();
    x.beginPath(); x.rect(cx - rx - 2, lidY, rx * 2 + 4, ry * 3); x.clip();
    x.fillStyle = '#fffaf6'; x.fillRect(cx - rx - 2, cy - ry - 2, rx * 2 + 4, ry * 2 + 4);
    let lx = 0, ly = 0;
    if (kind === 'down') ly = ry * 0.28;
    if (kind === 'sneaky') lx = rx * 0.3;
    if (kind === 'sleepy') ly = ry * 0.1;
    const ix = cx + lx, iy = cy + ry * 0.1 + ly;
    const irx = rx * (wide ? 0.62 : 0.86), iry = ry * (wide ? 0.66 : 0.9);
    const g = x.createLinearGradient(0, iy - iry, 0, iy + iry);
    g.addColorStop(0, f.eyeDark); g.addColorStop(0.5, f.eyeColor); g.addColorStop(1, f.eyeLight);
    x.fillStyle = g; x.beginPath(); x.ellipse(ix, iy, irx, iry, 0, 0, TAU); x.fill();
    x.fillStyle = f.pupil; x.beginPath(); x.ellipse(ix, iy + iry * 0.04, irx * (wide ? 0.38 : 0.5), iry * (wide ? 0.4 : 0.54), 0, 0, TAU); x.fill();
    x.strokeStyle = 'rgba(30,15,10,0.45)'; x.lineWidth = 2; x.beginPath(); x.ellipse(ix, iy, irx, iry, 0, 0, TAU); x.stroke();
    // glossy highlights
    x.fillStyle = '#ffffff';
    x.beginPath(); x.ellipse(ix - irx * 0.32, iy - iry * 0.38, irx * 0.36, iry * 0.3, -0.3, 0, TAU); x.fill();
    x.beginPath(); x.arc(ix + irx * 0.38, iy + iry * 0.42, irx * 0.15, 0, TAU); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.5)'; x.beginPath(); x.arc(ix + irx * 0.1, iy + iry * 0.55, irx * 0.09, 0, TAU); x.fill();
    x.restore();
    // upper lid line
    x.strokeStyle = lash; x.lineWidth = f.lashW;
    if (lidY > cy - ry) {
      const dy = clamp((lidY - cy) / ry, -1, 1), dx = rx * Math.sqrt(1 - dy * dy);
      x.beginPath(); x.moveTo(cx - dx - 3, lidY + 2); x.quadraticCurveTo(cx, lidY - 3, cx + dx + 3, lidY + 2); x.stroke();
      if (f.lashes) { const ox = cx + outer * (dx + 2); x.beginPath(); x.moveTo(ox, lidY + 1); x.quadraticCurveTo(ox + outer * 7, lidY - 1, ox + outer * 12, lidY - 7); x.stroke(); }
    } else {
      x.beginPath(); x.ellipse(cx, cy, rx * 1.02, ry * 1.02, 0, PI * 1.06, PI * 1.94); x.stroke();
      if (f.lashes) {
        const a = outer < 0 ? PI * 1.06 : PI * 1.94;
        const px = cx + Math.cos(a) * rx * 1.02, py = cy + Math.sin(a) * ry * 1.02;
        x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + outer * 8, py - 2, px + outer * 14, py - 10); x.stroke();
        x.lineWidth = f.lashW * 0.6; x.beginPath(); x.moveTo(px - outer * 4, py - 6); x.quadraticCurveTo(px + outer * 2, py - 12, px + outer * 6, py - 17); x.stroke();
      }
    }
    x.strokeStyle = hexA('#3a2015', 0.3); x.lineWidth = 2.2;
    x.beginPath(); x.ellipse(cx, cy, rx * 0.92, ry * 0.98, 0, PI * 0.25, PI * 0.75); x.stroke();
    return;
  }
  x.strokeStyle = lash; x.lineWidth = f.lashW * 1.05;
  switch (kind) {
    case 'closed': {
      x.beginPath(); x.moveTo(cx - rx, cy + ry * 0.05); x.quadraticCurveTo(cx, cy + ry * 0.6, cx + rx, cy + ry * 0.05); x.stroke();
      if (f.lashes) { const px = cx + outer * rx; x.beginPath(); x.moveTo(px, cy + ry * 0.05); x.lineTo(px + outer * 9, cy - 4); x.stroke(); }
      break;
    }
    case 'arc': {
      x.beginPath(); x.moveTo(cx - rx * 0.95, cy + ry * 0.3); x.quadraticCurveTo(cx, cy - ry * 0.75, cx + rx * 0.95, cy + ry * 0.3); x.stroke();
      break;
    }
    case 'squeeze': {
      const d = -outer;
      x.lineWidth = f.lashW * 1.15;
      x.beginPath(); x.moveTo(cx - d * rx * 0.7, cy - ry * 0.55); x.lineTo(cx + d * rx * 0.6, cy); x.lineTo(cx - d * rx * 0.7, cy + ry * 0.5); x.stroke();
      break;
    }
    case 'heart': {
      const s = rx * 1.15;
      x.save(); x.translate(cx, cy + ry * 0.05);
      const g = x.createLinearGradient(0, -s, 0, s); g.addColorStop(0, '#ff6f91'); g.addColorStop(1, '#d81b4f');
      x.fillStyle = g; x.strokeStyle = '#8c1d40'; x.lineWidth = 2.5;
      x.beginPath(); x.moveTo(0, s * 0.85);
      x.bezierCurveTo(-s * 1.25, -s * 0.05, -s * 0.6, -s * 1.0, 0, -s * 0.38);
      x.bezierCurveTo(s * 0.6, -s * 1.0, s * 1.25, -s * 0.05, 0, s * 0.85);
      x.fill(); x.stroke();
      x.fillStyle = '#fff'; x.beginPath(); x.ellipse(-s * 0.42, -s * 0.38, s * 0.18, s * 0.13, -0.5, 0, TAU); x.fill();
      x.restore();
      break;
    }
  }
}
function drawBrow(x, cx, cy, w, outer, kind, f) {
  let lift = 0, innerUp = 0, arch = 5;
  switch (kind) {
    case 'up': lift = -7; arch = 6; break;
    case 'high': lift = -15; arch = 9; break;
    case 'worried': lift = -4; innerUp = 9; arch = 1; break;
    case 'furrow': lift = 4; innerUp = -9; arch = 1; break;
    case 'relaxed': lift = 3; arch = 3; break;
    case 'confused': if (outer > 0) { lift = -12; arch = 8; } else { lift = 3; innerUp = -4; } break;
  }
  const ix = cx - outer * w * 0.5, ox = cx + outer * w * 0.55;
  const iy = cy + lift - innerUp, oy = cy + lift + 4;
  const th = f.browW, my = Math.min(iy, oy) - arch;
  x.fillStyle = f.browColor;
  x.beginPath();
  x.moveTo(ix, iy - th * 0.55);
  x.quadraticCurveTo((ix + ox) / 2, my - th * 0.55, ox, oy - th * 0.1);
  x.quadraticCurveTo((ix + ox) / 2, my + th * 0.55, ix, iy + th * 0.55);
  x.closePath(); x.fill();
}
function drawMouth(x, mx, my, kind, f) {
  const ink = '#5a2320', inside = '#7a2234', tongue = '#f0838f', teeth = '#fffaf4';
  const W = f.mouthW, MS = 1.4;
  x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = ink; x.lineWidth = 3;
  const openShape = (w, h, top = -3, teethH = 9, tongueS = 0.55) => {
    w *= MS; h *= MS; teethH *= MS;
    const path = () => {
      x.beginPath(); x.moveTo(mx - w, my + top);
      x.quadraticCurveTo(mx, my + top + 6 * MS, mx + w, my + top);
      x.bezierCurveTo(mx + w * 0.85, my + h * 1.15, mx - w * 0.85, my + h * 1.15, mx - w, my + top);
      x.closePath();
    };
    path(); x.fillStyle = inside; x.fill();
    x.save(); path(); x.clip();
    x.fillStyle = tongue; x.beginPath(); x.ellipse(mx, my + h * 0.98, w * tongueS, h * 0.4, 0, 0, TAU); x.fill();
    if (teethH) { x.fillStyle = teeth; x.beginPath(); x.ellipse(mx, my + top - 2, w * 0.95, teethH + 2, 0, 0, TAU); x.fill(); }
    x.restore();
    path(); x.lineWidth = 3.5; x.stroke();
    // little smile corners
    x.lineWidth = 3; x.beginPath(); x.moveTo(mx - w - 4, my + top - 3); x.quadraticCurveTo(mx - w - 1, my + top + 1, mx - w + 1, my + top + 1); x.stroke();
    x.beginPath(); x.moveTo(mx + w + 4, my + top - 3); x.quadraticCurveTo(mx + w + 1, my + top + 1, mx + w - 1, my + top + 1); x.stroke();
  };
  if (!['smile', 'grin', 'laugh'].includes(kind)) { x.save(); x.translate(mx, my); x.scale(MS, MS); x.translate(-mx, -my); x.lineWidth = 3 / MS * 1.2; }
  switch (kind) {
    case 'smile': openShape(29 * W, 24); break;
    case 'grin': openShape(31 * W, 17, -2, 11, 0.4); break;
    case 'laugh': openShape(33 * W, 36, -4, 9, 0.6); break;
    case 'smallSmile':
      x.beginPath(); x.moveTo(mx - 15 * W, my); x.quadraticCurveTo(mx, my + 11, mx + 15 * W, my); x.stroke(); break;
    case 'cat':
      x.beginPath(); x.moveTo(mx - 15, my); x.quadraticCurveTo(mx - 7.5, my + 9, mx, my + 1); x.quadraticCurveTo(mx + 7.5, my + 9, mx + 15, my); x.stroke(); break;
    case 'o': case 'smallO': case 'ah': case 'yawn': case 'talk': {
      const [w, h, oy] = { o: [10, 13, 8], smallO: [6, 7, 5], ah: [13, 15, 9], yawn: [15, 25, 13], talk: [12, 9, 6] }[kind];
      x.fillStyle = inside; x.beginPath(); x.ellipse(mx, my + oy, w, h, 0, 0, TAU); x.fill();
      x.save(); x.clip(); x.fillStyle = tongue; x.beginPath(); x.ellipse(mx, my + oy + h * 0.75, w * 0.75, h * 0.45, 0, 0, TAU); x.fill(); x.restore();
      x.beginPath(); x.ellipse(mx, my + oy, w, h, 0, 0, TAU); x.stroke();
      break;
    }
    case 'sneeze': {
      x.fillStyle = inside; x.beginPath(); x.ellipse(mx, my + 12, 38, 25, 0, 0, TAU); x.fill();
      x.save(); x.clip();
      x.fillStyle = tongue; x.beginPath(); x.ellipse(mx, my + 32, 24, 12, 0, 0, TAU); x.fill();
      x.fillStyle = teeth; x.fillRect(mx - 40, my - 14, 80, 12); x.fillRect(mx - 40, my + 32, 80, 8);
      x.restore();
      x.beginPath(); x.ellipse(mx, my + 12, 38, 25, 0, 0, TAU); x.stroke();
      break;
    }
    case 'wobble':
      x.beginPath(); x.moveTo(mx - 17, my + 7); x.bezierCurveTo(mx - 9, my - 1, mx - 5, my + 12, mx, my + 6); x.bezierCurveTo(mx + 5, my, mx + 9, my + 12, mx + 17, my + 5); x.stroke(); break;
    case 'pout': {
      x.fillStyle = '#e46f80'; x.strokeStyle = '#a63a4c'; x.lineWidth = 2.5;
      x.beginPath(); x.ellipse(mx, my + 2, 12, 7, 0, 0, TAU); x.fill(); x.stroke();
      x.beginPath(); x.ellipse(mx, my + 11, 11, 7, 0, 0, TAU); x.fill(); x.stroke();
      x.fillStyle = 'rgba(255,255,255,0.6)'; x.beginPath(); x.ellipse(mx - 4, my + 0, 4, 2, 0, 0, TAU); x.fill();
      break;
    }
  }
  if (!['smile', 'grin', 'laugh'].includes(kind)) x.restore();
}
function drawFace(x, f, exName, blink) {
  const ex = EXPR[exName] || EXPR.happy;
  x.clearRect(0, 0, FW, FH);
  const eyeTh = f.eyeTh, eyePhi = f.eyePhi;
  const rx = f.eyeW * PXD * 0.5, ry = f.eyeH * PXD * 0.5;
  const mouthY = fyp(f.beard === true ? 118.5 : 120.5);
  // blush
  if (ex.blush > 0) {
    for (const s of [-1, 1]) {
      const bx = fxp(s * 32), by = fyp(112.5);
      x.save(); x.translate(bx, by); x.scale(1, 0.55);
      const g = x.createRadialGradient(0, 0, 0, 0, 0, 40);
      g.addColorStop(0, srgbA(f.blushColor, 0.55 * ex.blush * f.blushAmt)); g.addColorStop(1, srgbA(f.blushColor, 0));
      x.fillStyle = g; x.beginPath(); x.arc(0, 0, 40, 0, TAU); x.fill(); x.restore();
      if (ex.blush >= 1.3) {
        x.strokeStyle = 'rgba(225,80,105,0.45)'; x.lineWidth = 2.2; x.lineCap = 'round';
        for (let i = -1; i <= 1; i++) { x.beginPath(); x.moveTo(bx + i * 9 - 3, by + 5); x.lineTo(bx + i * 9 + 3, by - 5); x.stroke(); }
      }
    }
  }
  if (f.freckles) {
    x.fillStyle = 'rgba(140,80,50,0.28)';
    const pts = [[-14, 106], [-19, 108], [-11, 109.5], [-22, 105.5], [14, 106], [19, 108], [11, 109.5], [22, 105.5], [-4, 104], [4, 104]];
    for (const [p, t] of pts) { x.beginPath(); x.arc(fxp(p), fyp(t), 1.6, 0, TAU); x.fill(); }
  }
  // beard / stubble
  if (f.beard === true) {
    x.fillStyle = srgbA(f.beardColor, 0.5);
    x.beginPath();
    x.moveTo(fxp(-66), fyp(96)); x.lineTo(fxp(-58), fyp(112));
    x.quadraticCurveTo(fxp(-34), fyp(114), fxp(-20), fyp(116));
    x.quadraticCurveTo(fxp(0), fyp(112), fxp(20), fyp(116));
    x.quadraticCurveTo(fxp(34), fyp(114), fxp(58), fyp(112));
    x.lineTo(fxp(66), fyp(96)); x.lineTo(fxp(75), fyp(96)); x.lineTo(fxp(75), FH); x.lineTo(fxp(-75), FH); x.lineTo(fxp(-75), fyp(96)); x.closePath(); x.fill();
  }
  function mx0() { return FW / 2; }
  // nose
  x.strokeStyle = 'rgba(165,90,70,0.55)'; x.lineWidth = 3; x.lineCap = 'round';
  x.beginPath(); x.moveTo(fxp(-2.4), fyp(111.4)); x.quadraticCurveTo(fxp(0), fyp(112.8), fxp(2.4), fyp(111.4)); x.stroke();
  // mouth
  if (f.beard === 'mustache') drawMouth(x, FW / 2, mouthY + 6, ex.mouth, f); else drawMouth(x, FW / 2, mouthY, ex.mouth, f);
  if (f.beard === true || f.beard === 'mustache') {
    const big = f.beard === 'mustache';
    x.fillStyle = srgbA(f.beardColor, 0.95);
    const my = mouthY - (big ? 3 : 4), w = big ? 40 : 25;
    x.beginPath(); x.moveTo(mx0(), my - 7);
    x.bezierCurveTo(mx0() - w * 0.5, my - 13, mx0() - w, my - 6, mx0() - w * 1.05, my + (big ? 8 : 4));
    x.bezierCurveTo(mx0() - w * 0.6, my + 2, mx0() - w * 0.3, my + 1, mx0(), my + 1);
    x.bezierCurveTo(mx0() + w * 0.3, my + 1, mx0() + w * 0.6, my + 2, mx0() + w * 1.05, my + (big ? 8 : 4));
    x.bezierCurveTo(mx0() + w, my - 6, mx0() + w * 0.5, my - 13, mx0(), my - 7);
    x.fill();
  }

  // eyes
  for (const s of [-1, 1]) {
    let kind = ex.eyes;
    if (kind === 'wink') kind = s > 0 ? 'arc' : 'open';
    if (blink && OPEN_EYES.has(kind)) kind = 'closed';
    drawEye(x, fxp(s * eyePhi), fyp(eyeTh), rx, ry, kind, s, f);
  }
  // brows
  for (const s of [-1, 1]) drawBrow(x, fxp(s * (eyePhi + 1.0)), fyp(eyeTh - f.eyeH * 0.5 - 6.5), f.eyeW * PXD * 1.05, s, ex.brows, f);
  // glasses
  if (f.glasses) {
    x.strokeStyle = '#3a2a22'; x.lineWidth = 4.5;
    for (const s of [-1, 1]) { x.beginPath(); x.ellipse(fxp(s * eyePhi), fyp(eyeTh + 0.5), rx * 1.45, ry * 1.22, 0, 0, TAU); x.stroke(); }
    x.beginPath(); x.moveTo(fxp(-eyePhi) + rx * 1.45, fyp(eyeTh - 1)); x.quadraticCurveTo(FW / 2, fyp(eyeTh - 4), fxp(eyePhi) - rx * 1.45, fyp(eyeTh - 1)); x.stroke();
  }
}

/* ------------------------------------------------------------------ hair */

const hairMix = (lo, hi, amt = 0.95, streak = 0.2) => (x, y, z) => {
  let m = sstep((lo - y) / (lo - hi)) * amt;
  m += streak * Math.sin(x * 7.3 + z * 4.1 + y * 1.7) * (0.4 + m);
  return clamp(m, -0.55, 1);
};
function capGeo(rad, tilt, thetaLen, sx = 1.04) {
  const g = new THREE.SphereGeometry(rad, 36, 20, 0, TAU, 0, thetaLen);
  return xf(g, [0, 0, 0], [-tilt, 0, 0], [sx, 1, 1]);
}
// returns { geos:[static head-space], springs:[{pivot, geos, cfg, child?}] }
function buildHair(cfg) {
  const style = cfg.hair || 'long';
  const L = cfg.hairLength ?? 1;
  const mix = hairMix(0.35, -1.2 - 0.9 * L, cfg.hairHighlight ? 0.95 : 0.3);
  const H = (g) => paint(g, 'hair', { mix });
  const S = [], springs = [];
  const sy = y => (y < 0 ? y * L : y);
  const P = arr => arr.map(([x, y, z]) => [x, sy(y), z]);
  const springPart = (pivot, locks, opts) => {
    const geos = locks.map(g => { H(g); return xf(g, [-pivot[0], -pivot[1], -pivot[2]]); });
    return { pivot, geos, ...opts };
  };
  const W = cfg.wavy ?? 0.6;
  if (style === 'long') {
    S.push(H(capGeo(1.085, 0.78, 0.6 * PI)));
    S.push(H(xf(G.sph(1, 24, 16), [0, -0.12, -0.3], [0, 0, 0], [1.1, 1.05, 0.92])));
    for (const s of [-1, 1]) {
      S.push(H(lockGeo(P([[s * 0.06, 1.0, 0.5], [s * 0.45, 0.78, 0.86], [s * 0.88, 0.32, 0.72], [s * 1.1, -0.2, 0.44], [s * 1.0, -0.8, 0.42], [s * 0.88, -1.3, 0.5], [s * 0.98, -1.62, 0.62]]), { r: 0.27, flat: 0.48, tub: 26, wave: W * 0.09, waveK: 3.2 })));
      S.push(H(lockGeo(P([[s * 0.3, 1.0, 0.1], [s * 0.86, 0.62, 0.36], [s * 1.14, 0.0, 0.22], [s * 1.12, -0.7, 0.16], [s * 1.02, -1.25, 0.24], [s * 1.14, -1.58, 0.38]]), { r: 0.32, flat: 0.55, tub: 26, wave: W * 0.1, waveK: 3, wavePh: 1.2 })));
      S.push(H(lockGeo(P([[s * 0.7, 0.7, -0.35], [s * 1.08, 0.0, -0.3], [s * 1.15, -0.7, -0.4], [s * 1.02, -1.35, -0.36], [s * 1.12, -1.72, -0.24]]), { r: 0.32, flat: 0.6, tub: 24, wave: W * 0.1, waveK: 3.4, wavePh: 2 })));
    }
    if (cfg.bangs) for (const bx of [-0.52, -0.26, 0, 0.26, 0.52]) S.push(H(lockGeo([[bx * 0.6, 1.06, 0.25], [bx * 0.95, 0.88, 0.78], [bx * 1.06, 0.42, 1.0]], { r: 0.2, flat: 0.45, tub: 10 })));
    const piv = [0, 0.25, -0.72];
    const locks = [];
    for (const bx of [-0.72, -0.36, 0, 0.36, 0.72]) {
      const w = bx === 0 ? 0.06 : -0.08 * Math.sign(bx);
      locks.push(lockGeo(P([[bx * 0.8, 0.5, -0.78], [bx * 1.05, -0.2, -0.98], [bx * 1.12 + w, -0.95, -0.9], [bx * 1.08 - w, -1.6, -0.78], [bx * 1.15 + w * 0.5, -2.15, -0.66]]), { r: 0.32, flat: 0.55, tub: 24, wave: W * 0.1, waveK: 4, wavePh: bx * 3 }));
    }
    springs.push(springPart(piv, locks, { k: 60, d: 7.5, gain: 0.05, comp: 0.35, lim: [-0.1, 0.9, -0.4, 0.4] }));
  } else if (style === 'ponytail') {
    S.push(H(capGeo(1.075, 0.72, 0.62 * PI)));
    for (const s of [-1, 1]) {
      S.push(H(lockGeo([[s * 0.42, 0.62, 0.86], [s * 0.8, 0.32, 0.8], [s * 0.95, -0.1, 0.68], [s * 0.86, -0.55, 0.7]], { r: 0.11, flat: 0.5, tub: 12 })));
      S.push(H(lockGeo([[s * 0.98, 0.25, 0.35], [s * 1.06, 0.3, -0.15], [s * 0.75, 0.55, -0.7], [s * 0.2, 0.68, -0.92]], { r: 0.3, flat: 0.5, tub: 12, dir: [s, 0.2, 0] })));
    }
    const tie = [0, 0.62, -0.86];
    S.push(paint(xf(G.tor(0.15, 0.065, 8, 16), tie, [0.55, 0, 0]), cfg.scrunchie || '#24122b'));
    const L1 = [[0, 0.03, 0.06], [0, 0.22, -0.2], [0, 0.04, -0.5], [0.02, -0.45, -0.56]];
    const seg1 = springPart(tie, [lockGeo(L1.map(p => [p[0] + tie[0], p[1] + tie[1], p[2] + tie[2]]), { r: 0.32, flat: 0.75, tub: 14, prof: t => 0.75 + 0.25 * Math.sin(t * PI) })], { k: 38, d: 5, gain: 0.08, comp: 0.75, lim: [-0.5, 1.4, -0.9, 0.9] });
    const p2 = [tie[0] + 0.02, tie[1] - 0.45, tie[2] - 0.56];
    const len2 = 0.75 * L + 0.25;
    const L2 = [[0, 0.06, 0], [0, -0.4 * len2, 0.04], [0.06, -0.85 * len2, -0.06], [0.0, -1.15 * len2, 0.08], [-0.06, -1.28 * len2, 0.16]];
    const seg2 = springPart(p2, [lockGeo(L2.map(p => [p[0] + p2[0], p[1] + p2[1], p[2] + p2[2]]), { r: 0.3, flat: 0.75, tub: 16, prof: t => (0.95 - 0.1 * t) * (1 - Math.pow(t, 2.4) * 0.85) })], { k: 30, d: 4, gain: 0.1, comp: 0.85, lim: [-1.0, 1.4, -1.0, 1.0] });
    seg1.child = seg2;
    springs.push(seg1);
  } else if (style === 'bun') {
    S.push(H(capGeo(1.075, 0.78, 0.62 * PI)));
    S.push(H(xf(G.sph(0.42, 16, 12), [0, 0.98, -0.5])));
    S.push(H(xf(G.tor(0.3, 0.12, 8, 16), [0, 0.9, -0.45], [0.9, 0, 0])));
    for (const s of [-1, 1]) S.push(H(lockGeo([[s * 0.45, 0.62, 0.86], [s * 0.8, 0.35, 0.8], [s * 0.95, -0.05, 0.62], [s * 0.88, -0.4, 0.66]], { r: 0.1, flat: 0.5, tub: 10 })));
  } else { // short / messy
    S.push(H(capGeo(1.1, 0.98, 0.58 * PI)));
    S.push(H(xf(G.sph(1, 20, 12), [0, 0.45, -0.08], [0, 0, 0], [1.02, 0.6, 0.98])));
    const fr = [
      [[-0.3, 1.0, 0.1], [-0.1, 1.08, 0.55], [0.25, 0.82, 0.9], [0.42, 0.5, 1.0]],
      [[0.15, 1.05, 0.0], [0.45, 0.98, 0.5], [0.72, 0.62, 0.8], [0.8, 0.36, 0.82]],
      [[-0.45, 0.95, 0.15], [-0.62, 0.82, 0.62], [-0.78, 0.5, 0.76], [-0.84, 0.32, 0.7]],
      [[0.0, 1.05, -0.35], [0.2, 1.3, -0.45], [0.4, 1.22, -0.68]],
      [[-0.2, 1.05, -0.45], [-0.38, 1.25, -0.55], [-0.58, 1.12, -0.72]],
      [[-0.05, 1.1, 0.2], [0.05, 1.28, 0.45], [0.2, 1.2, 0.68]],
    ];
    if (!cfg.tidy) for (const l of fr) S.push(H(lockGeo(l, { r: 0.27, flat: 0.55, tub: 10 })));
  }
  return { geos: S, springs };
}

/* ------------------------------------------------------------------ hats & props */

function buildHat(name) {
  const g = [];
  let extra = null;
  const p = (geo, c, o) => g.push(paint(geo, c, o));
  const obj = new THREE.Group();
  switch (name) {
    case 'partyHat': {
      for (let i = 0; i < 5; i++) {
        const r0 = 0.5 * (1 - i / 5), r1 = 0.5 * (1 - (i + 1) / 5);
        p(xf(G.cyl(r1, r0, 0.25, 20), [0, i * 0.25 + 0.125, 0]), i % 2 ? '#f0b43c' : '#ff8fa3');
      }
      p(xf(G.sph(0.15, 12, 10), [0, 1.27, 0]), '#f8f0e3');
      p(xf(G.tor(0.5, 0.06, 6, 20), [0, 0.02, 0], [PI / 2, 0, 0]), '#f8f0e3');
      obj.position.set(0.32, 0.92, 0.05); obj.rotation.set(0.05, 0, -0.38);
      break;
    }
    case 'crown': {
      p(G.lathe([[0.6, 0], [0.67, 0], [0.67, 0.28], [0.6, 0.28], [0.6, 0]], 28), '#f0b43c');
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + PI / 2;
        p(xf(G.cone(0.13, 0.32, 8), [Math.cos(a) * 0.635, 0.42, Math.sin(a) * 0.635]), '#f0b43c');
        p(xf(G.sph(0.065, 8, 6), [Math.cos(a) * 0.635, 0.6, Math.sin(a) * 0.635]), '#fff1c2');
        p(xf(G.sph(0.08, 10, 8), [Math.cos(a) * 0.68, 0.14, Math.sin(a) * 0.68]), i % 2 ? '#8c1d40' : '#ff8fa3');
      }
      obj.position.set(0, 0.88, -0.02); obj.rotation.set(-0.15, 0, 0.14);
      break;
    }
    case 'nurseCap': {
      p(G.box(1.0, 0.34, 0.58, 0.12), '#ffffff');
      p(xf(G.box(1.04, 0.1, 0.62, 0.04), [0, -0.14, 0]), '#eef2f4');
      p(xf(G.box(0.24, 0.075, 0.03, 0.01), [0, 0.02, 0.3]), '#d92d3a');
      p(xf(G.box(0.075, 0.24, 0.03, 0.01), [0, 0.02, 0.3]), '#d92d3a');
      obj.position.set(0, 1.0, 0.22); obj.rotation.set(-0.42, 0, 0); obj.scale.setScalar(1.25);
      break;
    }
    case 'cap': case 'lxaCap': case 'conductorCap': case 'hardHat': case 'flatCap': {
      const col = { cap: '#8c1d40', lxaCap: '#45464b', conductorCap: '#1f2b4d', hardHat: '#f2c230', flatCap: '#7a6650' }[name];
      if (name === 'conductorCap') {
        p(xf(G.cyl(1.08, 1.0, 0.42, 24), [0, 0.95, 0.02]), col);
        p(xf(G.cyl(1.01, 1.01, 0.14, 24), [0, 0.8, 0.02]), '#f0b43c');
        p(xf(G.cyl(0.85, 0.85, 0.06, 20, 1, false, -PI / 2, PI), [0, 0.74, 0.75], [0.25, 0, 0], [1, 1, 0.7]), '#15151a');
        p(xf(G.sph(0.14, 10, 8), [0, 0.98, 1.05], [0, 0, 0], [1, 1, 0.5]), '#f0b43c');
      } else if (name === 'flatCap') {
        p(xf(G.sph(1.13, 24, 12), [0, 0.45, -0.02], [0, 0, 0], [1.0, 0.5, 1.05]), col, { mix: (x, y, z) => 0.3 * Math.sin(x * 20) * Math.sin(z * 20) });
        p(xf(G.cyl(0.8, 0.8, 0.07, 20, 1, false, -PI / 2, PI), [0, 0.42, 0.72], [0.35, 0, 0], [1, 1, 0.6]), col);
        p(xf(G.sph(0.12, 8, 6), [0, 0.98, 0.25], [0, 0, 0], [1, 0.5, 1]), col);
      } else if (name === 'hardHat') {
        p(xf(new THREE.SphereGeometry(1.15, 26, 12, 0, TAU, 0, PI / 2), [0, 0.2, 0], [0, 0, 0], [1.02, 0.85, 1.05]), col);
        p(xf(G.cyl(1.38, 1.4, 0.07, 26), [0, 0.22, 0.12]), col);
        p(xf(G.box(0.2, 0.12, 1.4, 0.05), [0, 1.17, 0]), '#e6b81f');
        obj.scale.setScalar(0.93);
      } else {
        p(xf(new THREE.SphereGeometry(1.13, 26, 12, 0, TAU, 0, PI / 2), [0, 0.18, -0.03], [-0.18, 0, 0], [1.02, 0.78, 1.04]), col, name === 'lxaCap' ? { mix: (x, y, z) => -0.25 + 0.25 * Math.sin(x * 9 + y * 7) } : {});
        p(xf(G.cyl(0.8, 0.8, 0.07, 22, 1, false, -PI / 2, PI), [0, 0.3, 0.78], [0.12, 0, 0], [1, 1, 0.95]), col);
        p(xf(G.sph(0.11, 8, 6), [0, 1.04, -0.2]), name === 'cap' ? '#f0b43c' : col);
        if (name === 'lxaCap') {
          const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
          const c2 = cv.getContext('2d');
          c2.font = 'bold 92px Georgia, "Times New Roman", serif'; c2.textAlign = 'center'; c2.textBaseline = 'middle';
          c2.lineWidth = 8; c2.strokeStyle = 'rgba(30,30,34,0.9)'; c2.strokeText('LXA', 128, 68);
          c2.fillStyle = '#f4f1ea'; c2.fillText('LXA', 128, 68);
          const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
          const geo = new THREE.SphereGeometry(1.145, 16, 8, PI / 2 - 0.42, 0.84, 1.0, 0.42);
          xf(geo, [0, 0.18, -0.03], [-0.18, 0, 0], [1.02, 0.78, 1.04]);
          extra = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }));
        }
      }
      break;
    }
    case 'headphones': {
      p(xf(G.tor(1.18, 0.08, 8, 26, PI), [0, 0.0, 0.0]), '#24122b');
      for (const s of [-1, 1]) {
        p(xf(G.cyl(0.36, 0.36, 0.22, 18), [s * 1.12, -0.05, 0], [0, 0, PI / 2]), '#ff8fa3');
        p(xf(G.cyl(0.3, 0.3, 0.06, 18), [s * 1.25, -0.05, 0], [0, 0, PI / 2]), '#f0b43c');
      }
      break;
    }
    default: return null;
  }
  const mesh = new THREE.Mesh(merge(g), bodyMat('none'));
  mesh.castShadow = true;
  obj.add(mesh);
  if (extra) obj.add(extra);
  obj.userData.paintMeshes = [mesh];
  return obj;
}

function buildProp(name) {
  const g = [], obj = new THREE.Group();
  const p = (geo, c) => g.push(paint(geo, c));
  let glass = null, swing = null;
  switch (name) {
    case 'coffee':
      p(xf(G.cyl(0.044, 0.034, 0.13, 16), [0, 0.035, 0.035]), '#f8f0e3');
      p(xf(G.cyl(0.0425, 0.037, 0.055, 16), [0, 0.03, 0.035]), '#c98b5a');
      p(xf(G.cyl(0.047, 0.047, 0.016, 16), [0, 0.105, 0.035]), '#5b3a2e');
      p(xf(G.cyl(0.03, 0.042, 0.014, 16), [0, 0.118, 0.035]), '#5b3a2e');
      p(xf(G.sph(0.012, 8, 6), [0, 0.035, 0.077], [0, 0, 0], [1, 1, 0.4]), '#8c1d40');
      break;
    case 'glass': {
      p(xf(G.cyl(0.032, 0.034, 0.007, 16), [0, -0.055, 0.03]), '#f4f7fa');
      p(xf(G.cyl(0.005, 0.006, 0.065, 8), [0, -0.02, 0.03]), '#f4f7fa');
      p(xf(G.lathe([[0.0, 0.0], [0.028, 0.008], [0.037, 0.035], [0.0, 0.035]], 16), [0, 0.016, 0.03]), '#8c1d40');
      const bowl = xf(G.lathe([[0.006, 0], [0.03, 0.008], [0.042, 0.04], [0.039, 0.078], [0.036, 0.09]], 18), [0, 0.012, 0.03]);
      glass = new THREE.Mesh(bowl, glassMat());
      break;
    }
    case 'phone':
      p(xf(G.box(0.08, 0.15, 0.018, 0.013), [0, 0.05, 0.03]), '#ff8fa3');
      p(xf(G.box(0.068, 0.132, 0.005, 0.005), [0, 0.05, 0.04]), '#1f1a24');
      p(xf(G.box(0.058, 0.114, 0.002, 0.002), [0, 0.05, 0.0435]), '#bfe3ff');
      p(xf(G.box(0.026, 0.026, 0.008, 0.005), [-0.015, 0.1, 0.02]), '#1f1a24');
      break;
    case 'mic':
      p(xf(G.cyl(0.013, 0.017, 0.11, 10), [0, 0.0, 0.02]), '#2a2a2e');
      p(xf(G.tor(0.019, 0.006, 6, 12), [0, 0.055, 0.02], [PI / 2, 0, 0]), '#f0b43c');
      p(xf(G.sph(0.034, 12, 10), [0, 0.085, 0.02]), '#c8c8d0');
      break;
    case 'fork':
      p(xf(G.box(0.014, 0.12, 0.006, 0.003), [0, 0.02, 0.03]), '#d6d8de');
      for (const dx of [-0.009, 0, 0.009]) p(xf(G.box(0.004, 0.04, 0.004, 0.0015), [dx, 0.1, 0.03]), '#d6d8de');
      p(xf(G.sph(0.026, 10, 8), [0, 0.1, 0.034]), '#7a4524');
      break;
    case 'balloon': {
      swing = new THREE.Object3D();
      const s = [];
      s.push(paint(xf(G.cyl(0.003, 0.003, 0.72, 4), [0, 0.36, 0]), '#f8f0e3'));
      s.push(paint(xf(G.sph(0.13, 16, 12), [0, 0.86, 0], [0, 0, 0], [1, 1.15, 1]), '#ff8fa3'));
      s.push(paint(xf(G.cone(0.022, 0.035, 8), [0, 0.715, 0]), '#ff8fa3'));
      s.push(paint(xf(G.sph(0.03, 8, 6), [-0.05, 0.92, 0.08]), '#ffd6de'));
      const m = new THREE.Mesh(merge(s), bodyMat('none')); m.castShadow = true; swing.add(m);
      obj.userData.paintMeshes = [m];
      p(xf(G.sph(0.006, 4, 4), [0, 0, 0]), '#f8f0e3');
      break;
    }
    case 'tissue': {
      const t = G.ico(0.045, 1); const pa = t.attributes.position;
      for (let i = 0; i < pa.count; i++) { const f = 0.75 + 0.5 * Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1); pa.setXYZ(i, pa.getX(i) * f, pa.getY(i) * f, pa.getZ(i) * f); }
      t.computeVertexNormals();
      p(xf(t, [0, 0.025, 0.035]), '#ffffff');
      break;
    }
    case 'bouquet':
      p(xf(G.cone(0.075, 0.17, 12, true), [0, 0.02, 0.03], [PI, 0, 0]), '#f3e2c6');
      p(xf(G.cone(0.07, 0.165, 12), [0, 0.02, 0.03], [PI, 0, 0]), '#e8d3b0');
      [['#ff8fa3', 0, 0.13, 0], ['#8c1d40', 0.04, 0.115, 0.02], ['#f0b43c', -0.04, 0.115, 0.01], ['#f8f0e3', 0.02, 0.12, -0.035], ['#ff8fa3', -0.025, 0.11, -0.03], ['#e85d75', 0.0, 0.1, 0.045]]
        .forEach(([c, x, y, z]) => p(xf(G.sph(0.033, 10, 8), [x, y, z + 0.03]), c));
      p(xf(G.sph(0.03, 8, 6), [0.06, 0.09, 0.03], [0, 0, 0.6], [1, 0.4, 0.6]), '#5f8466');
      p(xf(G.sph(0.03, 8, 6), [-0.06, 0.09, 0.03], [0, 0, -0.6], [1, 0.4, 0.6]), '#5f8466');
      break;
    case 'bun':
      p(xf(G.tor(0.04, 0.026, 8, 18), [0, 0.02, 0.055], [PI / 2 - 0.3, 0, 0], [1, 1, 0.65]), '#b5702f');
      p(xf(G.sph(0.034, 12, 8), [0, 0.03, 0.055], [-0.3, 0, 0], [1, 0.55, 1]), '#9a5a26');
      for (let i = 0; i < 7; i++) { const a = i * 0.9; p(xf(G.sph(0.006, 4, 4), [Math.cos(a) * 0.035, 0.05, 0.055 + Math.sin(a) * 0.035]), '#fffaf0'); }
      break;
    case 'chainsaw':
      p(xf(G.box(0.075, 0.075, 0.14, 0.015), [0, 0.0, 0.06]), '#e8742a');
      p(xf(G.box(0.08, 0.02, 0.1, 0.008), [0, -0.04, 0.06]), '#2a2a2e');
      p(xf(G.tor(0.035, 0.009, 6, 12, PI), [0, 0.04, 0.03], [0, PI / 2, 0]), '#2a2a2e');
      p(xf(G.box(0.014, 0.04, 0.24, 0.012), [0, -0.005, 0.24]), '#b9bdc6');
      p(xf(G.box(0.01, 0.048, 0.25, 0.012), [0, -0.005, 0.24]), '#3b3b42');
      break;
    case 'controller':
      p(xf(G.box(0.12, 0.03, 0.06, 0.013), [0.04, 0.0, 0.05]), '#2d2d35');
      p(xf(G.sph(0.025, 10, 8), [-0.015, -0.01, 0.04]), '#2d2d35');
      p(xf(G.sph(0.025, 10, 8), [0.095, -0.01, 0.04]), '#2d2d35');
      [['#ff8fa3', 0.07, 0.06], ['#f0b43c', 0.08, 0.05], ['#5f8466', 0.07, 0.04], ['#6fa8dc', 0.06, 0.05]].forEach(([c, x, z]) => p(xf(G.sph(0.006, 6, 4), [x, 0.017, z]), c));
      p(xf(G.box(0.022, 0.006, 0.007, 0.002), [0.01, 0.017, 0.05]), '#55555e');
      p(xf(G.box(0.007, 0.006, 0.022, 0.002), [0.01, 0.017, 0.05]), '#55555e');
      break;
    case 'hammer':
      p(xf(G.cyl(0.009, 0.012, 0.17, 8), [0, 0.035, 0.02]), '#c08a50');
      p(xf(G.box(0.028, 0.03, 0.075, 0.006), [0, 0.12, 0.03]), '#6a6d75');
      break;
    case 'camera':
      p(xf(G.box(0.1, 0.065, 0.045, 0.012), [0.0, 0.03, 0.04]), '#2a2a30');
      p(xf(G.cyl(0.024, 0.026, 0.035, 14), [0.01, 0.03, 0.075], [PI / 2, 0, 0]), '#3c3c44');
      p(xf(G.cyl(0.017, 0.017, 0.004, 14), [0.01, 0.03, 0.094], [PI / 2, 0, 0]), '#7da2c8');
      p(xf(G.box(0.02, 0.012, 0.012, 0.004), [-0.03, 0.068, 0.035]), '#d92d3a');
      break;
    case 'spatula':
      p(xf(G.cyl(0.011, 0.013, 0.075, 8), [0, 0.01, 0.025]), '#2f2f35');
      p(xf(G.cyl(0.012, 0.012, 0.012, 8), [0, 0.052, 0.025]), '#c0c0c8');
      p(xf(G.box(0.055, 0.065, 0.004, 0.002), [0, 0.09, 0.025]), '#c9ccd2');
      p(xf(G.sph(0.018, 8, 6), [0.01, 0.115, 0.029], [0, 0, 0], [1.4, 0.6, 0.4]), '#f6f2ea');
      break;
    case 'puck':
      p(xf(G.cyl(0.042, 0.042, 0.024, 20), [0, 0.0, 0.045]), '#c8303a');
      p(xf(G.cyl(0.032, 0.032, 0.006, 20), [0, 0.014, 0.045]), '#d6d8de');
      break;
    default: return null;
  }
  const PSCALE = { hammer: 1.5, chainsaw: 1.35, spatula: 1.5, puck: 1.3, fork: 1.3, mic: 1.2, camera: 1.2, tissue: 1.3 };
  if (PSCALE[name]) for (const geo of g) geo.scale(PSCALE[name], PSCALE[name], PSCALE[name]);
  if (g.length) { const m = new THREE.Mesh(merge(g), bodyMat('none')); m.castShadow = true; obj.add(m); obj.userData.paintMeshes = [...(obj.userData.paintMeshes || []), m]; }
  if (glass) obj.add(glass);
  if (swing) { obj.add(swing); obj.userData.swing = swing; }
  return obj;
}

/* ------------------------------------------------------------------ presets */

const NPC_SCALE = 0.82;
const BASE = {
  height: 1.7, skin: '#f1c7a5', hair: 'short', hairColor: '#6b4a32', hairHighlight: null, hairLength: 1,
  top: '#c7a27a', bottom: '#3d4a63', shoes: '#f4f1ea', sole: '#d8d2c6', inner: '#f8f0e3', coat: null,
  beard: false, glasses: false, eyeColor: '#6b4428', lashes: false, browColor: null, freckles: false,
  chunky: false, collar: 'crew', buttons: null, toolBelt: false, boots: null, wideLeg: false, hood: false, pattern: 'none',
  hipY: 0.32, torsoW: 1.0, headR: 0.195, earrings: false, necklace: false, watch: false, hat: null, prop: null, expression: 'happy',
};
export const PRESETS = {
  maja: {
    name: 'maja', heightM: 1.6, skin: '#efc19a', hair: 'long', hairColor: '#5a3a24', hairHighlight: '#c99a5e', hairLength: 1,
    top: '#efe4cf', bottom: '#a9c0d8', shoes: '#fbfaf6', sole: '#e9e2d6', chunky: true, pattern: 'knit', wideLeg: true,
    eyeColor: '#7a4a24', lashes: true, browColor: '#3a2416', browW: 8.5, freckles: true, mouthW: 1.08,
    earrings: true, necklace: true, watch: true, wavy: 1.2, hipY: 0.345, torsoW: 0.97, headR: 0.19, scrunchie: '#8c1d40',
  },
  mattias: {
    name: 'mattias', height: 1.8, hair: 'short', hairColor: '#8a6b45', hairHighlight: '#c2a070', skin: '#f0c4a2',
    top: '#727a4f', bottom: '#33343c', shoes: '#f2efe8', sole: '#d9d3c8', collar: 'shirt', inner: '#727a4f',
    beard: true, eyeColor: '#5d7a8c', browColor: '#6b5033', torsoW: 1.06, hipY: 0.32,
  },
  conductor: {
    name: 'conductor', height: 1.72, hair: 'short', tidy: true, hairColor: '#7d6b5d', skin: '#f0c3a0',
    top: '#22305a', bottom: '#22305a', shoes: '#2a2a30', sole: '#1a1a1e', collar: 'shirt', inner: '#f8f0e3', buttons: '#f0b43c',
    beard: 'mustache', beardColor: '#8a7a6c', eyeColor: '#4d6a8a', torsoW: 1.12, hat: 'conductorCap',
  },
  maria: {
    name: 'maria', height: 1.65, hair: 'long', hairLength: 0.5, hairColor: '#8a6440', hairHighlight: '#c9a275',
    top: '#d98e7f', inner: '#f8f0e3', collar: 'cardigan', buttons: '#f8f0e3', bottom: '#5c5470', shoes: '#8a6a50', sole: '#5a4636',
    lashes: true, eyeColor: '#6b5a3a', browColor: '#6b4e33', glasses: true, earrings: true, prop: ['right', 'phone'],
  },
  patrik: {
    name: 'patrik', height: 1.78, hair: 'short', tidy: true, hairColor: '#9b9188', skin: '#eab792',
    top: '#b23a2e', pattern: 'check', collar: 'shirt', inner: '#b23a2e', bottom: '#5b5446', boots: '#3f5a3a',
    beard: true, beardColor: '#a39a90', eyeColor: '#5d7a8c', browColor: '#8a8178', torsoW: 1.14, hat: 'flatCap',
  },
  syster: {
    name: 'syster', height: 1.72, hair: 'ponytail', hairColor: '#5e3f2a', hairHighlight: '#b88a5a', hairLength: 0.85,
    top: '#7f9a80', bottom: '#6d6152', shoes: '#7a5a3e', sole: '#4a3626', toolBelt: true,
    lashes: true, eyeColor: '#6b4428', browColor: '#3e2a1c', earrings: true, scrunchie: '#f0b43c',
  },
  sebastian: {
    name: 'sebastian', height: 1.86, hair: 'short', tidy: true, hairColor: '#4a3426', top: '#4d5a6e', hood: true,
    bottom: '#3d4a63', shoes: '#2c2c33', sole: '#e9e4da', toolBelt: true, beard: true, beardColor: '#4a3426',
    eyeColor: '#5a4630', browColor: '#3a281c', torsoW: 1.1, hat: 'cap',
  },
  friend1: { name: 'friend1', height: 1.66, hair: 'long', bangs: true, hairColor: '#d4ac6c', hairHighlight: '#f0d7a0', hairLength: 0.85, top: '#ff8fa3', bottom: '#3d4a63', lashes: true, eyeColor: '#5d7a8c', browColor: '#9a7a50', earrings: true },
  friend2: { name: 'friend2', height: 1.7, hair: 'long', hairColor: '#8a6446', hairHighlight: '#b78d63', hairLength: 0.95, top: '#5f8466', bottom: '#d8cbb3', lashes: true, eyeColor: '#6b4428', browColor: '#5a3e28' },
  friend3: { name: 'friend3', height: 1.64, hair: 'ponytail', hairColor: '#2a1d16', hairHighlight: '#4a3426', top: '#8c1d40', bottom: '#2c2c33', lashes: true, eyeColor: '#3a2416', browColor: '#1e1410', scrunchie: '#f0b43c', earrings: true },
  nurse: { name: 'nurse', height: 1.66, hair: 'bun', hairColor: '#795744', hairHighlight: '#a07a5a', top: '#9cc9c5', bottom: '#9cc9c5', collar: 'v', lashes: true, hat: 'nurseCap' },
  fan: { name: 'fan', height: 1.62, hair: 'ponytail', hairColor: '#61483f', hairHighlight: '#8a6a58', hairLength: 0.7, top: '#d892ab', bottom: '#76889f', lashes: true, scrunchie: '#f8f0e3' },
};
PRESETS.sister = PRESETS.syster;

/* ------------------------------------------------------------------ body builder */

function resolveCfg(o) {
  const c = { ...BASE, ...o };
  c.browColor = c.browColor || c.hairColor;
  c.beardColor = c.beardColor || c.hairColor;
  c.hairHighlight = c.hairHighlight || null;
  c.H = c.heightM || (c.height * NPC_SCALE);
  c.face = {
    eyeTh: 100, eyePhi: 22.5, eyeW: c.lashes ? 17 : 15, eyeH: c.lashes ? 21 : 18.5,
    eyeColor: c.eyeColor, eyeDark: '#24140d', eyeLight: lightenHex(c.eyeColor, 0.35), pupil: '#160c08',
    lashColor: '#24140e', lashW: c.lashes ? 6 : 5, lashes: c.lashes, browColor: c.browColor, browW: c.browW || (c.lashes ? 6.5 : 7.5),
    blushColor: '#ff7d93', blushAmt: c.lashes ? 1 : 0.65, mouthW: c.mouthW || 1, freckles: c.freckles,
    beard: c.beard, beardColor: c.beardColor, glasses: c.glasses,
  };
  return c;
}
function lightenHex(hex, a) { const c = new THREE.Color(hex); c.lerp(new THREE.Color('#e8b878'), a); return '#' + c.getHexString(); }

class Character {
  constructor(cfg) {
    this.cfg = cfg;
    this.dims = makeDims(cfg);
    this.anims = compileAnims(this.dims);
    this.height = cfg.H * 1.0;
    this.sitHeight = (this.dims.hipY - this.dims.thigh - 0.035) * cfg.H; // seat surface height when play('sit') (feet stay at y=0)
    this.group = new THREE.Group();
    this.group.name = cfg.name || 'person';
    this.props = { left: null, right: null };
    this._temp = { left: false, right: false };
    this._propObj = { left: null, right: null };
    this._propCache = {};
    this._hatCache = {};
    this.hat = null;
    this.paintMeshes = [];
    this.springs = [];
    this.time = Math.random() * 10;
    this.baseExpr = cfg.expression || 'happy';
    this.lookTarget = null;
    this._look = { yaw: 0, pitch: 0 };
    this._blink = { next: 1 + Math.random() * 3, t: -1, dbl: false };
    this._faceKey = '';
    this._pose = new Float32Array(NEU);
    this._last = new Float32Array(NEU);
    this._from = new Float32Array(NEU);
    this._blendT = 1; this._blendDur = 0.2;
    this._walk = null;
    this._pops = [];
    this._puffs = [];
    this._yawPrev = null; this.yawRate = 0;
    this._initPalette();
    this._build();
    this.recolor();
    this.anim = null;
    this.play('idle', { loop: true });
    if (cfg.hat) this.setHat(cfg.hat, true);
    if (cfg.prop) this.setProp(cfg.prop[0], cfg.prop[1], true);
    this.update(0);
  }

  _initPalette() {
    const c = this.cfg, C = h => (h ? new THREE.Color(h) : null);
    this.pal = {
      skin: C(c.skin), hair: C(c.hairColor), hairHi: C(c.hairHighlight || c.hairColor), top: C(c.top), bottom: C(c.bottom),
      shoe: C(c.shoes), sole: C(c.sole), inner: C(c.inner), coat: C(c.coat), boot: C(c.boots || c.shoes),
      lip: C('#d9727f'), beard: C(c.beardColor || c.hairColor),
    };
  }
  _color(entry, m, out) {
    if (entry.fixed) out.copy(entry.fixed);
    else {
      const pal = this.pal;
      let b = entry.base;
      if (b === 'sleeve') b = pal.coat ? 'coat' : 'top';
      const base = pal[b] || pal.top;
      out.copy(base);
      if (b === 'hair') { if (m > 0) out.lerp(pal.hairHi, m); else if (m < 0) out.multiplyScalar(1 + m * 0.45); m = 0; }
    }
    if (m > 0 && !(entry.base === 'hair')) out.multiplyScalar(1 - m * 0.25);
    else if (m < 0 && entry.base !== 'hair') out.multiplyScalar(1 + m * 0.4);
    if (entry.mul !== 1) out.multiplyScalar(entry.mul);
    return out;
  }
  recolor() {
    const tmp = new THREE.Color();
    for (const mesh of this.paintMeshes) {
      const g = mesh.geometry, k = g.attributes.ckey, m = g.attributes.cmix, col = g.attributes.color;
      if (!k) continue;
      for (let i = 0; i < k.count; i++) {
        this._color(REG[k.array[i]], m.array[i], tmp);
        col.setXYZ(i, tmp.r, tmp.g, tmp.b);
      }
      col.needsUpdate = true;
    }
  }
  _mesh(geo, parent, mat) {
    const mesh = new THREE.Mesh(geo, mat || this.mat);
    mesh.castShadow = true; mesh.receiveShadow = false;
    parent.add(mesh);
    this.paintMeshes.push(mesh);
    return mesh;
  }

  _build() {
    const c = this.cfg, d = this.dims, W = d.torsoW;
    this.mat = bodyMat(c.pattern || 'none');
    const rig = this.rig = new THREE.Group(); rig.scale.setScalar(c.H); this.group.add(rig);
    const root = this.root = new THREE.Object3D(); rig.add(root);
    const hips = this.hips = new THREE.Object3D(); hips.position.y = d.hipY; root.add(hips);
    const spine = this.spine = new THREE.Object3D(); hips.add(spine);
    const pat = c.pattern !== 'none';

    // --- torso
    const T = [];
    const prof = c.chunky
      ? [[0.096, -0.035], [0.1, -0.01], [0.097, 0.05], [0.093, 0.12], [0.094, 0.17], [0.083, 0.215], [0.058, 0.25], [0.036, 0.268], [0.0, 0.274]]
      : [[0.088, -0.03], [0.09, 0.0], [0.087, 0.07], [0.086, 0.14], [0.089, 0.18], [0.078, 0.222], [0.052, 0.255], [0.032, 0.27], [0.0, 0.274]];
    T.push(paint(xf(G.lathe(prof, 24), [0, 0, 0], [0, 0, 0], [W, 1, 0.8 * W]), 'top', { pat: pat ? 1.5 : false }));
    T.push(paint(xf(G.sph(1, 18, 12), [0, -0.012, -0.003], [0, 0, 0], [0.082 * W, 0.05, 0.064 * W]), 'bottom'));
    const hemR = (c.chunky ? 0.098 : 0.089) * W;
    if (c.chunky) T.push(paint(xf(G.tor(1, 0.13, 6, 24), [0, -0.03, 0], [PI / 2, 0, 0], [hemR, hemR * 0.8, 0.11]), 'top*0.92'));
    // neck
    T.push(paint(xf(G.cyl(0.03, 0.034, 0.07, 10), [0, 0.282, 0]), 'skin'));
    // collar
    if (c.collar === 'shirt') {
      for (const s of [-1, 1]) T.push(paint(xf(G.box(0.045, 0.012, 0.035, 0.005), [s * 0.022, 0.262, 0.03], [0.5, s * 0.5, s * 0.5]), 'inner*1.05'));
      T.push(paint(xf(G.tor(0.034, 0.008, 6, 16), [0, 0.262, 0], [PI / 2, 0, 0], [1, 0.85, 1]), 'inner'));
    } else if (c.collar === 'cardigan') {
      T.push(paint(xf(G.box(0.055 * W, 0.24, 0.012, 0.005), [0, 0.12, 0.071 * W]), 'inner'));
      T.push(paint(xf(G.tor(0.034, 0.01, 6, 16), [0, 0.262, 0], [PI / 2, 0, 0], [1, 0.85, 1]), 'inner'));
    } else if (c.collar === 'v') {
      T.push(paint(xf(G.cone(0.03, 0.06, 3), [0, 0.235, 0.064], [PI, 0, 0], [1, 1, 0.2]), 'skin'));
    } else {
      T.push(paint(xf(G.tor(0.036, c.chunky ? 0.013 : 0.008, 8, 18), [0, 0.262, 0], [PI / 2, 0, 0], [1, 0.85, 1]), c.chunky ? 'top*0.94' : 'top*0.95'));
    }
    if (c.hood) T.push(paint(xf(G.tor(0.06, 0.028, 8, 16, PI), [0, 0.255, -0.045], [PI / 2 + 0.6, 0, PI], [1.1, 1, 1]), 'top*0.88'));
    if (c.buttons) for (let i = 0; i < 4; i++) T.push(paint(xf(G.sph(0.0075, 6, 4), [0, 0.05 + i * 0.05, (0.072 + (i > 2 ? -0.004 : 0)) * W]), c.buttons));
    if (c.toolBelt) {
      T.push(paint(xf(G.tor(1, 0.14, 6, 24), [0, 0.0, 0], [PI / 2, 0, 0], [0.093 * W, 0.075 * W, 0.11]), '#6b4a2e'));
      for (const s of [-1, 1]) T.push(paint(xf(G.box(0.04, 0.05, 0.03, 0.008), [s * 0.075 * W, -0.025, 0.04], [0, s * 0.6, 0]), '#8a6038'));
      T.push(paint(xf(G.cyl(0.006, 0.006, 0.06, 6), [-0.085 * W, -0.03, 0.055]), '#c08a50'));
    }
    if (c.necklace) {
      T.push(paint(xf(G.tor(0.04, 0.0028, 4, 24), [0, 0.252, 0.012], [1.25, 0, 0], [1, 1, 1]), '#e8b64c'));
      T.push(paint(xf(G.sph(0.0065, 6, 4), [0, 0.226, 0.05]), '#f0c25a'));
    }
    this.torso = this._mesh(merge(T), spine);

    // coat (hidden until setOutfit({coat}))
    const coatProf = [[0.135 * 1.0, -0.21], [0.126, -0.12], [0.11, -0.02], [0.104, 0.07], [0.104, 0.15], [0.096, 0.2], [0.07, 0.24], [0.045, 0.265]];
    const CG = [paint(xf(G.lathe(coatProf, 24), [0, 0, 0], [0, 0, 0], [W, 1, 0.84 * W]), 'coat')];
    CG.push(paint(xf(G.tor(0.046, 0.016, 6, 16), [0, 0.262, 0.0], [PI / 2 - 0.2, 0, 0], [1.05, 0.9, 1]), 'coat*0.9'));
    CG.push(paint(xf(G.tor(1, 0.12, 6, 24), [0, 0.03, 0], [PI / 2, 0, 0], [0.107 * W, 0.09 * W, 0.1]), 'coat*0.85'));
    for (let i = 0; i < 3; i++) CG.push(paint(xf(G.sph(0.008, 6, 4), [0.02, 0.08 + i * 0.05, 0.088 * W]), 'coat*0.6'));
    this.coatMesh = this._mesh(merge(CG), spine);
    this.coatMesh.visible = !!c.coat;

    // --- head
    const neck = this.neck = new THREE.Object3D(); neck.position.y = d.neckY; spine.add(neck);
    const head = this.head = new THREE.Object3D(); neck.add(head);
    const hg = this.headG = new THREE.Group(); hg.position.set(0, d.headR * 0.92, 0.004); hg.scale.setScalar(d.headR); head.add(hg);
    this.hatAnchor = new THREE.Object3D(); hg.add(this.hatAnchor);
    this._buildHead();

    // face canvas
    this.faceCanvas = document.createElement('canvas'); this.faceCanvas.width = FW; this.faceCanvas.height = FH;
    this.faceCtx = this.faceCanvas.getContext('2d');
    this.faceTex = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTex.colorSpace = THREE.SRGBColorSpace; this.faceTex.anisotropy = 4;
    const fgeo = new THREE.SphereGeometry(1.012, 32, 20, PI / 2 - (75 * PI) / 180, (150 * PI) / 180, (50 * PI) / 180, (95 * PI) / 180);
    xf(fgeo, [0, 0, 0], [0, 0, 0], [1.04, 0.96, 0.98]);
    this.faceMesh = new THREE.Mesh(fgeo, new THREE.MeshStandardMaterial({ map: this.faceTex, transparent: true, roughness: 0.6, emissive: '#ffffff', emissiveMap: this.faceTex, emissiveIntensity: 0.12, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false }));
    this.faceMesh.renderOrder = 1;
    hg.add(this.faceMesh);

    // --- arms
    this.sh = {}; this.el = {}; this.hand = {}; this.propPivot = {}; this.bic = {};
    for (const [side, s] of [['l', 1], ['r', -1]]) {
      const sh = new THREE.Object3D(); sh.position.set(s * d.shX, d.shY, 0); sh.rotation.order = 'ZXY'; spine.add(sh);
      const ra = c.chunky ? 0.037 : 0.032;
      const U = [];
      U.push(paint(xf(G.cap(ra, d.armU + 0.012 - 2 * ra, 4, 12), [0, -(d.armU) / 2, 0]), 'sleeve', { pat: pat ? 1 : false }));
      U.push(paint(xf(G.sph(ra * 1.12, 12, 10), [0, -0.004, 0]), 'sleeve', { pat: pat ? 0.3 : false }));
      this._mesh(merge(U), sh);
      const bic = this._mesh(paint(xf(G.sph(ra * 0.95, 12, 10), [0, -d.armU * 0.5, ra * 0.35], [0, 0, 0], [1, 1.25, 1]), 'sleeve'), sh);
      bic.visible = false; this.bic[side] = bic;
      const el = new THREE.Object3D(); el.position.y = -d.armU; sh.add(el);
      const F = [];
      const rf = c.chunky ? 0.036 : 0.03;
      F.push(paint(xf(G.cyl(rf * 0.9, rf * 1.1, d.armF - 0.03, 12), [0, -(d.armF - 0.03) / 2, 0]), 'sleeve', { pat: pat ? 1 : false }));
      F.push(paint(xf(G.sph(rf * 0.92, 10, 8), [0, 0, 0]), 'sleeve'));
      if (c.chunky) F.push(paint(xf(G.tor(rf * 1.0, 0.009, 6, 14), [0, -(d.armF - 0.034), 0], [PI / 2, 0, 0]), 'top*0.92'));
      F.push(paint(xf(G.sph(0.031, 12, 10), [0, -d.armF, 0.003], [0, 0, 0], [0.95, 1.05, 0.8]), 'skin'));
      F.push(paint(xf(G.sph(0.012, 8, 6), [-s * 0.02, -d.armF + 0.008, 0.017], [0, 0, 0], [1, 1.3, 1]), 'skin'));
      if (c.watch && side === 'l') {
        F.push(paint(xf(G.tor(0.026, 0.006, 6, 14), [0, -d.armF + 0.026, 0], [PI / 2, 0, 0]), '#1a1a1e'));
        F.push(paint(xf(G.box(0.022, 0.012, 0.026, 0.004), [s * 0.026, -d.armF + 0.026, 0], [0, 0, PI / 2]), '#1a1a1e'));
      }
      this._mesh(merge(F), el);
      const hand = new THREE.Object3D(); hand.position.set(0, -d.armF, 0); el.add(hand);
      const pp = new THREE.Object3D(); hand.add(pp);
      this.sh[side] = sh; this.el[side] = el; this.hand[side] = hand; this.propPivot[side === 'l' ? 'left' : 'right'] = pp;
    }
    // pointing finger (right)
    this.finger = this._mesh(paint(xf(G.cap(0.0095, 0.03, 3, 6), [0.0, -0.035, 0.022], [-0.3, 0, 0]), 'skin'), this.hand.r);
    this.finger.visible = false;

    // --- legs
    this.hip = {}; this.knee = {};
    for (const [side, s] of [['l', 1], ['r', -1]]) {
      const hp = new THREE.Object3D(); hp.position.set(s * 0.05 * W, -0.005, 0); hp.rotation.order = 'ZXY'; hips.add(hp);
      const rT = 0.05, rK = 0.046;
      const Th = [paint(xf(G.cyl(rT, rK, d.thigh + 0.02, 12), [0, -d.thigh / 2, 0]), 'bottom'), paint(xf(G.sph(rT, 12, 8), [0, 0, 0]), 'bottom')];
      this._mesh(merge(Th), hp);
      const kn = new THREE.Object3D(); kn.position.y = -d.thigh; hp.add(kn);
      const S = [paint(xf(G.sph(rK * 0.985, 12, 8), [0, 0, 0]), 'bottom')];
      if (c.boots) {
        S.push(paint(xf(G.cyl(rK * 0.95, rK * 0.95, d.shin * 0.45, 12), [0, -d.shin * 0.3, 0]), 'bottom'));
        S.push(paint(xf(G.cyl(0.052, 0.054, d.shin * 0.6, 12), [0, -d.shin * 0.72, 0.0]), 'boot'));
        S.push(paint(xf(G.box(0.072, 0.05, 0.12, 0.022), [0, -d.shin - 0.006, 0.022]), 'boot'));
        S.push(paint(xf(G.box(0.076, 0.014, 0.124, 0.006), [0, -d.shin - 0.024, 0.022]), 'boot*0.6'));
      } else {
        const rb = c.wideLeg ? 0.066 : 0.045, L = d.shin + 0.006;
        S.push(paint(xf(G.lathe([[rK * 0.97, 0], [rK * 0.97, -L * 0.3], [lerp(rK, rb, 0.5), -L * 0.7], [rb, -L], [rb * 0.9, -L - 0.002]], 16), [0, 0.004, 0]), 'bottom'));
        S.push(paint(xf(G.box(0.068, 0.046, 0.118, 0.02), [0, -d.shin - 0.007, 0.024]), 'shoe'));
        S.push(paint(xf(G.box(0.072, 0.014, 0.122, 0.006), [0, -d.shin - 0.024, 0.024]), 'sole'));
      }
      this._mesh(merge(S), kn);
      this.hip[side] = hp; this.knee[side] = kn;
    }

    // blob shadow + hit proxy
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false, opacity: 0.85 }));
    sm.rotation.x = -PI / 2; sm.position.y = 0.004; sm.scale.setScalar(0.42 * c.H); sm.renderOrder = -1;
    this.shadow = sm; this.group.add(sm);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.08, 0.42), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.54; hit.visible = false; hit.name = 'hitProxy'; rig.add(hit);
    this.hitProxy = hit;

    // sneeze puffs
    const im = new THREE.InstancedMesh(G.ico(1, 1), puffMat(), 16);
    im.count = 0; im.frustumCulled = false; im.visible = false; rig.add(im);
    this.puffMesh = im;
  }

  _buildHead() {
    const c = this.cfg, hg = this.headG;
    if (this.headMesh) { hg.remove(this.headMesh); this.paintMeshes = this.paintMeshes.filter(m => m !== this.headMesh); this.headMesh.geometry.dispose(); }
    for (const sp of this.springs) { sp.pivot.parent.remove(sp.pivot); }
    this.paintMeshes = this.paintMeshes.filter(m => !m.userData.spring);
    this.springs = [];
    const Hd = [];
    Hd.push(paint(xf(G.sph(1, 28, 20), [0, 0, 0], [0, 0, 0], [1.04, 0.96, 0.98]), 'skin'));
    for (const s of [-1, 1]) {
      Hd.push(paint(xf(G.sph(0.2, 10, 8), [s * 1.0, -0.12, 0.02], [0, 0, 0], [0.6, 1, 0.8]), 'skin'));
      if (c.earrings) Hd.push(paint(xf(G.tor(0.11, 0.028, 6, 14), [s * 1.06, -0.36, 0.06], [0, PI / 2, 0]), '#e8b64c'));
    }
    Hd.push(paint(xf(G.sph(0.06, 10, 8), [0, -0.24, 0.965], [0, 0, 0], [1.15, 0.8, 0.6]), 'skin'));
    if (c.beard === true) {
      const bg = new THREE.SphereGeometry(1.022, 28, 8, PI / 2 - 1.25, 2.5, 2.2, 0.75);
      Hd.push(paint(xf(bg, [0, 0, 0], [0, 0, 0], [1.04, 0.96, 0.98]), 'beard'));
    }
    const hair = buildHair(c);
    Hd.push(...hair.geos);
    this.headMesh = this._mesh(merge(Hd), hg);
    const mk = (spec, parent) => {
      const piv = new THREE.Object3D(); piv.position.set(spec.pivot[0], spec.pivot[1], spec.pivot[2]); parent.add(piv);
      const m = this._mesh(merge(spec.geos), piv); m.userData.spring = true;
      const st = { pivot: piv, ax: 0, az: 0, vx: 0, vz: 0, k: spec.k, d: spec.d, gain: spec.gain, comp: spec.comp, lim: spec.lim, prev: new V3(), vel: new V3(), acc: new V3(), init: false };
      this.springs.push(st);
      if (spec.child) {
        const cs = spec.child;
        const off = [cs.pivot[0] - spec.pivot[0], cs.pivot[1] - spec.pivot[1], cs.pivot[2] - spec.pivot[2]];
        mk({ ...cs, pivot: off }, piv);
      }
    };
    for (const sp of hair.springs) mk(sp, hg);
  }

  /* ---------------- public API */

  setHair(style, opts = {}) { Object.assign(this.cfg, { hair: style }, opts); this._buildHead(); this.recolor(); if (this.hat) { const h = this.hat; this.hat = null; this.setHat(h, true); } }

  setExpression(name) { this.baseExpr = EXPR[name] ? name : 'happy'; }

  lookAt(pos) { this.lookTarget = pos ? pos.clone() : null; }

  setOutfit(o = {}) {
    if (o.top !== undefined && o.top) this.pal.top = new THREE.Color(o.top);
    if (o.bottom !== undefined && o.bottom) this.pal.bottom = new THREE.Color(o.bottom);
    if (o.shoes) this.pal.shoe = new THREE.Color(o.shoes);
    if (o.coat !== undefined) { this.pal.coat = o.coat ? new THREE.Color(o.coat) : null; this.coatMesh.visible = !!o.coat; }
    this.recolor();
  }

  setHat(name, instant = false) {
    if (this._hatObj) { this.hatAnchor.remove(this._hatObj); this._hatObj = null; }
    this.hat = name || null;
    if (!name) return;
    let h = this._hatCache[name];
    if (h === undefined) { h = this._hatCache[name] = buildHat(name); if (h) this._registerPaint(h); }
    if (!h) { console.warn('maja.js: unknown hat', name); this.hat = null; return; }
    this.hatAnchor.add(h); this._hatObj = h;
    if (!instant) this._pop(h);
  }

  setProp(hand, name, instant = false) {
    hand = hand === 'left' || hand === 'l' ? 'left' : 'right';
    const pv = this.propPivot[hand];
    if (this._propObj[hand]) { pv.remove(this._propObj[hand]); this._propObj[hand] = null; }
    this.props[hand] = name || null; this._temp[hand] = false;
    if (!name) return;
    const key = hand + ':' + name;
    let o = this._propCache[key];
    if (o === undefined) { o = this._propCache[key] = buildProp(name); if (o) { this._registerPaint(o); if (o.userData.swing) o.userData.spring = { pivot: o.userData.swing, ax: 0, az: 0, vx: 0, vz: 0, k: 18, d: 2.5, gain: 0.08, comp: 1, lim: [-1.2, 1.2, -1.2, 1.2], float: true, prev: new V3(), vel: new V3(), acc: new V3(), init: false }; } }
    if (!o) { console.warn('maja.js: unknown prop', name); this.props[hand] = null; return; }
    if (hand === 'left') o.scale.x = -1; // mirror for the left hand
    pv.add(o); this._propObj[hand] = o;
    if (!instant) this._pop(o, hand === 'left' ? -1 : 1);
  }
  _registerPaint(obj) {
    const list = obj.userData.paintMeshes || [];
    for (const m of list) { if (!this.paintMeshes.includes(m)) this.paintMeshes.push(m); }
    this.recolor();
  }
  _pop(obj, sx = 1) { obj.scale.set(0.001 * sx, 0.001, 0.001); this._pops.push({ obj, t: 0, sx }); }

  play(name, opts = {}) {
    let def = this.anims[name];
    opts = Object.fromEntries(Object.entries(opts || {}).filter(([, v]) => v !== undefined));
    if (def && def.alias) { opts = { ...def.opts, ...opts }; def = this.anims[def.alias]; }
    if (!def) { console.warn('maja.js: unknown animation', name); return Promise.resolve(); }
    this._finish(false);
    const a = { name, def, t: 0, speed: opts.speed ?? 1, loop: !!(opts.loop ?? false) || !!def.hold, opts, fired: new Set(), done: false };
    const pr = new Promise(r => (a.resolve = r));
    this._from.set(this._last); this._blendT = 0; this._blendDur = def.blendIn ?? 0.22;
    if (def.prop) { const [hand, pn] = def.prop; if (!this.props[hand]) { this.setProp(hand, pn); this._temp[hand] = true; a.tempProp = hand; } }
    if (name === 'sit' || (name === 'gaming' && opts.seated)) this.sitting = true; else this.sitting = false;
    this.anim = a;
    if (name === 'idle' && !opts.loop) { a.done = true; a.resolve(); }
    return pr;
  }
  _finish(natural) {
    const a = this.anim; if (!a || a.done) return;
    a.done = true;
    if (a.tempProp && this._temp[a.tempProp]) this.setProp(a.tempProp, null);
    if (a.def.endZ && natural) {
      // bake comedic recoil into group position so returning to idle doesn't slide back
      const off = new V3(0, 0, a.def.endZ * this.cfg.H).applyQuaternion(this.group.quaternion);
      this.group.position.add(off);
      this._last[I.z] -= a.def.endZ; this._pose[I.z] -= a.def.endZ;
    }
    a.resolve();
  }

  walkTo(pos, speed = 1.1, o = {}) {
    if (this._walk) { this._walk.resolve(); this._walk = null; }
    const target = pos.clone();
    if (this.group.parent) { this.group.parent.updateMatrixWorld(); this.group.parent.worldToLocal(target); }
    target.y = this.group.position.y;
    let resolve; const pr = new Promise(r => (resolve = r));
    const animName = o.anim || (speed > 2.0 ? 'run' : 'walk');
    const nat = (this.anims[animName].natural || 1) * this.cfg.H / 1.6;
    this.play(animName, { loop: true, speed: clamp(speed / nat, 0.6, 1.8) });
    this._walk = { target, speed, resolve, anim: this.anim };
    return pr;
  }

  // world-space point just above the head (for speech bubbles / hearts)
  getHeadTop(target = new V3()) { this.group.updateMatrixWorld(true); return this.headG.localToWorld(target.set(0, 1.35, 0)); }
  getHandPosition(hand = 'right', target = new V3()) { this.group.updateMatrixWorld(true); return this.hand[hand === 'left' ? 'l' : 'r'].getWorldPosition(target); }

  aimAngles() {
    const v = this._aimTmp || (this._aimTmp = new V3());
    if (!this.lookTarget) return { yaw: 0, pitch: 0 };
    v.copy(this.lookTarget); this.root.worldToLocal(v);
    const sx = this.dims.shX * -1, sy = this.dims.hipY + this.dims.shY;
    const dx = v.x - sx, dy = v.y - sy, dz = v.z;
    return { yaw: Math.atan2(dx, Math.max(0.05, dz)), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
  }

  puff(n = 10, power = 1) {
    this.group.updateMatrixWorld(true);
    const m = new V3(0, -0.5, 1.1); this.headG.localToWorld(m); this.rig.worldToLocal(m);
    const f = new V3(0, 0.1, 1).applyEuler(new THREE.Euler(0, this.root.rotation.y, 0));
    for (let i = 0; i < n; i++) {
      const sp = new V3((Math.random() - 0.5) * 0.9, (Math.random() - 0.3) * 0.7, (Math.random() - 0.5) * 0.4);
      this._puffs.push({ p: m.clone().addScaledVector(f, 0.03), v: f.clone().add(sp).multiplyScalar((0.7 + Math.random() * 0.9) * power), age: 0, life: 0.7 + Math.random() * 0.5 * power, size: (0.03 + Math.random() * 0.035) * (0.5 + 0.5 * power) });
    }
    if (this._puffs.length > 16) this._puffs.splice(0, this._puffs.length - 16);
  }
  kick() { /* reserved hook for camera shake etc. */ }

  /* ---------------- per-frame */

  update(dt) {
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    this.time += dt;
    const a = this.anim, def = a.def;
    const p = this._pose;
    a.t += dt * a.speed;
    // events
    if (def.ev) for (let i = 0; i < def.ev.length; i++) if (!a.fired.has(i) && a.t >= def.ev[i][0]) { a.fired.add(i); def.ev[i][1](this, a); }
    // one-shot finished?
    if (!a.loop && a.t >= def.dur) {
      this._finish(true);
      this.play('idle', { loop: true });
      this._blendDur = def.blendOut ?? 0.3;
      return this.update(0);
    }
    if (def.hold && !a.holdResolved && a.t >= def.dur) { a.holdResolved = true; a.resolve(); }
    // target pose
    p.set(NEU);
    const tt = a.loop && def.keyList ? a.t % def.dur : a.t;
    if (def.keyList) evalKeys(def.keyList, tt, p);
    if (def.pose) def.pose(p, tt, this, a, def.K);
    const iw = def.idle ?? 0.35;
    if (iw > 0) this._idleLayer(p, iw);
    // crossfade
    let out = p;
    if (this._blendT < this._blendDur) {
      this._blendT += dt;
      const u = sstep(this._blendT / this._blendDur);
      out = this._blendBuf || (this._blendBuf = new Float32Array(NK));
      for (let k = 0; k < NK; k++) {
        if (k === I.ry) out[k] = this._from[k] + wrapPi(p[k] - this._from[k]) * u;
        else out[k] = this._from[k] + (p[k] - this._from[k]) * u;
      }
    }
    this._last.set(out);
    this._apply(out, dt);
    // face
    let ex = null;
    if (def.faceFn) ex = def.faceFn(tt, this, a);
    else if (def.face) ex = faceAt(def.face, tt);
    this._updateFace(ex || this.baseExpr, dt);
    this._updateWalk(dt);
    this._updatePops(dt);
    this._updatePuffs(dt);
  }

  _idleLayer(p, w) {
    const t = this.time, b = Math.sin(t * 2.1);
    p[I.sq] += 0.014 * b * w;
    p[I.spX] += 0.02 * b * w;
    p[I.hdX] -= 0.018 * b * w;
    p[I.lsZ] += 0.03 * b * w; p[I.rsZ] -= 0.03 * b * w;
    p[I.rz] += 0.022 * Math.sin(t * 0.7) * w;
    p[I.hdZ] += 0.06 * Math.sin(t * 0.53 + 1) * w;
    p[I.hdY] += 0.08 * Math.sin(t * 0.31) * w;
    p[I.leX] -= 0.05 * (0.5 + 0.5 * Math.sin(t * 0.9)) * w;
  }

  _apply(P, dt) {
    const r = this.root;
    r.position.set(P[I.x], P[I.y], P[I.z]);
    r.rotation.set(P[I.rx], P[I.ry], P[I.rz]);
    const sq = Math.max(0.5, P[I.sq]), side = 1 / Math.sqrt(sq);
    r.scale.set(side, sq, side);
    this.hips.rotation.set(0, P[I.hpY], 0);
    this.spine.rotation.set(P[I.spX], P[I.spY], P[I.spZ]);
    this.head.rotation.set(P[I.hdX], P[I.hdY], P[I.hdZ]);
    this.sh.l.rotation.set(P[I.lsX], P[I.lsY], P[I.lsZ]);
    this.sh.r.rotation.set(P[I.rsX], P[I.rsY], P[I.rsZ]);
    this.el.l.rotation.set(P[I.leX], 0, 0);
    this.el.r.rotation.set(P[I.reX], 0, 0);
    this.hip.l.rotation.set(P[I.llX], 0, P[I.llZ]);
    this.hip.r.rotation.set(P[I.rlX], 0, P[I.rlZ]);
    this.knee.l.rotation.set(P[I.lkX], 0, 0);
    this.knee.r.rotation.set(P[I.rkX], 0, 0);
    const bic = P[I.bic];
    for (const s of ['l', 'r']) { const m = this.bic[s]; m.visible = bic > 0.03; if (m.visible) m.scale.setScalar(bic); }
    this.finger.visible = P[I.fing] > 0.5;
    // look-at (head + a bit of spine)
    let ty = 0, tp = 0;
    if (this.lookTarget) {
      this.group.updateMatrixWorld(true);
      const v = this._lv || (this._lv = new V3()), hp = this._lh || (this._lh = new V3());
      v.copy(this.lookTarget); this.root.worldToLocal(v);
      this.head.getWorldPosition(hp); this.root.worldToLocal(hp);
      const dx = v.x - hp.x, dy = v.y - hp.y - 0.15, dz = v.z - hp.z;
      ty = clamp(Math.atan2(dx, dz), -1.25, 1.25) - P[I.ry] * 0;
      tp = clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.5, 0.55);
      if (this.anim.def.name === 'spin' || (this.anim.def.name === 'dance')) { ty = 0; tp = 0; }
    }
    const kL = 1 - Math.exp(-dt * 7);
    this._look.yaw += (ty - this._look.yaw) * kL;
    this._look.pitch += (tp - this._look.pitch) * kL;
    this.head.rotation.y += this._look.yaw * 0.7;
    this.spine.rotation.y += this._look.yaw * 0.3;
    this.head.rotation.x += this._look.pitch * 0.8;
    // shadow follows root but stays on the ground
    const H = this.cfg.H;
    this.shadow.position.set(P[I.x] * H, 0.004, P[I.z] * H);
    const air = clamp(P[I.y] * H, 0, 1);
    this.shadow.scale.setScalar(0.42 * H * (1 - air * 0.9) * (this.sitting ? 1.15 : 1));
    this.shadow.material.opacity = 0.85 * (1 - air * 1.2);

    this.group.updateMatrixWorld(true);
    this._uprightProps(P);
    this._updateSprings(dt);
  }

  _uprightProps(P) {
    const rq = this._rq || (this._rq = new THREE.Quaternion()), hq = this._hq || (this._hq = new THREE.Quaternion()), tq = this._tq || (this._tq = new THREE.Quaternion());
    const e = this._pe || (this._pe = new THREE.Euler());
    this.root.getWorldQuaternion(rq);
    for (const [hand, s, kx, ky, kz] of [['left', 'l', I.lpX, I.lpY, I.lpZ], ['right', 'r', I.rpX, I.rpY, I.rpZ]]) {
      const o = this._propObj[hand]; if (!o) continue;
      const pv = this.propPivot[hand];
      e.set(P[kx], P[ky] * (hand === 'left' ? -1 : 1), P[kz]);
      tq.setFromEuler(e);
      this.hand[s].getWorldQuaternion(hq);
      pv.quaternion.copy(hq.invert()).multiply(rq).multiply(tq);
      pv.updateMatrixWorld(true);
      const sp = o.userData.spring;
      if (sp) this._stepSpring(sp, this._dt || 0.016);
    }
  }

  _updateSprings(dt) {
    this._dt = dt;
    // yaw rate (unused by physics but exposed)
    for (const s of this.springs) this._stepSpring(s, dt);
  }
  _stepSpring(s, dt) {
    const piv = s.pivot;
    const q = this._sq || (this._sq = new THREE.Quaternion()), p = this._sp || (this._sp = new V3()), v = this._sv || (this._sv = new V3()), acc = this._sa || (this._sa = new V3()), dvec = this._sd || (this._sd = new V3());
    piv.parent.getWorldQuaternion(q); q.invert();
    piv.getWorldPosition(p);
    if (!s.init || dt <= 0) { if (!s.init) { s.prev.copy(p); s.vel.set(0, 0, 0); s.init = true; } if (dt <= 0) return; }
    v.copy(p).sub(s.prev).divideScalar(dt);
    acc.copy(v).sub(s.vel).divideScalar(dt);
    s.vel.copy(v); s.prev.copy(p);
    if (acc.length() > 80) acc.setLength(80);
    s.acc.lerp(acc, 0.5);
    let tx, tz;
    if (s.float) {
      dvec.set(0, 9.8, 0).addScaledVector(s.acc, -s.gain * 6).applyQuaternion(q);
      tz = Math.atan2(-dvec.x, dvec.y); tx = Math.atan2(dvec.z, dvec.y);
    } else {
      dvec.set(0, -9.8, 0).addScaledVector(s.acc, -s.gain * 6).applyQuaternion(q);
      tz = Math.atan2(dvec.x, -dvec.y); tx = Math.atan2(-dvec.z, -dvec.y);
    }
    tx = clamp(tx * s.comp, s.lim[0], s.lim[1]); tz = clamp(tz * s.comp, s.lim[2], s.lim[3]);
    const n = Math.max(2, Math.ceil(dt * 120)), h = dt / n;
    for (let i = 0; i < n; i++) {
      s.vx += (s.k * (tx - s.ax) - s.d * s.vx) * h; s.ax += s.vx * h;
      s.vz += (s.k * (tz - s.az) - s.d * s.vz) * h; s.az += s.vz * h;
    }
    s.ax = clamp(s.ax, s.lim[0] - 0.2, s.lim[1] + 0.2); s.az = clamp(s.az, s.lim[2] - 0.2, s.lim[3] + 0.2);
    piv.rotation.set(s.ax, 0, s.az);
  }

  _updateFace(ex, dt) {
    const b = this._blink;
    b.next -= dt;
    let blink = false;
    if (b.t >= 0) { b.t += dt; blink = b.t < 0.12; if (b.t > 0.12) { if (b.dbl) { b.dbl = false; b.t = -0.12; } else b.t = -1; } }
    else if (b.t < -0.5 && b.next <= 0) { b.t = 0; blink = true; b.next = 2.2 + Math.random() * 3.5; b.dbl = Math.random() < 0.2; }
    else if (b.t > -0.5 && b.t < 0) { b.t += dt; if (b.t >= 0) b.t = 0; }
    const key = ex + (blink ? '|b' : '');
    if (key !== this._faceKey) {
      this._faceKey = key;
      drawFace(this.faceCtx, this.cfg.face, ex, blink);
      this.faceTex.needsUpdate = true;
    }
  }

  _updateWalk(dt) {
    const w = this._walk; if (!w) return;
    if (this.anim !== w.anim) { this._walk = null; w.resolve(); return; }
    const g = this.group.position;
    const dx = w.target.x - g.x, dz = w.target.z - g.z, dist = Math.hypot(dx, dz);
    if (dist < 0.02) {
      g.x = w.target.x; g.z = w.target.z; this._walk = null;
      this.play('idle', { loop: true });
      w.resolve(); return;
    }
    const yaw = Math.atan2(dx, dz);
    this.group.rotation.y += wrapPi(yaw - this.group.rotation.y) * (1 - Math.exp(-dt * 10));
    const stepLen = Math.min(dist, w.speed * dt);
    g.x += (dx / dist) * stepLen; g.z += (dz / dist) * stepLen;
  }

  _updatePops(dt) {
    for (let i = this._pops.length - 1; i >= 0; i--) {
      const pp = this._pops[i]; pp.t += dt;
      const u = pp.t / 0.26;
      const s = u >= 1 ? 1 : u < 0.6 ? EASE.out(u / 0.6) * 1.18 : 1.18 - 0.18 * sstep((u - 0.6) / 0.4);
      pp.obj.scale.set(s * pp.sx, s, s);
      if (u >= 1) this._pops.splice(i, 1);
    }
  }

  _updatePuffs(dt) {
    const im = this.puffMesh;
    if (!this._puffs.length) { if (im.visible) { im.visible = false; im.count = 0; } return; }
    im.visible = true;
    const m = this._pm || (this._pm = new THREE.Matrix4()), q = new THREE.Quaternion(), s = new V3();
    let n = 0;
    for (let i = this._puffs.length - 1; i >= 0; i--) {
      const pf = this._puffs[i]; pf.age += dt;
      if (pf.age > pf.life) { this._puffs.splice(i, 1); continue; }
      pf.v.multiplyScalar(Math.pow(0.04, dt)); pf.v.y += 0.1 * dt;
      pf.p.addScaledVector(pf.v, dt);
      const u = pf.age / pf.life;
      const sc = pf.size * (0.4 + 1.6 * Math.sqrt(u)) * (1 - sstep(seg(u, 0.65, 1)));
      s.setScalar(Math.max(sc, 1e-4));
      m.compose(pf.p, q, s); im.setMatrixAt(n++, m);
    }
    im.count = n; im.instanceMatrix.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------ factories */

export function createMaja(overrides = {}) {
  return new Character(resolveCfg({ ...PRESETS.maja, ...overrides }));
}
// createPerson(opts) | createPerson('mattias') | createPerson({ preset:'mattias', top:'#...' })
export function createPerson(opts = {}) {
  if (typeof opts === 'string') opts = { preset: opts };
  const pre = opts.preset ? PRESETS[opts.preset] : null;
  if (opts.preset === 'maja') return createMaja(opts);
  return new Character(resolveCfg({ ...(pre || {}), ...opts }));
}
export const createNPC = createPerson;
export const ANIMATIONS = Object.keys(ANIM_SRC);
export const EXPRESSIONS = Object.keys(EXPR);
export const PROPS = ['coffee', 'glass', 'phone', 'mic', 'fork', 'balloon', 'tissue', 'bouquet', 'bun', 'chainsaw', 'controller', 'hammer', 'camera', 'spatula', 'puck'];
export const HATS = ['nurseCap', 'cap', 'crown', 'headphones', 'partyHat', 'lxaCap', 'flatCap', 'hardHat', 'conductorCap'];
