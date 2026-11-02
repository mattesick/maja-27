# Maja-expressen 3D – STORY BIBLE

Owner: creative director. Builders: follow this. If a beat is too expensive tonight, **drop it cleanly rather than
half-build it** (and tell the director). Copy marked ⟨SV⟩ is final player-facing Swedish – paste it verbatim
(typographic quotes ” ”, en dash –, ellipsis …, no exclamation-mark inflation).

Tone (from the classic site, which is QA'd): dry, warm, short sentences, a small twist at the end, teasing that is
always on Maja's side. Never cringe, never mean. Maria and Patrik are teased *with love*. Nothing about phone numbers,
no invented names (the sister is always "din syster").

---

## 0. Stop table (ids, names, time of day)

`f` = value for `world.setTimeOfDay(f)` when the stop plays (= k/18). App may also drive it from the real clock.

| k | t | id | kind | Resplan / sign name ⟨SV⟩ | f |
|---|---|---|---|---|---|
| 0 | 08:00 | `korsberga` | main | Korsberga | 0.00 |
| 1 | 08:30 | `spackel` | mini | Hållplats Spackel | 0.06 |
| 2 | 09:00 | `neuro` | main | Neurokirurgen | 0.11 |
| 3 | 09:30 | `spelkvall` | mini | Hållplats Spelkväll | 0.17 |
| 4 | 10:00 | `zara` | main | Zara-scenen | 0.22 |
| 5 | 10:30 | `farhagen` | mini | Hållplats Fårhagen | 0.28 |
| 6 | 11:00 | `skaftesfall` | main | Skäftesfall | 0.33 |
| 7 | 11:30 | `patrik` | mini | Hållplats Patriks gård | 0.39 |
| 8 | 12:00 | `recept` | main | Sparade recept | 0.44 |
| 9 | 12:30 | `shuffle` | mini | Hållplats Rockbaren | 0.50 |
| 10 | 13:00 | `maria` | main | Maria | 0.56 |
| 11 | 13:30 | `hester` | mini | Hållplats Hester | 0.61 |
| 12 | 14:00 | `langd` | main | 178 cm över havet | 0.67 |
| 13 | 14:30 | `fagelbo` | mini | Hållplats Fågelboet | 0.72 |
| 14 | 15:00 | `fika` | main | Fika & egentid | 0.78 |
| 15 | 15:30 | `tittut` | mini | Hållplats Tittut | 0.83 |
| 16 | 16:00 | `logen` | main | Logen | 0.89 |
| 17 | 16:30 | `snart` | mini | Hållplats Snart framme | 0.94 |
| 18 | 17:00 | `cincin` | main | Cin cin 🥂 | 1.00 |

(Main-station ids are suggestions; if Agent C already uses others, keep theirs – just keep them stable.)

---

## 1. The red thread

**One day, one train, one secret.** Maja-expressen (tåg 27, wine-and-gold loco) leaves Korsberga at 08:00 and arrives
at the secret destination at 17:00. Every 30 minutes it moves one stop. The world gets warmer in light as the day
goes: crisp blue-white morning → golden early afternoon → amber sunset at 16:00 → plum dusk with lit windows, string
lights and stars at 17:00. The final stop should *feel* like evening plans.

Four threads braid through every stop:

1. **På spåret** (main stations only). Each full hour gives a clue and the points drop 10 → 2. The nödbroms is always
   one tap away. Mellanstopp never give clues or points – they are the "bonus scenery" between questions, like the
   travel films between På spåret stations.
2. **Konduktören.** A small, formal, very dry conductor who takes this one-passenger train extremely seriously. He
   speaks one line when the train departs and one when it arrives (speech bubble over him, or a "📢" HUD banner if he
   isn't in frame). He is the narrator: SJ-announcement language with a joke in the last clause. He knows the
   destination and is visibly (comically) bursting not to say it.
3. **Hitta Mattias.** Mattias hides at every stop. In the morning he is genuinely hidden (peeking from corners,
   behind hay bales); through the afternoon he gets worse and worse at it (taller than the thing he hides behind,
   on purpose); at 15:30 *Tittut* he is right behind her shoulder, exactly like the photo; at 16:30 he is walking ahead
   with a lantern, barely pretending; at 17:00 he is not hiding at all – he is standing at the table for two.
   Finale: "Du hittade mig X av 19 gånger. Ikväll hittar du mig vid bord för två."
4. **Påskägg.** 16 tappable secrets spread over the world (section 3). The counter lives in Resplan. They reward
   curiosity between stops, when she is waiting for the next unlock.

Emotional arc: **wake-up giggle → work pride → pop → home & roots (farm, Patrik, sheep) → lunch → Maria → family
(Hester) → herself (178 cm, the nest, fika, alone-time) → us (Tittut) → getting ready (Logen) → anticipation (Snart)
→ dinner for two.** The afternoon intentionally slows down and gets quieter before the finale lifts.

---

## 2. Stops

Conventions for every arrival (see style guide §4 for timings):
`train brakes → doors open → Maja steps to standPos → conductor arrival line → showpiece + Maja beat (concurrent)
→ sheet rises`. Mattias is already in his spot when the train arrives (he does not move in view, except 17:00).
Departure line plays when she taps "🚂 Åk till nästa station" (and the train pulls out under it).
Props/hats are reset to the defaults (no prop, no hat) when Maja boards, unless noted.

"Camera" = suggested framing for Agent B's `cameraPos/cameraTarget`; phone portrait, the sheet will cover the bottom
~55 % so the *action must sit in the upper half* (see §4).

---

### k0 · 08:00 · Korsberga (main) – "Godmorgon"
- **Before 08:00:** Maja on the platform in default outfit, coffee in right hand, expression `sleepy`, idles `yawn`
  every ~8 s. Train waits with a little steam. Konduktören stands by the door checking his watch.
- **Start (tap "🎂 Starta resan"):** conductor line → banner "GRATTIS MAJA 27" unfurls/brightens, balloons rise +
  confetti (showpiece). Maja: expression `surprised` → `laugh`, `play('cheer')`, then `setHat('partyHat')` (pop on with
  a little scale bounce). No travel for this stop.
- **Camera:** low, slightly below eye level, 3/4 from the front; red houses + banner in the upper third, Maja + loco
  nose in the middle. Slow 4 s dolly-in.
- **Mattias:** `peek` from behind the corner of the nearest red house, half body visible.
- **Konduktören** ⟨SV⟩
  - Waiting (pre-08:00): "Godmorgon. Tåget avgår 08:00. Kaffet är redan ombord."
  - Start: "Välkommen ombord på Maja-expressen, tåg 27. Dagens sträcka: hela din födelsedag."
  - Arrival (after confetti): "Korsberga. Här börjar allt. Grattis, Maja!"
- **Sheet:** classic content, with the two copy patches in §2.1.

### k1 · 08:30 · Spackel (mini)
- **World:** apartment corner, ladder, paint tray, patch on the ceiling. Showpiece: spackle slaps on, sparkle,
  "Nästan osynligt!" sign.
- **Maja:** `setHat('lxaCap')`, `setProp('right','phone')`, `play('phone')` (she is filming, like the photo), looking
  up at the ceiling (`lookAt` patch). When the sign pops: expression `laugh`, small `point` at the patch.
- **Camera:** from low near the floor looking slightly up so the ceiling patch and Maja's cap are both in frame –
  mimic the photo's upward angle.
- **Mattias:** `stand` on the ladder top, upper body hidden *above* a ceiling hatch/behind the curtain – only legs
  visible. (Fallback: `peek` from behind the curtain.)
- **Konduktören** ⟨SV⟩
  - Departure: "Nästa: Hållplats Spackel. Hjälm krävs inte. Keps är obligatoriskt."
  - Arrival: "Spackel. Observera: nyspacklat i taket. Rör inte. Filma gärna."
- **Sheet** ⟨SV⟩
  - Kicker: "Hållplats · 08:30"
  - Title: **Nästan osynligt 🧰**
  - P1: "Varje renovering behöver två personer. En som står på stegen och spacklar. Och en som står nedanför i keps och filmar, ifall det skulle gå åt skogen."
  - P2: "Det är tydligt vem av dem som är projektledare."
  - P3: "Resultatet blev, med branschens eget uttryck, ”nästan osynligt”. Det syns bara i motljus. Och i dagsljus. Men inte om man blundar."
  - Photo `spackel.jpg`, r = -2, pos `center 70%`: "Projektledaren dokumenterar. Hantverket kommenteras inte."
  - Interaction (cheap) **"Spackla klart"**: a beige ceiling box with a dark hole; button "🧰 Spackla". Each tap lays
    one stroke (hole opacity 1 → .55 → .25 → .08). After 3 taps: "Nästan osynligt! ✨ (Syns bara i motljus.)" +
    small confetti. 4th+ tap: "Lägg ner spackelspaden. Det är bra nu."

### k2 · 09:00 · Neurokirurgen (main)
- **Maja:** `setHat('nurseCap')`, coffee in right hand, `play('sip')` ("GCS 15 efter kaffe") → when the brain mascot
  winks, expression `wink` back + `wave`.
- **Camera:** 3/4 from the front, hospital + brain mascot on the roof in the upper third; Maja lower-middle.
- **Mattias:** `crouch` behind a round bush / potted plant by the entrance.
- **Konduktören** ⟨SV⟩
  - Departure: "Nästa: Neurokirurgen. Idag är det någon annan som frågar hur du mår."
  - Arrival: "Neurokirurgen. Avstigning sker lugnt och sansat. Alla resenärer GCS 15."
- **Sheet:** classic content.

### k3 · 09:30 · Spelkväll (mini)
- **World:** living room diorama, sofa, TV with a tiny kart race, 3 friends with controllers. Showpiece: TV flashes
  "VINST!", confetti.
- **Maja:** sits on the sofa arm/edge (`sit`) with `setProp('right','controller')`, leans with the race, then on
  "VINST!" stands → `play('fistPump')`, expression `laugh`. Friends `cheer` (if cheap) or bounce.
- **Camera:** from behind/above the TV looking at the sofa so the four faces are lit by the TV; TV corner visible.
- **Mattias:** `peek` from behind the sofa back (only eyes + hair).
- **Konduktören** ⟨SV⟩
  - Departure: "Nästa: Spelkväll. Ta fram kontrollen. Vänskapen kan komma att prövas."
  - Arrival: "Spelkväll. Tåget går när alla har slutat skylla på kontrollen."
- **Sheet** ⟨SV⟩
  - Kicker: "Hållplats · 09:30"
  - Title: **Spelkväll 🎮**
  - P1: "Spelkväll med tjejerna är en helig institution. Snacks på bordet, fyra kontroller och en vänskap som sätts på prov i varje kurva."
  - P2: "Reglerna är enkla: den som vinner får vara lite för glad. Den som förlorar får skylla på kontrollen. Alla andra får skylla på banan."
  - P3: "Idag behöver du inte ens köra. Du vinner ändå. Det är din dag."
  - No photo.
  - Interaction (cheap) **"Startljuset"**: three dots turn red one by one (0.7 s each), then all green after a random
    0.8–2.5 s delay. Big button "Gasa!". Show reaction time in ms + quip:
    - Too early: "Tjuvstart! Du får skylla på kontrollen. 🎮"
    - < 250 ms: "{ms} ms. Pole position. Det där är neuroreflexer."
    - 250–400 ms: "{ms} ms. Stabil start. Inga bananskal i sikte."
    - > 400 ms: "{ms} ms. Du kom iväg. Det är det viktiga."
    - Button "Kör igen".

### k4 · 10:00 · Zara-scenen (main)
- **Maja:** `setHat('headphones')`, `setProp('right','mic')`, `play('dance',{loop:true})` for ~2.5 s while notes
  float and spotlights sweep, then `play('cheer')`. Expression `happy` → `laugh`.
- **Camera:** front-of-stage, slightly low (concert-goer POV), speakers framing both sides, lights above.
- **Mattias:** `stand` in the little audience (use a `fan` spot), arms up – hidden in plain sight, the only fan with
  a beard.
- **Konduktören** ⟨SV⟩
  - Departure: "Nästa: Zara-scenen. Hörlurar på. Volymen höjs successivt."
  - Arrival: "Zara-scenen. Sjung gärna med. Konduktören sjunger inte. Konduktören nynnar."
- **Sheet:** classic content.

### k5 · 10:30 · Fårhagen (mini)
- **World:** pasture, grey curly sheep with black faces and big fluffy mutton-chop sideburns, small black lambs.
  Showpiece: sheep choir "BÄÄ" bubbles, lambs hop.
- **Maja:** crouches (`crouch`) and holds a finger out to the nearest black lamb (mirrors the photo: lamb nuzzling her
  finger), expression `love`; when the choir starts: stands, `laugh`.
- **Camera:** low, at lamb height, Maja's hand + lamb in the middle, the sideburned sheep choir behind in a row.
- **Mattias:** `crouch` in the middle of the flock, among the sheep, head the same height as theirs (his beard
  makes him fit in a bit too well).
- **Konduktören** ⟨SV⟩
  - Departure: "Nästa: Fårhagen. Vissa resenärer har polisonger. Stirra inte."
  - Arrival: "Fårhagen. Lammen bjuder på mys. Fåren bjuder på frisyrtips."
- **Sheet** ⟨SV⟩
  - Kicker: "Hållplats · 10:30"
  - Title: **Fårhagen 🐑**
  - P1: "Gårdens får ser ut som en man med polisonger. Det är inte vi som har hittat på det. Det är fåren som har bestämt sig."
  - P2: "När man väl har sett det går det inte att se något annat. Grå lockar, svart ansikte och två rejäla polisonger, som en farbror på ett gammalt porträtt som just fått syn på något han inte gillar."
  - P3: "Lammen däremot har inga polisonger än. De har bara ett enda intresse, och det är ditt finger."
  - Photo `lamm.jpg`, r = 2: "Lammet trodde att ditt finger var en napp. Du lät det tro det."
  - Interaction: none in the sheet (the sheep are Påskägg #1 and #2 in 3D). Add a one-line hint:
    "Tips: tryck på ett får. Det har något att säga."

### k6 · 11:00 · Skäftesfall (main)
- **Maja:** steps out, looks around happily (expression `happy`) → horse pops out of the barn → Maja expression
  `sneeze`, `play('sneeze')` + `fx.sneeze` → horse retreats → "HÄSTFRI ZON" sign drops with a bounce → Maja
  `setProp('right','tissue')`, `laugh`, small `point` at the sign.
- **Camera:** wide; barn door on the left third, Maja right-middle, sign drops between them. Tractor may cameo in the
  far background.
- **Mattias:** `peek` from behind a hay bale (round bale, he's the right height).
- **Konduktören** ⟨SV⟩
  - Departure: "Nästa: Skäftesfall. Näsdukar delas ut vid dörrarna."
  - Arrival: "Skäftesfall. Området är inspekterat och nästan helt hästfritt."
- **Sheet:** classic content.

### k7 · 11:30 · Patriks gård (mini)
- **World:** farmyard, red tractor (Patrik drives a loop when not chopping), Highland cattle, hens, "Maskinhall" shed
  with poster "Patrik 60 · konsert kl 19", log stack. Showpiece: Patrik fells a tree with the chainsaw → "TIMBER!" →
  tree falls → big "?" bubble over Patrik.
- **Patrik:** `setHat('flatCap')`, `setProp('right','chainsaw')`; after the "?" he does `scratchHead`.
- **Maja:** `wave` to Patrik ("Hej pappa"), watches the tree fall (expression `surprised`), then at the "?"
  `facepalm` + `laugh`.
- **Camera:** wide 3/4: tree + Patrik left, Maja right, Maskinhall poster readable in the background, a Highland
  cow's fringe in the foreground corner.
- **Mattias:** `sit` in the tractor cab (parked), or if the tractor is driving, `peek` from behind the log stack.
- **Konduktören** ⟨SV⟩
  - Departure: "Nästa: Patriks gård. Vänta vid övergången. Det kommer en traktor. Det kommer alltid en traktor."
  - Arrival: "Patriks gård. Om någon frågar vad han skulle göra: ingen vet. Inte ens han."
- **Sheet** ⟨SV⟩
  - Kicker: "Hållplats · 11:30"
  - Title: **Patriks gård 🚜**
  - P1: "Det här är Patrik. Han kör traktor, fäller träd och tar hand om en gård full av höglandskor och höns. Allt annat glömmer han, ungefär lika snabbt som han hör det."
  - P2: "Det är inte att han inte bryr sig. Det är bara att gården tar upp hela hårddisken. Korna har prioritet. Sedan träden. Sedan traktorn. Sedan vad det var han skulle göra."
  - P3: "I våras fyllde han 60 och firade med konsert i maskinhallen. Andra hyr en festlokal. Patrik flyttade ut traktorn."
  - P4 (aside): "Han vet precis vem du är, och han är väldigt stolt. Han har bara glömt att han redan sagt det. Så han säger det igen."
  - No photo.
  - Interaction **"Patrik-memory"**: 12 cards (6 pairs) face down in a 4×3 grid: 🐄 🐓 🚜 🌲 🪵 🥚. Tap two; match
    stays up, mismatch flips back after 0.8 s. Count moves. Header line: "Patrik spelade den här i förväg. Han minns
    inte hur det gick." On win:
    - ≤ 8 drag: "Klart på {n} drag! Minnet har du uppenbarligen inte fått från pappa. Hjärtat däremot – det fick du."
    - > 8 drag: "Klart på {n} drag! Det tog en stund. Patrik är ändå imponerad. Han har glömt hur många drag han behövde."
    - Button "Spela igen". Confetti burst on win. (Save best score in store as `memoryBest`; optional.)

### k8 · 12:00 · Sparade recept (main)
- **Maja:** `setProp('right','phone')`, `play('phone')` (scrolling) while the billboard tiles shuffle; when they
  stop, phone away → `setProp('right','fork')`, `play('cheer')`, expression `happy`.
- **Camera:** Maja in front of the food truck, giant phone billboard behind her upper third, steam rising.
- **Mattias:** `stand` behind the food-truck counter (chef position, only head + shoulders visible).
- **Konduktören** ⟨SV⟩
  - Departure: "Nästa: Sparade recept. Restaurangvagnen serverar lunch. Receptet är sparat."
  - Arrival: "Sparade recept. Fyratusen recept ombord. Ett av dem kommer vi att laga."
- **Sheet:** classic content (spinner).

### k9 · 12:30 · Rockbaren (mini)
- **World:** rock-bar corner, shuffleboard table, rock posters, red LED scoreboard. Showpiece: puck slides, lands on
  max, scoreboard flips to "88".
- **Maja:** `setProp('right','puck')` → slide motion (`point` or `throw`-like `wave` is fine) → puck leaves her hand as
  world puck → on "88": `play('cheer')` then `point` at herself (exactly the photo: finger to chest, big grin),
  expression `laugh`.
- **Camera:** from the far end of the table looking back at Maja (puck comes toward camera), scoreboard top-right.
- **Mattias:** `peek` from behind a bar stool / the scoreboard post.
- **Konduktören** ⟨SV⟩
  - Departure: "Nästa: Rockbaren. Tåget glider in lika mjukt som en välskjuten puck."
  - Arrival: "Rockbaren. Det står 88 på tavlan. Vi vet vem som ska ha äran."
- **Sheet** ⟨SV⟩
  - Kicker: "Hållplats · 12:30"
  - Title: **88 poäng 🥌**
  - P1: "En rockbar. Iron Maiden på väggen, Alice Cooper på affischen och ett shuffleboardbord som har sett mycket."
  - P2: "Och mitt i alltihop: du, i stickad tröja, som skjuter pucken som om det vore det mest naturliga i världen. Tavlan säger 88."
  - P3: "Du är den enda jag känner som kan se ut som en reklam för en stickad tröja och samtidigt vinna en rockbar."
  - Photo `shuffleboard.jpg`, r = -2.5, pos `center 30%`: "88 på tavlan. Fingret visar vem som ska ha äran."
  - Interaction (cheap) **"Skjut pucken"**: a horizontal power bar with a marker sweeping back and forth (CSS
    animation, 1.1 s per sweep); tap "🥌 Skjut!" to stop it. Zones: 0–40 % / 40–75 % / 75–92 % / 92–100 %.
    - 0–40: "Pucken stannade halvvägs. Den behövde en paus. Det förstår vi."
    - 40–75: "2 poäng. Respektabelt. Ingen i baren reagerar."
    - 75–92: "3 poäng! Baren nickar gillande. 🤘"
    - 92–100: "Kanten! Maxpoäng. Tavlan visar 88. 🤘🎉" + confetti
    - Button text afterwards: "Skjut igen".

### k10 · 13:00 · Maria (main)
- **Maria NPC** stands by the yellow house holding her phone. Giant phone on a post shakes; speech bubbles pop
  ("Ring när du kan ❤️", "Har du fått något fint?", "Vad ska ni äta?").
- **Maja:** `setProp('right','phone')`; at the first bubble: expression `sigh`, `play('sigh')`; third bubble:
  `facepalm`; then softens → `laugh` and walks two steps → `hug` Maria (if cheap; else `wave`). It must end warm.
- **Camera:** 3/4, giant phone upper-left, Maria and Maja middle, bubbles above them.
- **Mattias:** `crouch` behind the white picket fence / mailbox.
- **Konduktören** ⟨SV⟩
  - Departure: "Nästa: Maria. Du har 1 missat samtal. Nej, 2. Nej, vänta…"
  - Arrival: "Maria. Hon ville bara säga grattis. Och en sak till. Och en till."
- **Sheet:** classic content (bingo).

### k11 · 13:30 · Hester (mini)
- **World:** half-built house, scaffolding, timber, big sign "HESTER". Syster + Sebastian with tool belts and hammers.
  Showpiece: hammers bounce, a roof piece drops in, sign wobbles.
- **Syster:** `setHat('hardHat')` optional, `setProp('right','hammer')`. **Sebastian:** `setHat('cap')`,
  `setProp('right','hammer')`. Both hammer, then `wave` to Maja.
- **Maja:** `wave` back; when the sign wobbles she reads it, expression `surprised` → nervous little `sneeze`-face
  (expression only, no sneeze anim) → `laugh`. Optional: `setHat('hardHat')` on Maja for the end pose (cute).
- **Camera:** 3/4 from the front of the house, HESTER sign readable top-centre, three characters across the middle.
- **Mattias:** `peek` from behind the scaffolding (a plank conveniently covers his face – but not his beard).
- **Konduktören** ⟨SV⟩
  - Departure: "Nästa: Hester. Konduktören har kontrollerat: inga riktiga hästar ombord."
  - Arrival: "Hester. Ett hus, två byggare och ett namn som betyder hästar. På norska."
- **Sheet** ⟨SV⟩
  - Kicker: "Hållplats · 13:30"
  - Title: **Hester 🔨**
  - P1: "Din syster och Sebastian bygger hus. Det är stort, det är modigt och det kräver ett otal helger med hammare, ritningar och åsikter om fönster."
  - P2: "Huset heter Hester. Hester är norska. Det betyder hästar."
  - P3: "Av alla ord i alla språk valde de alltså just det. Vi väljer att tolka det som kärlek. Huset är helt hästfritt. Det är bara namnet som är allergiframkallande."
  - P4 (aside): "Antihistamin behövs inte på inflyttningsfesten. Men ta med en för säkerhets skull."
  - No photo.
  - Interaction (cheap) **"Bygg Hester"**: big emoji stage starting with 🧱. Button "🔨 Spika". Each tap advances:
    1 "Grunden är lagd. 🧱" → 2 "Väggarna står. 🪵" → 3 "Taket är på. 🏠" → 4 "Hester är klar! 🏡 Hästfritt intyg utfärdat." (+ confetti, then a tiny stamp "HÄSTFRITT ✓"). Further taps: "Det är klart nu. Sluta spika."

### k12 · 14:00 · 178 cm över havet (main)
- **Maja:** stands next to the ruler, totally relaxed – the "178" marker shoots up past the top anyway. She shrugs
  (expression `wink`), `play('flex')`, then `setHat('crown')` as the trophy sparkles.
- **Camera:** slightly low to emphasise height; ruler full-height in frame, Maja middle-left, trophy "11/10" right.
- **Mattias:** `stand` behind the podium, **on tiptoes** (`tiptoe` if Agent A can loop it) – the podium is clearly
  shorter than him; terrible hiding spot on purpose. (He also clearly comes up shorter than the 178 mark.)
- **Konduktören** ⟨SV⟩
  - Departure: "Nästa: 178 cm över havet. Akta huvudet i dörren. Ja, du."
  - Arrival: "178 cm. Utsikten är fantastisk härifrån. Säger alla som står bakom dig."
- **Sheet:** classic content.

### k13 · 14:30 · Fågelboet (mini)
- **World:** forest glade, giant woven nest-hut. Showpiece: birds fly out, leaves swirl.
- **Maja:** walks to the nest opening, `crouch` inside the entrance (mirrors the photo), expression `sleepy`/content
  → closes eyes (if supported) – the calmest beat of the day. No props, no hat.
- **Camera:** front-on at crouch height, nest filling the frame like the photo, soft leaf particles.
- **Mattias:** `peek` from behind a tree **far** in the background, small in frame. He respects alone-time.
- **Konduktören** ⟨SV⟩
  - Departure: "Nästa: Fågelboet. Tåget kör tyst härifrån. Det har du förtjänat."
  - Arrival (show in small, italic, quieter bubble): "Fågelboet. (Viskar.) Ingen täckning, ingen gruppchatt, ingen Maria."
- **Sheet** ⟨SV⟩
  - Kicker: "Hållplats · 14:30"
  - Title: **Fågelboet 🪺**
  - P1: "Du gillar att vara ensam. Inte för att du inte tycker om folk, utan för att du tar hand om folk hela dagarna, och någon gång måste du få ta hand om dig själv."
  - P2: "Någon har byggt ett jättelikt fågelbo av hö och vide, precis lagom stort för en person som vill vara ifred. Det är inget tillfälle. Det är ett tecken."
  - P3: "Det här är din plats idag. Inga notiser, inga frågor. Bara du och lite fågelkvitter."
  - Photo `fagelbo.jpg`, r = 1.5, pos `center 35%`: "Ett bo för en. Precis som du gillar det."
  - Interaction (cheap) **"Stör ej"**: button "🤫 Gå in i boet". Tapping fades the sheet content to a calm card:
    "Boet är upptaget." / small: "Andas in … och ut." with a slow (6 s) breathing circle (CSS scale animation).
    Tap anywhere: "Välkommen tillbaka. Tåget väntade." Store nothing.

### k14 · 15:00 · Fika & egentid (main)
- **Maja:** sits on the bench (`sit`), `setProp('right','coffee')`, `setProp('left','bun')`, `play('sip')`, expression
  `happy` → `sleepy` (content). "Stör ej" sign is up; kanelbulle sign spins; steam hearts.
- **Camera:** gentle, side-on bench framing, café window warm, bulle sign upper third. Slowest camera of the day.
- **Mattias:** `crouch` behind a tree at the edge of the scene, as far as the spot allows (respecting the coupon
  "En timme helt ifred").
- **Konduktören** ⟨SV⟩
  - Departure: "Nästa: Fika. Kaffet är bryggt, bullen är varm och konduktören håller tyst."
  - Arrival: "Fika. Stör ej-skylten är uppe. Det här är det sista du hör från mig på en halvtimme."
- **Sheet:** classic content with the copy patch in §2.1.

### k15 · 15:30 · Tittut (mini)
- **World:** lakeside viewpoint, bench for two, golden hour. Showpiece: heart-shaped cloud forms.
- **Maja:** sits on the bench (`sit`), takes a selfie: `setProp('right','phone')` raised, expression `wink`
  (duck-face pout from the photo if the face rig allows – else `wink`).
- **Mattias:** `peek` **directly behind her shoulder**, over the bench back – exactly the photo. This is the one stop
  where he is right next to her. When the heart cloud forms, he does a tiny `wave`.
- **Camera:** "selfie POV" – in front of Maja at face height, both faces in frame (Maja big right, Mattias peeking
  left), lake + heart cloud behind.
- **Konduktören** ⟨SV⟩
  - Departure: "Nästa: Tittut. Titta gärna bakom dig. Nej, vänta. Inte än."
  - Arrival: "Tittut. Utsiktsplats för två. Den ena sitter redan och väntar. Typ."
- **Sheet** ⟨SV⟩
  - Kicker: "Hållplats · 15:30"
  - Title: **Tittut 👀**
  - P1 (dynamic, use Hitta-Mattias count `n` so far): 
    - n ≥ 1: "Jag har gömt mig vid varje stopp idag. Hittills har du hittat mig {n} av {m} gånger, och jag blir lika glad varje gång." ({m} = stops reached so far incl. this one, normally 16.)
    - n = 0: "Jag har gömt mig vid varje stopp idag. Du har inte hittat mig en enda gång. Antingen är jag väldigt bra på att gömma mig, eller så har du haft viktigare saker för dig. Båda är okej. Jag sitter bakom dig nu."
  - P2: "Det här är egentligen hela min plan, för idag och sedan: att dyka upp bakom dig, lite för nära, i lite för många av dina bilder."
  - P3: "Ett och ett halvt stopp kvar. Du får gärna börja gissa vad det blir."
  - Photo `tittut.jpg`, r = -2, pos `center 40%`: "Du tog en selfie. Jag tog mig in i den."
  - Interaction: none.

### k16 · 16:00 · Logen (main)
- **Maja:** no hat, hair-down feeling; `setProp('right','mic')`, `play('dance',{loop:true})` ~3 s under disco ball
  sparkles + lasers + fog, then `play('spin')` → `bow`. Expression `laugh`.
- **Camera:** from the "audience" floor, low, disco ball top-centre, lasers crossing behind Maja.
- **Mattias:** `peek` from behind a speaker stack at the side of the stage – the "entire audience (one person)".
- **Konduktören** ⟨SV⟩
  - Departure: "Nästa: Logen. Klädkod: valfri. CUFF IT: obligatorisk."
  - Arrival: "Logen. Strålkastarna är på dig. Publiken, en person, är redo."
- **Sheet:** classic content.

### k17 · 16:30 · Snart framme (mini)
- **World:** lantern-lined bridge/avenue toward the restaurant; dusk. Showpiece: lanterns light one by one toward the
  finale (direction: away from camera, toward the restaurant glow).
- **Maja:** `setOutfit({coat:'#b88a5a'})` (kamel; or `store.coat` colour if already chosen – it won't be yet), walks
  4–5 steps along the lanterns (`walkTo`), stops, looks toward the restaurant (`lookAt`), expression `love`.
- **Camera:** behind and slightly above Maja, looking down the avenue so the lanterns lead the eye to the restaurant.
- **Mattias:** `stand` at the far end of the bridge **behind one lantern post** that is far thinner than him. He is
  basically not hiding anymore.
- **Konduktören** ⟨SV⟩
  - Departure: "Nästa: Snart framme. Lyktorna tänds en efter en. Det är ingen slump."
  - Arrival: "Snart framme. En hållplats kvar. Ta på dig något fint."
- **Sheet** ⟨SV⟩
  - Kicker: "Hållplats · 16:30"
  - Title: **Snart framme 🏮**
  - P1: "Solen har gått ner, lyktorna är tända och tåget har bara en station kvar."
  - P2: "Om du inte har dragit i nödbromsen än är det här sista chansen. Juryn är fortfarande jävig och ser fram emot att döma till din fördel."
  - P3: "Ta på dig något fint. Du har en dejt om en halvtimme. (Med mig. Ifall det var oklart.)"
  - No photo.
  - Interaction (cheap) **"Tänd lyktorna"**: a row of 9 lantern buttons (🏮 dim, opacity .35) labelled with the
    hours 08–16. Tap each to light it (glow, opacity 1, vibrate 8). When all 9 are lit: "Vägen är upplyst. Vi ses
    klockan 17. 🥂" Lit state can be ephemeral.

### k18 · 17:00 · Cin cin (main) – FINALE
- **World:** restaurant terrace, string lights, table for two with candles and glasses; fireworks over the roof.
  Time of day = 1 (dusk, stars).
- **Sequence** (~7 s total, tap skips to sheet):
  1. Train arrives slowly, last brake has an extra-long "pssh" of steam.
  2. Maja (in coat) steps out, walks the terrace (`walkTo` the table).
  3. Mattias, **not hiding**, stands up from his chair, `wave` → Maja expression `surprised` → `love`.
  4. Both get glasses (`setProp('right','glass')`), `play('clink')` at the same moment → `fx.hearts` at the glasses.
  5. Fireworks (`playStationEvent`), string lights twinkle; camera slowly rises and pulls back to reveal the whole
     day's track glowing behind them (if cheap: just pull back and up 30 %).
  6. Tapping Mattias here counts as found (if not counted yet) with a special line (see §3.2).
- **Camera:** first over-the-table close-up (candles in foreground, both faces middle third, string lights top),
  then the slow rise/pull-back.
- **Konduktören** ⟨SV⟩
  - Departure: "Nästa: slutstation. Destinationen är fortfarande hemlig. Jag har blivit ombedd att hålla tyst."
  - Arrival: "Slutstation. Bord för två. Tack för att du reste med Maja-expressen."
  - After the sheet opens (optional, once): "Konduktören går av här. Han önskar en trevlig kväll. Han gråter inte, det är ångan."
- **Sheet:** classic finale content, plus the Hitta Mattias + Påskägg summary block **above the sign-off** (§3.3).

### 2.1 Copy patches to classic main-station content (only these)
- **Korsberga** P1 "Idag rullar ett tåg genom hela din dag, och varje hel timme öppnas en ny lucka." →
  ⟨SV⟩ "Idag rullar ett tåg genom hela din dag. Varje halvtimme stannar det någonstans."
- **Korsberga** rules list → ⟨SV⟩
  1. "Kika in varje halvtimme mellan 08 och 17. Hela timmar är stationer, halvtimmar är små hållplatser med bonusmaterial."
  2. (unchanged) "Varje station har en ledtråd till kvällens hemliga resmål. Precis som i På spåret: ju tidigare du gissar rätt, desto fler poäng."  *(only "lucka" → "station")*
  3. (unchanged) nödbroms rule.
  4. "Jag har gömt mig vid varje stopp. Hitta mig. Och tryck gärna på saker – det finns påskägg."
- **Fika** last aside "Vi ses 16:00." → ⟨SV⟩ "Det här är dagens enda lucka där mobilen gärna får läggas ifrån sig. Tåget väntar snällt till 15:30."
- Footer/ticket "En ny lucka varje timme." (if reused anywhere) → ⟨SV⟩ "Ett nytt stopp varje halvtimme."

### 2.2 UI copy ⟨SV⟩ (Agent C)
- Loading: "Maja-expressen värmer upp…" (sub: "Lägger ut rälsen, blåser upp ballonger.")
- First button: "🎂 Starta resan" · later: "🚂 Åk till nästa station" · mini: same button, the HUD shows the stop name.
- HUD waiting: "Nästa avgång {HH:MM} · {om X min}" · before 08:00: "Tåget avgår 08:00 · {om X min}".
- HUD when caught up and waiting for a mini: "Nästa: Hållplats {namn} {HH:MM}". Only show the name of the *next*
  stop, never later ones (keep surprises).
- Unlock toast: main "🔔 Tåget kan rulla vidare! Nästa station väntar." · mini "🔔 Ny hållplats öppen. Tryck här."
  · final "🔔 Slutstationen är öppen! 🥂"
- Sheet peek bar: "Dra upp för att läsa ⌃" · re-open from Resplan: same sheet, camera flies.
- Resplan title: "Resplan" · row states: "✓", "Nu", "🔒 {HH:MM}" · counters: "Mattias hittad: {n}/19" and
  "Påskägg: {n}/16".
- Nödbroms locked → conductor bubble/toast: "Nödbromsen är dragen. Gissningen är noterad. Konduktören säger
  ingenting. Konduktören ler lite."
- WebGL failure: "Tåget kom inte riktigt iväg den här gången. Ingen fara – samma resa finns i klassisk version."
  link text "Åk klassiskt →" (href `../klassisk/`). Headline above it: "Signalfel i Nässjö." (also used in `<noscript>`).
- Mattias found toast (two lines; the stop lines already say "Hittad"): "👀 Mattias hittad: {n}/19" ⏎ {stop line}.
- Depart button after the finale (disabled): "Framme ♥ Vi ses vid bordet".
- Resplan helper lines: "Tryck på ett stopp du har besökt för att åka tillbaka och kika igen." · "Mattias gömmer sig vid
  varje stopp. Tryck på honom när du ser honom. Han blir sämre på det ju längre dagen går."
- Scene caption note (only visible with the sheet closed): "Någon gömmer sig här. Bara så du vet." · at 17:00:
  "Ingen gömmer sig här längre."
- Share text (og:description): "Ett tåg, nitton stopp och en hel födelsedag. Avgång 08:00."
- Konduktören's finale farewell (§k18 "after the sheet opens") is queued once when the 17:00 sheet opens.
- Scene caption before the first stop: eyebrow "TISDAG 3 NOVEMBER · FÖRSTA KLASS", title "Slutstation: hemlig.", note
  "En resa genom hela din födelsedag. Ett nytt stopp varje halvtimme." · per stop eyebrow: main "STATION {n} AV 10 ·
  {HH:MM}", mini "HÅLLPLATS · {HH:MM}", finale "SLUTSTATION · 17:00".
- Travel caption (while the train rolls): title "Välkommen ombord!" (start) / "Mot {stop}…"; sub-line "Fönsterplats,
  såklart." (start) · "Stopp {k} av 19 · slutstation hemlig" · last leg "Sista sträckan. Fönsterplats, för sista gången
  idag."
- Depart button while busy: "🚂 På väg…" / "✨ Ett ögonblick…" · locked: "Nästa avgång {HH:MM}" · HUD when the next stop
  is open: "Nästa: {stop}" + "Dags att åka" · after the finale: "Framme! Cin cin 🥂".

### 2.3 Instruction lines for the mini-stop games ⟨SV⟩ (one short line under each game title)
- Spackla klart: "Tre drag med spackelspaden. Projektledaren filmar."
- Startljuset: "Vänta på grönt. Tryck ”Gasa!” så fort det slår om." · start button before the lights: "🏁 Till start"
- Skjut pucken: "Stoppa mätaren. Ju närmare kanten, desto bättre."
- Bygg Hester: "Din syster och Sebastian behöver en hand. Spika tills det är klart."
- Tänd lyktorna: "En lykta för varje timme du har rest idag."

### 2.4 Main-station mini-games ⟨SV⟩ (DOM-only, inside the classic hatch content, nothing stored)
The classic hatch content stays verbatim; each game sits in a `bonus-game` box inside it. Two games also make 3D Maja
react (DOM event `maja-act`, only while the sheet is up and no arrival is playing): ATSCHO → Maja sneezes; "Starta
musiken" → Maja dances.
- **09 Neurokirurgen – "Pupillkontroll 🔦"** (after the journal). Line: "Rutinkontroll innan avfärd. Tryck så fort
  lampan tänds." Button "🔦 Starta kontrollen" → "👁️ Reagera!" (status "Titta på lampan…"); the eye turns gold
  and the pupil shrinks after 1.2–3.5 s. Afterwards "🔦 Ny kontroll".
  - Too early: "För tidigt. Lampan var inte ens tänd. Ivrigheten noteras i journalen."
  - < 300 ms: "{ms} ms. Pupillerna reagerar prompt. Neurologiskt: utmärkt. Kosmetiskt: också." (+ confetti)
  - 300–500 ms: "{ms} ms. Normal ljusreaktion. Patienten är vaken, adekvat och fyller år."
  - > 500 ms: "{ms} ms. Lite trögt, men klockan är nio. GCS 15 efter kaffe, precis som journalen säger."
- **10 Zara-scenen – "Tidslinjen 📅"** (after the playlist). Line: "Tryck på låtarna i den ordning de kom ut. Äldst
  först." Songs, shuffled: Uncover (2013), Lush Life (2015), Ain't My Fault (2016), Symphony (2017). A right tap shows
  the year ("Rätt. 🎧"); wrong taps cycle "Inte än. Den kom senare." · "Nej, den är nyare än så." · "Rätt artist, fel år."
  - 0 misses: "Perfekt ordning! Zara, ring oss. Vi har hittat din arkivarie." (+ confetti)
  - otherwise: "Klart! {n} felsteg på vägen. De räknas inte, det var koreografi."  · button "Spela igen"
- **11 Skäftesfall – "Håll inne nysningen 🤧"** (before the aside). Line: "En häst har tittat ut ur stallet. Tryck
  snabbt för att hålla emot. (Det går inte. Men försök.)" A pressure bar fills faster and faster; each tap pushes it
  back. Status: "Det kittlar lite…" → "Ah… ah…" → "AAAH…"; face 🙂 😐 😣 😫 → 🤧. Buttons "🤧 Håll emot" → "👆 Håll
  emot!" → "🐴 En gång till". It always ends in ATSCHO ({s} with decimal comma):
  - < 2.5 s: "ATSCHO! {s} sekunder. Kroppen hade redan bestämt sig."
  - < 4.5 s: "ATSCHO! {s} sekunder. Starkt kämpat. Hästen ber om ursäkt."
  - else: "ATSCHO! {s} sekunder. Nytt Skäftesfallsrekord. Det slutade ändå i ATSCHO. Det gör det alltid."
- **16 Logen – "Takttest 🪩"** (after the last paragraph). Line: "Klappa i takt med discokulan. Åtta slag, sedan
  domen." Button "▶️ Starta musiken" → "👏 Klapp" (count-in "Fem, sex, sju, åtta…", then "Klappa! 👏"), 100 BPM,
  8 beats → "▶️ En gång till".
  - no taps: "Inte ett enda klapp. Ibland är det bäst att bara lyssna."
  - > 12 taps: "Det där var inte klapp, det var applåder. Tack, tack."
  - < 6 taps: "{k} klapp av 8. Du sparar energin till ikväll. Klokt."
  - avg < 70 ms: "Snitt {ms} ms från takten. Beyoncé, ring oss." (+ confetti)
  - avg < 150 ms: "Snitt {ms} ms från takten. Stabilt. Publiken (jag) klappar med."
  - else: "Snitt {ms} ms från takten. Du dansar i din egen takt. Det är också en takt."

### 2.5 Waiting notes ⟨SV⟩ (the small ticket line under the depart button, shown while waiting after stop k)
Konduktören's running voice between stops; never names the next stop. Morning → dusk on purpose. Before 08:00 and
as fallback: "Ett nytt stopp varje halvtimme." When the next stop is open: "Fönsterplatsen är din."
| after | note |
|---|---|
| korsberga | "Morgonsol över Korsberga. Kaffet räcker till nästa stopp." |
| spackel | "Spacklet torkar. Rör inte taket." |
| neuro | "Journalen är uppdaterad. Patienten mår utmärkt." |
| spelkvall | "Kontrollerna laddas. Vänskapen återhämtar sig." |
| zara | "Konduktören nynnar fortfarande. Han förnekar det." |
| farhagen | "Fåren tittar efter tåget. Med polisongerna." |
| skaftesfall | "Näsdukarna räcker. Hästen är inlåst." |
| patrik | "Patrik vinkar efter tåget. Han vet inte riktigt varför." |
| recept | "Lunchen är sparad. Precis som allt annat." |
| shuffle | "Tavlan står kvar på 88. Ingen vågar röra den." |
| maria | "📱 1 missat samtal." |
| hester | "Det spikas fortfarande på Hester." |
| langd | "Akta huvudet när du kliver på. Ja, fortfarande du." |
| fagelbo | "Tyst kupé. Tåget väntar tills du är redo." |
| fika | "Solen står lägre nu. Bullen är uppäten." |
| tittut | "Det börjar skymma. Någon sitter fortfarande bakom dig." |
| logen | "CUFF IT en gång till. Sedan något fint på dig." |
| snart | "Lyktorna är tända. Bordet är dukat." |
| cincin | (end) "Grattis på 27-årsdagen, Maja." |

---

## 3. Hitta Mattias & Påskägg

### 3.1 Hitta Mattias – found lines ⟨SV⟩
Tap on Mattias → he does a tiny `wave`/`laugh`, `fx.hearts` at his head, toast "👀 Mattias hittad: {n}/19" + the
stop's line on a second row (below). Count once per stop (store `found: [stopIds]`). Second tap at a stop: just hearts, toast "Du har redan
hittat mig här. 😊"

| stop | line |
|---|---|
| korsberga | "Hittad! Jag har stått här sedan sju. Värt det." |
| spackel | "Hittad. Benen avslöjade mig." |
| neuro | "Hittad! Busken var mindre än den såg ut." |
| spelkvall | "Hittad. Jag sitter inte med i laget. Jag hejar bara." |
| zara | "Hittad! Störst fan. Bokstavligen." |
| farhagen | "Hittad. Jag smälte in lite för bra." |
| skaftesfall | "Hittad! Höbalen var min bästa vän i en kvart." |
| patrik | "Hittad. Patrik vet inte att jag är här. Han har glömt det." |
| recept | "Hittad! Dagens lunch: du väljer, jag diskar." |
| shuffle | "Hittad. Jag tittade på när du vann." |
| maria | "Hittad! Säg inget till Maria. Hon ringer annars." |
| hester | "Hittad. Byggnadsställningen var en dålig idé." |
| langd | "Hittad. Jag stod på tå. Det hjälpte inte." |
| fagelbo | "Hittad, på behörigt avstånd. Jag går nu." |
| fika | "Hittad. Förlåt. Jag går tillbaka bakom trädet." |
| tittut | "Tittut! Den här gången var det inte så svårt." |
| logen | "Hittad! Hela publiken, en person, närvarande." |
| snart | "Hittad. Lyktstolpen var smalare än jag trodde." |
| cincin | "Hittad. Jag tänkte inte gömma mig här." |

### 3.2 Finale line ⟨SV⟩ (in the 17:00 sheet, §3.3)
Pick exactly one:
- n = 19: "Alla 19! Du har uppenbarligen gjort det här förut. Ikväll hittar du mig vid bord för två."
- 1 ≤ n ≤ 18: "Du hittade mig {n} av 19 gånger. Ikväll hittar du mig vid bord för två."
- n = 0: "Noll av 19. Antingen är jag bra på att gömma mig, eller så hade du bättre saker för dig. Ikväll blir det lättare: jag sitter vid bord för två."

### 3.3 Finale summary block ⟨SV⟩ (above sign-off)
Small ticket-style box, title "Resans statistik":
- "Hållplatser: 19 av 19"
- "Mattias hittad: {n}/19" + the finale line above
- "Påskägg: {e}/16" + one line:
  - e = 16: "Alla! Du är officiellt dagens mest noggranna resenär. Patrik hade glömt var han lade hälften."
  - e ≥ 8: "Fint fångat. Resten ligger kvar till nästa år."
  - e < 8: "Det finns fler. De går inte någonstans. Du kan leta i kväll, efter efterrätten."

### 3.4 Påskägg – the fixed list (TOTAL = 16)
Counter "Påskägg: {n}/16" in Resplan. First discovery of each → toast "🥚 Påskägg {n}/16 · {name}" + the line,
small sparkle at the object, vibrate 15. Repeat taps still react (cycle lines where several are given) but don't
count. Pick ids exactly as below (`world.pickables[].id`; for app-side things the app owns the id).

| # | id | name ⟨SV⟩ | trigger | reaction | line(s) ⟨SV⟩ |
|---|---|---|---|---|---|
| 1 | `sheep` | Farbror Polisong | tap any sheep | sideburns wiggle, "BÄÄ" bubble | "Bää." · "Bää. (Han stryker sig över polisongerna.)" · "Bää-ää. Det betyder grattis på fårspråk." · "Bää. Han tycker att du borde skaffa polisonger. Vi säger nej." |
| 2 | `lamb` | Lammet | tap a black lamb | hop + heart | "Mä! Lammet vill ha fingret igen." · "Mä. (Lammet har inga polisonger än. Det jobbar på det.)" |
| 3 | `patrik` | Patrik | tap Patrik | Patrik `scratchHead`, "?" bubble or his line in a bubble | see §3.5 (cycle in order) |
| 4 | `cow` | Höglandskon | tap a Highland cow | hearts, fringe sways | "Mu. Hon ser dig inte genom luggen, men hon gillar dig." · "Mu. (Hon har bättre lugg än någon i Korsberga.)" |
| 5 | `hen` | Hönan | tap a hen | an egg pops out and rolls | first: "Ett påskägg! Ett riktigt ett, dessutom. 🥚" · repeat: "Ett till. Hönan är på gott humör idag." |
| 6 | `horse` | Hästen | tap the horse | horse ducks; Maja wherever she is: expression `sneeze`, `play('sneeze')`, `fx.sneeze` | "ATSCHO! Hästen ber om ursäkt och går in igen." · "ATSCHO! Vi sa ju hästfri zon." |
| 7 | `tractor` | Traktorn | tap the tractor | honk "TUT-TUT", small bounce | "TUT-TUT! Patriks kontor. Öppet dygnet runt, ingen wifi." · "Nyckeln sitter i. Det är därför Patrik aldrig tappar bort den." |
| 8 | `loco` | Loket | tap the loco 5× within 4 s | "TUUUT" + steam puff shaped like a heart | "TUUUT! Loket blev lite kär. 💨❤️" |
| 9 | `maja` | Muskler | tap Maja 10× within 6 s | `play('flex')`, "💪 11/10" bubble | "💪 11/10. Bilden är inte redigerad. (Jo.)" |
| 10 | `moon` | Månen | tap moon/stars, only when timeOfDay ≥ 0.85 | moon pulses, heart of stars/`fx.hearts` in sky | "Månen tittade fram. Den ville också säga grattis." |
| 11 | `hester` | Hester-skylten | tap the HESTER sign | sign wobbles/flips briefly to show "= HÄSTAR (NO)" | "Hester betyder hästar på norska. Huset är helt hästfritt. Det är bara namnet." |
| 12 | `brain` | Hjärnan | tap the brain mascot | brain winks + bounces, heart blip | "Hjärnan blinkar. GCS 15, prognos utmärkt." |
| 13 | `phone` | Mammas telefon | tap Maria's giant phone | phone rings/shakes, bubble with count | "📱 Missade samtal från Mamma: {k}. Hon vill bara höra hur du har det." (k increments per tap, start 3) |
| 14 | `bulle` | Kanelbullen | tap the giant kanelbulle sign | spins fast, steam hearts | "Bonus: en extra bulle. Två är också okej, ingen dömer." |
| 15 | `disco` | Discokulan | tap the disco ball | extra sparkle burst; Maja `dance` 2 s wherever she is | "CUFF IT, volym upp. Det var regeln." |
| 16 | `conductor` | Konduktören | tap the conductor | conductor `bow`, line bubble | see §3.6 (cycle) |

### 3.5 Patrik lines ⟨SV⟩ (cycle in this order, then loop)
1. "Vad var det jag skulle göra nu igen?"
2. "Har du sett mina nya kor?"
3. "Grattis, Maja! Du fyller… vänta, jag vet det här… 27!"
4. "Har du sett mina nya kor? Har jag frågat det redan? De har lugg."
5. "Jag skulle bara fälla en gran. Det blev sju."
6. "Har någon sett motorsågen? … Jaså. Jag håller i den."
7. "Maskinhallen har bättre akustik än Avicii Arena. Ingen har bevisat motsatsen."
8. "Ring om du behöver något. Jag svarar om jag inte sitter i traktorn. Jag sitter i traktorn."
9. "Den där björken har stått där i fyrtio år. Den har ett par minuter kvar."
10. "Hönsen värper bättre än jag minns. Fast det är inte så svårt."
11. "Jag fyllde 60 i våras. Det var konsert. Det minns jag. Resten är lite oklart."
12. "Vem var det som fyllde år idag nu igen? … Skojar. Det är du. Det är alltid du."

### 3.6 Konduktören tap lines ⟨SV⟩ (cycle)
1. "Biljetten, tack. … Den gäller hela dagen, fröken Strandh."
2. "Första klass, såklart."
3. "Inga förseningar idag. Jag har pratat med Nässjö."
4. "Destinationen är hemlig. Jag har skrivit på ett papper."
5. "Det är inte tillåtet att vara så här glad i vagnen. Undantag beviljas."
6. "Resenären ombeds hålla uppsikt över sin pojkvän. Han gömmer sig."

---

## 4. Visual style guide (what "looks good" means at review)

**Canvas: iPhone portrait 390×844 CSS px, DPR 3.** Everything is judged there first.

Framing
- Arrival shots: Maja's head in the **upper 25–45 %** of the viewport *before* the sheet rises; when the sheet is up
  (covers ≈ 55 %, peek bar ≈ 72 px), the camera target must be offset so Maja + the showpiece remain visible in the
  top ~40 %. Never let the sheet cover Maja's face.
- Maja on screen in arrival close-ups: **≈ 18–28 % of viewport height**. Travel shots: train ≈ 30–45 % of width.
- Rule of thirds: showpiece object in the upper third, Maja middle-left or middle-right, never dead centre behind
  HUD. Keep 16 px + safe-area clear at the top for the HUD and the notch.
- Mattias must be *findable*: at least ~24×24 px on screen and partially visible in the arrival framing (hide, don't
  bury). Pick hit-areas generously (invisible 1.5× proxy box).
- No camera clipping through walls/roofs/trees; no near-plane cuts of Maja's head.

Readability
- 3D text (signs, banner, "88", "HESTER", "Patrik 60 · konsert kl 19") must be legible at the arrival framing on a
  390 px wide screen: cap height ≥ 12 CSS px on screen, high contrast (paper `#f8f0e3` on wine/plum, or plum on
  paper/gold). Fredoka 600 for signs.
- Speech bubbles (conductor, Patrik, sheep): HTML overlay anchored to the 3D head, paper background, plum `#24122b`
  text, Fredoka 500–600 **16 px**, max-width 260 px, ≤ 2 lines, 12 px radius, small tail, soft shadow. On-screen time
  **2.2 s + 55 ms/char**, max 6 s, tap to dismiss. Never two bubbles overlapping – queue them.
- Toasts: bottom-above-sheet, ≤ 2 lines, 15–16 px. Body copy in the sheet ≥ 16 px Shantell Sans, line-height 1.5.
- At dusk (f ≥ 0.85) recheck contrast: HUD and bubbles keep the paper background; never white text on a light sky.

Colour
- Shared palette only (plum, paper, wine, gold, rose, sage, falu red + naturals). Autumn trees in warm
  orange/yellow/red; grass desaturated sage-green, not lime. Sheep grey with black faces; lambs near-black
  `#2a2628` with a soft rim light so they don't vanish; Highland cattle ginger `#b5642c`.
- Lighting arc: morning cool-bright (sky `#cfe3f2`, sun pale gold), noon neutral-warm, 16:00 amber (`#f3a35b`
  sky band), 17:00 plum-to-navy gradient with warm window/string light glow (`#ffd27a`). Emissives on at f ≥ 0.85.
- Locked stations: desaturated ~50 % and slightly darker, never grey mush; ready stations clearly the brightest
  thing on screen (beacon/balloons).

Animation timing
- Travel between neighbours: **3–4 s**, ease-in-out (cubic), camera lags ~0.25 s with a slight lead toward the next
  stop; no sudden yaw > 60°/s.
- Arrival choreography budget (from wheels stopping to sheet start): **≤ 6 s** for minis, **≤ 7 s** for mains,
  **≤ 9 s** for the finale. Tap anywhere skips to the sheet.
  - brake + steam 0.6 s → door 0.3 s → step out 0.8 s → conductor line → showpiece 2–4 s with Maja's beat starting
    0.2 s after the showpiece → sheet slides up 0.35 s (ease-out) ~0.4 s after the showpiece peak.
- Easter-egg feedback within **100 ms** of the tap (squash/sparkle), toast within 300 ms.
- Idle: Maja random idle every 6–12 s (`yawn` only before 10:00 and never twice in a row). Nothing on screen should
  be fully still – gentle bob on balloons, smoke, birds, tree sway.
- Hats/props appear with a 0.2 s scale pop (0 → 1.15 → 1), never just blink in.
- `prefers-reduced-motion`: keep the story, cut camera shake/rapid lights, halve particle counts, no loops > 2 s.

Cuteness checklist (director will check each stop)
1. Can you tell which stop it is in < 1 s with the sheet down? 2. Is Maja's face visible and happy (or expressively
sneezing)? 3. Is Mattias visible-but-hidden? 4. Is the text legible? 5. Does it run smooth (no hitches during the
arrival)? 6. Does it end warm?
