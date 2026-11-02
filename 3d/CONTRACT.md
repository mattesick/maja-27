# Maja-expressen 3D – gemensamt kontrakt

A birthday gift. Girlfriend **Maja Strandh** turns 27 on **Tue 2026-11-03**. She opens the site on her **iPhone (Safari)**
and follows it 08:00–17:00 Stockholm time. Every full hour a new "lucka" (station) unlocks. 10 stations, last at 17:00.
DEADLINE: it must be finished and polished tonight. Prefer a complete, robust, cute result over ambitious-but-broken.

The existing 2D site (reference for all content, tone, time logic, photos, interactions) is the backup:
- `site/klassisk/index.html` (live: https://mattesick.github.io/maja-27/klassisk/)
- Photos: `site/img/*.jpg`

The new version is a **three.js animated story**: a cute toy-like diorama world, a little train travels along a track
between 10 stations; **Maja is a chibi 3D character** who rides the train, steps out at each station and plays a
station-specific animation; then an HTML bottom sheet shows that lucka's content (text, photos, games – ported 1:1 from
the classic site).

## Files & ownership (do NOT edit files you don't own; do NOT git commit/push)

| File | Owner |
|---|---|
| `site/3d/maja.js` (+ `site/3d/dev-maja.html` demo page) | Agent A – characters |
| `site/3d/world.js` (+ `site/3d/dev-world.html` demo page) | Agent B – world, train, stations, fx |
| `site/3d/index.html`, `site/3d/app.js`, `site/3d/content.js`, `site/3d/ui.css` | Agent C – app shell, story director, UI |

Everything is plain ES modules, no build step. three.js r170 is vendored:

```html
<script type="importmap">
{ "imports": {
  "three": "../vendor/three.module.min.js",
  "three/addons/": "../vendor/addons/"
} }
</script>
```
Available addons: `three/addons/geometries/RoundedBoxGeometry.js`, `three/addons/utils/BufferGeometryUtils.js`.
Need another addon? Download it from `https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/<path>` into
`site/vendor/addons/<path>` (check its imports also resolve).

Serve locally with e.g. `python3 -m http.server 8765 --directory site` and open `http://localhost:8765/3d/…`
(ES modules don't work from file://).

## Art direction (shared)

- Cozy, cute, toy-like miniature diorama. Rounded low-poly shapes, soft pastel-warm palette. Swedish autumn
  (early November): orange/yellow/red birches, red wooden houses (falu red) with white trim, green hills, a lake.
- Palette: plum night `#24122b`, paper `#f8f0e3`, wine `#8c1d40`, gold `#f0b43c`, rose `#ff8fa3`, sage `#5f8466`,
  falu red `#9e2a22`, plus natural greens/browns.
- Materials: `MeshToonMaterial` (with a small gradientMap) or `MeshStandardMaterial` (roughness ~0.8). Pick one look and
  keep it consistent; Agent B decides lighting, Agent A must look good under a hemisphere + warm directional light.
- Units: 1 unit ≈ 1 m. Y up. Characters stand with feet at y=0 of their group, face +Z.
- Fonts available on the page: Fredoka (display), Shantell Sans (body), Caveat (handwritten). For 3D text use
  CanvasTexture; wait for `document.fonts.ready` before drawing (or redraw after it resolves).
- Performance budget (iPhone 12 must stay smooth): ≤ 250 draw calls, ≤ 250k triangles total, one shadow-casting
  directional light (shadow map ≤ 2048) or baked fake blob shadows, use InstancedMesh for repeated things
  (trees, grass tufts, flowers, fence posts). Renderer pixelRatio capped at 2. No post-processing.

## Agent A – `maja.js`

```js
import * as THREE from 'three';
export function createMaja(): Character
export function createPerson(opts): Character   // NPCs
// opts: { height=1.7, skin='#f1c7a5', hair: 'long'|'short'|'bun'|'ponytail', hairColor, hairHighlight?,
//         top, bottom, shoes, beard=false, glasses=false }
```
`Character`:
```js
{
  group: THREE.Group,          // origin at feet, faces +Z
  height: number,
  update(dt: number),          // call every frame (blink, breathing, hair sway, animation blending)
  play(name, { loop=false, speed=1 }={}): Promise<void>  // one-shots resolve when done, then return to 'idle'
  // names: 'idle','walk','run','wave','jump','cheer','dance','sneeze','sip','phone','sigh','flex','sit','clink',
  //        'bow','spin','tiptoe','yawn','laugh','point','hug'
  setProp(hand: 'left'|'right', name: null|'coffee'|'glass'|'phone'|'mic'|'fork'|'balloon'|'tissue'|'bouquet'|'bun'),
  setHat(name: null|'nurseCap'|'cap'|'crown'|'headphones'|'partyHat'),
  setOutfit({ top?, bottom?, coat?: null|hex }),   // coat: long coat over outfit
  setExpression(name: 'happy'|'laugh'|'surprised'|'wink'|'sneeze'|'love'|'sleepy'|'sigh'),
  lookAt(worldPos: THREE.Vector3|null),
  walkTo?(pos, speed): Promise<void>   // optional helper (moves group along XZ + plays walk)
}
```
**Maja's look** (from photos): long wavy brown hair with caramel/blonde highlights (balayage), often a high ponytail;
dark defined eyebrows; warm brown/hazel eyes; big warm smile; light-tan skin; small gold hoop earrings + thin gold
necklace; black smartwatch on left wrist. She is **178 cm – the tallest character** (make her ~1.15× NPC height while
chibi). Default outfit: cream chunky knit sweater + wide light jeans + white sneakers. Chibi proportions (big head ~40%
of height), big friendly glossy eyes with highlights, rosy blush. Cute, flattering, never creepy/uncanny.
**Mattias** (boyfriend NPC, appears at the restaurant): messy wavy dark-blond hair, short beard + mustache, olive linen
shirt, dark trousers, ~1.8 m but shorter than Maja in chibi scale. Also make a generic **conductor** (navy uniform,
cap) and **Maria** (Maja's mum: friendly, shoulder-length hair, cardigan, holding a phone).

## Agent B – `world.js`

```js
export async function createWorld({ scene, renderer, camera }): World
```
`World`:
```js
{
  stations: Array<{ idx, h, name, trainU, standPos: Vector3, standFacing: number,
                    cameraPos: Vector3, cameraTarget: Vector3,          // nice framing for the arrival scene
                    npcSpots: Array<{ who: 'mattias'|'conductor'|'maria'|'nurse'|'fan', pos: Vector3, facing: number }> }>,
  train: { group: THREE.Group, seat: THREE.Object3D,   // parent Maja to `seat` while riding (seat.position is her feet)
           doorPos(): THREE.Vector3 },                // world pos just outside the door when stopped
  trackPoint(u): { position: Vector3, tangent: Vector3 },   // u ∈ [0,1], open path from station 0 to 9
  setTrainU(u),                 // positions + orients train (loco + 1–2 carriages following the curve), wheels spin
  setStationState(i, 'locked'|'ready'|'visited'),
        // locked: muted/desaturated, closed barrier, sign showing unlock time
        // ready: glowing beacon / bobbing balloons / sparkles to invite
        // visited: lively, props idle-animate
  setSign(i, text),             // small departure-board sign text at station i (e.g. "11:00" or "om 23 min")
  playStationEvent(i): Promise<void>,   // the station's showpiece animation (see table), ~2–4 s
  setTimeOfDay(f),              // f ∈ [0,1]: 0 = 08:00 crisp morning, 0.6 = afternoon, 0.9 = sunset, 1 = 17:00 dusk
                                // (November in Sweden: dark at 17) → lamps/windows/string lights glow, stars
  fx: { confetti(pos, n?), hearts(pos), notes(pos), sneeze(pos), fireworks(pos), sparkle(pos) },
  update(dt, elapsed)
}
```
Station ids (index → hour → theme → showpiece in `playStationEvent`):
0. 08 **Korsberga** – small village station, red houses, sign "Korsberga", banner "GRATTIS MAJA 27", balloons → balloons rise + confetti.
1. 09 **Neurokirurgen** – cute small hospital "Neurokirurgen", pink brain mascot on the roof → brain bounces & winks, heart-monitor sign blips hearts.
2. 10 **Zara-scenen** – pop stage with speakers & colored lights → spotlights sweep, music notes float.
3. 11 **Skäftesfall** – big farm, red barn, fence, field, hay bales; a horse peeks out of the barn → horse pops out, (app makes Maja sneeze), horse retreats, a "HÄSTFRI ZON" sign drops down with a bounce.
4. 12 **Sparade recept** – food truck / outdoor kitchen + a giant phone billboard with a 3×3 grid of food tiles → tiles shuffle like a slot machine, steam puffs from a pot.
5. 13 **Maria** – little yellow house with a giant ringing phone on a post → phone shakes, speech bubbles pop ("Ring när du kan ❤️", "Har du fått något fint?", "Vad ska ni äta?").
6. 14 **178 cm** – giant measuring ruler with a "178" marker and a podium/trophy "11/10" → marker shoots up past the top, trophy sparkles.
7. 15 **Fika** – café "Fika" with a giant rotating kanelbulle sign, bench + "Stör ej"-sign → bulle spins, steam hearts from a cup.
8. 16 **Logen** – arena stage with disco ball, lasers → disco ball sparkles, lasers sweep, fog puffs.
9. 17 **Cin cin** – restaurant with string lights, terrace table for two with candles & glasses; Mattias waiting → fireworks over the restaurant, string lights twinkle.

Also: rolling hills, a lake, autumn trees, rocks, small flowers, a few birds/clouds drifting, track sleepers + rails,
platform at each station, the train (loco in wine/gold like the classic site's SVG + a carriage with big windows).
Stations spaced so a travel between neighbours takes ~5 s at a pleasant speed.

## Agent C – app shell (`index.html`, `app.js`, `content.js`, `ui.css`)

- Port all content + time logic + interactions from `site/klassisk/index.html` into `content.js` (LUCKOR array with
  html()/init()) and `ui.css` (component styles). Same storage format but key `maja27-3d-v1`; same `?tid=`, `?nollstall`,
  `?test` (test bar: −1 h, +1 h, Nästa lucka, Börja om; key `maja27-3d-test`). Photos: `../img/<name>.jpg`.
- Story director: renderer/camera/loop; places Maja + NPCs; state machine:
  - Load → cute loading screen ("Maja-expressen värmer upp…") → scene.
  - Before 08:00: train waits at Korsberga, Maja on platform (sleepy yawn idles), HUD countdown "Tåget avgår 08:00".
  - When station `visited+1` is unlocked: big button "🚂 Åk till nästa station" (first: "🎂 Starta resan").
    Tap → Maja walks into the train → train travels (camera follows smoothly, slight lead, cinematic) → arrives →
    Maja steps out to `standPos` → world.playStationEvent(i) + Maja station animation (+ props/hats) → bottom sheet
    with that lucka's content slides up. Mark visited. Several unlocked at once → go one station at a time.
  - Waiting: HUD shows "Nästa avgång 13:00 · om 42 min"; Maja does random cute idle anims; tapping Maja triggers a
    reaction (hearts). Sheet can be collapsed to a peek bar to enjoy the 3D view and re-expanded.
  - "Resplan" drawer: list of stations; visited ones re-open their sheet (camera flies there).
  - Nödbroms (guess) like classic. Finale at 17: fireworks, clink with Mattias, sheet with reveal, coat picker,
    "I'm Alive", sign-off. Toasts + vibration when a station unlocks while open.
  - setTimeOfDay follows current time (08→17).
  - WebGL unsupported / error → friendly message + link to `../klassisk/`.
  - Mobile: full-screen canvas, safe areas, no scroll bounce on the canvas, sheet scrolls internally, tap targets ≥ 44px.
- Until A and B deliver, develop against minimal stubs **inside app.js** (feature-detect: try dynamic
  `import('./maja.js')` / `import('./world.js')`, fall back to stubs if missing) so the integrator can just drop them in.

## Verification (everyone)
Use Playwright (Chromium with `--use-gl=angle --use-angle=swiftshader` or `--enable-unsafe-swiftshader`; also try
WebKit) at iPhone viewport 390×844 DPR 3. Screenshot your work and LOOK at the screenshots; iterate until it's
genuinely cute and polished. No console errors. Report screenshot paths.

---

# AMENDMENT 1 (22:30) – halvtimmar, fler karaktärer, easter eggs, direktör

This amendment overrides the sections above where they conflict.

## 1. Schedule: 19 stops, every 30 minutes
- Stop k (k = 0..18) unlocks at 08:00 + 30 min × k Stockholm time: 08:00, 08:30, 09:00 … 16:30, 17:00.
- **Main stations** = full hours (k even) = the 10 stations above (clues 10→2 points, unchanged content).
- **Mellanstopp** = half hours (k odd) = 9 smaller "Hållplats" scenes: bonus content + easter eggs, **no clue/points**.
- `world.stations` is now 19 entries in time order, each with extra fields `kind: 'main'|'mini'`, `t: 'HH:MM'`, `id`.
  Mini stops sit on the track between the main stations (smaller platform + "Hållplats" sign). Travel between
  neighbouring stops ≈ 3–4 s.
- The app's progress UI/Resplan/test bar ("Nästa stopp") work on 19 stops. Storage: `opened`/`visited` hold stop ids.

## 2. The 9 mellanstopp (world staging + showpiece; copy comes from `site/3d/STORY.md` written by the director)
| t | id | Scene | Showpiece (`playStationEvent`) |
|---|---|---|---|
| 08:30 | `spackel` | Cosy apartment corner/ceiling under renovation: ladder, paint tray, a spackle patch on the ceiling | spackle slaps on, sparkle + "Nästan osynligt!" sign |
| 09:30 | `spelkvall` | Living-room diorama: sofa, TV showing a little kart race, 3 friends with game controllers | TV flashes "VINST!", confetti |
| 10:30 | `farhagen` | Sheep pasture: Gotland-style sheep (grey curly wool, black faces) with comically big fluffy **mutton-chop sideburns** (inside joke: the farm's sheep look like a man with mutton chops) + small black lambs | sheep choir "BÄÄ" bubbles, lambs hop |
| 11:30 | `patrik` | Maja's dad **Patrik's** farm yard: red tractor, **Highland cattle** (shaggy ginger, fringe over the eyes, horns), hens pecking, a "Maskinhall" shed with a tiny poster "Patrik 60 · konsert kl 19", a stack of logs | Patrik fells a tree with a chainsaw → "TIMBER!" → tree falls → a big "?" bubble over Patrik (he forgot what he was doing) |
| 12:30 | `shuffle` | Rock bar corner: shuffleboard table, rock posters, red LED scoreboard | puck slides, lands on max, scoreboard flips to "88" |
| 13:30 | `hester` | Maja's sister + her husband **Sebastian** building their house, named **"Hester"** (big sign; Norwegian for "horses" – a joke given her horse allergy): scaffolding, timber, tool belts | hammers bounce, a roof piece drops in, sign wobbles |
| 14:30 | `fagelbo` | Forest glade with a giant woven hay/willow **nest-hut** (Maja's dream spot for alone-time) | birds fly out, leaves swirl |
| 15:30 | `tittut` | Lakeside viewpoint, bench for two at golden hour | a heart-shaped cloud forms |
| 16:30 | `snart` | Lantern-lined bridge/avenue toward the restaurant | lanterns light up one by one toward the finale |

## 3. New characters & props (Agent A)
- **Patrik** (Maja's dad, ~60, farmer): flat cap, checked flannel, work trousers, rubber boots, cheerful, slightly scruffy.
- **Syster** (Maja's sister; similar wavy brown hair in a ponytail, work clothes + tool belt) and **Sebastian**
  (her husband: hoodie, cap, tool belt, beard).
- **Friends** (3 women for the game night: blonde w/ bangs, long light-brown, dark ponytail).
- Props: `'chainsaw','controller','hammer','camera','spatula','puck'`. Hats: `'lxaCap'` (dark-grey washed cap with
  white letters "LXA"), `'flatCap'`, `'hardHat'`. Animations: `'fistPump','crouch','peek','facepalm','scratchHead'`.

## 4. Animals & vehicles (Agent B, procedural, cute): mutton-chop sheep, black lambs, Highland cattle, hens,
the existing horse, birds, red tractor (Patrik drives it around a loop at 11:30 and also cameo-drives through the
background at other farm-ish stops).

## 5. Red thread & easter eggs
- **Konduktören** (conductor NPC) gives a one-line announcement on every departure/arrival ("Nästa: …"). Copy in STORY.md.
- **Hitta Mattias**: Mattias hides somewhere in EVERY stop (behind a tree, in the audience, on the tractor, peeking
  from the nest…). Tapping him → "Hittad!" + counter. Finale reveals "Du hittade mig X av 19 gånger. Ikväll hittar du
  mig vid bord för två." World exposes a hiding spot per stop: `station.mattiasSpot: { pos, facing, pose: 'peek'|'sit'|'stand'|'crouch' }`.
- **Påskägg** counter in Resplan ("Påskägg hittade: 3/12"). Eggs (C implements via picking; B/A provide objects/anims):
  tap a sheep → "Bää" + sideburns wiggle; tap Patrik → random line (see STORY.md: "Vad var det jag skulle göra nu
  igen?", "Har du sett mina nya kor?"); tap a Highland cow → hearts; tap the horse → Maja sneezes "ATSCHO!" wherever she
  is; tap the loco 5× → "TUUT" + steam heart; tap Maja 10× → 'flex' + "💪 11/10"; tap the moon/stars at dusk → heart;
  tap a hen → egg pops out; plus anything the director adds.
- World picking API (Agent B): `world.pickables: Array<{ object: THREE.Object3D, id: string, stationId?: string }>`
  and `world.react(id): void` for world-side reactions (wiggle, bubbles). App does raycasting on tap.

## 6. Photos for mellanstopp (already in `site/img/`)
`spackel.jpg` (Maja in LXA cap, someone spackling the ceiling), `lamm.jpg` (feeding a lamb), `shuffleboard.jpg`,
`fagelbo.jpg` (Maja in the nest-hut), `tittut.jpg` (Mattias peeking over Maja's shoulder). No other new photos.

## 7. Director
A creative-director agent owns `site/3d/STORY.md` (story bible: red thread, conductor lines, every stop's staging
beats, all Swedish copy for the 9 mellanstopp, Patrik lines, easter-egg list). Read it when it appears and follow it.
After the build the director does the final look-and-feel pass with authority to edit any file.
