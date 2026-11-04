import * as THREE from './vendor/three.module.js';
import {ArenaGame,MAPS,randomSeed} from './core.mjs';

const $=id=>document.getElementById(id);
const storage={get(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}},set(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}};
let settings=storage.get('cc3-settings',{sound:false,quality:'high',shake:true});
let records=storage.get('cc3-records',{wins:0,bestKo:0});
let selectedMap=0,mode='menu',game=null,sheepModels=[],arena,decor,ambientParticles=[],heroRing;
let countdown=0,resultDelay=0,cameraYaw=0,shake=0,accumulator=0,lastTime=0,visualTime=0,currentModal=null,focusBeforeModal=null;
let joy={x:0,z:0},joyPointer=null,dashRequested=false,renderer,scene,camera;
const keys=new Set(),clock=new THREE.Clock(),matCache=new Map();
const sphereGeo=new THREE.IcosahedronGeometry(1,1),roundGeo=new THREE.SphereGeometry(1,10,7),cubeGeo=new THREE.BoxGeometry(1,1,1);
const particles=[],clouds=[];
let audioContext;
function tone(freq,duration=.1,type='sine',volume=.06,slide=0){
  if(!settings.sound)return;try{audioContext??=new(window.AudioContext||window.webkitAudioContext)();if(audioContext.state==='suspended')audioContext.resume();const t=audioContext.currentTime,o=audioContext.createOscillator(),g=audioContext.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(20,slide),t+duration);g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(audioContext.destination);o.start(t);o.stop(t+duration)}catch{}
}
function updateSound(){
  $('sound-setting').checked=settings.sound;$('sound-btn').setAttribute('aria-label',settings.sound?'Выключить звук':'Включить звук');$('sound-wave').setAttribute('d',settings.sound?'M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14':'m17 9 5 6m0-6-5 6');storage.set('cc3-settings',settings);
}
function updateRecords(){$('best-wins').textContent=String(records.wins).padStart(2,'0');$('best-ko').textContent=String(records.bestKo).padStart(2,'0')}
function material(color,extra={}){const key=color+JSON.stringify(extra);if(!matCache.has(key))matCache.set(key,new THREE.MeshStandardMaterial({color,roughness:1,flatShading:true,...extra}));return matCache.get(key)}
function mesh(geo,color,parent,x=0,y=0,z=0,sx=1,sy=1,sz=1){const m=new THREE.Mesh(geo,material(color));m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m}
function ball(color,parent,x,y,z,sx,sy=sx,sz=sx){return mesh(sphereGeo,color,parent,x,y,z,sx,sy,sz)}
function box(color,parent,x,y,z,sx,sy,sz){return mesh(cubeGeo,color,parent,x,y,z,sx,sy,sz)}
function disposeGroup(group){if(!group)return;group.traverse(n=>{if(n.isMesh&&n.userData.ownGeometry)n.geometry.dispose();if(n.isMesh&&n.userData.ownMaterial){n.material.map?.dispose();n.material.dispose()}});scene.remove(group)}
function numberTexture(id){const c=document.createElement('canvas');c.width=128;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle=id===0?'#c7ee76':'#eeeede';ctx.beginPath();ctx.roundRect(14,16,100,96,22);ctx.fill();ctx.font='900 64px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#344336';ctx.fillText(String(id+1).padStart(2,'0'),64,67);const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;return texture}
function createSheep(id){
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);
  const wool=id===0?0xfff6de:[0xf1eee0,0xe8e7d6,0xf5f0df,0xe5e6d3][id%4],face=0x3d4239;
  ball(wool,body,0,1.14,0,.84,.76,1.02);
  for(const [x,y,z,s]of[[-.51,1.19,-.35,.44],[.51,1.19,-.35,.44],[-.5,1.2,.26,.43],[.5,1.2,.26,.43],[-.25,1.67,-.35,.42],[.28,1.65,-.3,.42],[0,1.72,.22,.4],[0,1.1,-.88,.36]])ball(wool,body,x,y,z,s);
  const head=ball(face,body,0,1.14,.85,.43,.53,.45);head.rotation.x=.14;
  const earL=ball(face,body,-.47,1.37,.79,.3,.105,.15);earL.rotation.z=-.3;
  const earR=ball(face,body,.47,1.37,.79,.3,.105,.15);earR.rotation.z=.3;
  for(const x of[-.19,.19]){mesh(roundGeo,0xfffbea,body,x,1.28,1.224,.115,.13,.065);mesh(roundGeo,0x222c28,body,x,1.28,1.28,.043,.065,.035)}
  ball(wool,body,0,1.65,.74,.32,.22,.3);
  const legs=[];for(const x of[-.42,.42])for(const z of[-.48,.43]){legs.push(box(face,body,x,.3,z,.18,.59,.2))}
  ball(wool,body,0,1.17,-1.05,.22,.2,.3);
  const badgeMat=new THREE.MeshBasicMaterial({map:numberTexture(id),transparent:true,depthWrite:false});
  const badge=new THREE.Mesh(new THREE.PlaneGeometry(.73,.73),badgeMat);badge.position.set(0,2.14,-.05);badge.rotation.x=-Math.PI/2;badge.userData.ownGeometry=true;badge.userData.ownMaterial=true;body.add(badge);
  if(id===0){
    const band=box(0xbee565,body,0,.83,.64,.83,.19,.12);band.rotation.x=.15;
    box(0xe39c44,body,0,1.87,.65,.5,.12,.33);
    for(let i=-1;i<=1;i++){const point=new THREE.Mesh(new THREE.ConeGeometry(.10,.30,4),material(0xf3bd59));point.position.set(i*.19,2.04,.65);point.rotation.y=Math.PI/4;body.add(point);point.userData.ownGeometry=true}
  }
  root.userData={body,legs,phase:id*1.7};scene.add(root);return root;
}
function createTree(parent,x,z,seed,snow){
  const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=seed*4;parent.add(g);
  const height=2+seed*1.2;box(0x7a6f4d,g,0,height*.43,0,.30,height*.86,.3);
  for(let i=0;i<3;i++){const geo=new THREE.ConeGeometry(1.2-i*.23,1.9,6);const m=new THREE.Mesh(geo,material(snow?0x9cae9e:[0x688955,0x789757,0x8ba567][i]));m.position.y=height*.45+i*.64;m.castShadow=true;g.add(m);m.userData.ownGeometry=true;if(snow){const cap=new THREE.Mesh(new THREE.ConeGeometry(1.06-i*.21,.6,6),material(0xeef0e2));cap.position.y=m.position.y+.64;g.add(cap);cap.userData.ownGeometry=true}}
}
function createArena(mapIndex){
  disposeGroup(arena);disposeGroup(decor);const map=MAPS[mapIndex],rnd=randomSeed(map.seed);
  scene.background=new THREE.Color(map.sky);scene.fog=new THREE.Fog(map.sky,65,180);
  arena=new THREE.Group();scene.add(arena);
  const sideGeo=new THREE.CylinderGeometry(23,20.5,4.8,64,1);const sides=mesh(sideGeo,map.side,arena,0,-2.48,0);sides.userData.ownGeometry=true;
  const topGeo=new THREE.CylinderGeometry(23,23,.16,96,1);const top=mesh(topGeo,map.grass,arena,0,-.08,0);top.userData.ownGeometry=true;top.receiveShadow=true;
  for(let i=0;i<90;i++){const a=rnd()*Math.PI*2,r=Math.sqrt(rnd())*22;const p=mesh(new THREE.CircleGeometry(.3+rnd()*1.2,6),i%3===0?map.trim:map.grass,arena,Math.sin(a)*r,.013,Math.cos(a)*r,1,1,1);p.rotation.x=-Math.PI/2;p.userData.ownGeometry=true;p.castShadow=false}
  for(let i=0;i<150;i++){
    const a=rnd()*Math.PI*2,r=Math.sqrt(rnd())*22,x=Math.sin(a)*r,z=Math.cos(a)*r;
    if(i%3===0&&mapIndex!==1){const flower=ball(mapIndex===2?0xf7f6ec:(i%2?0xf2df8c:0xf6f0d7),arena,x,.10,z,.065,.07,.065);flower.castShadow=false}
    else{const tuft=mesh(new THREE.ConeGeometry(.08,.27,3),mapIndex===2?0xb9c8b7:0x82a354,arena,x,.12,z);tuft.userData.ownGeometry=true;tuft.castShadow=false}
  }
  decor=new THREE.Group();scene.add(decor);
  for(let i=0;i<19;i++){
    const a=i/19*Math.PI*2,r=20.5+rnd()*1.0;const x=Math.sin(a)*r,z=Math.cos(a)*r;
    if(i%4!==0)createTree(decor,x,z,rnd(),mapIndex===2);else{for(let j=0;j<3;j++)ball(mapIndex===1?0x5e5e52:0xa3a48c,decor,x+j*.6,.28+j*.12,z+rnd(),.5+rnd()*.4,.5,.7)}
  }
  // A little barn makes the pasture recognisable from every camera angle.
  const barn=new THREE.Group();barn.position.set(-12,0,-14);barn.rotation.y=.35;decor.add(barn);
  box(mapIndex===2?0x929c8c:0xb77757,barn,0,1.2,0,3.5,2.4,2.7);
  const roof=new THREE.Mesh(new THREE.CylinderGeometry(2.5,2.5,3.2,3),material(mapIndex===2?0xdce3d5:0x66765a));roof.rotation.z=Math.PI/2;roof.rotation.y=Math.PI/2;roof.position.y=2.85;roof.userData.ownGeometry=true;roof.castShadow=true;barn.add(roof);
  box(0xf2e5c5,barn,0,.95,1.37,1.45,1.9,.06);box(0x6e765a,barn,0,.9,1.42,1.13,1.7,.06);
  for(const k of[-1,1]){const cross=box(0xf2e5c5,barn,0,.9,1.48,.08,1.9,.05);cross.rotation.z=k*.55}
  for(let i=0;i<8;i++){const f=new THREE.Group();f.position.set(-9+i*.8,0,-10.6);box(0xdce0bf,f,0,.6,0,.13,1.2,.13);box(0xdce0bf,f,.36,.8,0,.8,.12,.1);box(0xdce0bf,f,.36,.4,0,.8,.12,.1);decor.add(f)}
  if(mapIndex===1)for(let i=0;i<7;i++){const a=rnd()*Math.PI*2,r=12+rnd()*7;const glow=mesh(new THREE.CircleGeometry(.7+rnd()*.5,8),0xdc8b4c,arena,Math.sin(a)*r,.025,Math.cos(a)*r);glow.rotation.x=-Math.PI/2;glow.userData.ownGeometry=true;glow.castShadow=false}
  const edge=new THREE.Mesh(new THREE.TorusGeometry(22.9,.07,5,128),new THREE.MeshBasicMaterial({color:0xdde4af,transparent:true,opacity:.8}));edge.rotation.x=Math.PI/2;edge.position.y=.05;edge.name='edge';edge.userData.ownGeometry=true;edge.userData.ownMaterial=true;arena.add(edge);
}
function makeEnvironment(){
  const rnd=randomSeed(78);for(let i=0;i<10;i++){
    const g=new THREE.Group();const angle=i/10*Math.PI*2;g.position.set(Math.sin(angle)*(80+rnd()*25),-14,Math.cos(angle)*(80+rnd()*25));ball(0xadc0a0,g,0,0,0,20+rnd()*15,14+rnd()*12,18+rnd()*20);scene.add(g)
  }
  for(let i=0;i<13;i++){
    const c=new THREE.Group();const a=rnd()*Math.PI*2;c.position.set(Math.sin(a)*(35+rnd()*50),16+rnd()*10,Math.cos(a)*(35+rnd()*50));
    for(let j=0;j<4;j++){const m=ball(0xf6f5e6,c,j*1.8,Math.sin(j)*.5,0,2.5,1.1,1.5);m.castShadow=false;m.receiveShadow=false}scene.add(c);clouds.push(c)
  }
  const plane=mesh(new THREE.PlaneGeometry(600,600),0xb7c9a8,scene,0,-15,0);plane.rotation.x=-Math.PI/2;plane.castShadow=false;plane.receiveShadow=false;
}
function rebuildSheep(){for(const m of sheepModels)disposeGroup(m);sheepModels=game.sheep.map(s=>createSheep(s.id));for(const p of particles){scene.remove(p.mesh);p.mesh.geometry.dispose()}particles.length=0}
function makeRing(){heroRing=new THREE.Mesh(new THREE.TorusGeometry(1.23,.06,5,48),material(0xd4f584));heroRing.rotation.x=-Math.PI/2;heroRing.position.y=.04;scene.add(heroRing)}
function puff(x,z,color,count=8,power=1){
  if(particles.length>180)return;
  for(let i=0;i<count;i++){const geo=new THREE.IcosahedronGeometry(.09+Math.random()*.09,0),m=new THREE.Mesh(geo,material(color));m.position.set(x,.4+Math.random()*.5,z);scene.add(m);const a=Math.random()*Math.PI*2,v=(1+Math.random()*3)*power;particles.push({mesh:m,vx:Math.cos(a)*v,vz:Math.sin(a)*v,vy:2+Math.random()*3,life:.5+Math.random()*.4,max:.9})}
}
function animateParticles(dt){for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;if(p.life<=0){scene.remove(p.mesh);p.mesh.geometry.dispose();particles.splice(i,1);continue}p.mesh.position.x+=p.vx*dt;p.mesh.position.z+=p.vz*dt;p.mesh.position.y+=p.vy*dt;p.vy-=9*dt;p.mesh.rotation.x+=dt*5;p.mesh.scale.setScalar(Math.min(1,p.life*3))}}
function syncModels(dt){
  for(let i=0;i<sheepModels.length;i++){
    const s=game.sheep[i],m=sheepModels[i];m.visible=s.alive;if(!s.alive)continue;m.position.set(s.x,s.y,s.z);m.rotation.y=s.angle;
    const speed=Math.hypot(s.vx,s.vz),body=m.userData.body;body.position.y=s.falling?0:Math.abs(Math.sin(visualTime*(speed>1?12:2)+i))*Math.min(.15,speed*.022);
    body.rotation.x=s.falling?s.fallAge*3:Math.min(.18,speed*.011);body.rotation.z=s.falling?s.fallAge*4:Math.sin(visualTime*10+i)*Math.min(.1,speed*.009);
    for(let j=0;j<4;j++)m.userData.legs[j].rotation.x=Math.sin(visualTime*13+(j===0||j===3?0:Math.PI))*Math.min(.6,speed*.06);
    if(s.dashTime>0&&Math.random()<dt*16)puff(s.x,s.z,0xe9edcd,2,.4);
  }
  heroRing.visible=game.player.alive&&!game.player.falling;heroRing.position.x=game.player.x;heroRing.position.z=game.player.z;
  heroRing.scale.setScalar((mode==='menu'?2.1:1)*(1+Math.sin(visualTime*3)*.04));
  const scale=game.radius/23;arena.scale.set(scale,1,scale);decor.scale.set(scale,1,scale);
  const edge=arena.getObjectByName('edge');if(game.time>25){edge.material.color.setHex(0xe78e4d);edge.material.opacity=.65+Math.sin(visualTime*5)*.3}
}
function getInput(){
  let x=joy.x,z=joy.z;
  if(keys.has('KeyW')||keys.has('ArrowUp'))z-=1;if(keys.has('KeyS')||keys.has('ArrowDown'))z+=1;
  if(keys.has('KeyA')||keys.has('ArrowLeft'))x-=1;if(keys.has('KeyD')||keys.has('ArrowRight'))x+=1;
  const co=Math.cos(cameraYaw),si=Math.sin(cameraYaw),dash=dashRequested;dashRequested=false;return{x:x*co+z*si,z:-x*si+z*co,dash};
}
function announce(text,isPlayer=false){
  const a=document.createElement('div');a.className='announcement'+(isPlayer?' player-ko':'');a.textContent=text;$('announcements').append(a);
  while($('announcements').childElementCount>3)$('announcements').firstChild.remove();setTimeout(()=>a.remove(),3400);
}
function processEvents(){
  for(const e of game.drainEvents()){
    if(e.type==='dash'&&e.id===0)tone(250,.18,'sawtooth',.035,70);
    if(e.type==='hit'){puff(e.x,e.z,e.power>9?0xeac777:0xf2efd7,Math.min(12,Math.round(e.power)),.7);if(e.player){shake=Math.min(.5,e.power*.025);tone(95+Math.random()*50,.09,'triangle',.12,35)}}
    if(e.type==='fall'){
      if(e.killer===0){announce(`↗ ТАРАН! Овца № ${String(e.id+1).padStart(2,'0')} улетела`,true);tone(520,.15,'sine',.08,780)}
      else if(e.id!==0)announce(`Овца № ${String(e.id+1).padStart(2,'0')} покинула пастбище`);
      puff(e.x,e.z,0xf2e8c5,12,1.4);
    }
  }
}
function formatTime(t){return`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`}
function updateHud(){
  const alive=game.sheep.filter(s=>s.alive&&!s.falling).length;$('alive').textContent=alive;$('timer').textContent=formatTime(game.time);$('knockouts').textContent=game.knockouts;
  const ready=game.player.cooldown<=0;$('dash-fill').style.width=(1-game.player.cooldown/3)*100+'%';$('dash-status').textContent=ready?'ГОТОВ К ТАРАНУ':`ПЕРЕЗАРЯДКА ${game.player.cooldown.toFixed(1)} С`;
  $('touch-dash').style.opacity=ready?'1':'.45';$('warning').hidden=game.time<25||game.time>30;
  const ctx=$('minimap').getContext('2d');ctx.clearRect(0,0,140,140);ctx.fillStyle='#adc58e';ctx.beginPath();ctx.arc(70,70,56*game.radius/23,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#657f53';ctx.lineWidth=1;ctx.stroke();
  for(const s of game.sheep){if(!s.alive||s.falling)continue;ctx.beginPath();ctx.arc(70+s.x*2.3,70+s.z*2.3,s.id===0?4:2.5,0,Math.PI*2);ctx.fillStyle=s.id===0?'#f9f9dc':'#4a6144';ctx.fill();if(s.id===0){ctx.strokeStyle='#344d2e';ctx.lineWidth=2;ctx.stroke()}}
}
function startGame(){
  closeModal();mode='countdown';game=new ArenaGame(selectedMap);rebuildSheep();createArena(selectedMap);cameraYaw=0;countdown=3.2;accumulator=0;resultDelay=0;keys.clear();joy={x:0,z:0};dashRequested=false;
  $('menu').hidden=true;$('hud').hidden=false;$('countdown').hidden=false;$('countdown').textContent='3';$('announcements').replaceChildren();$('arena-name').textContent=MAPS[selectedMap].name.toUpperCase();document.body.classList.add('in-game');tone(350,.12,'sine',.07);updateHud();
}
function enterMenu(){
  closeModal();mode='menu';keys.clear();joy={x:0,z:0};$('hud').hidden=true;$('menu').hidden=false;document.body.classList.remove('in-game');
  game=new ArenaGame(selectedMap,MAPS[selectedMap].seed);createArena(selectedMap);rebuildSheep();
  game.player.x=12;game.player.z=10;game.player.angle=.65;sheepModels[0].scale.setScalar(2.1);game.sheep.slice(1).forEach((s,i)=>{const a=i/23*Math.PI*2;s.x=Math.sin(a)*(7+i%4*2);s.z=Math.cos(a)*(7+i%4*2);s.angle=a+.5});updateRecords();
}
function showModal(id){
  focusBeforeModal=document.activeElement;keys.clear();joy={x:0,z:0};dashRequested=false;currentModal=id;
  for(const m of document.querySelectorAll('.modal'))m.hidden=m.id!==id;$('modal-backdrop').hidden=false;
  requestAnimationFrame(()=>$(id).querySelector('button,input,select')?.focus());
}
function closeModal(){const old=currentModal;currentModal=null;$('modal-backdrop').hidden=true;for(const m of document.querySelectorAll('.modal'))m.hidden=true;if(focusBeforeModal?.isConnected)focusBeforeModal.focus();return old}
function pause(){if(mode==='playing'||mode==='countdown'){mode=mode==='countdown'?'paused-countdown':'paused';showModal('pause-modal')}}
function resume(){if(mode==='paused'||mode==='paused-countdown'){mode=mode==='paused-countdown'?'countdown':'playing';closeModal();keys.clear();accumulator=0}}
function finish(){
  mode='result';const r=game.result;if(r.won){records.wins++;tone(523,.2,'sine',.1);setTimeout(()=>tone(659,.2,'sine',.1),150);setTimeout(()=>tone(784,.4,'sine',.1),300)}else tone(220,.4,'triangle',.08,75);
  records.bestKo=Math.max(records.bestKo,r.ko);storage.set('cc3-records',records);updateRecords();
  $('result-title').textContent=r.won?'БЕ-Е-ЕЗУМНО!':'УПС. УЛЕТЕЛИ.';$('result-kicker').textContent=r.won?'КОРОЛЬ ПАСТБИЩА':'НЕ ПОСЛЕДНИЙ ТАРАН';$('result-copy').textContent=r.won?'Последняя овца. Первая легенда.':'У каждой легенды бывает неудачный разбег.';$('result-icon').textContent=r.won?'♛':'↗';$('result-place').textContent='#'+r.place;$('result-ko').textContent=r.ko;$('result-time').textContent=formatTime(r.time);showModal('result-modal');
}
function cameraUpdate(dt){
  let desired,look;
  if(mode==='menu'){
    desired=new THREE.Vector3(35+Math.sin(visualTime*.055)*2,29,38);look=new THREE.Vector3(-7,0,1);
    sheepModels[0].rotation.y=.65+Math.sin(visualTime*.5)*.12;
  }else{
    const p=game.player;
    if(mode==='playing'){if(keys.has('KeyQ'))cameraYaw-=dt*1.8;if(keys.has('KeyE'))cameraYaw+=dt*1.8}
    desired=new THREE.Vector3(p.x+Math.sin(cameraYaw)*13,10.5, p.z+Math.cos(cameraYaw)*13);look=new THREE.Vector3(p.x,0.9,p.z);
  }
  const factor=1-Math.exp(-dt*4);camera.position.lerp(desired,factor);camera.userData.look??=look.clone();camera.userData.look.lerp(look,factor);
  if(settings.shake&&shake>0){camera.position.x+=(Math.random()-.5)*shake;camera.position.y+=(Math.random()-.5)*shake;shake=Math.max(0,shake-dt*2)}camera.lookAt(camera.userData.look);
}
function animate(){
  requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05);visualTime+=dt;
  if(mode==='menu'){
    for(const s of game.sheep){if(s.id===0)continue;const a=visualTime*.07*(s.id%2?1:-1)+s.id/23*Math.PI*2,r=7+s.id%4*2;s.x=Math.sin(a)*r;s.z=Math.cos(a)*r;s.angle=a+(s.id%2?Math.PI/2:-Math.PI/2);s.vx=Math.cos(a)*1.1;s.vz=-Math.sin(a)*1.1}
    syncModels(dt);
  }else if(mode==='countdown'){
    const prev=Math.ceil(countdown);countdown-=dt;const now=Math.ceil(countdown);if(now!==prev&&now>0)tone(350+now*50,.1,'sine',.06);
    $('countdown').textContent=countdown>.35?Math.max(1,Math.ceil(countdown-.3)):'ВПЕРЁД!';
    if(countdown<=0){mode='playing';$('countdown').hidden=true;tone(700,.2,'sine',.07)}syncModels(dt);
  }else if(mode==='playing'){
    accumulator+=dt;const input=getInput();let first=true;while(accumulator>=1/60){game.update(1/60,{...input,dash:first&&input.dash});accumulator-=1/60;first=false;processEvents();if(game.done){mode='ending';resultDelay=1.1;break}}
    if(first&&input.dash)dashRequested=true;
    syncModels(dt);updateHud();
  }else if(mode==='ending'){
    resultDelay-=dt;for(const s of game.sheep){if(s.falling&&s.alive){s.vy-=24*dt;s.y+=s.vy*dt;s.x+=s.vx*dt;s.z+=s.vz*dt;s.fallAge+=dt;if(s.y< -16)s.alive=false}}
    syncModels(dt);if(resultDelay<=0)finish();
  }
  if(!mode.startsWith('paused')){animateParticles(dt);for(let i=0;i<clouds.length;i++)clouds[i].position.x+=dt*(.12+i*.008)}
  cameraUpdate(dt);renderer.render(scene,camera);
}
function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.fov=w<760?58:48;camera.updateProjectionMatrix()}
function setQuality(){renderer.setPixelRatio(Math.min(devicePixelRatio,settings.quality==='high'?1.7:1));renderer.shadowMap.enabled=settings.quality==='high';$('quality-setting').value=settings.quality;scene.traverse(o=>{if(o.isMesh){if(Array.isArray(o.material))o.material.forEach(m=>m.needsUpdate=true);else o.material.needsUpdate=true}});resize();storage.set('cc3-settings',settings)}
function bindUI(){
  $('play-btn').onclick=startGame;$('again-btn').onclick=startGame;$('restart-btn').onclick=startGame;
  $('home-btn').onclick=enterMenu;$('result-home-btn').onclick=enterMenu;$('pause-btn').onclick=pause;$('resume-btn').onclick=resume;
  $('help-btn').onclick=()=>showModal('help-modal');$('settings-btn').onclick=()=>showModal('settings-modal');
  $('sound-btn').onclick=()=>{settings.sound=!settings.sound;updateSound();tone(550,.12)};
  $('sound-setting').onchange=e=>{settings.sound=e.target.checked;updateSound();tone(550,.12)};
  $('shake-setting').checked=settings.shake;$('shake-setting').onchange=e=>{settings.shake=e.target.checked;storage.set('cc3-settings',settings)};
  $('quality-setting').onchange=e=>{settings.quality=e.target.value;setQuality()};
  $('fullscreen-btn').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{announce('Полноэкранный режим недоступен в этом окне')}};
  for(const b of document.querySelectorAll('.modal-close,.modal-close-action'))b.onclick=()=>closeModal();
  $('modal-backdrop').addEventListener('click',e=>{if(e.target===$('modal-backdrop')&&['settings-modal','help-modal'].includes(currentModal))closeModal()});
  for(const b of document.querySelectorAll('.map-card'))b.onclick=()=>{
    selectedMap=Number(b.dataset.map);for(const c of document.querySelectorAll('.map-card')){c.classList.toggle('selected',c===b);c.setAttribute('aria-pressed',String(c===b))}tone(440+selectedMap*90,.07);enterMenu();
  };
  window.addEventListener('keydown',e=>{
    if(e.code==='Tab'&&currentModal){const list=[...$(currentModal).querySelectorAll('button,input,select')];const first=list[0],last=list.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}return}
    if(e.code==='Escape'){e.preventDefault();if(['paused','paused-countdown'].includes(mode))resume();else if(['playing','countdown'].includes(mode))pause();else if(['settings-modal','help-modal'].includes(currentModal))closeModal();return}
    if(mode==='playing'||mode==='countdown'){
      if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.code==='Space'&&!e.repeat&&mode==='playing')dashRequested=true;
    }
  });
  window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();pause()});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause()});
  const joystick=$('joystick'),stick=$('stick');
  const moveJoy=e=>{const r=joystick.getBoundingClientRect();let x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;const d=Math.hypot(x,y),max=35;if(d>max){x=x/d*max;y=y/d*max}joy={x:x/max,z:y/max};stick.style.transform=`translate(${x}px,${y}px)`};
  joystick.addEventListener('pointerdown',e=>{joyPointer=e.pointerId;joystick.setPointerCapture(e.pointerId);moveJoy(e);e.preventDefault()});joystick.addEventListener('pointermove',e=>{if(e.pointerId===joyPointer)moveJoy(e)});
  const releaseJoy=()=>{joyPointer=null;joy={x:0,z:0};stick.style.transform=''};joystick.addEventListener('pointerup',releaseJoy);joystick.addEventListener('pointercancel',releaseJoy);
  $('touch-dash').addEventListener('pointerdown',e=>{if(mode==='playing')dashRequested=true;e.preventDefault()});
  window.addEventListener('resize',resize);
}
function init(){
  try{
    renderer=new THREE.WebGLRenderer({canvas:$('world'),antialias:true,alpha:false,powerPreference:'high-performance'});renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
    scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,.1,260);camera.position.set(35,29,38);
    const hemi=new THREE.HemisphereLight(0xfff8e4,0x7b8c68,2.6);scene.add(hemi);
    const sun=new THREE.DirectionalLight(0xfff0ce,3.3);sun.position.set(-15,35,18);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-36,right:36,top:36,bottom:-36,near:1,far:90});sun.shadow.bias=-.0005;sun.shadow.normalBias=.04;scene.add(sun);
    makeEnvironment();makeRing();bindUI();setQuality();updateSound();enterMenu();resize();
    $('play-btn').disabled=false;$('play-btn').querySelector('span').textContent='НАЧАТЬ ХАОС';animate();
  }catch(e){console.error(e);$('error-panel').hidden=false;$('error-message').textContent='Для 3D-арены нужна поддержка WebGL. Попробуй открыть игру в современном Chrome, Safari или Firefox.'}
}
init();
