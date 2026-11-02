import * as THREE from 'three';
import { STOPS, unlockStop, bindWorldStops, EGG_IDS, EGGS, PATRIK_LINES, CONDUCTOR_LINES, PRE_DEPARTURE, FINALE_FAREWELL, tittutLine, finaleSummary, TEST, store, save, now, unlockAt, fmtCountdown, fmtHuman, esc, vibrate, confetti, renderContent, initContent, markVisited, renderBrake } from './content.js';

const $ = selector => document.querySelector(selector);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const v = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z);
const canvas = $('#scene');
let renderer, world, maja, camera, scene;
let phase = 'loading', activeIndex = -1, trainU = 0, elapsed = 0, nextIdleAt = 8, lastIdleName = '';
let cameraGoal, targetGoal, cameraTarget = v();
let firstTick = true, failed = false, lastTimestamp = null, frameId, toastTimer;
const characters = [], npcByStation = new Map(), mattiasByStation = new Map(), appPickables = [], tweens = new Set();
let announcementTimer, announcementBusy=false;
const announcementQueue=[],tapWindows={maja:[],loco:[]};
let currentArrival=null,viewShift=0;
const unlockedBefore = new Set();
const activeTween = (duration, step) => new Promise(resolve => {
  tweens.add({ elapsed:0, duration: reduced ? Math.min(duration,.15) : duration, step, resolve });
});
const pause = duration => activeTween(duration, () => {});
const ease = t => t*t*(3-2*t);
function nextIndex() { return STOPS.findIndex((_,i) => !visitedNow(i)); }
function visitedNow(i) { return !!STOPS[i] && store.visited.includes(STOPS[i].id) && now() >= unlockStop(i); }
function setPhase(name) {
  phase = name;
  document.body.dataset.phase = name;
  document.body.classList.toggle('traveling', name === 'traveling' || name === 'boarding' || name === 'arriving');
  $('#travel-caption').hidden = !['boarding','traveling','arriving','event'].includes(name);
}
function fallback(error) {
  if (failed) return;
  failed = true; phase = 'error'; cancelAnimationFrame(frameId);
  $('#loading').hidden = true; $('#fallback').hidden = false;
  document.body.classList.remove('has-sheet','traveling');
  renderer?.dispose();
  // Leave the classic version one tap away, including its simulated time.
  const classicParams=new URLSearchParams(location.search);classicParams.delete('nollstall');
  $('#fallback a').href = '../klassisk/' + (classicParams.size?'?'+classicParams:'');
  if (TEST) $('#fallback p').title = String(error?.message || error || 'WebGL');
}

// These stubs deliberately implement the same interface as the two independent modules.
// They are only used if a module has not been delivered yet.
function stubPerson({height=1.7,top='#f8f0e3',hairColor='#654534'}={}) {
  const group = new THREE.Group();
  const mat = color => new THREE.MeshStandardMaterial({color,roughness:.85});
  const mesh = (geo,color,x,y,z) => { const m=new THREE.Mesh(geo,mat(color));m.position.set(x,y,z);group.add(m);return m; };
  mesh(new THREE.CapsuleGeometry(.24,.38,4,8),top,0,.65,0);
  mesh(new THREE.SphereGeometry(.34,16,12),'#efc5a5',0,1.25,0);
  mesh(new THREE.SphereGeometry(.35,16,12),hairColor,0,1.35,-.08);
  for (const x of [-.12,.12]) {
    mesh(new THREE.CapsuleGeometry(.09,.28,3,6),'#adc6db',x,.24,0);
    mesh(new THREE.SphereGeometry(.035,8,6),'#3c242a',x,1.27,.315);
  }
  group.scale.setScalar(height/1.65);
  let anim='idle', clock=0;
  const props = {};
  return {group,height,update(dt){clock+=dt;group.rotation.z=['dance','spin'].includes(anim)?Math.sin(clock*7)*.1:0;},
    async play(name,{loop=false}={}) {anim=name;if(!loop){await pause(.7);anim='idle';}},
    setProp(hand,name){if(props[hand])group.remove(props[hand]);if(name)props[hand]=mesh(new THREE.SphereGeometry(.12,8,6),name==='glass'?'#f0b43c':'#f8f0e3',hand==='left'?-.35:.35,.75,.16);},
    setHat(){},setOutfit(){},setExpression(){},lookAt(){} };
}
async function stubWorld({scene}) {
  scene.background = new THREE.Color('#c7d9d1');
  scene.add(new THREE.HemisphereLight('#fff3db','#66714f',2.5));
  const sun=new THREE.DirectionalLight('#ffdec4',3);sun.position.set(8,18,7);scene.add(sun);
  const material = color => new THREE.MeshStandardMaterial({color,roughness:.9});
  const box = (sx,sy,sz,color,x,y,z) => {const m=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),material(color));m.position.set(x,y,z);scene.add(m);return m;};
  box(125,.5,40,'#849571',50,-.4,0);
  const curve=new THREE.CatmullRomCurve3(Array.from({length:19},(_,i)=>v(i*6,.1,Math.sin(i*.45)*3)));
  for(let i=0;i<180;i++){const p=curve.getPoint(i/179);box(.2,.12,1.9,'#79604c',p.x,p.y,p.z);}
  const trackPoint=u=>({position:curve.getPointAt(THREE.MathUtils.clamp(u,0,1)),tangent:curve.getTangentAt(THREE.MathUtils.clamp(u,0,1))});
  const stations=STOPS.map((l,i)=>{
    const p=trackPoint(i/18).position;
    const standPos=p.clone().add(v(0,.15,3));
    box(5,.25,3,'#c3ad8b',p.x,0,p.z+3);
    const house=box(3,2.2,2.2,i===5?'#e4bb68':'#9e2a22',p.x,1.3,p.z-5);
    box(3.5,.3,2.7,'#594047',p.x,2.5,p.z-5);
    box(.65,.8,.04,'#fff0c7',p.x,1.5,p.z-3.87);
    return {idx:i,id:l.id,kind:l.kind,t:l.t,name:l.station,trainU:i/18,mattiasSpot:{pos:standPos.clone().add(v(-1.6,0,-1.1)),facing:0,pose:i%2?'peek':'crouch'},standPos,standFacing:0,cameraPos:p.clone().add(v(7,6.2,12)),cameraTarget:standPos.clone().add(v(0,1,0)),npcSpots:i===18?[{who:'mattias',pos:standPos.clone().add(v(-1.5,0,0)),facing:.5}]:[],house};
  });
  for(let i=0;i<60;i++){
    const x=(i*17.3)%115-5,z=(i%2?-1:1)*(8+(i%5)*2);
    box(.2,1.4,.2,'#70523f',x,.7,z);
    const m=new THREE.Mesh(new THREE.SphereGeometry(.9,7,5),material(['#d5894b','#e9b559','#b46248'][i%3]));m.position.set(x,2,z);scene.add(m);
  }
  const group=new THREE.Group();scene.add(group);
  const carriage=new THREE.Mesh(new THREE.BoxGeometry(2,1.4,1.3),material('#8c1d40'));carriage.position.y=1;group.add(carriage);
  const roof=new THREE.Mesh(new THREE.BoxGeometry(2.3,.15,1.6),material('#f0b43c'));roof.position.y=1.8;group.add(roof);
  const seat=new THREE.Object3D();seat.position.set(0,.5,0);group.add(seat);
  return {stations,pickables:[{object:group,id:'loco'}],react(){},train:{group,seat,doorPos(){return group.localToWorld(v(0,.2,1.1));}},trackPoint,
    setTrainU(u){const p=trackPoint(u);group.position.copy(p.position);group.rotation.y=Math.atan2(p.tangent.x,p.tangent.z);},
    setStationState(i,state){stations[i].house.material.color.set(state==='locked'?'#9c8c7e':i===5?'#e4bb68':'#9e2a22');},setSign(){},async playStationEvent(){await pause(1);},
    setTimeOfDay(f){scene.background.set(f>.9?'#4d405d':'#c7d9d1');},fx:Object.fromEntries(['confetti','hearts','notes','sneeze','fireworks','sparkle'].map(n=>[n,()=>{}])),update(){} };
}
async function moduleOrStub(path, fallback) {
  try { return await import(path); } catch { return fallback; }
}

function stationCamera(i) {
  const s=world.stations[i];
  cameraGoal=s.cameraPos.clone();targetGoal=s.cameraTarget.clone();
}
function frame(dt) {
  elapsed+=dt;
  for(const tween of tweens){tween.elapsed+=dt;const p=Math.min(1,tween.elapsed/tween.duration);tween.step(ease(p));if(p===1){tweens.delete(tween);tween.resolve();}}
  world.update(reduced ? 0 : dt, reduced ? 0 : elapsed);
  characters.forEach(c=>{if(c.group.visible)c.update(reduced ? 0 : dt);});
  if(cameraGoal){const f=reduced?1:1-Math.exp(-dt*3.8);camera.position.lerp(cameraGoal,f);cameraTarget.lerp(targetGoal,f);camera.lookAt(cameraTarget);}
  if(phase==='waiting'&&elapsed>nextIdleAt&&!reduced){nextIdleAt=elapsed+6+Math.random()*6;const choices=(now()<unlockAt(8)?['yawn','wave']:now()<unlockAt(10)?['yawn','wave','laugh']:['wave','cheer','laugh']).filter(name=>name!==lastIdleName);lastIdleName=choices[Math.floor(Math.random()*choices.length)];void maja.play(lastIdleName);}
  camera.updateMatrixWorld();
  const expanded=!$('#sheet').hidden&&!$('#sheet').classList.contains('collapsed');
  let desiredShift=0;
  if(expanded){const head=maja.group.getWorldPosition(v()).add(v(0,maja.height*.84,0)).project(camera);const baseY=(1-head.y)*innerHeight/2+viewShift;desiredShift=THREE.MathUtils.clamp(baseY-innerHeight*(TEST?.19:.29),0,innerHeight*.3);}
  viewShift=THREE.MathUtils.lerp(viewShift,desiredShift,reduced?1:1-Math.exp(-dt*5));
  if(viewShift>.5)camera.setViewOffset(innerWidth,innerHeight,0,viewShift,innerWidth,innerHeight);else camera.clearViewOffset();
  renderer.render(scene,camera);
}
function loop(timestamp) {
  if(failed)return;
  const dt=lastTimestamp===null?0:Math.min((timestamp-lastTimestamp)/1000,.05);lastTimestamp=timestamp;
  try{frame(dt);}catch(error){fallback(error);return;}
  frameId=requestAnimationFrame(loop);
}
function toast(message) {
  const el=$('#toast');el.textContent=message;el.classList.add('show');
  el.onclick=()=>{el.classList.remove('show');if(phase==='waiting'&&nextIndex()>=0)$('#depart').focus();};
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),7000);
}
function updatePlan() {
  $('#egg-count').textContent=`Påskägg: ${store.eggs.length}/${EGG_IDS.length}`;
  $('#mattias-count').textContent=`Mattias hittad: ${store.foundMattias.length}/19`;
  $('#plan-stations').innerHTML=STOPS.map((l,i)=>{
    const visited=visitedNow(i),ready=now()>=unlockStop(i);
    return `<button type="button" class="plan-station ${l.kind}${activeIndex===i?' current':''}" data-station="${i}" ${visited&&phase==='waiting'?'':'disabled'}><span class="plan-time">${l.t}</span><span class="plan-marker">${visited?'✓':ready?'•':'🔒'}</span><span>${visited?esc(l.station):ready?'Nytt stopp!':'? ? ?'}${l.kind==='mini'?'<em>Hållplats</em>':''}</span><small>${visited?'✓':ready?'Nu':'🔒 '+l.t}</small></button>`;
  }).join('');
}
function tick() {
  if(failed)return;
  const t=now(),next=nextIndex(),nextStop=STOPS[next];
  const busy=phase!=='waiting';
  const unlocked=nextStop&&t>=unlockStop(next);
  STOPS.forEach((l,i)=>{
    const ready=t>=unlockStop(i);
    world.setStationState(i,!ready?'locked':visitedNow(i)?'visited':'ready');
    world.setSign(i,!ready?l.t:visitedNow(i)?'✓ '+l.t:l.t);
    if(ready&&!unlockedBefore.has(i)&&!firstTick){toast(i===18?'🔔 Slutstationen är öppen! 🥂':l.kind==='mini'?'🔔 Ny hållplats öppen. Tryck här.':'🔔 Tåget kan rulla vidare! Nästa station väntar.');vibrate([40,60,40]);}
    if(ready)unlockedBefore.add(i);else unlockedBefore.delete(i);
  });
  firstTick=false;
  world.setTimeOfDay(THREE.MathUtils.clamp((t-unlockAt(8))/(9*3600000),0,1));
  const count=STOPS.filter((_,i)=>visitedNow(i)).length;
  $('#progress').textContent=`Stopp ${count}/19`;
  $('#done-stamp').hidden=!visitedNow(18);
  $('#brake-shortcut').hidden=!STOPS.some((l,i)=>l.kind==='main'&&i<18&&visitedNow(i))||visitedNow(18);
  const departure=$('#depart');departure.disabled=busy||!unlocked;
  departure.textContent=busy?(phase==='traveling'?'🚂 På väg…':'✨ Ett ögonblick…'):next<0?'Framme ♥ Vi ses vid bordet':unlocked?(next===0?'🎂 Starta resan':'🚂 Åk till nästa station'):`Nästa avgång ${nextStop.t}`;
  $('#status-label').textContent=next<0?'Framme! Cin cin 🥂':unlocked?`Nästa: ${nextStop.station}`:next===0?`Tåget avgår 08:00 · ${fmtHuman(unlockStop(0)-t)}`:nextStop.kind==='mini'?`Nästa: ${nextStop.station} ${nextStop.t}`:`Nästa avgång ${nextStop.t} · ${fmtHuman(unlockStop(next)-t)}`;
  $('#status-cd').textContent=next<0?'✓':unlocked?'Dags att åka':fmtCountdown(unlockStop(next)-t);
  $('#departure-note').textContent=busy?'Maja-expressen · första klass':next<0?'Grattis på 27-årsdagen, Maja.':unlocked?'Fönsterplatsen är din.':(STOPS[next-1]?.waitNote||'Ett nytt stopp varje halvtimme.');
  updatePlan();renderBrake();
  if(activeIndex>=0&&!visitedNow(activeIndex)&&phase==='waiting'){hideSheet();activeIndex=-1;}
}
function hideSheet() {$('.nest-retreat')?.remove();$('#sheet').hidden=true;document.body.classList.remove('has-sheet');}
function showSheet(i) {
  activeIndex=i;
  const l=STOPS[i];
  $('#sheet-label').textContent=`${l.t} · ${l.station}`;
  renderContent(i,$('#sheet-content'));
  $('#sheet').hidden=false;$('#sheet').classList.remove('collapsed');$('#sheet-toggle').setAttribute('aria-expanded','true');
  $('#sheet-hint').textContent='';$('#sheet-scroll').scrollTop=0;document.body.classList.add('has-sheet');
  $('#scene-title').textContent=l.station;$('#scene-note').textContent=i===18?'Ingen gömmer sig här längre.':'Någon gömmer sig här. Bara så du vet.';
  $('#scene-eyebrow').textContent=`${l.kind==='main'?(i===18?'SLUTSTATION':'STATION '+(l.mainIndex+1)+' AV 10'):'HÅLLPLATS'} · ${l.t}`;
}
function clearProps() {maja.lookAt(null);maja.setProp('left',null);maja.setProp('right',null);maja.setHat(null);maja.setExpression('happy');}
const mainActs = [
  {hat:'partyHat',prop:'balloon',animation:'cheer'},
  {hat:'nurseCap',prop:'coffee',animation:'sip'},
  {hat:'headphones',prop:'mic',animation:'dance',fx:'notes'},
  {prop:'tissue',animation:'sneeze',expression:'sneeze',fx:'sneeze'},
  {prop:'fork',animation:'cheer'},
  {prop:'phone',animation:'sigh',expression:'sigh'},
  {animation:'flex',fx:'sparkle'},
  {prop:'coffee',animation:'sip',expression:'sleepy'},
  {prop:'mic',animation:'dance',fx:'notes'},
  {prop:'glass',animation:'clink',expression:'love',fx:'fireworks'}
];
const miniActs = [
  {hat:'lxaCap',prop:'phone',animation:'phone'}, {prop:'controller',animation:'fistPump'},
  {animation:'crouch',expression:'love'}, {animation:'wave',expression:'surprised'},
  {prop:'puck',animation:'point'}, {animation:'wave'},
  {animation:'crouch',expression:'sleepy'}, {prop:'phone',animation:'sit',expression:'wink'},
  {animation:'point',fx:'hearts'}
];
const actFor = i => STOPS[i].kind==='main'?mainActs[STOPS[i].mainIndex]:miniActs[Math.floor(i/2)];
function equipStation(i) {
  clearProps();const act=actFor(i);if(i>=17)maja.setOutfit({coat:['#b88a5a','#1f1d22','#8d8b91','#6e1f33','#e8dcc6','#2f4a3a'][store.coat??0]});if(i===14)maja.setProp('left','bun');maja.setHat(act.hat||null);maja.setProp('right',act.prop||null);maja.setExpression(act.expression||'happy');
}
async function moveMaja(destination,duration=.9) {
  scene.attach(maja.group);const from=maja.group.position.clone();
  const direction=destination.clone().sub(from);
  if(direction.lengthSq()>.01)maja.group.rotation.y=Math.atan2(direction.x,direction.z);
  if(!reduced)void maja.play('walk',{loop:true});
  await activeTween(duration,p=>maja.group.position.lerpVectors(from,destination,p));
  void maja.play('idle',{loop:true});
}
async function stationAnimation(i,sequence) {
  equipStation(i);const act=actFor(i),s=world.stations[i];
  if(reduced)return;
  if(act.fx)world.fx[act.fx]?.(s.standPos.clone().add(v(0,1.5,0)));
  if(i===18){
    const mattias=mattiasByStation.get(i);
    if(mattias){mattias.character.setProp('right','glass');maja.lookAt(mattias.character.group.position);mattias.character.lookAt(maja.group.position);void mattias.character.play('clink');}
    world.fx.hearts?.(s.standPos.clone().add(v(0,1.3,0)));confetti.rain(150);
  }
  await maja.play(act.animation);if(sequence.cancelled)return;
  if(i===0){maja.setExpression('laugh');maja.setHat('partyHat');}
  else if(i===1){maja.setExpression('laugh');await maja.play('point');}
  else if(i===2){maja.setExpression('wink');await maja.play('wave');}
  else if(i===4)await maja.play('cheer');
  else if(i===5){maja.setExpression('love');await maja.play('laugh');}
  else if(i===6){maja.setProp('right','tissue');await maja.play('laugh');}
  else if(i===7){const patrik=npcByStation.get(i)?.find(n=>n.who==='patrik');if(patrik)void patrik.character.play('scratchHead');await maja.play('facepalm');if(!sequence.cancelled)await maja.play('laugh');}
  else if(i===8){maja.setProp('right','fork');await maja.play('cheer');}
  else if(i===9){maja.setProp('right',null);await maja.play('cheer');}
  else if(i===10){await maja.play('facepalm');if(!sequence.cancelled){maja.setExpression('laugh');await maja.play('laugh');}}
  else if(i===11){maja.setExpression('sneeze');await pause(.3);if(!sequence.cancelled){maja.setHat('hardHat');await maja.play('laugh');}}
  else if(i===12){maja.setHat('crown');maja.setExpression('wink');}
  else if(i===14)maja.setExpression('sleepy');
  else if(i===16){await maja.play('spin');if(!sequence.cancelled)await maja.play('bow');}
  else if(i===18){const from=cameraGoal.clone(),to=from.clone().sub(targetGoal).multiplyScalar(1.3).add(targetGoal).add(v(0,1,0));await activeTween(1.7,p=>{if(!sequence.cancelled)cameraGoal=from.clone().lerp(to,p);});}
  if(!sequence.cancelled&&i!==13&&i!==14)maja.setExpression('happy');
}
function skipArrival() {
  const sequence=currentArrival;if(!sequence)return;sequence.cancelled=true;
  for(const tween of tweens){tweens.delete(tween);tween.resolve();}
  void maja.play('idle',{loop:true});sequence.skip();
}
async function depart() {
  const i=nextIndex();if(phase!=='waiting'||i<0||now()<unlockStop(i))return;
  try {
    hideSheet();closePlan();clearProps();$('#toast').classList.remove('show');vibrate(15);setPhase('boarding');sayAnnouncement(i,'departure');tick();
    $('#travel-title').textContent=i===0?'Välkommen ombord!':`Mot ${STOPS[i].station}…`;
    $('#travel-sub').textContent=i===0?'Fönsterplats, såklart.':i===18?'Sista sträckan. Fönsterplats, för sista gången idag.':`Stopp ${i+1} av 19 · slutstation hemlig`;
    if(i>0){
      await moveMaja(world.train.doorPos(),.8);
      world.train.seat.add(maja.group);maja.group.position.set(0,0,0);maja.group.rotation.set(0,0,0);
      if(!reduced)void maja.play('sit',{loop:true});setPhase('traveling');
      const start=trainU,end=world.stations[i].trainU;
      await activeTween(3.5,p=>{
        trainU=THREE.MathUtils.lerp(start,end,p);world.setTrainU(trainU);
        const here=world.trackPoint(trainU),ahead=world.trackPoint(Math.min(1,trainU+.018));
        const side=v(here.tangent.z,0,-here.tangent.x).multiplyScalar(8);
        cameraGoal=here.position.clone().add(side).add(v(-2,5.7,5));targetGoal=ahead.position.clone().add(v(0,1.3,0));
      });
    }
    setPhase('arriving');stationCamera(i);setNPCStation(i);sayAnnouncement(i,'arrival');
    if(i>0){scene.attach(maja.group);maja.group.position.copy(world.train.doorPos());}
    const sequence={cancelled:false,skip:null};currentArrival=sequence;
    const skipped=new Promise(resolve=>{sequence.skip=resolve;});
    const arrival=(async()=>{
      if(i>0)await moveMaja(world.stations[i].standPos,.8);if(sequence.cancelled)return;
      maja.group.rotation.y=world.stations[i].standFacing;setPhase('event');$('#travel-title').textContent=`${STOPS[i].t} · ${STOPS[i].station}`;
      await Promise.all([reduced?Promise.resolve():world.playStationEvent(i),stationAnimation(i,sequence)]);
    })();
    await Promise.race([arrival,skipped]);currentArrival=null;
    scene.attach(maja.group);maja.group.position.copy(world.stations[i].standPos);maja.group.rotation.y=world.stations[i].standFacing;
    markVisited(i);setPhase('waiting');showSheet(i);tick();if(i===18)announce(FINALE_FAREWELL);
    if(i===0&&!reduced)confetti.burst(innerWidth/2,innerHeight*.4,65);
  } catch(error){fallback(error);}
}
function closePlan() {$('#plan').hidden=true;$('#plan-backdrop').hidden=true;$('#plan-button').setAttribute('aria-expanded','false');}
function openPlan() {updatePlan();$('#plan').hidden=false;$('#plan-backdrop').hidden=false;$('#plan-button').setAttribute('aria-expanded','true');$('#plan-close').focus();}
async function revisit(i) {
  if(phase!=='waiting'||!visitedNow(i))return;
  closePlan();hideSheet();setPhase('revisiting');setNPCStation(i);tick();
  // The train and character travel together even when revisiting, so the next departure
  // starts at the station that is actually on screen.
  world.train.seat.add(maja.group);maja.group.position.set(0,0,0);maja.group.rotation.set(0,0,0);
  const start=trainU,end=world.stations[i].trainU;
  await activeTween(.9,p=>{trainU=THREE.MathUtils.lerp(start,end,p);world.setTrainU(trainU);stationCamera(i);});
  scene.attach(maja.group);maja.group.position.copy(world.stations[i].standPos);maja.group.rotation.set(0,world.stations[i].standFacing,0);equipStation(i);void maja.play('idle',{loop:true});
  setPhase('waiting');showSheet(i);tick();
}
function setNPCStation(i) {
  npcByStation.forEach((list,index)=>list.forEach(({character})=>{character.group.visible=index===i;}));
  mattiasByStation.forEach(({character},index)=>{character.group.visible=index===i;});
}
function setupNPCs(createPerson) {
  const configs={
    mattias:{height:1.55,hair:'short',hairColor:'#8d7653',top:'#778568',bottom:'#35333d',beard:true},
    conductor:{height:1.5,hair:'short',hairColor:'#735748',top:'#283c58',bottom:'#283c58'},
    maria:{height:1.52,hair:'long',hairColor:'#805e42',top:'#c5a6a0',bottom:'#4c455b'},
    nurse:{height:1.5,hair:'bun',hairColor:'#795744',top:'#b2d3d1',bottom:'#b2d3d1'},
    fan:{height:1.45,hair:'ponytail',hairColor:'#61483f',top:'#d892ab',bottom:'#76889f'},
    patrik:{height:1.55,hair:'short',hairColor:'#8a8276',top:'#a7473e',bottom:'#55564b',beard:true},
    syster:{height:1.55,hair:'ponytail',hairColor:'#79513d',top:'#b8a88a',bottom:'#626779'},
    sebastian:{height:1.57,hair:'short',hairColor:'#644832',top:'#6b7883',bottom:'#4b4b52',beard:true},
    friend1:{height:1.5,hair:'long',hairColor:'#d2b279',top:'#d8a8b5',bottom:'#647a96'},
    friend2:{height:1.5,hair:'long',hairColor:'#a08060',top:'#a7b99a',bottom:'#6e7191'},
    friend3:{height:1.5,hair:'ponytail',hairColor:'#493229',top:'#b7abd2',bottom:'#52576b'}
  };
  const make=(who,spot)=>{
    const character=createPerson(configs[who]||configs.fan);character.group.position.copy(spot.pos);character.group.rotation.y=spot.facing||0;scene.add(character.group);characters.push(character);
    if(['mattias','conductor','patrik'].includes(who)){const proxy=new THREE.Mesh(new THREE.BoxGeometry(character.height*.6,character.height*1.15,.7),new THREE.MeshBasicMaterial({visible:false}));proxy.position.y=character.height*.52;character.group.add(proxy);}
    if(who==='conductor')character.setHat('cap');if(who==='maria')character.setProp('right','phone');
    if(who==='patrik'){character.setHat('flatCap');character.setProp('right','chainsaw');}
    if(who==='syster'||who==='sebastian'){character.setHat(who==='syster'?'hardHat':'cap');character.setProp('right','hammer');}
    if(who.startsWith('friend'))character.setProp('right','controller');
    return {who,character};
  };
  world.stations.forEach((s,i)=>{
    const list=[];let friendNumber=0;for(const spot of s.npcSpots||[]){let role=String(spot.who||'fan').toLowerCase();if(role==='mattias')continue;if(role==='sister')role='syster';if(i===3&&(/friend|fan/.test(role)))role='friend'+(++friendNumber);const npc=make(role,spot);list.push(npc);if(role==='patrik'||role==='conductor')appPickables.push({object:npc.character.group,id:role,stationId:STOPS[i].id});}
    npcByStation.set(i,list);
    const hidingSpot=s.mattiasSpot||(s.npcSpots||[]).find(spot=>spot.who==='mattias')||{pos:s.standPos.clone().add(v(-1.5,0,-.8)),facing:s.standFacing,pose:'peek'};
    if(hidingSpot){const npc=make('mattias',hidingSpot);mattiasByStation.set(i,npc);appPickables.push({object:npc.character.group,id:'mattias',stationId:STOPS[i].id});if(hidingSpot.pose&&hidingSpot.pose!=='stand')void npc.character.play(hidingSpot.pose,{loop:true});}
  });
}
function sayAnnouncement(i,type) { if(type==='departure'){announcementQueue.length=0;clearTimeout(announcementTimer);announcementBusy=false;}announce(STOPS[i][type]); }
function announce(text) {
  if(!text)return;announcementQueue.push(text);showNextAnnouncement();
}
function showNextAnnouncement() {
  if(announcementBusy||!announcementQueue.length)return;
  announcementBusy=true;document.body.classList.add('announcing');const text=announcementQueue.shift();$('#announcement-text').textContent=text;$('#announcement').hidden=false;
  clearTimeout(announcementTimer);announcementTimer=setTimeout(dismissAnnouncement,Math.min(6000,2200+text.length*55));
}
function dismissAnnouncement() {clearTimeout(announcementTimer);$('#announcement').hidden=true;document.body.classList.remove('announcing');announcementBusy=false;showNextAnnouncement();}
function updateSummary() {
  const summary=$('.journey-summary');if(summary)summary.innerHTML=finaleSummary();
  const tittut=$('#tittut-count');if(tittut)tittut.textContent=tittutLine();
}
function discoverEgg(id,line,point) {
  const egg=EGGS.find(e=>e.id===id);if(!egg)return;
  const fresh=!store.eggs.includes(id);if(fresh)store.eggs.push(id);save();updatePlan();updateSummary();
  toast(fresh?`🥚 Påskägg ${store.eggs.length}/16 · ${egg.name}
${line}`:line);
  if(!reduced&&point)world.fx.sparkle?.(point);vibrate(15);
}
function cycleLine(id,lines) {const n=store.taps['line-'+id]||0;store.taps['line-'+id]=n+1;return lines[n%lines.length];}
function tapReaction(id,stationId,point) {
  const raw=id.toLowerCase(),key=EGG_IDS.find(k=>raw===k||raw.startsWith(k+'-')||raw.startsWith(k+':'))||(/star/.test(raw)?'moon':raw);
  if(key==='mattias'){
    const stop=STOPS.find(s=>s.id===stationId)||STOPS[Math.max(0,activeIndex)];const fresh=!store.foundMattias.includes(stop.id);
    if(fresh){store.foundMattias.push(stop.id);store.found=store.foundMattias;save();}
    toast(fresh?`👀 Mattias hittad: ${store.foundMattias.length}/19
${stop.foundLine}`:'Du har redan hittat mig här. 😊');updatePlan();updateSummary();
    const npc=mattiasByStation.get(stop.idx);if(!reduced&&npc){void npc.character.play('wave');world.fx.hearts?.(npc.character.group.position.clone().add(v(0,1.7,0)));}return;
  }
  if(key==='maja'||key==='loco'){
    const t=performance.now(),limit=key==='maja'?6000:4000,target=key==='maja'?10:5;
    tapWindows[key]=tapWindows[key].filter(at=>t-at<=limit);tapWindows[key].push(t);store.taps[key]=(store.taps[key]||0)+1;save();
    if(tapWindows[key].length>=target){tapWindows[key]=[];const line=EGGS.find(e=>e.id===key).lines[0];discoverEgg(key,line,point);if(!reduced){if(key==='maja')void maja.play('flex');else world.fx.hearts?.(world.train.group.getWorldPosition(v()).add(v(0,2,0)));}}
    else if(key==='maja'){maja.setExpression('love');if(!reduced){world.fx.hearts?.(maja.group.position.clone().add(v(0,1.7,0)));void maja.play('wave');}}
    return;
  }
  if(!EGG_IDS.includes(key))return;
  if(key==='moon'&&(now()-unlockAt(8))/(9*3600000)<.85)return;
  let line;
  if(key==='patrik'){line=cycleLine(key,PATRIK_LINES);const npc=npcByStation.get(Math.max(0,activeIndex))?.find(n=>n.who==='patrik');if(npc&&!reduced)void npc.character.play('scratchHead');}
  else if(key==='conductor'){line=cycleLine(key,CONDUCTOR_LINES);const npc=npcByStation.get(Math.max(0,activeIndex))?.find(n=>n.who==='conductor');if(npc&&!reduced)void npc.character.play('bow');}
  else if(key==='hen'){const lines=EGGS.find(e=>e.id===key).lines;const count=store.taps['line-hen']||0;store.taps['line-hen']=count+1;line=lines[count?1:0];}
  else if(key==='phone'){store.taps.phone=(store.taps.phone||2)+1;line=EGGS.find(e=>e.id===key).lines[0].replace('{k}',store.taps.phone);}
  else line=cycleLine(key,EGGS.find(e=>e.id===key).lines);
  if(!reduced){
    if(key==='horse'){maja.setExpression('sneeze');void maja.play('sneeze');world.fx.sneeze?.(maja.group.position.clone().add(v(0,1.7,0)));}
    if(key==='cow'||key==='lamb'||key==='moon')world.fx.hearts?.(point||maja.group.position.clone().add(v(0,2,0)));
    if(key==='disco')void maja.play('dance');
  }
  discoverEgg(key,line,point);
}
function visiblePickables() {
  return [{object:maja.group,id:'maja'},...(world.pickables||[]),...appPickables].filter(p=>{
    let object=p.object;while(object){if(!object.visible)return false;object=object.parent;}return true;
  });
}
function setSheetCollapsed(collapsed){$('#sheet').classList.toggle('collapsed',collapsed);$('#sheet-toggle').setAttribute('aria-expanded',String(!collapsed));$('#sheet-hint').textContent=collapsed?'Dra upp för att läsa ⌃':'';vibrate(5);}
function setupInteractions() {
  $('#depart').addEventListener('click',depart);
  $('#announcement').addEventListener('click',dismissAnnouncement);
  $('#announcement').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();dismissAnnouncement();}});
  document.addEventListener('guess-locked',()=>{announcementQueue.length=0;clearTimeout(announcementTimer);announcementBusy=false;announce('Nödbromsen är dragen. Gissningen är noterad. Konduktören säger ingenting. Konduktören ler lite.');});
  $('#brake-shortcut').addEventListener('click',()=>{if(phase!=='waiting')return;closePlan();if($('#sheet').hidden&&activeIndex>=0)showSheet(activeIndex);$('#sheet').classList.remove('collapsed');$('#sheet-hint').textContent='';$('#sheet-toggle').setAttribute('aria-expanded','true');$('#brake')?.scrollIntoView({block:'start',behavior:reduced?'instant':'smooth'});});
  let sheetPointerY=0,ignoreSheetClick=false;
  $('#sheet-toggle').addEventListener('pointerdown',e=>{sheetPointerY=e.clientY;});
  $('#sheet-toggle').addEventListener('pointerup',e=>{const d=e.clientY-sheetPointerY;if(Math.abs(d)>25){setSheetCollapsed(d>0);ignoreSheetClick=true;setTimeout(()=>ignoreSheetClick=false,0);}});
  $('#sheet-toggle').addEventListener('click',()=>{if(ignoreSheetClick)return;setSheetCollapsed(!$('#sheet').classList.contains('collapsed'));});
  $('#plan-button').addEventListener('click',openPlan);$('#plan-close').addEventListener('click',()=>{closePlan();$('#plan-button').focus();});$('#plan-backdrop').addEventListener('click',closePlan);
  $('#plan-stations').addEventListener('click',e=>{const button=e.target.closest('[data-station]');if(button&&!button.disabled)void revisit(+button.dataset.station);});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&!$('#plan').hidden){closePlan();$('#plan-button').focus();}
    if(e.key==='Tab'&&!$('#plan').hidden){const controls=[...$('#plan').querySelectorAll('button:not(:disabled),a')];const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){last.focus();e.preventDefault();}else if(!e.shiftKey&&document.activeElement===last){first.focus();e.preventDefault();}}
  });
  document.addEventListener('coat-change',e=>maja.setOutfit({coat:e.detail}));
  // Small games in the sheet can make Maja react in 3D (sneeze at Skäftesfall, dance at Logen).
  document.addEventListener('maja-act',e=>{if(phase!=='waiting'||reduced)return;const name=e.detail;if(name==='sneeze'){maja.setExpression('sneeze');world.fx.sneeze?.(maja.group.position.clone().add(v(0,1.7,0)));}void maja.play(name).then(()=>{if(name==='sneeze')maja.setExpression('happy');});});
  const raycaster=new THREE.Raycaster();let down;
  canvas.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};});
  canvas.addEventListener('pointerup',e=>{
    if((phase==='arriving'||phase==='event')&&currentArrival){skipArrival();return;}
    if(phase!=='waiting'||!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>12)return;
    const rect=canvas.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);
    const picks=visiblePickables();
    const hits=raycaster.intersectObjects(picks.map(p=>p.object),true);
    if(!hits.length)return;
    const match=picks.find(p=>{let object=hits[0].object;while(object){if(object===p.object)return true;object=object.parent;}return false;});
    if(match){if((world.pickables||[]).includes(match))world.react?.(match.id);tapReaction(match.id,match.stationId,hits[0].point);vibrate(10);}
  });
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();fallback(new Error('WebGL context lost'));});
  document.addEventListener('visibilitychange',()=>{lastTimestamp=null;if(!document.hidden)tick();});
}
async function boot() {
  try {
    renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(43,innerWidth/innerHeight,.1,500);camera.position.set(7,6,12);
    await document.fonts.ready;
    const [majaModule,worldModule]=await Promise.all([moduleOrStub('./maja.js',{createMaja:()=>stubPerson({height:1.78}),createPerson:stubPerson}),moduleOrStub('./world.js',{createWorld:stubWorld})]);
    document.body.dataset.worldModule=worldModule.createWorld===stubWorld?'stub':'real';document.body.dataset.characterModule=majaModule.createPerson===stubPerson?'stub':'real';
    world=await worldModule.createWorld({scene,renderer,camera});bindWorldStops(world.stations);maja=majaModule.createMaja();scene.add(maja.group);characters.push(maja);setupNPCs(majaModule.createPerson||stubPerson);
    let restored=-1;STOPS.forEach((_,i)=>{if(visitedNow(i))restored=i;});
    const initial=restored<0?0:restored;setNPCStation(initial);trainU=world.stations[initial].trainU;world.setTrainU(trainU);maja.group.position.copy(world.stations[initial].standPos);maja.group.rotation.y=world.stations[initial].standFacing;stationCamera(initial);camera.position.copy(cameraGoal);cameraTarget.copy(targetGoal);camera.lookAt(cameraTarget);
    const resize=()=>{renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();};window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);
    setupInteractions();setPhase('waiting');initContent(tick);tick();
    if(restored>=0){equipStation(restored);showSheet(restored);}else if(now()<unlockAt(8)){maja.setExpression('sleepy');maja.setProp('right','coffee');announce(PRE_DEPARTURE);if(!reduced)void maja.play('yawn');}
    if(TEST)window.__majaDebug={inspect:()=>({phase,activeIndex,trainU,viewShift,head:(()=>{const p=maja.group.getWorldPosition(v()).add(v(0,maja.height*.84,0)).project(camera);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};})(),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,
      picks:visiblePickables().map(p=>{const center=new THREE.Box3().setFromObject(p.object).getCenter(v()).project(camera);return {id:p.id,stationId:p.stationId,x:(center.x+1)*innerWidth/2,y:(1-center.y)*innerHeight/2,z:center.z};})})};
    $('#loading').hidden=true;frameId=requestAnimationFrame(loop);setInterval(tick,1000);
  }catch(error){fallback(error);}
}
void boot();
