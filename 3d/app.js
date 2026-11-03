import * as THREE from 'three';
import { STOPS, unlockStop, bindWorldStops, EGG_IDS, EGGS, PATRIK_LINES, CONDUCTOR_LINES, PRE_DEPARTURE, FINALE_FAREWELL, tittutLine, finaleSummary, TEST, store, save, now, unlockAt, fmtCountdown, fmtHuman, esc, vibrate, confetti, renderContent, initContent, markVisited, renderBrake } from './content.js';

const $ = selector => document.querySelector(selector);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const V3 = THREE.Vector3;
const v = (x = 0, y = 0, z = 0) => new V3(x, y, z);
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const canvas = $('#scene');
const WALK_SPEED = 1.35;                       // m/s – a relaxed chibi stroll (walk anim is tuned for ~1 m/s)
const SEAT_TOP = { spelkvall: .81, fika: .49, tittut: .49 };   // seat surface heights (world y) for sitting beats
const COATS = ['#b88a5a', '#1f1d22', '#8d8b91', '#6e1f33', '#e8dcc6', '#2f4a3a'];

let renderer, world, maja, camera, scene, createPerson;
let phase = 'loading', activeIndex = -1, stageIndex = -1, trainU = 0, elapsed = 0, nextIdleAt = 8, lastIdleName = '';
let firstTick = true, failed = false, lastTimestamp = null, frameId, toastTimer, announcementTimer, announcementBusy = false;
let currentArrival = null, viewShift = 0, rest = null, seated = null, majaBusy = false;
const tweens = new Set(), announcementQueue = [], tapWindows = { maja: [], loco: [] }, unlockedBefore = new Set();
const signCache = [], stateCache = [];

// scratch vectors (no per-frame allocation)
const _a = v(), _b = v(), _head = v();

const activeTween = (duration, step) => new Promise(resolve => {
  tweens.add({ elapsed: 0, duration: reduced ? Math.min(duration, .15) : Math.max(1e-3, duration), step, resolve });
});
const pause = duration => activeTween(duration, () => {});
const smooth = t => t * t * (3 - 2 * t);
const inOut = p => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
function nextIndex() { return STOPS.findIndex((_, i) => !visitedNow(i)); }
function visitedNow(i) { return !!STOPS[i] && store.visited.includes(STOPS[i].id) && now() >= unlockStop(i); }
function setPhase(name) {
  phase = name;
  document.body.dataset.phase = name;
  document.body.classList.toggle('traveling', ['boarding', 'traveling', 'arriving', 'event', 'revisiting'].includes(name));
  $('#travel-caption').hidden = !['boarding', 'traveling', 'arriving', 'event'].includes(name);
}
function fallback(error) {
  if (failed) return;
  failed = true; phase = 'error'; cancelAnimationFrame(frameId);
  console.warn('[app] fallback', error);
  $('#loading').hidden = true; $('#fallback').hidden = false;
  document.body.classList.remove('has-sheet', 'traveling');
  renderer?.dispose();
  // Leave the classic version one tap away, including its simulated time.
  const classicParams = new URLSearchParams(location.search); classicParams.delete('nollstall');
  $('#fallback a').href = '../klassisk/' + (classicParams.size ? '?' + classicParams : '');
  if (TEST) $('#fallback p').title = String(error?.message || error || 'WebGL');
}

/* ------------------------------------------------------------------ camera rig */
// Every shot is a goal (position + look target) approached with exponential damping. `rate` itself eases toward
// `rateGoal` so cuts between very different shots start gently (no sudden yaw).
const FOV = 43;
const cam = { goalPos: v(), goalTarget: v(), target: v(), rate: 2, rateGoal: 2, follow: null, snap: false, fovGoal: FOV };
const L = (i, x, y, z) => world.debug?.ctxs?.[i]?.L ? world.debug.ctxs[i].L(x, y, z) : world.stations[i].standPos.clone().add(v(x, y, z));
// Per-stop arrival-camera tweaks (station-local coordinates, same frame as world.js station defs).
const CAM = {
  spackel: { p: [2.3, 2.75, 7.0], t: [1.0, 1.0, -6.0], arrivalOnly: true },
  korsberga: { p: [1.55, 4.4, 10.5], t: [.4, .35, -5.2], arrivalOnly: true },   // whole GRATTIS MAJA 27 banner in frame
  spelkvall: { p: [3.2, 2.9, 1.6], t: [1.0, 1.0, -7.6] },
  farhagen: { p: [2.9, 1.9, 5.4], t: [.2, .75, -4.6] },
  shuffle: { p: [7.4, 2.9, 3.2], t: [3.6, 1.6, -5.6] },
  maria: { p: [2.2, 5.5, 9.5], t: [.8, 2.6, -6] },
  cincin: { p: [1.05, 2.05, -1.6], t: [1.05, 1.2, -5.6], fov: 57 },   // finale: two-shot in front of the table for two (wider lens – the parked train is right behind the camera)
  skaftesfall: { p: [3.5, 4.4, 10.5], t: [2.1, .35, -5.2] },
  fika: { p: [3.3, 4.4, 10.5], t: [1.8, .35, -5.2] },
};
// Mattias hiding spots nudged so he is findable inside the narrow portrait frame (station-local x, y, z).
const MATTIAS_FIX = {
  korsberga: [1.3, 0, -7.6], skaftesfall: [4.15, 0, -6.35], shuffle: [3.3, .15, -8.7], maria: [2.7, 0, -7.1],
  fagelbo: [3.5, 0, -10.6], fika: [4.2, 0, -7.5], logen: [-.95, 0, -6.95],
};
// finale staging (station-local): they stand in front of the table, close enough to clink, both 3/4 to the camera
const CINCIN = { maja: [.75, .2, -5.3], mattias: [1.45, .2, -5.45] };
// heads turn toward each other but stay readable from the camera (a pure look-at would show the back of Maja's hair)
function lookPartner(i, who, other, toCam = .5) {
  const p = other.group.position; _a.set(p.x, p.y + 1.25, p.z).lerp(camPosOf(i), toCam); who.lookAt(_a);
}
// [distance factor, target lift (m)] for the arrival framing; 1/0 keeps a hand-tuned shot as is
const ZOOM = {
  default: [.7, .45], korsberga: [.82, .6], neuro: [.74, .8], spelkvall: [.85, .2], recept: [.72, .9], maria: [.8, .4],
  tittut: [.75, .4], snart: [.8, .3], cincin: [1, 0],
};
function shot(i, { sheet = false, rate = 2.2, snap = false } = {}) {
  const s = world.stations[i], o = CAM[s.id];
  cam.follow = null; cam.fovGoal = o?.fov || FOV;
  if (o && !sheet) { cam.goalPos.copy(L(i, ...o.p)); cam.goalTarget.copy(L(i, ...o.t)); }
  else if (o && sheet && !o.arrivalOnly) { cam.goalTarget.copy(L(i, o.t[0], o.t[1] - .5, o.t[2])); cam.goalPos.copy(L(i, ...o.p)).sub(cam.goalTarget).multiplyScalar(1.3).add(cam.goalTarget).add(_a.set(0, .5, 0)); }
  else { cam.goalPos.copy(sheet ? s.sheetCameraPos : s.cameraPos); cam.goalTarget.copy(sheet ? s.sheetCameraTarget : s.cameraTarget); }
  if (!sheet) {
    // arrival close-up: dolly in toward a slightly raised target so Maja + the showpiece read on a phone
    const z = ZOOM[s.id] ?? ZOOM.default, k = z[0], lift = z[1];
    cam.goalTarget.y += lift; cam.goalPos.sub(cam.goalTarget).multiplyScalar(k).add(cam.goalTarget);
  }
  cam.rateGoal = rate; if (snap) cam.snap = true;
}
function sheetExpanded() { const el = $('#sheet'); return !el.hidden && !el.classList.contains('collapsed'); }
// Visible band for the 3D action: below the ticket/announcement, above the sheet (or dock).
const band = { top: 130, bottom: 700 }; let bandAt = -1;
function measureBand() {
  const ann = $('#announcement'), ticket = $('.mini-ticket');
  // the ticket fades out while traveling – then only the Resplan corner (and a conductor line) is in the way
  const ticketBottom = document.body.classList.contains('traveling') ? 64 : ticket.getBoundingClientRect().bottom;
  band.top = Math.max(ticketBottom, ann.hidden ? 0 : ann.getBoundingClientRect().bottom) + 6;
  const sheet = $('#sheet');
  band.bottom = !sheet.hidden ? sheet.offsetTop : $('.departure-dock').offsetTop;
}
function updateFraming(dt) {
  if (elapsed - bandAt > .25) { bandAt = elapsed; measureBand(); }
  let desired = 0;
  const atStop = ['waiting', 'arriving', 'event', 'boarding', 'revisiting'].includes(phase) && maja.group.parent === scene;
  if (atStop) {
    camera.updateMatrixWorld(); maja.getHeadTop(_head);
    const y = (1 - _head.project(camera).y) * innerHeight / 2 + viewShift;      // head-top y without any shift
    const span = band.bottom - band.top;
    if (sheetExpanded()) desired = y - (band.top + span * .28);
    else if (y < band.top + 24) desired = y - (band.top + 24);      // only rescue a head hidden behind the HUD
    desired = clamp(desired, -innerHeight * .2, innerHeight * .38);
  }
  viewShift = lerp(viewShift, desired, reduced ? 1 : 1 - Math.exp(-dt * 3.5));
  if (Math.abs(viewShift) > .5) camera.setViewOffset(innerWidth, innerHeight, 0, viewShift, innerWidth, innerHeight); else camera.clearViewOffset();
}

/* ------------------------------------------------------------------ frame loop */
const live = new Set();  // characters to update
function frame(dt) {
  elapsed += dt;
  for (const tween of tweens) { tween.elapsed += dt; const p = Math.min(1, tween.elapsed / tween.duration); tween.step(p); if (p === 1) { tweens.delete(tween); tween.resolve(); } }
  world.update(dt, elapsed);
  for (const c of live) if (c.group.visible) c.update(dt);
  if (cam.follow) cam.follow(dt);
  cam.rate += (cam.rateGoal - cam.rate) * Math.min(1, dt * 1.6);
  const k = (reduced || cam.snap) ? 1 : 1 - Math.exp(-dt * cam.rate); cam.snap = false;
  camera.position.lerp(cam.goalPos, k); cam.target.lerp(cam.goalTarget, k); camera.lookAt(cam.target);
  if (Math.abs(camera.fov - cam.fovGoal) > .01) { camera.fov += (cam.fovGoal - camera.fov) * k; camera.updateProjectionMatrix(); }
  if (phase === 'waiting' && elapsed > nextIdleAt && !reduced) randomIdle();
  updateFraming(dt);
  renderer.render(scene, camera);
}
function loop(timestamp) {
  if (failed) return;
  const dt = lastTimestamp === null ? 0 : Math.min((timestamp - lastTimestamp) / 1000, .05); lastTimestamp = timestamp;
  try { frame(dt); } catch (error) { fallback(error); return; }
  frameId = requestAnimationFrame(loop);
}
function randomIdle() {
  nextIdleAt = elapsed + 6 + Math.random() * 6;
  if (majaBusy || seated || rest) return;
  const early = now() < unlockAt(10);
  const choices = (early ? ['yawn', 'wave', 'laugh', 'jump'] : ['wave', 'cheer', 'laugh', 'jump', 'spin']).filter(name => name !== lastIdleName);
  lastIdleName = choices[Math.floor(Math.random() * choices.length)];
  void majaOneShot(lastIdleName);
}

/* ------------------------------------------------------------------ HUD */
function toast(message) {
  const el = $('#toast'); el.textContent = message; el.classList.add('show');
  el.onclick = () => { el.classList.remove('show'); if (phase === 'waiting' && nextIndex() >= 0) $('#depart').focus(); };
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 7000);
}
function updatePlan() {
  $('#egg-count').textContent = `Påskägg: ${store.eggs.length}/${EGG_IDS.length}`;
  $('#mattias-count').textContent = `Mattias hittad: ${store.foundMattias.length}/19`;
  $('#plan-stations').innerHTML = STOPS.map((l, i) => {
    const visited = visitedNow(i), ready = now() >= unlockStop(i);
    return `<button type="button" class="plan-station ${l.kind}${activeIndex === i ? ' current' : ''}" data-station="${i}" ${visited && phase === 'waiting' ? '' : 'disabled'}><span class="plan-time">${l.t}</span><span class="plan-marker">${visited ? '✓' : ready ? '•' : '🔒'}</span><span>${visited ? esc(l.station) : ready ? 'Nytt stopp!' : '? ? ?'}${l.kind === 'mini' ? '<em>Hållplats</em>' : ''}</span><small>${visited ? '✓' : ready ? 'Nu' : '🔒 ' + l.t}</small></button>`;
  }).join('');
}
function setStation(i, state, text) {
  if (stateCache[i] !== state) { stateCache[i] = state; world.setStationState(i, state); }
  if (signCache[i] !== text) { signCache[i] = text; world.setSign(i, text); }
}
function tick() {
  if (failed) return;
  const t = now(), next = nextIndex(), nextStop = STOPS[next];
  const busy = phase !== 'waiting';
  const unlocked = nextStop && t >= unlockStop(next);
  STOPS.forEach((l, i) => {
    const ready = t >= unlockStop(i), visited = visitedNow(i);
    const left = unlockStop(i) - t;
    setStation(i, !ready ? 'locked' : visited ? 'visited' : 'ready', visited ? '✓' : ready ? 'Nu!' : i === next && left < 3600000 ? `om ${Math.max(1, Math.ceil(left / 60000))} min` : '');
    if (ready && !unlockedBefore.has(i) && !firstTick) { toast(i === 18 ? '🔔 Slutstationen är öppen! 🥂' : l.kind === 'mini' ? '🔔 Ny hållplats öppen. Tryck här.' : '🔔 Tåget kan rulla vidare! Nästa station väntar.'); vibrate([40, 60, 40]); }
    if (ready) unlockedBefore.add(i); else unlockedBefore.delete(i);
  });
  firstTick = false;
  world.setTimeOfDay(clamp((t - unlockAt(8)) / (9 * 3600000), 0, 1));
  const count = STOPS.filter((_, i) => visitedNow(i)).length;
  $('#progress').textContent = `Stopp ${count}/19`;
  $('#done-stamp').hidden = !visitedNow(18);
  $('#brake-shortcut').hidden = !STOPS.some((l, i) => l.kind === 'main' && i < 18 && visitedNow(i)) || visitedNow(18);
  const departure = $('#depart'); departure.disabled = busy || !unlocked;
  departure.textContent = busy ? (phase === 'traveling' ? '🚂 På väg…' : '✨ Ett ögonblick…') : next < 0 ? 'Framme ♥ Vi ses vid bordet' : unlocked ? (next === 0 ? '🎂 Starta resan' : '🚂 Åk till nästa station') : `Nästa avgång ${nextStop.t}`;
  $('#status-label').textContent = next < 0 ? 'Framme! Cin cin 🥂' : unlocked ? `Nästa: ${nextStop.station}` : next === 0 ? `Tåget avgår 08:00 · ${fmtHuman(unlockStop(0) - t)}` : nextStop.kind === 'mini' ? `Nästa: ${nextStop.station} ${nextStop.t}` : `Nästa avgång ${nextStop.t} · ${fmtHuman(unlockStop(next) - t)}`;
  $('#status-cd').textContent = next < 0 ? '✓' : unlocked ? 'Dags att åka' : fmtCountdown(unlockStop(next) - t);
  $('#departure-note').textContent = busy ? 'Maja-expressen · första klass' : next < 0 ? 'Grattis på 27-årsdagen, Maja.' : unlocked ? 'Fönsterplatsen är din.' : (STOPS[next - 1]?.waitNote || 'Ett nytt stopp varje halvtimme.');
  updatePlan(); renderBrake();
  if (activeIndex >= 0 && !visitedNow(activeIndex) && phase === 'waiting') { hideSheet(); activeIndex = -1; }
}
function hideSheet() { $('.nest-retreat')?.remove(); $('#sheet').hidden = true; document.body.classList.remove('has-sheet'); bandAt = -1; }
function showSheet(i) {
  activeIndex = i;
  const l = STOPS[i];
  $('#sheet-label').textContent = `${l.t} · ${l.station}`;
  renderContent(i, $('#sheet-content'));
  $('#sheet').hidden = false; $('#sheet').classList.remove('collapsed'); $('#sheet-toggle').setAttribute('aria-expanded', 'true');
  $('#sheet-hint').textContent = ''; $('#sheet-scroll').scrollTop = 0; document.body.classList.add('has-sheet');
  $('#scene-title').textContent = l.station; $('#scene-note').textContent = i === 18 ? 'Ingen gömmer sig här längre.' : 'Någon gömmer sig här. Bara så du vet.';
  $('#scene-eyebrow').textContent = `${l.kind === 'main' ? (i === 18 ? 'SLUTSTATION' : 'STATION ' + (l.mainIndex + 1) + ' AV 10') : 'HÅLLPLATS'} · ${l.t}`;
  bandAt = -1; shot(i, { sheet: true, rate: 1.8 });
}

/* ------------------------------------------------------------------ characters */
function prepCharacter(c) {
  if (c.shadow) c.shadow.visible = false;           // the world has a real shadow map – no double shadows
  live.add(c);
  return c;
}
function addProxy(c, scale = 1.5) {
  // generous invisible hit box (raycast ignores visibility, so the material is simply not drawn)
  const h = c.height, m = new THREE.Mesh(new THREE.BoxGeometry(.55 * scale, h * 1.05, .55 * scale), new THREE.MeshBasicMaterial({ visible: false }));
  m.position.y = h * .5; m.userData.proxy = true; c.group.add(m); return m;
}
const roster = new Map();
function person(key, preset) {
  let c = roster.get(key);
  if (!c) { c = prepCharacter(createPerson(preset)); c.group.visible = false; scene.add(c.group); roster.set(key, c); if (['mattias', 'conductor', 'patrik'].includes(key)) addProxy(c, key === 'mattias' ? 1.6 : 1.3); }
  return c;
}
// scene.attach() can decompose the world matrix as Euler (π, y, π) – normalise to a pure yaw so turnTo() works.
const _fwd = v();
function toScene(c) {
  if (c.group.parent !== scene) scene.attach(c.group);
  c.group.updateMatrixWorld(); _fwd.set(0, 0, 1).applyQuaternion(c.group.quaternion);
  c.group.rotation.set(0, Math.atan2(_fwd.x, _fwd.z), 0);
}
function place(c, pos, facing) { toScene(c); c.group.position.copy(pos); c.group.rotation.set(0, facing ?? 0, 0); c.group.visible = true; }
function yawTo(from, to) { return Math.atan2(to.x - from.x, to.z - from.z); }
let staged = [];
const npc = who => staged.find(n => n.who === who)?.character;
function mattiasPose(i) {
  const s = world.stations[i], id = s.id;
  if (id === 'langd') return ['tiptoe', { loop: true }];
  if (id === 'zara') return ['cheer', { loop: true }];
  const pose = s.mattiasSpot?.pose || 'peek';
  return pose === 'stand' ? ['idle', { loop: true }] : [pose, { loop: true }];
}
function camPosOf(i) { const o = CAM[world.stations[i].id]; return o ? L(i, ...o.p) : world.stations[i].cameraPos; }
// yaw that mostly faces `a` but turns a little toward `b` (3/4 view)
function blendYaw(from, a, b, w = .4) {
  const ya = yawTo(from, a), yb = yawTo(from, b);
  return Math.atan2(Math.sin(ya) * (1 - w) + Math.sin(yb) * w, Math.cos(ya) * (1 - w) + Math.cos(yb) * w);
}
function mattiasSpot(i) {
  const s = world.stations[i], fix = MATTIAS_FIX[s.id];
  if (s.id === 'cincin') { const pos = L(i, ...CINCIN.mattias); return { ...s.mattiasSpot, pos, facing: blendYaw(pos, L(i, ...CINCIN.maja), camPosOf(i), .45) }; }
  if (!fix) return s.mattiasSpot;
  const pos = L(i, ...fix); return { ...s.mattiasSpot, pos, facing: yawTo(pos, camPosOf(i)) };
}
function conductorSpot(i) {
  // on the platform just camera-left of Maja's stand position, half turned to the camera (tappable Påskägg)
  // ...on the side away from Mattias' hiding spot so he never covers him
  const s = world.stations[i], def = world.debug?.ctxs?.[i]?.def, st = def?.stand;
  const fix = MATTIAS_FIX[s.id], mx = fix ? fix[0] : def?.mattias?.p?.[0] ?? 99;
  const side = s.id === 'farhagen' ? -1.2 : st && mx < st[0] ? 1.25 : -1.2;
  const pos = st ? L(i, st[0] + side, s.standPos.y, st[1] + .45) : s.standPos.clone().add(v(side, 0, .45));
  const facing = yawTo(pos, camPosOf(i)) * .5 + yawTo(pos, s.standPos) * .5;
  return { pos, facing };
}
function stage(i) {
  if (stageIndex === i) return;
  stageIndex = i;
  for (const n of staged) { n.character.group.visible = false; n.character.lookAt(null); }
  staged = [];
  const s = world.stations[i];
  // trains stop with the door at the same place, so the conductor is positioned after the train is parked
  const cond = person('conductor', 'conductor'); staged.push({ who: 'conductor', character: cond });
  let fans = 0;
  for (const spot of s.npcSpots || []) {
    let who = String(spot.who || 'fan'); if (who === 'conductor' || who === 'mattias') continue; if (who === 'sister') who = 'syster';
    const key = who === 'fan' ? 'fan' + fans++ : who;
    const c = roster.get(key) || person(key, key === 'fan1' ? { preset: 'fan', top: '#7fc4e8', hairColor: '#3a2a20', hair: 'long' } : who);
    place(c, spot.pos, spot.facing); c.setExpression('happy');
    staged.push({ who: key, character: c, spot });
    if (who === 'syster' || who === 'sebastian') { c.setHat(who === 'syster' ? 'hardHat' : 'cap', true); c.setProp('right', 'hammer', true); void c.play('hammer', { loop: true }); }
    else if (who === 'patrik') { c.setProp('right', 'chainsaw', true); void c.play('idle', { loop: true }); }
    else if (who.startsWith('friend')) { c.setProp('right', 'controller', true); }
    else if (who === 'fan') void c.play(fans === 1 ? 'dance' : 'cheer', { loop: true });
    else void c.play('idle', { loop: true });
  }
  if (s.id === 'spelkvall') {
    // two friends on the outer sofa cushions, one cheering on the rug
    const seatAt = (key, spotKey) => { const c = npc(key), sp = s.spots[spotKey]; if (!c || !sp) return; place(c, _a.copy(sp.pos).setY(SEAT_TOP.spelkvall - c.sitHeight), sp.facing); void c.play('gaming', { loop: true, seated: true }); };
    seatAt('friend1', 'sofaL'); seatAt('friend2', 'sofaR');
    const f3 = npc('friend3'); if (f3) void f3.play('gaming', { loop: true });
  }
  const m = person('mattias', 'mattias'), ms = mattiasSpot(i);
  place(m, ms.pos, ms.facing); m.setProp('right', null, true); m.setExpression(s.id === 'cincin' ? 'happy' : 'sneaky');
  void m.play(...mattiasPose(i));
  staged.push({ who: 'mattias', character: m });
  for (const n of staged) n.character.update(0);
}
function parkConductor(i) {
  const cond = npc('conductor'); if (!cond) return;
  const { pos, facing } = conductorSpot(i); place(cond, pos, world.stations[i].id === 'logen' ? yawTo(pos, camPosOf(i)) : facing); void cond.play('idle', { loop: true });
}

/* ------------------------------------------------------------------ Maja helpers */
function clearProps() { maja.lookAt(null); maja.setProp('left', null); maja.setProp('right', null); maja.setHat(null); maja.setExpression('happy'); }
function coatColor() { return COATS[store.coat ?? 0] || COATS[0]; }
function majaOneShot(name, opts) {
  // body reactions while seated/crouched would pop her up – keep those to expressions + hearts
  if (seated || majaBusy) return Promise.resolve();
  majaBusy = true;
  return maja.play(name, opts).then(() => { majaBusy = false; if (rest && phase === 'waiting' && maja.anim?.name === 'idle') void maja.play(...rest); });
}
function turnTo(c, yaw, dur = .35) {
  const from = c.group.rotation.y; let d = yaw - from; d = Math.atan2(Math.sin(d), Math.cos(d));
  if (Math.abs(d) < .02) { c.group.rotation.y = yaw; return Promise.resolve(); }
  return activeTween(dur, p => { c.group.rotation.y = from + d * smooth(p); });
}
async function walk(c, to, { speed, seq } = {}) {
  toScene(c);
  const from = c.group.position.clone(), dist = Math.hypot(to.x - from.x, to.z - from.z);
  const sp = speed ?? clamp(dist / 3.2, 1.1, 1.75) * (WALK_SPEED / 1.35);
  const yTween = Math.abs(to.y - from.y) > .01 ? activeTween(Math.max(.2, dist / sp), p => { c.group.position.y = lerp(from.y, to.y, smooth(clamp((p - .55) / .45, 0, 1))); }) : null;
  if (reduced || dist < .05) { c.group.position.copy(to); return; }
  await c.walkTo(to, sp);
  if (yTween) await yTween;
  if (seq?.cancelled) return;
  c.group.position.y = to.y;
}
async function sitDown(c, spot, seatTop, anim = ['sit']) {
  await turnTo(c, spot.facing, .3);
  const y0 = c.group.position.y, y1 = seatTop - c.sitHeight;
  void c.play(...anim);
  await activeTween(.35, p => { c.group.position.y = lerp(y0, y1, smooth(p)); });
}
async function standUp(c, floorY) {
  const y0 = c.group.position.y;
  void c.play('idle', { loop: true });
  await activeTween(.3, p => { c.group.position.y = lerp(y0, floorY, smooth(p)); });
}

/* ------------------------------------------------------------------ staging: where Maja ends up at each stop */
// Used for skip, revisit and restore so every stop has a deterministic, cute resting pose under the sheet.
function majaSpot(i) {
  const s = world.stations[i], id = s.id;
  const spotKey = { spackel: 'film', spelkvall: 'sofa', farhagen: 'lamb', shuffle: 'throw', fagelbo: 'nest', fika: 'bench', tittut: 'bench', cincin: 'table' }[id];
  if (id === 'cincin') { const pos = L(i, ...CINCIN.maja); return { pos, facing: blendYaw(pos, mattiasSpot(i).pos, camPosOf(i), .45), key: 'table' }; }
  if (spotKey && s.spots?.[spotKey]) {
    const pos = s.spots[spotKey].pos.clone(), o = CAM[id];
    const facing = id === 'cincin' ? blendYaw(pos, mattiasSpot(i).pos, camPosOf(i), .45) : o?.faceCam ? yawTo(pos, L(i, ...o.p)) : s.spots[spotKey].facing;
    return { pos, facing, key: spotKey };
  }
  if (id === 'maria') { const m = s.npcSpots.find(n => n.who === 'maria'); if (m) { const p = s.standPos.clone().lerp(m.pos, .62); p.y = s.standPos.y; return { pos: p, facing: yawTo(p, m.pos) }; } }
  if (id === 'snart') { const p = L(i, .95, 0, -5.4); return { pos: p, facing: s.standFacing }; }
  return { pos: s.standPos.clone(), facing: s.standFacing };
}
const FINAL = {
  korsberga: { hat: 'partyHat' },
  spackel: { hat: 'lxaCap', right: 'phone', rest: ['film', { loop: true }], expr: 'laugh' },
  neuro: { hat: 'nurseCap', right: 'coffee' },
  spelkvall: { right: 'controller', seat: true, rest: ['gaming', { loop: true, seated: true }], expr: 'laugh' },
  zara: { hat: 'headphones', right: 'mic' },
  farhagen: { rest: ['crouch', { loop: true }], expr: 'love' },
  skaftesfall: { right: 'tissue' },
  patrik: {},
  recept: { right: 'fork' },
  shuffle: { expr: 'laugh' },
  maria: { expr: 'happy' },
  hester: { hat: 'hardHat', expr: 'laugh' },
  langd: { hat: 'crown', expr: 'wink' },
  fagelbo: { rest: ['crouch', { loop: true }], expr: 'calm' },
  fika: { seat: true, right: 'coffee', left: 'bun', rest: ['sit'], expr: 'sleepy' },
  tittut: { seat: true, right: 'phone', rest: ['sit'], expr: 'wink' },
  logen: { right: 'mic', expr: 'laugh' },
  snart: { coat: true, expr: 'love', lookMattias: true },
  cincin: { coat: true, right: 'glass', expr: 'love', lookMattias: true },
};
function applyFinal(i, { teleport = true } = {}) {
  const s = world.stations[i], f = FINAL[s.id] || {}, spot = majaSpot(i);
  toScene(maja);
  maja.lookAt(null);
  if (teleport) { maja.group.position.copy(spot.pos); maja.group.rotation.set(0, spot.facing, 0); }
  maja.setHat(f.hat || null); maja.setProp('right', f.right || null); maja.setProp('left', f.left || null);
  maja.setOutfit({ coat: f.coat || i >= 17 ? coatColor() : null });
  maja.setExpression(f.expr || 'happy');
  rest = f.rest || null; seated = null;
  if (f.seat) { seated = s.id; maja.group.position.y = SEAT_TOP[s.id] - maja.sitHeight; }
  void maja.play(...(rest || ['idle', { loop: true }]));
  if (f.lookMattias && s.id !== 'cincin') { const m = npc('mattias'); if (m) maja.lookAt(_a.copy(m.group.position).setY(m.group.position.y + 1.2)); }
  if (s.id === 'cincin') { const m = npc('mattias'); if (m) { m.setProp('right', 'glass', true); lookPartner(i, maja, m, .5); lookPartner(i, m, maja, .35); } }
  if (s.id === 'maria') { const m = npc('maria'); if (m) { m.group.rotation.y = yawTo(m.group.position, maja.group.position); } }
  maja.update(0);
}

/* ------------------------------------------------------------------ choreography (STORY.md §2) */
// Each beat runs after Maja reached her spot. ctx.event() starts world.playStationEvent at the right moment.
const BEATS = {
  async korsberga(x) {
    maja.setExpression('surprised'); x.event(); await x.w(.5); maja.setProp('right', null);
    maja.setExpression('laugh'); await x.play('cheer'); maja.setHat('partyHat'); await x.w(.6); maja.setExpression('happy');
  },
  async spackel(x) {
    maja.setHat('lxaCap'); maja.setProp('right', 'phone'); void maja.play('film', { loop: true });
    x.event(); await x.w(1.5); maja.setExpression('laugh'); await x.play('point'); void maja.play('film', { loop: true });
  },
  async neuro(x) {
    maja.setHat('nurseCap'); maja.setProp('right', 'coffee'); x.event(); await x.play('sip');
    maja.setExpression('wink'); await x.play('wave'); maja.setExpression('happy');
  },
  async spelkvall(x) {
    maja.setProp('right', 'controller'); await sitDown(maja, x.s.spots.sofa, SEAT_TOP.spelkvall, ['gaming', { loop: true, seated: true }]); seated = 'spelkvall';
    x.event(); await x.w(1.3); if (x.seq.cancelled) return;
    seated = null; await standUp(maja, x.s.spots.sofa.pos.y); maja.setExpression('laugh'); await x.play('fistPump');
    for (const k of ['friend3']) { const c = npc(k); if (c) void c.play('cheer'); }   // applyFinal seats her again
  },
  async zara(x) {
    maja.setHat('headphones'); maja.setProp('right', 'mic'); maja.setExpression('happy'); void maja.play('dance', { loop: true });
    x.event(); await x.w(1.7); maja.setExpression('laugh'); await x.play('cheer');
  },
  async farhagen(x) {
    maja.setExpression('love'); void maja.play('crouch', { loop: true }); x.event(); await x.w(1.2);
    maja.setExpression('laugh'); await x.play('laugh'); maja.setExpression('love'); void maja.play('crouch', { loop: true });
  },
  async skaftesfall(x) {
    maja.setExpression('happy'); x.event(); await x.w(.45); maja.setExpression('preSneeze'); await x.w(.35);
    maja.setExpression('sneeze'); world.fx.sneeze?.(maja.getHeadTop(v())); const sn = x.play('sneeze'); await x.w(1.6); await sn;
    maja.setProp('right', 'tissue'); maja.setExpression('laugh'); await x.w(.4);
  },
  async patrik(x) {
    const p = npc('patrik'); if (p) { p.lookAt(null); void p.play('chop', { loop: true }); }
    x.event(); maja.setExpression('happy'); await x.play('wave'); maja.setExpression('surprised'); await x.w(.6);
    if (p) void p.play('scratchHead'); maja.setExpression('sigh'); await x.play('facepalm'); maja.setExpression('laugh');
    if (p) { await x.w(.2); void p.play('idle', { loop: true }); }
  },
  async recept(x) {
    maja.setProp('right', 'phone'); void maja.play('scroll', { loop: true }); x.event(); await x.w(1.6);
    maja.setProp('right', 'fork'); maja.setExpression('happy'); await x.play('cheer');
  },
  async shuffle(x) {
    maja.setProp('right', 'puck'); const sl = x.play('slide'); await x.w(.75); maja.setProp('right', null); x.event(); await sl;
    await x.w(.3); maja.setExpression('laugh'); await x.play('cheer');
  },
  async maria(x) {
    const m = npc('maria'); maja.setProp('right', 'phone'); x.event(); await x.w(.25);
    maja.setExpression('sigh'); await x.w(.6); maja.setProp('right', null); maja.setExpression('laugh');
    const spot = majaSpot(x.i); await walk(maja, spot.pos, { speed: 1.4, seq: x.seq }); if (x.seq.cancelled) return;
    await turnTo(maja, spot.facing); if (m) { m.group.rotation.y = yawTo(m.group.position, maja.group.position); void m.play('hug'); }
    maja.setExpression('love'); await x.play('hug'); maja.setExpression('happy');
  },
  async hester(x) {
    x.event(); await x.play('wave');
    for (const k of ['syster', 'sebastian']) { const c = npc(k); if (c) void c.play('wave').then(() => c.play('hammer', { loop: true })); }
    await x.w(.9); maja.setExpression('surprised'); await x.w(.6); maja.setExpression('sneeze'); await x.w(.45);
    maja.setHat('hardHat'); maja.setExpression('laugh'); await x.w(.4);
  },
  async langd(x) {
    x.event(); maja.setExpression('happy'); await x.w(1.1); maja.setExpression('wink'); await x.play('flex'); maja.setHat('crown'); maja.setExpression('wink');
  },
  async fagelbo(x) {
    maja.setExpression('sleepy'); void maja.play('crouch', { loop: true }); x.event(); await x.w(1.4); maja.setExpression('calm');
  },
  async fika(x) {
    maja.setProp('right', 'coffee'); maja.setProp('left', 'bun'); await sitDown(maja, x.s.spots.bench, SEAT_TOP.fika); seated = 'fika';
    maja.setExpression('happy'); x.event(); await x.w(1.6); maja.setExpression('sleepy');
  },
  async tittut(x) {
    maja.setProp('right', 'phone'); await sitDown(maja, x.s.spots.bench, SEAT_TOP.tittut); seated = 'tittut';
    maja.setExpression('wink'); x.event(); await x.w(1.4); maja.setExpression('pout'); await x.w(1.2);
    const m = npc('mattias'); if (m) void m.play('wave').then(() => m.play('peek', { loop: true })); maja.setExpression('wink');
  },
  async logen(x) {
    maja.setProp('right', 'mic'); maja.setExpression('laugh'); void maja.play('dance', { loop: true }); x.event(); await x.w(1.8);
    await x.play('spin');
  },
  async snart(x) {
    x.event(); const spot = majaSpot(x.i); await walk(maja, spot.pos, { speed: 1.3, seq: x.seq }); if (x.seq.cancelled) return;
    const m = npc('mattias'); if (m) maja.lookAt(_a.copy(m.group.position).setY(1.4)); maja.setExpression('love'); await x.w(1.2);
  },
  async cincin(x) {
    const m = npc('mattias');
    if (m) { lookPartner(x.i, m, maja, .35); lookPartner(x.i, maja, m, .5); await x.play('wave', undefined, m); }
    maja.setExpression('surprised'); await x.w(.5); maja.setExpression('love');
    maja.setProp('right', 'glass'); m?.setProp('right', 'glass'); await x.w(.3);
    if (m) void m.play('clink'); const ck = x.play('clink'); await x.w(1.2);
    world.fx.hearts?.(maja.getHandPosition('right', v()).lerp(m ? m.getHandPosition('right', v()) : maja.getHeadTop(v()), .5).add(v(0, .3, 0)), 10);
    x.event(); await ck;
    // slow reveal: rise and pull back
    const from = cam.goalPos.clone(), to = from.clone().sub(cam.goalTarget).multiplyScalar(1.45).add(cam.goalTarget).add(v(0, 1.3, 0));
    await activeTween(2.4, p => { if (!x.seq.cancelled) cam.goalPos.lerpVectors(from, to, smooth(p)); });
  },
};

/* ------------------------------------------------------------------ journey */
function skipArrival() {
  const sequence = currentArrival; if (!sequence) return; sequence.cancelled = true;
  for (const tween of tweens) { tweens.delete(tween); tween.resolve(); }
  sequence.skip();
}
function travelDuration(from, to) {
  const len = (world.debug?.T?.L || 400) * Math.abs(to - from);
  return reduced ? 1 : clamp(2.6 + len / 14, 3.2, 5.2);
}
async function ride(i, { dur } = {}) {
  const start = trainU, end = world.stations[i].trainU, d = dur ?? travelDuration(start, end);
  world.train.seat.add(maja.group); maja.group.position.set(0, 0, 0); maja.group.rotation.set(0, 0, 0);
  maja.setExpression('happy'); void maja.play('sit');
  // chase camera biased back along the train so Maja's window (carriage) sits in frame next to the loco
  cam.follow = () => { const tc = world.travelCamera(trainU, -2.4); cam.goalTarget.copy(tc.target); cam.goalPos.copy(tc.position).sub(tc.target).multiplyScalar(1.12).add(tc.target); };
  cam.rate = .9; cam.rateGoal = 3.2; cam.fovGoal = FOV;
  await activeTween(d, p => { trainU = lerp(start, end, inOut(p)); world.setTrainU(trainU); });
  cam.follow = null;
}
async function depart() {
  const i = nextIndex(); if (phase !== 'waiting' || i < 0 || now() < unlockStop(i)) return;
  try {
    hideSheet(); closePlan(); $('#toast').classList.remove('show'); vibrate(15); setPhase('boarding'); sayAnnouncement(i, 'departure'); tick();
    $('#travel-title').textContent = i === 0 ? 'Välkommen ombord!' : `Mot ${STOPS[i].station}…`;
    $('#travel-sub').textContent = i === 0 ? 'Fönsterplats, såklart.' : i === 18 ? 'Sista sträckan. Fönsterplats, för sista gången idag.' : `Stopp ${i + 1} av 19 · slutstation hemlig`;
    if (i > 0) {
      // board: stand up if needed, props off, stroll to the door
      if (seated) { seated = null; await standUp(maja, majaSpot(Math.max(0, stageIndex)).pos.y); }
      rest = null; majaBusy = false; clearProps(); if (i < 17) maja.setOutfit({ coat: null });
      shot(Math.max(0, stageIndex), { rate: 1.6 });
      await walk(maja, world.train.doorPos());
      setPhase('traveling');
      await ride(i);
    }
    setPhase('arriving'); stage(i); parkConductor(i); shot(i, { rate: 1.7 }); sayAnnouncement(i, 'arrival'); const arrivedAt = elapsed;
    if (i >= 17) maja.setOutfit({ coat: coatColor() });
    const sequence = { cancelled: false, skip: null }; currentArrival = sequence;
    const skipped = new Promise(resolve => { sequence.skip = resolve; });
    let eventP = Promise.resolve();
    const x = {
      i, s: world.stations[i], seq: sequence,
      w: sec => sequence.cancelled ? Promise.resolve() : pause(sec),
      play: (name, opts, who = maja, wait = true) => { if (sequence.cancelled || reduced) return Promise.resolve(); const p = who.play(name, opts); return wait ? p : Promise.resolve(); },
      event: () => { if (!reduced) eventP = world.playStationEvent(i); },
    };
    const arrival = (async () => {
      if (i > 0) {
        toScene(maja); maja.group.position.copy(world.train.doorPos()); maja.group.rotation.y = yawTo(maja.group.position, world.stations[i].standPos);
        void maja.play('idle', { loop: true });
        const spot = ['maria', 'snart'].includes(world.stations[i].id) ? { pos: world.stations[i].standPos, facing: world.stations[i].standFacing } : majaSpot(i);
        // a brisk, happy step out (the walk cycle speeds up with it) – arrivals should land in ~4–6 s
        const d = Math.hypot(spot.pos.x - maja.group.position.x, spot.pos.z - maja.group.position.z);
        await walk(maja, spot.pos, { seq: sequence, speed: clamp(d / 1.9, 1.35, 1.95) }); if (sequence.cancelled) return;
        if (!['spelkvall', 'fika', 'tittut'].includes(world.stations[i].id)) await turnTo(maja, spot.facing);
      }
      if (sequence.cancelled) return;
      setPhase('event'); $('#travel-title').textContent = `${STOPS[i].t} · ${STOPS[i].station}`; $('#travel-sub').textContent = STOPS[i].kind === 'main' ? (i === 18 ? 'Slutstation' : `Station ${STOPS[i].mainIndex + 1} av 10`) : 'Hållplats';
      if (reduced) { applyFinal(i); eventP = world.playStationEvent(i); await pause(.6); return; }
      await BEATS[world.stations[i].id]?.(x);
      // the showpiece keeps playing under the sheet – don't hold the story for its tail
      await Promise.race([eventP, pause(.9)]);
      await x.w(.25);
    })();
    const cap = i === 18 ? 9.5 : STOPS[i].kind === 'main' ? 7 : 6;   // STORY.md §4 arrival budgets
    if (!reduced) void pause(cap).then(() => { if (currentArrival === sequence && !sequence.cancelled) skipArrival(); });
    await Promise.race([arrival, skipped]); currentArrival = null;
    for (const c of live) if (c !== maja && c.group.visible && c.anim && !c.anim.def.loop) void c.play('idle', { loop: true });
    applyFinal(i, { teleport: sequence.cancelled || reduced });
    if (sequence.cancelled) {
      stage(i);
      // the cancelled beat unwinds on resolved promises – settle on the final pose once it has
      setTimeout(() => { if (phase === 'waiting' && activeIndex === i && !majaBusy) applyFinal(i); }, 150);
    }
    if (TEST) (window.__arrivals ||= []).push({ i, sim: +(elapsed - arrivedAt).toFixed(2), skipped: sequence.cancelled });
    markVisited(i); setPhase('waiting'); showSheet(i); tick(); if (i === 18) announce(FINALE_FAREWELL);
    if (i === 0 && !reduced) confetti.burst(innerWidth / 2, innerHeight * .3, 65);
    if (i === 18 && !reduced) confetti.rain?.(150);
    nextIdleAt = elapsed + 7;
  } catch (error) { fallback(error); }
}
function closePlan() { $('#plan').hidden = true; $('#plan-backdrop').hidden = true; $('#plan-button').setAttribute('aria-expanded', 'false'); }
function openPlan() { updatePlan(); $('#plan').hidden = false; $('#plan-backdrop').hidden = false; $('#plan-button').setAttribute('aria-expanded', 'true'); $('#plan-close').focus(); }
async function revisit(i) {
  if (phase !== 'waiting' || !visitedNow(i)) return;
  closePlan(); hideSheet(); setPhase('revisiting'); tick();
  // Maja rides along so the next departure starts from the stop that is actually on screen.
  seated = null; rest = null; majaBusy = false;
  await ride(i, { dur: reduced ? .2 : clamp(travelDuration(trainU, world.stations[i].trainU) * .45, 1.2, 2.4) });
  stage(i); parkConductor(i); applyFinal(i); shot(i, { sheet: true, rate: 2 });
  setPhase('waiting'); showSheet(i); tick();
}

/* ------------------------------------------------------------------ announcements */
function sayAnnouncement(i, type) { if (type === 'departure') { announcementQueue.length = 0; clearTimeout(announcementTimer); announcementBusy = false; } announce(STOPS[i][type]); }
function announce(text) { if (!text) return; announcementQueue.push(text); showNextAnnouncement(); }
function showNextAnnouncement() {
  if (announcementBusy || !announcementQueue.length) return;
  announcementBusy = true; document.body.classList.add('announcing'); const text = announcementQueue.shift(); $('#announcement-text').textContent = text; $('#announcement').hidden = false; bandAt = -1;
  clearTimeout(announcementTimer); announcementTimer = setTimeout(dismissAnnouncement, Math.min(6000, 2200 + text.length * 55));
}
function dismissAnnouncement() { clearTimeout(announcementTimer); $('#announcement').hidden = true; document.body.classList.remove('announcing'); announcementBusy = false; bandAt = -1; showNextAnnouncement(); }

/* ------------------------------------------------------------------ easter eggs */
function updateSummary() {
  const summary = $('.journey-summary'); if (summary) summary.innerHTML = finaleSummary();
  const tittut = $('#tittut-count'); if (tittut) tittut.textContent = tittutLine();
}
function discoverEgg(id, line, point) {
  const egg = EGGS.find(e => e.id === id); if (!egg) return;
  const fresh = !store.eggs.includes(id); if (fresh) store.eggs.push(id); save(); updatePlan(); updateSummary();
  toast(fresh ? `🥚 Påskägg ${store.eggs.length}/16 · ${egg.name}\n${line}` : line);
  if (!reduced && point) world.fx.sparkle?.(point);
  vibrate(15);
}
function cycleLine(id, lines) { const n = store.taps['line-' + id] || 0; store.taps['line-' + id] = n + 1; return lines[n % lines.length]; }
function majaSneeze() {
  maja.setExpression('sneeze'); world.fx.sneeze?.(maja.getHeadTop(v()));
  if (seated) { setTimeout(() => maja.setExpression('laugh'), 900); return; }
  void majaOneShot('sneeze').then(() => maja.setExpression('happy'));
}
function tapReaction(id, stationId, point) {
  const raw = id.toLowerCase(), key = EGG_IDS.find(k => raw === k || raw.startsWith(k + '-') || raw.startsWith(k + ':')) || (/star/.test(raw) ? 'moon' : raw);
  if (key === 'mattias') {
    const stop = STOPS.find(s => s.id === stationId) || STOPS[Math.max(0, activeIndex)]; const fresh = !store.foundMattias.includes(stop.id);
    if (fresh) { store.foundMattias.push(stop.id); store.found = store.foundMattias; save(); }
    toast(fresh ? `👀 Mattias hittad: ${store.foundMattias.length}/19\n${stop.foundLine}` : 'Du har redan hittat mig här. 😊'); updatePlan(); updateSummary();
    const m = npc('mattias');
    if (m && !reduced) { world.fx.hearts?.(m.getHeadTop(v())); m.setExpression('laugh'); const pose = mattiasPose(stop.idx); if (pose[0] === 'idle' || pose[0] === 'tiptoe' || pose[0] === 'cheer') void m.play('wave').then(() => m.play(...pose)); setTimeout(() => m.setExpression(stop.id === 'cincin' ? 'happy' : 'sneaky'), 1600); }
    vibrate(15); return;
  }
  if (key === 'maja' || key === 'loco') {
    const t = performance.now(), limit = key === 'maja' ? 6000 : 4000, target = key === 'maja' ? 10 : 5;
    tapWindows[key] = tapWindows[key].filter(at => t - at <= limit); tapWindows[key].push(t); store.taps[key] = (store.taps[key] || 0) + 1; save();
    if (tapWindows[key].length >= target) {
      tapWindows[key] = []; const line = EGGS.find(e => e.id === key).lines[0]; discoverEgg(key, line, point);
      if (!reduced && key === 'maja') { world.bubble?.('💪 11/10', maja.getHeadTop(v()).add(v(0, .3, 0)), { h: .5, dur: 2 }); if (!seated) { majaBusy = false; void majaOneShot('flex'); } }
    } else if (key === 'maja') {
      const prev = maja.baseExpr || 'happy'; maja.setExpression('love'); setTimeout(() => maja.setExpression(prev === 'love' ? 'happy' : prev), 1400);
      if (!reduced) { world.fx.hearts?.(maja.getHeadTop(v())); void majaOneShot(['wave', 'laugh', 'jump'][tapWindows.maja.length % 3]); }
    }
    return;
  }
  if (!EGG_IDS.includes(key)) return;
  if (key === 'moon' && world.timeOfDay < .85) return;
  let line;
  if (key === 'patrik') { line = cycleLine(key, PATRIK_LINES); const p = npc('patrik'); if (p && !reduced) { void p.play('scratchHead'); world.bubble?.('?', p.getHeadTop(v()).add(v(0, .25, 0)), { h: .6, dur: 1.6 }); } }
  else if (key === 'conductor') { line = cycleLine(key, CONDUCTOR_LINES); const c = npc('conductor'); if (c && !reduced) void c.play('bow'); }
  else if (key === 'hen') { const lines = EGGS.find(e => e.id === key).lines; const count = store.taps['line-hen'] || 0; store.taps['line-hen'] = count + 1; line = lines[count ? 1 : 0]; }
  else if (key === 'phone') { store.taps.phone = (store.taps.phone || 2) + 1; line = EGGS.find(e => e.id === key).lines[0].replace('{k}', store.taps.phone); }
  else line = cycleLine(key, EGGS.find(e => e.id === key).lines);
  if (!reduced) {
    if (key === 'horse') majaSneeze();
    if (key === 'cow' || key === 'lamb' || key === 'moon') world.fx.hearts?.(point || maja.getHeadTop(v()));
    if (key === 'disco' && !seated) { majaBusy = false; const p = majaOneShot('dance', { loop: true }); setTimeout(() => { if (maja.anim?.name === 'dance') { majaBusy = false; void maja.play(...(rest || ['idle', { loop: true }])); } }, 2000); void p; }
  }
  discoverEgg(key, line, point);
}
function shownChain(o) { while (o) { if (!o.visible) return false; o = o.parent; } return true; }
function pickables() {
  const list = [{ object: maja.group, id: 'maja' }, ...(world.pickables || [])];
  for (const n of staged) if (['mattias', 'conductor', 'patrik'].includes(n.who)) list.push({ object: n.character.group, id: n.who, stationId: STOPS[stageIndex]?.id });
  return list.filter(p => shownChain(p.object));
}
function hitOk(o) { if (o.userData.proxy || o.name === 'hitProxy') return shownChain(o.parent); return shownChain(o) && !(o.material && o.material.visible === false); }
function setSheetCollapsed(collapsed) { $('#sheet').classList.toggle('collapsed', collapsed); $('#sheet-toggle').setAttribute('aria-expanded', String(!collapsed)); $('#sheet-hint').textContent = collapsed ? 'Dra upp för att läsa ⌃' : ''; vibrate(5); bandAt = -1; if (activeIndex >= 0 && phase === 'waiting') shot(activeIndex, { sheet: !collapsed, rate: 2 }); }
function setupInteractions() {
  $('#depart').addEventListener('click', depart);
  $('#announcement').addEventListener('click', dismissAnnouncement);
  $('#announcement').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dismissAnnouncement(); } });
  document.addEventListener('guess-locked', () => { announcementQueue.length = 0; clearTimeout(announcementTimer); announcementBusy = false; announce('Nödbromsen är dragen. Gissningen är noterad. Konduktören säger ingenting. Konduktören ler lite.'); });
  $('#brake-shortcut').addEventListener('click', () => { if (phase !== 'waiting') return; closePlan(); if ($('#sheet').hidden && activeIndex >= 0) showSheet(activeIndex); if ($('#sheet').classList.contains('collapsed')) setSheetCollapsed(false); $('#brake')?.scrollIntoView({ block: 'start', behavior: reduced ? 'instant' : 'smooth' }); });
  let sheetPointerY = 0, ignoreSheetClick = false;
  $('#sheet-toggle').addEventListener('pointerdown', e => { sheetPointerY = e.clientY; });
  $('#sheet-toggle').addEventListener('pointerup', e => { const d = e.clientY - sheetPointerY; if (Math.abs(d) > 25) { setSheetCollapsed(d > 0); ignoreSheetClick = true; setTimeout(() => ignoreSheetClick = false, 0); } });
  $('#sheet-toggle').addEventListener('click', () => { if (ignoreSheetClick) return; setSheetCollapsed(!$('#sheet').classList.contains('collapsed')); });
  $('#plan-button').addEventListener('click', openPlan); $('#plan-close').addEventListener('click', () => { closePlan(); $('#plan-button').focus(); }); $('#plan-backdrop').addEventListener('click', closePlan);
  $('#plan-stations').addEventListener('click', e => { const button = e.target.closest('[data-station]'); if (button && !button.disabled) void revisit(+button.dataset.station); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#plan').hidden) { closePlan(); $('#plan-button').focus(); }
    if (e.key === 'Tab' && !$('#plan').hidden) { const controls = [...$('#plan').querySelectorAll('button:not(:disabled),a')]; const first = controls[0], last = controls.at(-1); if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); } else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); } }
  });
  document.addEventListener('coat-change', e => maja.setOutfit({ coat: e.detail }));
  // Small games in the sheet can make Maja react in 3D (sneeze at Skäftesfall, dance at Logen).
  document.addEventListener('maja-act', e => {
    if (phase !== 'waiting' || reduced) return; const name = e.detail;
    if (name === 'sneeze') { majaSneeze(); return; }
    majaBusy = false; void majaOneShot(name);
  });
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(); let down;
  canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', e => {
    if ((phase === 'arriving' || phase === 'event') && currentArrival) { skipArrival(); return; }
    if (phase !== 'waiting' || !down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) return;
    const rect = canvas.getBoundingClientRect(); ndc.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
    camera.updateMatrixWorld(); raycaster.setFromCamera(ndc, camera);
    const picks = pickables();
    const hits = raycaster.intersectObjects(picks.map(p => p.object), true).filter(h => hitOk(h.object));
    // Mattias is small and half hidden: if the ray touches his (generous) proxy at all, he wins
    const mGroup = npc('mattias')?.group;
    const mHit = mGroup && hits.find(h => { let o = h.object; while (o) { if (o === mGroup) return true; o = o.parent; } return false; });
    if (mHit) { hits.splice(hits.indexOf(mHit), 1); hits.unshift(mHit); }
    for (const hit of hits) {
      const match = picks.find(p => { let o = hit.object; while (o) { if (o === p.object) return true; o = o.parent; } return false; });
      if (!match) continue;
      if ((world.pickables || []).includes(match)) world.react?.(match.id, hit.object);
      tapReaction(match.id, match.stationId, hit.point); vibrate(10); break;
    }
  });
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); fallback(new Error('WebGL context lost')); });
  document.addEventListener('visibilitychange', () => { lastTimestamp = null; if (!document.hidden) tick(); });
}

/* ------------------------------------------------------------------ boot */
async function boot() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(innerWidth, innerHeight); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, .1, 500); camera.position.set(7, 6, 12);
    await document.fonts.ready;
    const [majaModule, worldModule] = await Promise.all([import('./maja.js'), import('./world.js')]);
    createPerson = majaModule.createPerson;
    world = await worldModule.createWorld({ scene, renderer, camera }); bindWorldStops(world.stations);
    maja = prepCharacter(majaModule.createMaja()); scene.add(maja.group);
    let restored = -1; STOPS.forEach((_, i) => { if (visitedNow(i)) restored = i; });
    const initial = restored < 0 ? 0 : restored;
    trainU = world.stations[initial].trainU; world.setTrainU(trainU);
    stage(initial); parkConductor(initial);
    maja.group.position.copy(world.stations[initial].standPos); maja.group.rotation.y = world.stations[initial].standFacing;
    shot(initial, { snap: true }); camera.position.copy(cam.goalPos); cam.target.copy(cam.goalTarget); camera.lookAt(cam.target);
    const resize = () => { renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); bandAt = -1; }; window.addEventListener('resize', resize); window.visualViewport?.addEventListener('resize', resize);
    setupInteractions(); setPhase('waiting'); initContent(tick); tick();
    if (restored >= 0) { applyFinal(restored); showSheet(restored); shot(restored, { sheet: true, snap: true }); }
    else { maja.setExpression('sleepy'); maja.setProp('right', 'coffee', true); if (now() < unlockAt(8)) { requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => announce(PRE_DEPARTURE), 600))); if (!reduced) void majaOneShot('yawn'); } }
    if (TEST) window.__majaDebug = {
      world, maja, camera, staged: () => staged, cam, shot, ZOOM,
      // project key points for stop i in the arrival (sheet=false) or sheet framing, incl. the sheet head shift
      probe: (i, sheet) => {
        const c = camera.clone(); c.clearViewOffset(); shot(i, { sheet }); c.position.copy(cam.goalPos); c.lookAt(cam.goalTarget); c.updateMatrixWorld(); c.updateProjectionMatrix();
        const s = world.stations[i], ms = mattiasSpot(i), sp = majaSpot(i); world.setTrainU(s.trainU);
        const pr = p => { const q = p.clone().project(c); return { x: Math.round((q.x + 1) * innerWidth / 2), y: Math.round((1 - q.y) * innerHeight / 2) }; };
        const head = pr(sp.pos.clone().add(v(0, 1.75, 0))), feet = pr(sp.pos);
        const bb = innerHeight * .46; const shift = sheet ? clamp(head.y - (band.top + (bb - band.top) * .28), -innerHeight * .2, innerHeight * .38) : 0;
        const mh = { crouch: .95, peek: 1.25, sit: 1.15 }[ms.pose] ?? 1.45;
        const out = { id: s.id, head, feet, mattias: pr(ms.pos.clone().add(v(0, mh, 0))), mattiasFeet: pr(ms.pos), cond: pr(conductorSpot(i).pos.clone().add(v(0, 1.3, 0))) };
        for (const k of ['head', 'feet', 'mattias', 'mattiasFeet', 'cond']) out[k].y -= Math.round(shift);
        world.setTrainU(trainU); if (activeIndex >= 0) shot(activeIndex, { sheet: sheetExpanded() }); return out;
      },
      inspect: () => ({ phase, activeIndex, trainU, viewShift, band: { ...band }, head: (() => { const p = maja.getHeadTop(v()).project(camera); return { x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 }; })(), drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
        picks: pickables().map(p => { const center = new THREE.Box3().setFromObject(p.object).getCenter(v()).project(camera); return { id: p.id, stationId: p.stationId, x: (center.x + 1) * innerWidth / 2, y: (1 - center.y) * innerHeight / 2, z: center.z }; }) }),
    };
    $('#loading').hidden = true; frameId = requestAnimationFrame(loop); setInterval(tick, 1000);
  } catch (error) { fallback(error); }
}
void boot();
