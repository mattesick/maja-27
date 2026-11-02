/* ================= Inställningar ================= */
const CONFIG = {
  date: [2026, 11, 3],   // år, månad, dag
  utcOffset: 1,          // Stockholm vintertid (CET = UTC+1)
  signature: 'Mattias',
  restaurant: '',        // t.ex. 'Restaurang Namn' – lämna tomt för att hålla det hemligt
  dinnerTime: '',        // t.ex. '19:00'
};

/* ================= Tid ================= */
const unlockAt = h => Date.UTC(CONFIG.date[0], CONFIG.date[1] - 1, CONFIG.date[2], h - CONFIG.utcOffset, 0, 0);
const params = new URLSearchParams(location.search);
let offset = 0;
(() => {
  // Testläge: ?tid=13:05 eller ?tid=2026-11-03T13:05 (svensk tid)
  const raw = params.get('tid');
  if (!raw) return;
  let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  let y, mo, d, hh, mm, ss;
  if (m) { [, y, mo, d, hh, mm, ss] = m; }
  else if ((m = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/))) { [, hh, mm, ss] = m; [y, mo, d] = CONFIG.date; }
  else return;
  const target = Date.UTC(+y, +mo - 1, +d, +hh - CONFIG.utcOffset, +mm, +(ss || 0));
  offset = target - Date.now();
})();
const TEST = params.has('test');
if (TEST && !params.get('tid')) offset = unlockAt(8) - 8000 - Date.now(); // börja 07:59:52
const now = () => Date.now() + offset;

/* ================= Lagring ================= */
const KEY = TEST ? 'maja27-3d-test' : 'maja27-3d-v1';
if (params.has('nollstall')) { try { localStorage.removeItem(KEY); } catch {} }
let store;
try { store = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { store = {}; }
store.opened ||= []; store.bingo ||= []; store.coupons ||= [];
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch {} };

/* ================= Hjälpare ================= */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const hhmm = h => `${pad(h)}:00`;
const vibrate = p => { try { navigator.vibrate && navigator.vibrate(p); } catch {} };
function fmtCountdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s % 3600 / 60))}:${pad(s % 60)}`;
}
function fmtHuman(ms) {
  const m = Math.ceil(ms / 60000);
  if (m < 1) return 'nu';
  if (m < 60) return `om ${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `om ${h} h ${r} min` : `om ${h} h`;
}
const q = s => encodeURIComponent(s);
function song(artist, title, note = '', big = false) {
  return `<div class="song${big ? ' big' : ''}"><div class="disc"></div>
    <div class="t"><b>${esc(title)}</b><span>${esc(artist)}${note ? ' · ' + esc(note) : ''}</span></div>
    <div class="links"><a class="sp" href="https://open.spotify.com/search/${q(artist + ' ' + title)}" target="_blank" rel="noopener">Spotify</a>
    <a class="yt" href="https://www.youtube.com/results?search_query=${q(artist + ' ' + title)}" target="_blank" rel="noopener">YouTube</a></div>
  </div>`;
}

const pola = (src, cap, r = -2, opt = {}) =>
  `<figure class="pola${opt.wide ? ' wide' : ''}" style="--r:${r}deg${opt.pos ? ';--pos:' + opt.pos : ''}"><img src="../img/${src}.jpg" alt="${esc(cap)}" loading="lazy" decoding="async"><figcaption>${esc(cap)}</figcaption></figure>`;
const polas = (...p) => `<div class="polas">${p.join('')}</div>`;
const burstAt = el => { const r = el.getBoundingClientRect(); confetti.burst(r.left + r.width / 2, Math.max(80, r.top + r.height / 2), 45); vibrate(15); };

/* ================= Luckorna ================= */
const LUCKOR = [
{
  h: 8, station: 'Korsberga', short: 'Korsberga', points: 10,
  clue: 'Resmålet har tak, väggar och, enligt säkra källor, stolar.',
  html: () => `
    <h2>Godmorgon, födelsedagsbarn! 🎂</h2>
    <p class="lead">Grattis på 27-årsdagen, Maja!</p>
    ${polas(pola('tunga', 'Du, 07:59', -3), pola('skratt', 'Du, 08:01. Efter den här sidan.', 2.5))}
    <p>Välkommen ombord på Maja-expressen. Idag rullar ett tåg genom hela din dag. Varje halvtimme stannar det någonstans. Slutstationen nås klockan 17:00.</p>
    <p>Inga förseningar, inget signalfel i Nässjö och ingen som ropar ut att bistron är stängd. Bara du, mobilen och en dag som blir bättre för varje timme.</p>
    <div class="rules"><h3>Så funkar det</h3><ol>
      <li>Kika in varje halvtimme mellan 08 och 17. Hela timmar är stationer, halvtimmar är små hållplatser med bonusmaterial.</li>
      <li>Varje station har en ledtråd till kvällens hemliga resmål. Precis som i På spåret: ju tidigare du gissar rätt, desto fler poäng.</li>
      <li>Tror du att du vet? Dra i nödbromsen och lås din gissning. Du får bara dra en gång.</li>
      <li>Jag har gömt mig vid varje stopp. Hitta mig. Och tryck gärna på saker – det finns påskägg.</li>
    </ol></div>
    <p class="aside">Kul fakta: 27 är sista året man kan säga ”typ 25” utan att någon reagerar. Använd det klokt.</p>`
},
{
  h: 9, station: 'Neurokirurgen', short: 'Neurokir.', points: 9,
  clue: 'Där är det någon annan som kommer fram och frågar hur du mår. Flera gånger.',
  html: () => `
    <h2>Det är faktiskt hjärnkirurgi 🧠</h2>
    <p>Du jobbar med folks hjärnor. Jag behövde tre försök för att få på påslakanet i morse. Vi verkar på olika nivåer, och det är helt okej.</p>
    ${pola('muskler', 'Du, efter ett pass med patientlyft. Bilden är inte redigerad. (Jo.)', -2, { pos: 'center 30%' })}
    <p>Idag är det dock omvända roller. Här är din journal:</p>
    <div class="journal">
      <div class="h">JOURNALANTECKNING · Avd. Födelsedag</div>
      <dl>
        <dt>Patient</dt><dd>Strandh, Maja · 27 år (sedan i natt)</dd>
        <dt>Kontaktorsak</dt><dd>Fyller år. Återkommande besvär sedan 1999. Prognosen är utmärkt.</dd>
        <dt>Status</dt><dd>Vaken, adekvat. Orienterad till tid, rum och tårta. GCS 15 (efter kaffe).</dd>
        <dt>Bedömning</dt><dd>Misstänkt överdriven snygghet. Ingen behandling indicerad.</dd>
        <dt>Ordination</dt><dd>Tårta p.o. vid behov. Ledigt från att ta hand om andra i 24 h.</dd>
        <dt>Uppföljning</dt><dd>Återbesök ikväll, se kommande luckor.</dd>
      </dl>
    </div>
    <section class="bonus-game"><h3>Pupillkontroll 🔦</h3><p>Rutinkontroll innan avfärd. Tryck så fort lampan tänds.</p>
      <div id="reflex-eye" aria-hidden="true" style="width:96px;height:96px;margin:14px auto 0;border-radius:50%;background:#f8f0e3;border:3px solid #24122b;display:grid;place-items:center;transition:background .08s"><i id="reflex-pupil" style="display:block;width:46px;height:46px;border-radius:50%;background:#24122b;transition:width .15s,height .15s"></i></div>
      <button class="btn" id="reflex-btn" type="button">🔦 Starta kontrollen</button><p class="game-result" id="reflex-result" aria-live="polite"></p></section>
    <p class="aside">Om någon ropar ”syster!” idag behöver du inte vända dig om. (Det behöver du egentligen aldrig.)</p>`,
  init: el => {
    const btn = $('#reflex-btn', el), eye = $('#reflex-eye', el), pupil = $('#reflex-pupil', el), out = $('#reflex-result', el);
    let state = 'idle', litAt = 0, timer;
    const look = lit => { eye.style.background = lit ? '#f0b43c' : '#f8f0e3'; pupil.style.width = pupil.style.height = lit ? '18px' : '46px'; };
    btn.addEventListener('click', () => {
      if (state !== 'wait' && state !== 'lit') {
        state = 'wait'; look(false); out.textContent = 'Titta på lampan…'; btn.textContent = '👁️ Reagera!';
        timer = setTimeout(() => { if (!eye.isConnected) return; state = 'lit'; litAt = performance.now(); look(true); vibrate(8); }, 1200 + Math.random() * 2300);
        return;
      }
      clearTimeout(timer);
      if (state === 'wait') out.textContent = 'För tidigt. Lampan var inte ens tänd. Ivrigheten noteras i journalen.';
      else {
        const ms = Math.round(performance.now() - litAt);
        out.textContent = ms < 300 ? `${ms} ms. Pupillerna reagerar prompt. Neurologiskt: utmärkt. Kosmetiskt: också.`
          : ms <= 500 ? `${ms} ms. Normal ljusreaktion. Patienten är vaken, adekvat och fyller år.`
          : `${ms} ms. Lite trögt, men klockan är nio. GCS 15 efter kaffe, precis som journalen säger.`;
        if (ms < 300) burstAt(eye);
      }
      state = 'done'; look(false); btn.textContent = '🔦 Ny kontroll';
    });
  }
},
{
  h: 10, station: 'Zara-scenen', short: 'Zara', points: 8,
  clue: 'Det spelas troligen ingen Zara Larsson där. Det är deras förlust.',
  html: () => `
    <h2>Dagens soundtrack 🎧</h2>
    <p>Zara Larsson vann Talang som tioåring, med en Céline Dion-låt. Du började nysa i ett stall som nioåring. Ni har båda kommit långt sedan dess.</p>
    ${pola('albumomslag', 'Omslaget till ditt debutalbum. Zara, ring oss.', 2)}
    <p>Här är förmiddagens playlist. Hörlurar på, volym upp. Om någon undrar varför du ler hela tiden är svaret ”födelsedag”.</p>
    <div class="songs">
      ${song('Zara Larsson', 'Lush Life', 'obligatorisk')}
      ${song('Zara Larsson', 'Never Forget You')}
      ${song('Zara Larsson', 'Symphony')}
      ${song('Zara Larsson', "Ain't My Fault")}
      ${song('Zara Larsson', 'Uncover', 'genombrottet')}
    </div>
    <section class="bonus-game"><h3>Tidslinjen 📅</h3><p>Tryck på låtarna i den ordning de kom ut. Äldst först.</p>
      <div id="zara-order" style="display:grid;gap:8px;margin:14px 0 0"></div>
      <p class="game-result" id="zara-result" aria-live="polite"></p><button class="btn" id="zara-again" type="button" hidden>Spela igen</button></section>`,
  init: el => {
    const songs = [['Uncover', 2013], ['Lush Life', 2015], ["Ain't My Fault", 2016], ['Symphony', 2017]];
    const misses = ['Inte än. Den kom senare.', 'Nej, den är nyare än så.', 'Rätt artist, fel år.'];
    const box = $('#zara-order', el), out = $('#zara-result', el), again = $('#zara-again', el);
    let next = 0, miss = 0;
    const start = () => {
      next = 0; miss = 0; out.textContent = ''; again.hidden = true;
      const order = [...songs].sort(() => Math.random() - .5);
      box.innerHTML = order.map(([t, y]) => `<button type="button" class="btn" data-y="${y}" style="width:100%;margin:0">${esc(t)}</button>`).join('');
    };
    box.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      const y = +b.dataset.y;
      if (y !== songs[next][1]) { out.textContent = misses[miss++ % misses.length]; vibrate(20); return; }
      b.disabled = true; b.textContent += ` · ${y}`; next++; vibrate(8);
      if (next < songs.length) { out.textContent = 'Rätt. 🎧'; return; }
      out.textContent = miss ? `Klart! ${miss} felsteg på vägen. De räknas inte, det var koreografi.` : 'Perfekt ordning! Zara, ring oss. Vi har hittat din arkivarie.';
      again.hidden = false; burstAt(box);
    });
    again.addEventListener('click', start); start();
  }
},
{
  h: 11, station: 'Skäftesfall', short: 'Skäftesfall', points: 7,
  clue: 'Inga hästar och inga stövlar. Klackar däremot, gärna.',
  html: () => `
    <h2>Hälsningar från gården 🌾</h2>
    <p>Du flyttade till en stor gård på Skäftesfall när du var nio. På gården fanns hästar. Du är allergisk mot hästar.</p>
    <p>Det är ungefär som att vara laktosintolerant och växa upp i en ostbutik. Och ändå blev du den tåligaste människan jag känner. Mot allt utom hästar.</p>
    ${pola('stugan', 'Landet. Alla hästar bortretuscherade.', -2, { pos: 'center 40%' })}
    <div class="nohorse"><div class="sign">🐴</div><div><b>Officiellt besked</b><span>Dagens program är 100 % hästfritt. Vi har dubbelkollat. Inte ens en dalahäst.</span></div></div>
    <section class="bonus-game"><h3>Håll inne nysningen 🤧</h3><p>En häst har tittat ut ur stallet. Tryck snabbt för att hålla emot. (Det går inte. Men försök.)</p>
      <div style="height:22px;border-radius:11px;background:#e6dccb;overflow:hidden;margin:14px 4px 0"><i id="sneeze-bar" style="display:block;height:100%;width:0;background:linear-gradient(90deg,#5f8466,#f0b43c,#8c1d40);border-radius:11px"></i></div>
      <div id="sneeze-face" style="font-size:56px;margin-top:8px" aria-hidden="true">🙂</div>
      <button class="btn" id="sneeze-btn" type="button">🤧 Håll emot</button><p class="game-result" id="sneeze-result" aria-live="polite"></p></section>
    <p class="aside">Antihistaminet får ta ledigt idag. Det har jobbat nog.</p>`,
  init: el => {
    const btn = $('#sneeze-btn', el), bar = $('#sneeze-bar', el), face = $('#sneeze-face', el), out = $('#sneeze-result', el);
    let p = 0, t0 = 0, timer = null, lockUntil = 0;
    const stop = () => { clearInterval(timer); timer = null; };
    btn.addEventListener('click', () => {
      const now_ = performance.now();
      if (now_ < lockUntil) return;
      if (timer) { p = Math.max(0, p - 11); vibrate(5); return; }
      p = 0; t0 = now_; out.textContent = 'Det kittlar lite…'; btn.textContent = '👆 Håll emot!';
      timer = setInterval(() => {
        if (!bar.isConnected) return stop();
        const t = (performance.now() - t0) / 1000;
        p += 2 + t * t * .6; bar.style.width = Math.min(100, p) + '%';
        face.textContent = p < 40 ? '😐' : p < 75 ? '😣' : '😫';
        out.textContent = p < 40 ? 'Det kittlar lite…' : p < 75 ? 'Ah… ah…' : 'AAAH…';
        if (p < 100) return;
        stop(); lockUntil = performance.now() + 800;
        const s = t.toFixed(1).replace('.', ',');
        face.textContent = '🤧'; btn.textContent = '🐴 En gång till'; vibrate([30, 40, 80]); burstAt(face); document.dispatchEvent(new CustomEvent('maja-act', { detail: 'sneeze' }));
        out.textContent = t < 2.5 ? `ATSCHO! ${s} sekunder. Kroppen hade redan bestämt sig.`
          : t < 4.5 ? `ATSCHO! ${s} sekunder. Starkt kämpat. Hästen ber om ursäkt.`
          : `ATSCHO! ${s} sekunder. Nytt Skäftesfallsrekord. Det slutade ändå i ATSCHO. Det gör det alltid.`;
      }, 100);
    });
  }
},
{
  h: 12, station: 'Sparade recept', short: 'Lunch', points: 6,
  clue: 'Där behöver du inte spara receptet. Någon annan lagar maten.',
  html: () => `
    <h2>Sparat: oändligt. Lagat: sex.</h2>
    <p>Enligt mina beräkningar har du sparat ungefär alla recept som finns på Instagram. I nuvarande takt har vi lagat dem år 2089.</p>
    <p>Så nu får slumpen bestämma. Snurra, så lagar vi det som hamnar närmast bland dina sparade.</p>
    ${pola('fia', 'Samma fokus som när du väljer bland 4 000 sparade recept. (Det här är fia.)', 2, { pos: 'center 20%' })}
    <div class="spinner">
      <div class="window" id="spin-window"><span>Tryck på knappen 👇</span></div>
      <button class="btn" id="spin-btn" type="button">🎰 Snurra</button>
      <div class="deal" id="spin-deal"></div>
    </div>`,
  init: el => {
    const opts = [
      'Den där pastan som alla i kommentarerna kallar ”life changing”',
      'Något med burrata. Det är alltid något med burrata.',
      'En ”enkel vardagsrätt” med 23 ingredienser',
      'Något som kräver en gjutjärnspanna vi inte äger',
      'Den koreanska rätten du sparade 01:34 en tisdag',
      'Ett bröd med ”bara” 48 timmars jästid',
      'Ugnsrätt på en plåt, ”noll disk” (det är en lögn)',
      'Smashburgare, för att internet sa så',
      'Den där krämiga gnocchin',
      'Något med tahini som vi kommer köpa en hel burk till och använda en matsked av',
    ];
    const win = $('#spin-window', el), btn = $('#spin-btn', el), deal = $('#spin-deal', el);
    btn.addEventListener('click', () => {
      btn.disabled = true; deal.textContent = '';
      win.className = 'window rolling';
      let i = 0, delay = 50, last = -1;
      const step = () => {
        let n; do { n = Math.floor(Math.random() * opts.length); } while (n === last);
        last = n; win.innerHTML = `<span>${esc(opts[n])}</span>`; vibrate(5);
        if (++i < 22) { delay *= 1.13; setTimeout(step, delay); }
        else {
          win.className = 'window done'; btn.disabled = false; btn.textContent = '🎰 Snurra igen';
          deal.textContent = 'Deal: du letar fram en sån bland dina sparade, vi lagar den i veckan och jag diskar. 🤝';
          const r = win.getBoundingClientRect(); confetti.burst(r.left + r.width / 2, r.top + r.height / 2, 40);
        }
      };
      step();
    });
  }
},
{
  h: 13, station: 'Maria', short: 'Maria', points: 5,
  clue: 'Det är bokat för två. Maria får höra allt om det i morgon.',
  html: () => `
    <h2>Maria-bingo 📱</h2>
    <p>Klockan är 13. Din mamma har med största sannolikhet redan hört av sig. Kanske två gånger. Kanske med ett röstmeddelande på fyra minuter.</p>
    <p>Bocka av allt eftersom det händer. Tre i rad ger bingo.</p>
    <div class="bingo" id="bingo"></div>
    <div class="bingo-msg" id="bingo-msg"></div>
    ${pola('stopp', 'Du, när någon börjar en mening med ”jag säger bara…”', -2)}
    <p class="aside">Och kom ihåg: hon är trots allt anledningen till att du finns. Det är en ganska stark merit. (Säg inte till henne att jag sa det.)</p>`,
  init: el => {
    const cells = [
      'Grattis-sms med minst tre hjärtan', 'Ringer när du inte kan svara', '”Har du fått något fint?”',
      'Ett råd du inte bett om', 'Du suckar högt (fri ruta)', 'Röstmeddelande över en minut',
      '”Jag minns när du föddes…”', 'Frågar vad ni ska göra ikväll (du vet inte heller)', 'En bild helt utan förklaring',
    ];
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    const grid = $('#bingo', el), msg = $('#bingo-msg', el);
    if (!store.bingoInit) { store.bingo = [4]; store.bingoInit = true; save(); }
    let won = false;
    const draw = (celebrate) => {
      const on = new Set(store.bingo);
      const winLines = lines.filter(l => l.every(i => on.has(i)));
      const winSet = new Set(winLines.flat());
      grid.innerHTML = cells.map((c, i) => `<button type="button" data-i="${i}" class="${on.has(i) ? 'on' : ''}${i === 4 ? ' free' : ''}${winSet.has(i) ? ' win' : ''}" aria-pressed="${on.has(i)}">${esc(c)}</button>`).join('');
      if (winLines.length) {
        msg.textContent = on.size === 9 ? 'FULL BRICKA! Hon älskar dig uppenbarligen väldigt mycket. Ring henne ikväll. Eller i morgon. 😅' : 'BINGO! 🎉 Priset är… att ringa tillbaka.';
        if (celebrate && !won) { const r = grid.getBoundingClientRect(); confetti.burst(r.left + r.width / 2, r.top + r.height / 2, 90); vibrate([30, 40, 30]); }
        won = true;
      } else { msg.textContent = ''; won = false; }
    };
    grid.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const i = +b.dataset.i; const s = new Set(store.bingo);
      s.has(i) ? s.delete(i) : s.add(i); store.bingo = [...s]; save(); vibrate(8); draw(true);
    });
    draw(false);
  }
},
{
  h: 14, station: '178 cm över havet', short: '178 cm', points: 4,
  clue: 'Du behöver inte sträcka dig efter någonting. Allt kommer till bordet.',
  html: () => `
    <h2>Spelarkort 🃏</h2>
    <p>178 centimeter. Du ser scenen på varje konsert, når översta hyllan utan pall och blir alltid ombedd att ta gruppbilden.</p>
    <div class="stats">
      <div class="hd"><div class="av">M</div><div><b>Maja Strandh</b><span>Nivå 27 · legendarisk</span></div></div>
      ${[
        ['Längd', '178 cm', 100],
        ['Snygghet', '11/10', 128, 'over'],
        ['Hjärnkoll', 'neurokirurgisk', 96],
        ['Restaurangradar', 'expert', 98],
        ['Hästtolerans', '0 %', 3],
        ['Tålamod med mamma', 'varierar per sms', 50, 'wobble'],
      ].map(([k, v, w, c]) => `<div class="stat"><div class="row"><span>${k}</span><em>${v}</em></div><div class="bar ${c || ''}"><i data-w="${w}"></i></div></div>`).join('')}
    </div>
    ${polas(pola('klippan', 'Fotografen bad dig titta in i kameran.', -3, { pos: 'center 45%' }), pola('yatzy', 'Yatzy-resultatet kommenteras inte.', 3))}
    <p>Att hitta dig i en folkmassa tar mig ungefär två sekunder. Det är min favoritsak med att gå på konsert med dig.</p>
    <p class="aside">Och ja, du är orimligt snygg. Det är inget skämt, bara ett konstaterande.</p>`,
  init: el => {
    requestAnimationFrame(() => setTimeout(() => {
      el.querySelectorAll('.bar:not(.wobble) i').forEach(i => { i.style.width = i.dataset.w + '%'; });
    }, 350));
  }
},
{
  h: 15, station: 'Fika & egentid', short: 'Fika', points: 3,
  clue: 'Det är som fika, fast med vin, fler tallrikar och ingen disk.',
  html: () => `
    <h2>Egentid och fika ☕</h2>
    <p>Du gillar fika. Du gillar att få vara ifred. Här är två officiella kuponger som täcker båda. Tryck för att stämpla.</p>
    ${pola('skargard', 'Egentid, dokumenterad på behörigt avstånd.', -1.5, { wide: true, pos: '35% center' })}
    <button type="button" class="coupon" data-c="0"><span class="ic">🤫</span><b>En timme helt ifred</b><span>Ingen pratar med dig. Inte jag, inte Maria, inte någon gruppchatt. Giltig när som helst, ingen förvarning krävs.</span><span class="tap">Tryck för att stämpla</span><span class="stamp">GILTIG ✓</span></button>
    <button type="button" class="coupon" data-c="1"><span class="ic">🍰</span><b>Fika, jag bjuder</b><span>Valfritt café. Du väljer bakelse. Två bakelser är också okej, ingen dömer.</span><span class="tap">Tryck för att stämpla</span><span class="stamp">GILTIG ✓</span></button>
    <p class="aside">Det här är dagens enda lucka där mobilen gärna får läggas ifrån sig. Tåget väntar snällt till 15:30.</p>`,
  init: el => {
    el.querySelectorAll('.coupon').forEach(c => {
      if (store.coupons.includes(+c.dataset.c)) c.classList.add('used');
      c.addEventListener('click', () => {
        if (c.classList.contains('used')) return;
        c.classList.add('used'); store.coupons.push(+c.dataset.c); save(); vibrate(25);
        const r = c.getBoundingClientRect(); confetti.burst(r.right - 50, r.top + r.height / 2, 30);
      });
    });
  }
},
{
  h: 16, station: 'Logen', short: 'Beyoncé', points: 2,
  clue: 'Bord för två, tre rätter och någon annan som diskar.',
  html: () => `
    <h2>Logen 💃</h2>
    <p>En timme kvar. Det här är spellistan medan du gör dig i ordning. Regel: ”CUFF IT” ska spelas minst en gång, på hög volym, medan du gör dig i ordning.</p>
    <div class="songs">
      ${song('Beyoncé', 'CUFF IT', 'obligatorisk')}
      ${song('Beyoncé', 'Crazy in Love')}
      ${song('Beyoncé', 'Love On Top')}
      ${song('Beyoncé', 'Run the World (Girls)')}
      ${song('Beyoncé', 'Halo')}
    </div>
    ${pola('konsert', 'Konsert: perfekt plats, ingen skarp bild. Som vanligt.', 2)}
    <p>Du älskar konserter. Ikväll är det du som är huvudnumret. Publiken är liten (jag), men extremt entusiastisk.</p>
    <section class="bonus-game"><h3>Takttest 🪩</h3><p>Klappa i takt med discokulan. Åtta slag, sedan domen.</p>
      <div id="beat-ball" style="font-size:64px;margin-top:6px;transition:transform .12s" aria-hidden="true">🪩</div>
      <button class="btn" id="beat-btn" type="button">▶️ Starta musiken</button><p class="game-result" id="beat-result" aria-live="polite"></p></section>`,
  init: el => {
    const btn = $('#beat-btn', el), ball = $('#beat-ball', el), out = $('#beat-result', el);
    const P = 600, N = 8;
    let beats = [], taps = [], running = false;
    btn.addEventListener('click', () => {
      const t = performance.now();
      if (running) { taps.push(t); vibrate(5); return; }
      running = true; taps = []; const t0 = t + 2 * P;
      beats = Array.from({ length: N }, (_, i) => t0 + i * P);
      btn.textContent = '👏 Klapp'; out.textContent = 'Fem, sex, sju, åtta…'; document.dispatchEvent(new CustomEvent('maja-act', { detail: 'dance' }));
      beats.forEach((b, i) => setTimeout(() => {
        if (!ball.isConnected) return;
        ball.style.transform = 'scale(1.25)'; setTimeout(() => { ball.style.transform = ''; }, 120);
        if (i === 0) out.textContent = 'Klappa! 👏';
      }, b - t));
      setTimeout(() => {
        running = false; if (!ball.isConnected) return;
        btn.textContent = '▶️ En gång till';
        const used = taps.filter(x => x >= t0 - P / 2 && x <= beats[N - 1] + P / 2);
        const avg = used.length ? Math.round(used.reduce((s, x) => s + Math.min(...beats.map(b => Math.abs(x - b))), 0) / used.length) : 0;
        out.textContent = !used.length ? 'Inte ett enda klapp. Ibland är det bäst att bara lyssna.'
          : used.length > N * 1.5 ? 'Det där var inte klapp, det var applåder. Tack, tack.'
          : used.length < N - 2 ? `${used.length} klapp av ${N}. Du sparar energin till ikväll. Klokt.`
          : avg < 70 ? `Snitt ${avg} ms från takten. Beyoncé, ring oss.`
          : avg < 150 ? `Snitt ${avg} ms från takten. Stabilt. Publiken (jag) klappar med.`
          : `Snitt ${avg} ms från takten. Du dansar i din egen takt. Det är också en takt.`;
        if (used.length >= N - 2 && used.length <= N * 1.5 && avg < 70) burstAt(ball);
      }, beats[N - 1] - t + P);
    });
  }
},
{
  h: 17, station: 'Cin cin 🥂', short: 'Cin cin', final: true,
  html: () => {
    const g = store.guess;
    const result = g
      ? `Du drog i nödbromsen vid <b>${g.points} poäng</b> och gissade: <b>”${esc(g.text)}”</b>. Juryn (jag) har granskat svaret noggrant och godkänner det. Juryn är jävig. <b>${g.points} poäng!</b> 🏆`
      : `Du drog aldrig i nödbromsen. Modigt. Det blir <b>0 poäng</b>, men middagen får du ändå.`;
    const booking = CONFIG.restaurant ? `<p>📍 ${esc(CONFIG.restaurant)}${CONFIG.dinnerTime ? ' · ' + esc(CONFIG.dinnerTime) : ''}</p>` : '';
    return `
    <h2>Framme! 🎉</h2>
    <div class="reveal">
      <div class="lbl">Kvällens resmål</div>
      <h3>Middag på restaurang.<br>Jag bjuder.</h3>
      ${booking}
      <p>På allt. Förrätt, varmrätt, efterrätt och vinet. Du behöver inte ens kika på priserna.</p>
      <div class="cincin"><span class="glass l">🥂</span>Cin cin!<span class="glass r">🥂</span></div>
    </div>
    ${pola('restaurang', 'Senast vi var ute. Ikväll blir det repris.', -2, { pos: 'center 30%' })}
    <div class="result">${result}</div>
    <div class="coat-box">
      <h3>En sak till…</h3>
      <p>Du ska få en ny kappa. Vilken du vill, var du vill. Du väljer, jag betalar.</p>
      <svg class="coat" viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg" aria-label="En kappa på en galge">
        <path d="M100 4 a9 9 0 1 1 9 9 v8" fill="none" stroke="#8a7b70" stroke-width="3.5" stroke-linecap="round"/>
        <path d="M52 34 L100 21 L148 34" fill="none" stroke="#8a7b70" stroke-width="5" stroke-linecap="round"/>
        <path class="fill" d="M58 34 L40 58 L14 196 Q22 206 34 202 L52 112 L50 288 Q100 296 150 288 L148 112 L166 202 Q178 206 186 196 L160 58 L142 34 L118 30 L100 120 L82 30 Z" fill="#b88a5a"/>
        <path d="M58 34 L40 58 L14 196 Q22 206 34 202 L52 112 L50 288 Q100 296 150 288 L148 112 L166 202 Q178 206 186 196 L160 58 L142 34 L118 30 L100 120 L82 30 Z" fill="none" stroke="#0003" stroke-width="2"/>
        <path d="M82 30 L100 120 L74 72 L66 40 Z" fill="#0000001f"/>
        <path d="M118 30 L100 120 L126 72 L134 40 Z" fill="#0000001f"/>
        <line x1="100" y1="120" x2="100" y2="290" stroke="#0003" stroke-width="2"/>
        <rect x="52" y="160" width="96" height="12" rx="3" fill="#00000028"/>
        <rect x="93" y="157" width="14" height="18" rx="2" fill="none" stroke="#0004" stroke-width="2.5"/>
        <circle cx="88" cy="140" r="4" fill="#0004"/><circle cx="112" cy="140" r="4" fill="#0004"/>
        <circle cx="88" cy="200" r="4" fill="#0004"/><circle cx="112" cy="200" r="4" fill="#0004"/>
        <path d="M64 215 h22 M114 215 h22" stroke="#0003" stroke-width="2.5" stroke-linecap="round"/>
      </svg>
      <div class="swatches" id="swatches"></div>
      <p class="coat-quip" id="coat-quip">Tryck på en färg för att prova.</p>
      ${polas(pola('jackan', 'Du i en jacka. Jag i spegeln, väldigt nöjd.', -3), pola('provrum', 'Provrumsteamet är redo igen.', 3, { pos: '18% center' }))}
      <p class="fineprint">Kappan ovan är bara en skiss. Den riktiga väljer du själv, i vilken butik som helst. Skicka en länk så är det klart.</p>
    </div>
    ${song('Céline Dion', "I'm Alive", 'dagens slutlåt, spelas på full volym', true)}
    ${pola('bilen', 'Resesällskap. Samma tid nästa år?', -2, { pos: 'center 40%' })}
    <p class="signoff">Grattis på 27-årsdagen, Maja.<br>Tack för att du åkte med hela vägen.<br><em>Jag älskar dig.</em><br>/ ${esc(CONFIG.signature)}</p>`;
  },
  init: el => {
    const colors = [
      ['#b88a5a', 'Kamel', 'Klassiskt och tidlöst. Du kommer se ut som någon som äger ett galleri.'],
      ['#1f1d22', 'Svart', 'Går till allt. Även till ett stall, men dit ska du ju inte.'],
      ['#8d8b91', 'Grå', 'Elegant och diskret. Som en neurosjuksköterska på ledig dag.'],
      ['#6e1f33', 'Vinröd', 'Modigt. Matchar dessutom vinet ikväll.'],
      ['#e8dcc6', 'Crème', 'Snyggt. Håll dig bara borta från tomatsåsen.'],
      ['#2f4a3a', 'Skogsgrön', 'Riktigt bra val. Lite Skäftesfall, fast helt utan hästar.'],
    ];
    const box = $('#swatches', el), quip = $('#coat-quip', el), fill = $('.coat .fill', el);
    box.innerHTML = colors.map(([c, n], i) => `<button type="button" class="sw" data-i="${i}" style="background:${c}" aria-label="${n}"></button>`).join('');
    const pick = (i, fx) => {
      const [c, n, t] = colors[i];
      fill.setAttribute('fill', c);
      box.querySelectorAll('.sw').forEach(b => b.classList.toggle('on', +b.dataset.i === i));
      quip.innerHTML = `<b>${n}.</b> ${esc(t)}`;
      if (fx) { vibrate(10); store.coat = i; save(); }
      document.dispatchEvent(new CustomEvent('coat-change', { detail: c }));
    };
    box.addEventListener('click', e => { const b = e.target.closest('.sw'); if (b) pick(+b.dataset.i, true); });
    if (store.coat != null) pick(store.coat, false);
    setTimeout(() => {
      const r = $('.reveal', el).getBoundingClientRect();
      if (r.top < innerHeight && r.bottom > 0) confetti.rain(220);
    }, 900);
  }
},
];

// Director copy from STORY.md (§2, §2.4 waitNote). Keep in sync – STORY.md is the source of truth.
const STORY_STOPS = [
  {
    "station": "Korsberga",
    "waitNote": "Morgonsol över Korsberga. Kaffet räcker till nästa stopp.",
    "departure": "Välkommen ombord på Maja-expressen, tåg 27. Dagens sträcka: hela din födelsedag.",
    "arrival": "Korsberga. Här börjar allt. Grattis, Maja!",
    "foundLine": "Hittad! Jag har stått här sedan sju. Värt det."
  },
  {
    "station": "Hållplats Spackel",
    "waitNote": "Spacklet torkar. Rör inte taket.",
    "departure": "Nästa: Hållplats Spackel. Hjälm krävs inte. Keps är obligatoriskt.",
    "arrival": "Spackel. Observera: nyspacklat i taket. Rör inte. Filma gärna.",
    "title": "Nästan osynligt 🧰",
    "kicker": "Hållplats · 08:30",
    "paragraphs": [
      {
        "text": "Varje renovering behöver två personer. En som står på stegen och spacklar. Och en som står nedanför i keps och filmar, ifall det skulle gå åt skogen.",
        "aside": false,
        "n": 1
      },
      {
        "text": "Det är tydligt vem av dem som är projektledare.",
        "aside": false,
        "n": 2
      },
      {
        "text": "Resultatet blev, med branschens eget uttryck, ”nästan osynligt”. Det syns bara i motljus. Och i dagsljus. Men inte om man blundar.",
        "aside": false,
        "n": 3
      }
    ],
    "photo": "spackel",
    "r": -2.0,
    "pos": "center 70%",
    "caption": "Projektledaren dokumenterar. Hantverket kommenteras inte.",
    "foundLine": "Hittad. Benen avslöjade mig."
  },
  {
    "station": "Neurokirurgen",
    "waitNote": "Journalen är uppdaterad. Patienten mår utmärkt.",
    "departure": "Nästa: Neurokirurgen. Idag är det någon annan som frågar hur du mår.",
    "arrival": "Neurokirurgen. Avstigning sker lugnt och sansat. Alla resenärer GCS 15.",
    "foundLine": "Hittad! Busken var mindre än den såg ut."
  },
  {
    "station": "Hållplats Spelkväll",
    "waitNote": "Kontrollerna laddas. Vänskapen återhämtar sig.",
    "departure": "Nästa: Spelkväll. Ta fram kontrollen. Vänskapen kan komma att prövas.",
    "arrival": "Spelkväll. Tåget går när alla har slutat skylla på kontrollen.",
    "title": "Spelkväll 🎮",
    "kicker": "Hållplats · 09:30",
    "paragraphs": [
      {
        "text": "Spelkväll med tjejerna är en helig institution. Snacks på bordet, fyra kontroller och en vänskap som sätts på prov i varje kurva.",
        "aside": false,
        "n": 1
      },
      {
        "text": "Reglerna är enkla: den som vinner får vara lite för glad. Den som förlorar får skylla på kontrollen. Alla andra får skylla på banan.",
        "aside": false,
        "n": 2
      },
      {
        "text": "Idag behöver du inte ens köra. Du vinner ändå. Det är din dag.",
        "aside": false,
        "n": 3
      }
    ],
    "foundLine": "Hittad. Jag sitter inte med i laget. Jag hejar bara."
  },
  {
    "station": "Zara-scenen",
    "waitNote": "Konduktören nynnar fortfarande. Han förnekar det.",
    "departure": "Nästa: Zara-scenen. Hörlurar på. Volymen höjs successivt.",
    "arrival": "Zara-scenen. Sjung gärna med. Konduktören sjunger inte. Konduktören nynnar.",
    "foundLine": "Hittad! Störst fan. Bokstavligen."
  },
  {
    "station": "Hållplats Fårhagen",
    "waitNote": "Fåren tittar efter tåget. Med polisongerna.",
    "departure": "Nästa: Fårhagen. Vissa resenärer har polisonger. Stirra inte.",
    "arrival": "Fårhagen. Lammen bjuder på mys. Fåren bjuder på frisyrtips.",
    "title": "Fårhagen 🐑",
    "kicker": "Hållplats · 10:30",
    "paragraphs": [
      {
        "text": "Gårdens får ser ut som en man med polisonger. Det är inte vi som har hittat på det. Det är fåren som har bestämt sig.",
        "aside": false,
        "n": 1
      },
      {
        "text": "När man väl har sett det går det inte att se något annat. Grå lockar, svart ansikte och två rejäla polisonger, som en farbror på ett gammalt porträtt som just fått syn på något han inte gillar.",
        "aside": false,
        "n": 2
      },
      {
        "text": "Lammen däremot har inga polisonger än. De har bara ett enda intresse, och det är ditt finger.",
        "aside": false,
        "n": 3
      }
    ],
    "photo": "lamm",
    "r": 2.0,
    "pos": null,
    "caption": "Lammet trodde att ditt finger var en napp. Du lät det tro det.",
    "hint": "Tips: tryck på ett får. Det har något att säga.",
    "foundLine": "Hittad. Jag smälte in lite för bra."
  },
  {
    "station": "Skäftesfall",
    "waitNote": "Näsdukarna räcker. Hästen är inlåst.",
    "departure": "Nästa: Skäftesfall. Näsdukar delas ut vid dörrarna.",
    "arrival": "Skäftesfall. Området är inspekterat och nästan helt hästfritt.",
    "foundLine": "Hittad! Höbalen var min bästa vän i en kvart."
  },
  {
    "station": "Hållplats Patriks gård",
    "waitNote": "Patrik vinkar efter tåget. Han vet inte riktigt varför.",
    "departure": "Nästa: Patriks gård. Vänta vid övergången. Det kommer en traktor. Det kommer alltid en traktor.",
    "arrival": "Patriks gård. Om någon frågar vad han skulle göra: ingen vet. Inte ens han.",
    "title": "Patriks gård 🚜",
    "kicker": "Hållplats · 11:30",
    "paragraphs": [
      {
        "text": "Det här är Patrik. Han kör traktor, fäller träd och tar hand om en gård full av höglandskor och höns. Allt annat glömmer han, ungefär lika snabbt som han hör det.",
        "aside": false,
        "n": 1
      },
      {
        "text": "Det är inte att han inte bryr sig. Det är bara att gården tar upp hela hårddisken. Korna har prioritet. Sedan träden. Sedan traktorn. Sedan vad det var han skulle göra.",
        "aside": false,
        "n": 2
      },
      {
        "text": "I våras fyllde han 60 och firade med konsert i maskinhallen. Andra hyr en festlokal. Patrik flyttade ut traktorn.",
        "aside": false,
        "n": 3
      },
      {
        "text": "Han vet precis vem du är, och han är väldigt stolt. Han har bara glömt att han redan sagt det. Så han säger det igen.",
        "aside": true,
        "n": 4
      }
    ],
    "foundLine": "Hittad. Patrik vet inte att jag är här. Han har glömt det."
  },
  {
    "station": "Sparade recept",
    "waitNote": "Lunchen är sparad. Precis som allt annat.",
    "departure": "Nästa: Sparade recept. Restaurangvagnen serverar lunch. Receptet är sparat.",
    "arrival": "Sparade recept. Fyratusen recept ombord. Ett av dem kommer vi att laga.",
    "foundLine": "Hittad! Dagens lunch: du väljer, jag diskar."
  },
  {
    "station": "Hållplats Rockbaren",
    "waitNote": "Tavlan står kvar på 88. Ingen vågar röra den.",
    "departure": "Nästa: Rockbaren. Tåget glider in lika mjukt som en välskjuten puck.",
    "arrival": "Rockbaren. Det står 88 på tavlan. Vi vet vem som ska ha äran.",
    "title": "88 poäng 🥌",
    "kicker": "Hållplats · 12:30",
    "paragraphs": [
      {
        "text": "En rockbar. Iron Maiden på väggen, Alice Cooper på affischen och ett shuffleboardbord som har sett mycket.",
        "aside": false,
        "n": 1
      },
      {
        "text": "Och mitt i alltihop: du, i stickad tröja, som skjuter pucken som om det vore det mest naturliga i världen. Tavlan säger 88.",
        "aside": false,
        "n": 2
      },
      {
        "text": "Du är den enda jag känner som kan se ut som en reklam för en stickad tröja och samtidigt vinna en rockbar.",
        "aside": false,
        "n": 3
      }
    ],
    "photo": "shuffleboard",
    "r": -2.5,
    "pos": "center 30%",
    "caption": "88 på tavlan. Fingret visar vem som ska ha äran.",
    "foundLine": "Hittad. Jag tittade på när du vann."
  },
  {
    "station": "Maria",
    "waitNote": "📱 1 missat samtal.",
    "departure": "Nästa: Maria. Du har 1 missat samtal. Nej, 2. Nej, vänta…",
    "arrival": "Maria. Hon ville bara säga grattis. Och en sak till. Och en till.",
    "foundLine": "Hittad! Säg inget till Maria. Hon ringer annars."
  },
  {
    "station": "Hållplats Hester",
    "waitNote": "Det spikas fortfarande på Hester.",
    "departure": "Nästa: Hester. Konduktören har kontrollerat: inga riktiga hästar ombord.",
    "arrival": "Hester. Ett hus, två byggare och ett namn som betyder hästar. På norska.",
    "title": "Hester 🔨",
    "kicker": "Hållplats · 13:30",
    "paragraphs": [
      {
        "text": "Din syster och Sebastian bygger hus. Det är stort, det är modigt och det kräver ett otal helger med hammare, ritningar och åsikter om fönster.",
        "aside": false,
        "n": 1
      },
      {
        "text": "Huset heter Hester. Hester är norska. Det betyder hästar.",
        "aside": false,
        "n": 2
      },
      {
        "text": "Av alla ord i alla språk valde de alltså just det. Vi väljer att tolka det som kärlek. Huset är helt hästfritt. Det är bara namnet som är allergiframkallande.",
        "aside": false,
        "n": 3
      },
      {
        "text": "Antihistamin behövs inte på inflyttningsfesten. Men ta med en för säkerhets skull.",
        "aside": true,
        "n": 4
      }
    ],
    "foundLine": "Hittad. Byggnadsställningen var en dålig idé."
  },
  {
    "station": "178 cm över havet",
    "waitNote": "Akta huvudet när du kliver på. Ja, fortfarande du.",
    "departure": "Nästa: 178 cm över havet. Akta huvudet i dörren. Ja, du.",
    "arrival": "178 cm. Utsikten är fantastisk härifrån. Säger alla som står bakom dig.",
    "foundLine": "Hittad. Jag stod på tå. Det hjälpte inte."
  },
  {
    "station": "Hållplats Fågelboet",
    "waitNote": "Tyst kupé. Tåget väntar tills du är redo.",
    "departure": "Nästa: Fågelboet. Tåget kör tyst härifrån. Det har du förtjänat.",
    "arrival": "Fågelboet. (Viskar.) Ingen täckning, ingen gruppchatt, ingen Maria.",
    "title": "Fågelboet 🪺",
    "kicker": "Hållplats · 14:30",
    "paragraphs": [
      {
        "text": "Du gillar att vara ensam. Inte för att du inte tycker om folk, utan för att du tar hand om folk hela dagarna, och någon gång måste du få ta hand om dig själv.",
        "aside": false,
        "n": 1
      },
      {
        "text": "Någon har byggt ett jättelikt fågelbo av hö och vide, precis lagom stort för en person som vill vara ifred. Det är inget tillfälle. Det är ett tecken.",
        "aside": false,
        "n": 2
      },
      {
        "text": "Det här är din plats idag. Inga notiser, inga frågor. Bara du och lite fågelkvitter.",
        "aside": false,
        "n": 3
      }
    ],
    "photo": "fagelbo",
    "r": 1.5,
    "pos": "center 35%",
    "caption": "Ett bo för en. Precis som du gillar det.",
    "foundLine": "Hittad, på behörigt avstånd. Jag går nu."
  },
  {
    "station": "Fika & egentid",
    "waitNote": "Solen står lägre nu. Bullen är uppäten.",
    "departure": "Nästa: Fika. Kaffet är bryggt, bullen är varm och konduktören håller tyst.",
    "arrival": "Fika. Stör ej-skylten är uppe. Det här är det sista du hör från mig på en halvtimme.",
    "foundLine": "Hittad. Förlåt. Jag går tillbaka bakom trädet."
  },
  {
    "station": "Hållplats Tittut",
    "waitNote": "Det börjar skymma. Någon sitter fortfarande bakom dig.",
    "departure": "Nästa: Tittut. Titta gärna bakom dig. Nej, vänta. Inte än.",
    "arrival": "Tittut. Utsiktsplats för två. Den ena sitter redan och väntar. Typ.",
    "title": "Tittut 👀",
    "kicker": "Hållplats · 15:30",
    "paragraphs": [
      {
        "text": "Det här är egentligen hela min plan, för idag och sedan: att dyka upp bakom dig, lite för nära, i lite för många av dina bilder.",
        "aside": false,
        "n": 2
      },
      {
        "text": "Ett och ett halvt stopp kvar. Du får gärna börja gissa vad det blir.",
        "aside": false,
        "n": 3
      }
    ],
    "photo": "tittut",
    "r": -2.0,
    "pos": "center 40%",
    "caption": "Du tog en selfie. Jag tog mig in i den.",
    "dynamic": "Jag har gömt mig vid varje stopp idag. Hittills har du hittat mig {n} av {m} gånger, och jag blir lika glad varje gång.",
    "zero": "Jag har gömt mig vid varje stopp idag. Du har inte hittat mig en enda gång. Antingen är jag väldigt bra på att gömma mig, eller så har du haft viktigare saker för dig. Båda är okej. Jag sitter bakom dig nu.",
    "foundLine": "Tittut! Den här gången var det inte så svårt."
  },
  {
    "station": "Logen",
    "waitNote": "CUFF IT en gång till. Sedan något fint på dig.",
    "departure": "Nästa: Logen. Klädkod: valfri. CUFF IT: obligatorisk.",
    "arrival": "Logen. Strålkastarna är på dig. Publiken, en person, är redo.",
    "foundLine": "Hittad! Hela publiken, en person, närvarande."
  },
  {
    "station": "Hållplats Snart framme",
    "waitNote": "Lyktorna är tända. Bordet är dukat.",
    "departure": "Nästa: Snart framme. Lyktorna tänds en efter en. Det är ingen slump.",
    "arrival": "Snart framme. En hållplats kvar. Ta på dig något fint.",
    "title": "Snart framme 🏮",
    "kicker": "Hållplats · 16:30",
    "paragraphs": [
      {
        "text": "Solen har gått ner, lyktorna är tända och tåget har bara en station kvar.",
        "aside": false,
        "n": 1
      },
      {
        "text": "Om du inte har dragit i nödbromsen än är det här sista chansen. Juryn är fortfarande jävig och ser fram emot att döma till din fördel.",
        "aside": false,
        "n": 2
      },
      {
        "text": "Ta på dig något fint. Du har en dejt om en halvtimme. (Med mig. Ifall det var oklart.)",
        "aside": false,
        "n": 3
      }
    ],
    "foundLine": "Hittad. Lyktstolpen var smalare än jag trodde."
  },
  {
    "station": "Cin cin 🥂",
    "departure": "Nästa: slutstation. Destinationen är fortfarande hemlig. Jag har blivit ombedd att hålla tyst.",
    "arrival": "Slutstation. Bord för två. Tack för att du reste med Maja-expressen.",
    "foundLine": "Hittad. Jag tänkte inte gömma mig här."
  }
];
const MAIN_IDS = ["korsberga","neuro","zara","skaftesfall","recept","maria","langd","fika","logen","cincin"];
const MINI_IDS = ["spackel","spelkvall","farhagen","patrik","shuffle","hester","fagelbo","tittut","snart"];
const STOPS = Array.from({length:19}, (_,i) => {
  const main=i%2===0,n=Math.floor(i/2);
  return {idx:i,id:main?MAIN_IDS[n]:MINI_IDS[n],kind:main?'main':'mini',mainIndex:main?n:null,t:`${pad(8+n)}:${main?'00':'30'}`,...STORY_STOPS[i]};
});
const unlockStop = stop => unlockAt(8) + (typeof stop==='number'?stop:stop.idx)*1800000;
const hasMainOpened = h => store.opened.includes(STOPS[(h-8)*2]?.id);
function normalizeRouteStorage() {
  const aliases={'neurokirurgen':'neuro','178':'langd'};
  const convert=ids=>[...new Set((Array.isArray(ids)?ids:[]).map(id=>typeof id==='number'?STOPS[(id-8)*2]?.id:aliases[id]||id).filter(Boolean))];
  store.opened=convert(store.opened);store.visited=convert(store.visited||store.opened);
  store.foundMattias=convert(store.found||store.foundMattias||[]);store.found=store.foundMattias;
  store.eggs=Array.isArray(store.eggs)?store.eggs:[];store.taps||={};
}
normalizeRouteStorage();
export function bindWorldStops(stations) {
  const aliases=new Map();STOPS.forEach((stop,i)=>{const id=stations[i]?.id;if(id&&id!==stop.id){aliases.set(stop.id,id);stop.id=id;}});
  for(const key of ['opened','visited','foundMattias'])store[key]=store[key].map(id=>aliases.get(id)||id);
  store.found=store.foundMattias;save();
}
export const EGGS = [
  {
    "id": "sheep",
    "name": "Farbror Polisong",
    "lines": [
      "Bää.",
      "Bää. (Han stryker sig över polisongerna.)",
      "Bää-ää. Det betyder grattis på fårspråk.",
      "Bää. Han tycker att du borde skaffa polisonger. Vi säger nej."
    ]
  },
  {
    "id": "lamb",
    "name": "Lammet",
    "lines": [
      "Mä! Lammet vill ha fingret igen.",
      "Mä. (Lammet har inga polisonger än. Det jobbar på det.)"
    ]
  },
  {
    "id": "patrik",
    "name": "Patrik",
    "lines": []
  },
  {
    "id": "cow",
    "name": "Höglandskon",
    "lines": [
      "Mu. Hon ser dig inte genom luggen, men hon gillar dig.",
      "Mu. (Hon har bättre lugg än någon i Korsberga.)"
    ]
  },
  {
    "id": "hen",
    "name": "Hönan",
    "lines": [
      "Ett påskägg! Ett riktigt ett, dessutom. 🥚",
      "Ett till. Hönan är på gott humör idag."
    ]
  },
  {
    "id": "horse",
    "name": "Hästen",
    "lines": [
      "ATSCHO! Hästen ber om ursäkt och går in igen.",
      "ATSCHO! Vi sa ju hästfri zon."
    ]
  },
  {
    "id": "tractor",
    "name": "Traktorn",
    "lines": [
      "TUT-TUT! Patriks kontor. Öppet dygnet runt, ingen wifi.",
      "Nyckeln sitter i. Det är därför Patrik aldrig tappar bort den."
    ]
  },
  {
    "id": "loco",
    "name": "Loket",
    "lines": [
      "TUUUT! Loket blev lite kär. 💨❤️"
    ]
  },
  {
    "id": "maja",
    "name": "Muskler",
    "lines": [
      "💪 11/10. Bilden är inte redigerad. (Jo.)"
    ]
  },
  {
    "id": "moon",
    "name": "Månen",
    "lines": [
      "Månen tittade fram. Den ville också säga grattis."
    ]
  },
  {
    "id": "hester",
    "name": "Hester-skylten",
    "lines": [
      "Hester betyder hästar på norska. Huset är helt hästfritt. Det är bara namnet."
    ]
  },
  {
    "id": "brain",
    "name": "Hjärnan",
    "lines": [
      "Hjärnan blinkar. GCS 15, prognos utmärkt."
    ]
  },
  {
    "id": "phone",
    "name": "Mammas telefon",
    "lines": [
      "📱 Missade samtal från Mamma: {k}. Hon vill bara höra hur du har det."
    ]
  },
  {
    "id": "bulle",
    "name": "Kanelbullen",
    "lines": [
      "Bonus: en extra bulle. Två är också okej, ingen dömer."
    ]
  },
  {
    "id": "disco",
    "name": "Discokulan",
    "lines": [
      "CUFF IT, volym upp. Det var regeln."
    ]
  },
  {
    "id": "conductor",
    "name": "Konduktören",
    "lines": []
  }
];
export const EGG_IDS=EGGS.map(e=>e.id);
store.eggs=[...new Set(store.eggs.map(id=>id==='sky'?'moon':id).filter(id=>EGG_IDS.includes(id)))];
export const PATRIK_LINES = [
  "Vad var det jag skulle göra nu igen?",
  "Har du sett mina nya kor?",
  "Grattis, Maja! Du fyller… vänta, jag vet det här… 27!",
  "Har du sett mina nya kor? Har jag frågat det redan? De har lugg.",
  "Jag skulle bara fälla en gran. Det blev sju.",
  "Har någon sett motorsågen? … Jaså. Jag håller i den.",
  "Maskinhallen har bättre akustik än Avicii Arena. Ingen har bevisat motsatsen.",
  "Ring om du behöver något. Jag svarar om jag inte sitter i traktorn. Jag sitter i traktorn.",
  "Den där björken har stått där i fyrtio år. Den har ett par minuter kvar.",
  "Hönsen värper bättre än jag minns. Fast det är inte så svårt.",
  "Jag fyllde 60 i våras. Det var konsert. Det minns jag. Resten är lite oklart.",
  "Vem var det som fyllde år idag nu igen? … Skojar. Det är du. Det är alltid du."
];
export const CONDUCTOR_LINES = [
  "Biljetten, tack. … Den gäller hela dagen, fröken Strandh.",
  "Första klass, såklart.",
  "Inga förseningar idag. Jag har pratat med Nässjö.",
  "Destinationen är hemlig. Jag har skrivit på ett papper.",
  "Det är inte tillåtet att vara så här glad i vagnen. Undantag beviljas.",
  "Resenären ombeds hålla uppsikt över sin pojkvän. Han gömmer sig."
];
export const PRE_DEPARTURE = "Godmorgon. Tåget avgår 08:00. Kaffet är redan ombord.";
export const FINALE_FAREWELL = "Konduktören går av här. Han önskar en trevlig kväll. Han gråter inte, det är ångan.";
export function bonusHTML(stop) {
  const paragraphs=[...stop.paragraphs];
  if(stop.idx===15)paragraphs.unshift({text:tittutLine(stop),n:1});
  return `<span class="bonus-label">${esc(stop.kicker)}</span><h2>${esc(stop.title)}</h2>${paragraphs.map(p=>`<p${p.aside?' class="aside"':''}${stop.idx===15&&p.n===1?' id="tittut-count"':''}>${esc(p.text)}</p>`).join('')}${stop.photo?pola(stop.photo,stop.caption,stop.r,{pos:stop.pos}):''}${stop.hint?`<p class="aside">${esc(stop.hint)}</p>`:''}${bonusGameHTML(stop)}`;
}
export function tittutLine(stop=STOPS[15]) {
  const n=store.foundMattias.length,m=Math.max(16,store.visited.length);
  return n?stop.dynamic.replaceAll('{n}',n).replaceAll('{m}',m):stop.zero;
}
export function finaleSummary() {
  const n=store.foundMattias.length,e=store.eggs.length;
  const found=n===0?'Noll av 19. Antingen är jag bra på att gömma mig, eller så hade du bättre saker för dig. Ikväll blir det lättare: jag sitter vid bord för två.':n===19?'Alla 19! Du har uppenbarligen gjort det här förut. Ikväll hittar du mig vid bord för två.':`Du hittade mig ${n} av 19 gånger. Ikväll hittar du mig vid bord för två.`;
  const eggs=e===16?'Alla! Du är officiellt dagens mest noggranna resenär. Patrik hade glömt var han lade hälften.':e>=8?'Fint fångat. Resten ligger kvar till nästa år.':'Det finns fler. De går inte någonstans. Du kan leta i kväll, efter efterrätten.';
  return `<h3>Resans statistik</h3><p>Hållplatser: 19 av 19</p><p>Mattias hittad: ${n}/19</p><p class="mattias-finale">${found}</p><p>Påskägg: ${e}/16</p><p>${eggs}</p>`;
}

const confetti = (() => {
  const cv = document.getElementById('confetti'), ctx = cv.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cols = ['#f0b43c', '#ff8fa3', '#8c1d40', '#f8f0e3', '#5f8466', '#ffd166'];
  let parts = [], running = false, dpr = 1;
  const size = () => { dpr = Math.min(2, devicePixelRatio || 1); cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; };
  size(); addEventListener('resize', size);
  const loop = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter(p => p.y < innerHeight + 30 && p.life > 0);
    for (const p of parts) {
      p.vy += .18; p.vx *= .985; p.vy *= .985; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life -= 1;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
      ctx.globalAlpha = Math.min(1, p.life / 40);
      if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.s / 2, 0, 7); ctx.fill(); }
      else ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2 * Math.abs(Math.cos(p.r * 2)) + 1);
      ctx.restore();
    }
    if (parts.length) requestAnimationFrame(loop); else { running = false; ctx.clearRect(0, 0, innerWidth, innerHeight); }
  };
  const add = p => { parts.push(p); if (!running) { running = true; requestAnimationFrame(loop); } };
  const mk = (x, y, vx, vy) => ({ x, y, vx, vy, r: Math.random() * 6, vr: (Math.random() - .5) * .3, s: 6 + Math.random() * 7, c: cols[Math.random() * cols.length | 0], life: 160 + Math.random() * 80, round: Math.random() < .25 });
  return {
    burst(x, y, n = 70) { if (reduce) return; for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = 3 + Math.random() * 7; add(mk(x, y, Math.cos(a) * v, Math.sin(a) * v - 4)); } },
    rain(n = 150) { if (reduce) return; for (let i = 0; i < n; i++) setTimeout(() => add(mk(Math.random() * innerWidth, -20, (Math.random() - .5) * 2, 2 + Math.random() * 3)), i * 12); },
  };
})();

function renderBrake() {
  const b = $('#brake'), t = now(); if (!b) return;
  const openedClues = LUCKOR.filter(l => !l.final && hasMainOpened(l.h) && t >= unlockAt(l.h));
  const finalOpen = hasMainOpened(17) && t >= unlockAt(17);
  if (!openedClues.length || finalOpen) { b.hidden = true; return; }
  b.hidden = false;
  const pts = Math.min(...openedClues.map(l => l.points));
  const form = $('#guess-form');
  if (!store.guess && form) { const p = $('#brake-pts'); if (p) p.textContent = pts; return; }
  if (store.guess) {
    b.innerHTML = `<h3>🛑 Nödbromsen är dragen</h3><div class="locked-guess">Din gissning, låst på ${store.guess.points} poäng:<br><b>”${esc(store.guess.text)}”</b></div><p>Svaret avslöjas på slutstationen kl 17:00.</p>`;
    return;
  }
  b.innerHTML = `<h3>🚨 Nödbroms</h3><p>Tror du att du vet kvällens resmål? Dra i nödbromsen nu och lås gissningen på <b><span id="brake-pts">${pts}</span> poäng</b>. Du får bara dra en gång.</p>
    <button type="button" class="brake-btn" id="brake-btn">Dra i nödbromsen</button>`;
  $('#brake-btn').addEventListener('click', () => {
    vibrate(40);
    b.querySelector('#brake-btn').outerHTML = `<form id="guess-form"><input id="guess-in" aria-label="Din gissning" maxlength="80" placeholder="Jag tror att vi ska…" autocomplete="off" required><button type="submit">Lås</button></form>`;
    $('#guess-in').focus();
    $('#guess-form').addEventListener('submit', e => {
      e.preventDefault();
      const text = $('#guess-in').value.trim(); if (!text) return;
      const tt = now();
      const cur = Math.min(...LUCKOR.filter(l => !l.final && hasMainOpened(l.h) && tt >= unlockAt(l.h)).map(l => l.points));
      store.guess = { text, points: cur, at: tt }; save();
      document.dispatchEvent(new CustomEvent('guess-locked'));
      const r = b.getBoundingClientRect(); confetti.burst(r.left + r.width / 2, r.top + 30, 60); vibrate([20, 30, 60]);
      renderBrake();
    });
  });
}

/* ---- lightbox ---- */
function initLightbox() {
  const lb = $('#lightbox'), img = $('img', lb), cap = $('p', lb);
  let lastFocus;
  const close = () => { lb.hidden = true; lastFocus?.focus(); };
  document.addEventListener('click', e => {
    const f = e.target.closest('.pola'); if (!f) return;
    const i = $('img', f); img.src = i.src; img.alt = i.alt; cap.textContent = $('figcaption', f).textContent;
    lastFocus = document.activeElement; lb.hidden = false; $('button', lb).focus(); vibrate(8);
  });
  lb.addEventListener('click', close);
  document.addEventListener('keydown', e => { if (lb.hidden) return; if (e.key === 'Escape') close(); if (e.key === 'Tab') { e.preventDefault(); $('button', lb).focus(); } });
}

export function renderContent(index, host) {
  const stop = STOPS[index], l = stop.kind==='main'?LUCKOR[stop.mainIndex]:null;
  host.innerHTML = `<article class="card open seen"><div class="inner">${l?l.html():bonusHTML(stop)}${l?.clue ? `<div class="clue"><div class="pts"><b>${l.points}</b><span>poäng</span></div><div><div class="lbl">Ledtråd · kvällens resmål</div><p>${esc(l.clue)}</p></div></div>` : ''}</div></article><section class="brake" id="brake" hidden></section>`;
  if(l?.final)host.querySelector('.signoff').insertAdjacentHTML('beforebegin', `<section class="journey-summary">${finaleSummary()}</section>`);
  l?.init?.(host);
  if(!l)initBonus(stop,host);
  host.querySelectorAll('.pola').forEach(f => { f.tabIndex = 0; f.setAttribute('role','button'); f.setAttribute('aria-label', 'Visa bild: ' + $('img', f).alt); f.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); f.click(); } }); });
  renderBrake();
}
export function markVisited(index) {
  const id=STOPS[index].id;
  for(const key of ['opened','visited'])if(!store[key].includes(id))store[key].push(id);
  save();
}
export function initContent(onTimeChange) {
  initLightbox();
  if (!TEST) return;
  document.body.classList.add('testing');
  const bar = document.createElement('div');
  bar.className = 'testbar';
  bar.innerHTML = `<div class="clock"><span>🧪 TESTLÄGE · simulerad tid</span><b id="t-clock">--:--:--</b></div><div class="row"><button type="button" data-a="back">⏪ −1 h</button><button type="button" data-a="fwd">⏩ +1 h</button><button type="button" class="hl" data-a="next">⏭ Nästa stopp</button><button type="button" data-a="reset">↺ Börja om</button></div>`;
  document.body.appendChild(bar);
  const fmtClock = () => {
    const d = new Date(now() + CONFIG.utcOffset * 3600000);
    const day = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'][d.getUTCDay()];
    $('#t-clock').textContent = `${day} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  };
  fmtClock(); setInterval(fmtClock, 250);
  bar.addEventListener('click', e => {
    const a = e.target.closest('button')?.dataset.a; if (!a) return;
    if (a === 'reset') { try { localStorage.removeItem(KEY); } catch {} location.href = location.pathname + '?test'; return; }
    $('#toast').classList.remove('show');
    if (a === 'back') offset -= 3600000;
    if (a === 'fwd') offset += 3600000;
    if (a === 'next') {
      const nx = STOPS.find(l => now() < unlockStop(l));
      offset = nx ? unlockStop(nx) - 4000 - Date.now() : unlockAt(8) - 8000 - Date.now();
    }
    vibrate(8); onTimeChange(); fmtClock();
  });
}
export { LUCKOR, STOPS, unlockStop, hasMainOpened, CONFIG, TEST, KEY, store, save, now, unlockAt, hhmm, fmtCountdown, fmtHuman, esc, vibrate, confetti, renderBrake };

function bonusGameHTML(stop) {
  switch(stop.idx) {
    case 1:return `<section class="bonus-game"><h3>Spackla klart</h3><p>Tre drag med spackelspaden. Projektledaren filmar.</p><div class="ceiling-patch" aria-label="Ett hål i taket"><i id="spackle-hole"></i></div><button type="button" class="btn" id="spackle-btn">🧰 Spackla</button><p class="game-result" id="spackle-result" aria-live="polite"></p></section>`;
    case 3:return `<section class="bonus-game"><h3>Startljuset</h3><p>Vänta på grönt. Tryck ”Gasa!” så fort det slår om.</p><div class="start-lights" aria-hidden="true"><i></i><i></i><i></i></div><button class="btn" id="race-btn" type="button">🏁 Till start</button><p class="game-result" id="race-result" aria-live="polite"></p></section>`;
    case 7:return `<section class="bonus-game"><h3>Patrik-memory</h3><p>Patrik spelade den här i förväg. Han minns inte hur det gick.</p><div class="memory-grid" id="memory-grid"></div><p class="game-result" id="memory-result" aria-live="polite">0 drag</p><button class="btn" id="memory-again" type="button">Spela igen</button></section>`;
    case 9:return `<section class="bonus-game"><h3>Skjut pucken</h3><p>Stoppa mätaren. Ju närmare kanten, desto bättre.</p><div class="power-track"><i id="shuffle-marker"></i></div><input class="reduced-power" id="shuffle-power" type="range" min="0" max="100" value="70" aria-label="Kraft"><button class="btn" id="shuffle-btn" type="button">🥌 Skjut!</button><p class="game-result" id="shuffle-result" aria-live="polite"></p></section>`;
    case 11:return `<section class="bonus-game"><h3>Bygg Hester</h3><p>Din syster och Sebastian behöver en hand. Spika tills det är klart.</p><div class="house-stage" id="house-stage" aria-hidden="true">🧱</div><button class="btn" type="button" id="house-btn">🔨 Spika</button><p class="game-result" id="house-result" aria-live="polite"></p><span class="horsefree-stamp" id="horsefree-stamp" hidden>HÄSTFRITT ✓</span></section>`;
    case 13:return `<section class="bonus-game nest-game"><h3>Stör ej</h3><button class="btn" id="nest-enter" type="button">🤫 Gå in i boet</button><p class="game-result" id="nest-result" aria-live="polite"></p></section>`;
    case 17:return `<section class="bonus-game"><h3>Tänd lyktorna</h3><p>En lykta för varje timme du har rest idag.</p><div class="lantern-grid" id="lantern-grid">${Array.from({length:9},(_,i)=>`<button type="button" aria-pressed="false" aria-label="Tänd lyktan ${pad(i+8)}"><span aria-hidden="true">🏮</span><small>${pad(i+8)}</small></button>`).join('')}</div><p class="game-result" id="lantern-result" aria-live="polite"></p></section>`;
    default:return '';
  }
}
function initBonus(stop,host) {
  const burst = element => {const r=element.getBoundingClientRect();confetti.burst(r.left+r.width/2,Math.max(80,r.top),45);vibrate(15);};
  if(stop.idx===1){let n=0;$('#spackle-btn',host).onclick=()=>{n++;$('#spackle-hole',host).style.opacity=[1,.55,.25,.08][Math.min(3,n)];$('#spackle-result',host).textContent=n===3?'Nästan osynligt! ✨ (Syns bara i motljus.)':n>3?'Lägg ner spackelspaden. Det är bra nu.':'';if(n===3)burst($('#spackle-hole',host));};}
  if(stop.idx===3){
    const btn=$('#race-btn',host),result=$('#race-result',host),lights=[...host.querySelectorAll('.start-lights i')];let state='idle',greenAt=0,timers=[];
    const clear=()=>{timers.forEach(clearTimeout);timers=[];};
    const finish=text=>{clear();state='done';result.textContent=text;btn.textContent='Kör igen';};
    btn.onclick=()=>{
      if(state==='idle'||state==='done'){
        clear();state='red';result.textContent='';btn.textContent='Gasa!';lights.forEach(l=>l.className='');
        for(let i=0;i<3;i++)timers.push(setTimeout(()=>{if(host.isConnected)lights[i].className='red';},i*700));
        timers.push(setTimeout(()=>{if(!host.isConnected)return;state='green';greenAt=performance.now();lights.forEach(l=>l.className='green');vibrate(8);},2100+800+Math.random()*1700));
      }else if(state==='red')finish('Tjuvstart! Du får skylla på kontrollen. 🎮');
      else{const ms=Math.round(performance.now()-greenAt);finish(ms<250?`${ms} ms. Pole position. Det där är neuroreflexer.`:ms<=400?`${ms} ms. Stabil start. Inga bananskal i sikte.`:`${ms} ms. Du kom iväg. Det är det viktiga.`);}
    };
  }
  if(stop.idx===7){
    const grid=$('#memory-grid',host),result=$('#memory-result',host);let cards=[],flipped=[],matched=new Set(),moves=0,busy=false,round=0;
    const draw=()=>{grid.innerHTML=cards.map((symbol,i)=>`<button type="button" data-i="${i}" data-symbol="${symbol}" class="${matched.has(i)?'matched':flipped.includes(i)?'flipped':''}" aria-label="${matched.has(i)||flipped.includes(i)?symbol:'Kort '+(i+1)}" aria-pressed="${matched.has(i)||flipped.includes(i)}">${matched.has(i)||flipped.includes(i)?symbol:'?'}</button>`).join('');};
    const start=()=>{round++;cards=['🐄','🐓','🚜','🌲','🪵','🥚'].flatMap(x=>[x,x]);for(let i=cards.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[cards[i],cards[j]]=[cards[j],cards[i]];}flipped=[];matched=new Set();moves=0;busy=false;result.textContent='0 drag';draw();};
    grid.onclick=e=>{const b=e.target.closest('[data-i]');if(!b||busy)return;const i=+b.dataset.i;if(matched.has(i)||flipped.includes(i))return;flipped.push(i);draw();vibrate(5);if(flipped.length<2)return;moves++;result.textContent=`${moves} drag`;const [a,c]=flipped;if(cards[a]===cards[c]){matched.add(a);matched.add(c);flipped=[];draw();if(matched.size===12){result.textContent=moves<=8?`Klart på ${moves} drag! Minnet har du uppenbarligen inte fått från pappa. Hjärtat däremot – det fick du.`:`Klart på ${moves} drag! Det tog en stund. Patrik är ändå imponerad. Han har glömt hur många drag han behövde.`;store.memoryBest=Math.min(store.memoryBest||Infinity,moves);save();burst(grid);}}else{busy=true;const current=round;setTimeout(()=>{if(current!==round)return;flipped=[];busy=false;draw();},800);}};
    $('#memory-again',host).onclick=start;start();
  }
  if(stop.idx===9){
    const btn=$('#shuffle-btn',host),marker=$('#shuffle-marker',host),result=$('#shuffle-result',host);let start=performance.now(),moving=true;
    btn.onclick=()=>{if(!moving){start=performance.now();moving=true;marker.style.animation='none';void marker.offsetWidth;marker.style.animation='';marker.style.left='';btn.textContent='🥌 Skjut!';result.textContent='';return;}
      const f=((performance.now()-start)/1100)%2;const p=matchMedia('(prefers-reduced-motion: reduce)').matches?+$('#shuffle-power',host).value:(f<=1?f:2-f)*100;
      marker.style.animation='none';marker.style.left=p+'%';moving=false;btn.textContent='Skjut igen';result.textContent=p<40?'Pucken stannade halvvägs. Den behövde en paus. Det förstår vi.':p<75?'2 poäng. Respektabelt. Ingen i baren reagerar.':p<92?'3 poäng! Baren nickar gillande. 🤘':'Kanten! Maxpoäng. Tavlan visar 88. 🤘🎉';if(p>=92)burst(marker);
    };
  }
  if(stop.idx===11){let n=0;const words=['Grunden är lagd. 🧱','Väggarna står. 🪵','Taket är på. 🏠','Hester är klar! 🏡 Hästfritt intyg utfärdat.'];$('#house-btn',host).onclick=()=>{n++;$('#house-stage',host).textContent=['🧱','🪵','🏠','🏡'][Math.min(3,n-1)];$('#house-result',host).textContent=n<=4?words[n-1]:'Det är klart nu. Sluta spika.';if(n===4){$('#horsefree-stamp',host).hidden=false;burst($('#house-stage',host));}};}
  if(stop.idx===13){$('#nest-enter',host).onclick=()=>{const retreat=document.createElement('button');retreat.type='button';retreat.className='nest-retreat';retreat.innerHTML='<span class="breathing-circle" aria-hidden="true"></span><b>Boet är upptaget.</b><small>Andas in … och ut.</small>';$('#sheet').appendChild(retreat);retreat.focus();retreat.onclick=()=>{retreat.remove();$('#nest-result',host).textContent='Välkommen tillbaka. Tåget väntade.';$('#nest-enter',host).focus();};};}
  if(stop.idx===17){const grid=$('#lantern-grid',host);grid.onclick=e=>{const btn=e.target.closest('button');if(!btn)return;btn.classList.add('lit');btn.setAttribute('aria-pressed','true');vibrate(8);if(grid.querySelectorAll('.lit').length===9)$('#lantern-result',host).textContent='Vägen är upplyst. Vi ses klockan 17. 🥂';};}
}
