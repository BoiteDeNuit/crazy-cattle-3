import * as THREE from './vendor/three.module.js';
import {ArenaGame,MAPS,randomSeed,surfaceHeight,surfaceGradient,chasePose,angleDifference,DASH_COOLDOWN} from './core.mjs';

const $=id=>document.getElementById(id);
const storage={get(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}},set(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}};
let settings=storage.get('cc3-settings',{sound:false,quality:'high',shake:true});
let records=storage.get('cc3-records',{wins:0,bestKo:0});
records.trophies??=[null,null,null];
let selectedMap=0,mode='menu',game=null,sheepModels=[],arena,decor,heroRing;
let countdown=0,resultDelay=0,cameraYaw=0,shake=0,accumulator=0,visualTime=0,currentModal=null,focusBeforeModal=null;
let joy={x:0,z:0},joyPointer=null,dashRequested=false,turnDelta=0,mouseDown=false,renderer,scene,camera;
const blastEffects=[];
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
function updateRecords(){$('best-wins').textContent=String(records.wins).padStart(2,'0');$('best-ko').textContent=String(records.bestKo).padStart(2,'0');for(const card of document.querySelectorAll('.map-card')){const i=Number(card.dataset.map),t=records.trophies[i];card.querySelector('.map-trophy').textContent=t===null?'':`♛ ${formatTime(t)}`}}
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
  for(const child of body.children)child.position.y-=1;body.position.y=1;
  root.userData={body,legs,phase:id*1.7};scene.add(root);return root;
}
function createTree(parent,x,z,seed,snow){
  const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=seed*4;parent.add(g);
  const height=2+seed*1.2;box(0x7a6f4d,g,0,height*.43,0,.30,height*.86,.3);
  for(let i=0;i<3;i++){const geo=new THREE.ConeGeometry(1.2-i*.23,1.9,6);const m=new THREE.Mesh(geo,material(snow?0x9cae9e:[0x688955,0x789757,0x8ba567][i]));m.position.y=height*.45+i*.64;m.castShadow=true;g.add(m);m.userData.ownGeometry=true;if(snow){const cap=new THREE.Mesh(new THREE.ConeGeometry(1.06-i*.21,.6,6),material(0xeef0e2));cap.position.y=m.position.y+.64;g.add(cap);cap.userData.ownGeometry=true}}
}
function createArena(mapIndex){
  disposeGroup(arena);disposeGroup(decor);const map=MAPS[mapIndex],rnd=randomSeed(map.seed),R=map.radius;
  scene.background=new THREE.Color(map.sky);scene.fog=new THREE.Fog(map.sky,130,370);
  arena=new THREE.Group();scene.add(arena);
  const sideGeo=new THREE.CylinderGeometry(R,R-4,7,128,1,true);const sides=mesh(sideGeo,map.side,arena,0,-3.5,0);sides.userData.ownGeometry=true;
  const positions=[],colors=[],indices=[],rings=76,segments=160,base=new THREE.Color(map.grass);
  for(let ring=0;ring<=rings;ring++)for(let j=0;j<=segments;j++){
    const a=j/segments*Math.PI*2,r=ring/rings*R,x=Math.sin(a)*r,z=Math.cos(a)*r;
    positions.push(x,surfaceHeight(mapIndex,x,z),z);const shade=.91+.09*Math.sin(x*.19)*Math.cos(z*.18)+rnd()*.07;colors.push(base.r*shade,base.g*shade,base.b*shade);
  }
  for(let i=0;i<rings;i++)for(let j=0;j<segments;j++){const a=i*(segments+1)+j,b=a+segments+1;indices.push(a,b,a+1,b,b+1,a+1)}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setIndex(indices);geo.computeVertexNormals();
  const ground=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));ground.receiveShadow=true;ground.userData.ownGeometry=true;ground.userData.ownMaterial=true;arena.add(ground);
  for(let i=0;i<260;i++){
    const a=rnd()*Math.PI*2,r=Math.sqrt(rnd())*(R-1.5),x=Math.sin(a)*r,z=Math.cos(a)*r,y=surfaceHeight(mapIndex,x,z);
    if(i%3===0){const f=ball(mapIndex===2?0xe9d39e:(i%2?0xf1dc8a:0xf4efdf),arena,x,y+.10,z,.075);f.castShadow=false}
    else {const f=mesh(new THREE.ConeGeometry(.095,.3,3),mapIndex===2?0xb5a26e:0x7f9a58,arena,x,y+.15,z);f.userData.ownGeometry=true;f.castShadow=false}
  }
  // The visible fence and the lethal collision boundary use the same radius.
  const fence=new THREE.Group();fence.name='fence';arena.add(fence);const count=160,step=Math.PI*2/count;
  const posts=new THREE.InstancedMesh(cubeGeo,material(0xe5dfbf),count),rails=new THREE.InstancedMesh(cubeGeo,material(0xcabf98),count*2),caps=new THREE.InstancedMesh(cubeGeo,material(0xba664a),count);
  const helper=new THREE.Object3D();
  for(let i=0;i<count;i++){
    const a=i*step;helper.position.set(Math.sin(a)*R,.95,Math.cos(a)*R);helper.rotation.set(0,a,0);helper.scale.set(.24,1.9,.24);helper.updateMatrix();posts.setMatrixAt(i,helper.matrix);
    helper.position.y=1.95;helper.scale.set(.28,.16,.28);helper.updateMatrix();caps.setMatrixAt(i,helper.matrix);
    for(let k=0;k<2;k++){const middle=a+step/2;helper.position.set(Math.sin(middle)*R,k===0?.62:1.37,Math.cos(middle)*R);helper.rotation.set(0,middle,0);helper.scale.set(R*step+.15,.16,.13);helper.updateMatrix();rails.setMatrixAt(i*2+k,helper.matrix)}
  }
  posts.castShadow=rails.castShadow=true;fence.add(posts,rails,caps);
  decor=new THREE.Group();scene.add(decor);
  for(let i=0;i<40;i++){
    const a=i/40*Math.PI*2,r=R+5+rnd()*7,x=Math.sin(a)*r,z=Math.cos(a)*r;
    if(mapIndex<2&&i%4!==0)createTree(decor,x,z,rnd(),mapIndex===1);
    else for(let j=0;j<3;j++)ball(mapIndex===2?0xb19a6c:0x9ba28a,decor,x+j*.8,.4+j*.1,z+rnd(),.6+rnd(),.6,.9);
  }
  if(mapIndex===2){for(let i=0;i<4;i++){const pyramid=new THREE.Mesh(new THREE.ConeGeometry(7+i*2,9+i*2,4),material(0xc7a86b));pyramid.position.set(-R-12-i*13,4.5+i,-R*.6+i*23);pyramid.rotation.y=Math.PI/4;pyramid.castShadow=true;pyramid.userData.ownGeometry=true;decor.add(pyramid)}}
  else{
    const barn=new THREE.Group();barn.position.set(-R*.73,0,-R*.84);barn.rotation.y=.35;decor.add(barn);box(0xb77757,barn,0,1.8,0,5,3.6,4);
    const roof=new THREE.Mesh(new THREE.CylinderGeometry(3.5,3.5,4.8,3),material(0x66765a));roof.rotation.z=Math.PI/2;roof.rotation.y=Math.PI/2;roof.position.y=4.2;roof.userData.ownGeometry=true;roof.castShadow=true;barn.add(roof);
    box(0xf2e5c5,barn,0,1.5,2.02,2.2,3,.07);box(0x6e765a,barn,0,1.4,2.08,1.9,2.7,.07);
    for(const k of[-1,1]){const cross=box(0xf2e5c5,barn,0,1.4,2.14,.11,3,.07);cross.rotation.z=k*.55}
  }
}
function makeEnvironment(){
  const rnd=randomSeed(78);for(let i=0;i<10;i++){
    const g=new THREE.Group();const angle=i/10*Math.PI*2;g.position.set(Math.sin(angle)*(160+rnd()*35),-14,Math.cos(angle)*(160+rnd()*35));ball(0xadc0a0,g,0,0,0,20+rnd()*15,14+rnd()*12,18+rnd()*20);scene.add(g)
  }
  for(let i=0;i<13;i++){
    const c=new THREE.Group();const a=rnd()*Math.PI*2;c.position.set(Math.sin(a)*(100+rnd()*70),25+rnd()*15,Math.cos(a)*(100+rnd()*70));
    for(let j=0;j<4;j++){const m=ball(0xf6f5e6,c,j*1.8,Math.sin(j)*.5,0,2.5,1.1,1.5);m.castShadow=false;m.receiveShadow=false}scene.add(c);clouds.push(c)
  }
  const plane=mesh(new THREE.PlaneGeometry(600,600),0xb7c9a8,scene,0,-15,0);plane.rotation.x=-Math.PI/2;plane.castShadow=false;plane.receiveShadow=false;
}
function clearBlasts(){for(const e of blastEffects){scene.remove(e.group);e.group.traverse(n=>{if(n.isMesh){n.geometry.dispose();n.material.dispose()}})}blastEffects.length=0}
function rebuildSheep(){clearBlasts();for(const m of sheepModels)disposeGroup(m);sheepModels=game.sheep.map(s=>createSheep(s.id));for(const p of particles){scene.remove(p.mesh);p.mesh.geometry.dispose()}particles.length=0}
function makeRing(){heroRing=new THREE.Mesh(new THREE.TorusGeometry(1.23,.06,5,48),material(0xd4f584));heroRing.rotation.x=-Math.PI/2;heroRing.position.y=.04;scene.add(heroRing)}
function puff(x,z,color,count=8,power=1){
  const ground=surfaceHeight(selectedMap,x,z);
  if(particles.length>180)return;
  for(let i=0;i<count;i++){const geo=new THREE.IcosahedronGeometry(.09+Math.random()*.09,0),m=new THREE.Mesh(geo,material(color));m.position.set(x,ground+.4+Math.random()*.5,z);scene.add(m);const a=Math.random()*Math.PI*2,v=(1+Math.random()*3)*power;particles.push({mesh:m,vx:Math.cos(a)*v,vz:Math.sin(a)*v,vy:2+Math.random()*3,life:.5+Math.random()*.4,max:.9})}
}
function explosionFx(e){
  const group=new THREE.Group();group.position.set(e.x,e.y,e.z);scene.add(group);
  for(let i=0;i<3;i++){const m=new THREE.Mesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshBasicMaterial({color:[0xffef9a,0xffae42,0xe77636][i],transparent:true,opacity:1}));m.position.set((i-1)*.38,i*.15,0);group.add(m)}
  const ring=new THREE.Mesh(new THREE.TorusGeometry(1,.08,6,48),new THREE.MeshBasicMaterial({color:0xffe5a3,transparent:true,opacity:.9}));ring.rotation.x=-Math.PI/2;ring.position.y=-.7;group.add(ring);
  blastEffects.push({group,ring,age:0});puff(e.x,e.z,0xede9d6,18,2.6);puff(e.x,e.z,0x685d48,8,2);
  if(settings.sound){tone(115,.4,'triangle',.2,25);try{const ctx=audioContext,buffer=ctx.createBuffer(1,ctx.sampleRate*.28,ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);const noise=ctx.createBufferSource(),gain=ctx.createGain();noise.buffer=buffer;gain.gain.value=.16;noise.connect(gain);gain.connect(ctx.destination);noise.start()}catch{}}
  if(e.id===0||Math.hypot(e.x-game.player.x,e.z-game.player.z)<14)shake=.85;
}
function animateParticles(dt){
  for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;if(p.life<=0){scene.remove(p.mesh);p.mesh.geometry.dispose();particles.splice(i,1);continue}p.mesh.position.x+=p.vx*dt;p.mesh.position.z+=p.vz*dt;p.mesh.position.y+=p.vy*dt;p.vy-=9*dt;p.mesh.rotation.x+=dt*5;p.mesh.scale.setScalar(Math.min(1,p.life*3))}
  for(let i=blastEffects.length-1;i>=0;i--){const e=blastEffects[i];e.age+=dt;const t=e.age;
    for(let j=0;j<3;j++){const fire=e.group.children[j];fire.scale.setScalar((.5+t*6)*(1+j*.15));fire.material.opacity=Math.max(0,1-t*2.4);fire.position.y=t*(2+j)}
    e.ring.scale.setScalar(1+t*13);e.ring.material.opacity=Math.max(0,1-t*1.7);
    if(t>.8){scene.remove(e.group);e.group.traverse(n=>{if(n.isMesh){n.geometry.dispose();n.material.dispose()}});blastEffects.splice(i,1)}
  }
}
function syncModels(dt){
  for(let i=0;i<sheepModels.length;i++){
    const s=game.sheep[i],m=sheepModels[i];m.visible=s.alive;if(!s.alive)continue;m.position.set(s.x,s.y,s.z);m.rotation.y=s.angle;
    const speed=Math.hypot(s.vx,s.vz),body=m.userData.body,g=surfaceGradient(selectedMap,s.x,s.z);
    const forward=g.x*Math.sin(s.angle)+g.z*Math.cos(s.angle),right=g.x*Math.cos(s.angle)-g.z*Math.sin(s.angle);
    body.position.y=1+(s.grounded?Math.abs(Math.sin(visualTime*(speed>1?12:2)+i))*Math.min(.12,speed*.012):0);
    body.rotation.x=s.pitch-Math.atan(forward);body.rotation.z=s.roll+Math.atan(right);
    for(let j=0;j<4;j++)m.userData.legs[j].rotation.x=Math.sin(visualTime*13+(j===0||j===3?0:Math.PI))*Math.min(.6,speed*.04);
    if(s.dashTime>0&&Math.random()<dt*16)puff(s.x,s.z,0xe9edcd,2,.4);
  }
  const p=game.player;heroRing.visible=p.alive;heroRing.position.set(p.x,surfaceHeight(selectedMap,p.x,p.z)+.06,p.z);heroRing.scale.setScalar((mode==='menu'?3.1:1)*(1+Math.sin(visualTime*3)*.04));
}
function getInput(){
  let steer=joy.x,throttle=-joy.z;
  if(keys.has('KeyW')||keys.has('ArrowUp'))throttle+=1;if(keys.has('KeyS')||keys.has('ArrowDown'))throttle-=.65;
  if(keys.has('KeyA')||keys.has('ArrowLeft'))steer-=1;if(keys.has('KeyD')||keys.has('ArrowRight'))steer+=1;
  const dash=dashRequested,turn=turnDelta;dashRequested=false;turnDelta=0;
  return{throttle,steer,dash,turnDelta:turn,sprint:keys.has('ShiftLeft')||keys.has('ShiftRight')||Math.hypot(joy.x,joy.z)>.9,balance:(keys.has('KeyQ')?1:0)-(keys.has('KeyE')?1:0)};
}
function announce(text,isPlayer=false){
  const a=document.createElement('div');a.className='announcement'+(isPlayer?' player-ko':'');a.textContent=text;$('announcements').append(a);
  while($('announcements').childElementCount>3)$('announcements').firstChild.remove();setTimeout(()=>a.remove(),3400);
}
function processEvents(){
  for(const e of game.drainEvents()){
    if(e.type==='dash'&&e.id===0)tone(250,.18,'sawtooth',.035,70);
    if(e.type==='hit'){puff(e.x,e.z,e.power>9?0xeac777:0xf2efd7,Math.min(12,Math.round(e.power)),.7);if(e.player){shake=Math.min(.5,e.power*.025);tone(95+Math.random()*50,.09,'triangle',.12,35)}}
    if(e.type==='explosion'){
      explosionFx(e);const cause=e.reason==='fence'?'врезалась в забор':'перевернулась';
      if(e.killer===0){announce(`↗ НОКАУТ! № ${String(e.id+1).padStart(2,'0')} ${cause}`,true);tone(520,.15,'sine',.08,780)}
      else if(e.id!==0)announce(`№ ${String(e.id+1).padStart(2,'0')} ${cause} — БУМ!`);
    }
  }
}
function formatTime(t){return`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`}
function updateHud(){
  const p=game.player,alive=game.sheep.filter(s=>s.alive).length,speed=Math.hypot(p.vx,p.vz),tilt=Math.max(Math.abs(p.roll),Math.abs(p.pitch));
  $('alive').textContent=alive;$('timer').textContent=formatTime(game.time);$('knockouts').textContent=game.knockouts;
  const ready=p.cooldown<=0;$('dash-fill').style.width=(1-p.cooldown/DASH_COOLDOWN)*100+'%';$('dash-status').textContent=ready?'ПРЫЖОК + ТАРАН':`ПЕРЕЗАРЯДКА ${p.cooldown.toFixed(1)} С`;
  $('speed-value').textContent=Math.round(speed*3.6);$('balance-fill').style.width=Math.min(100,tilt/1.72*100)+'%';$('balance-fill').style.background=tilt>.8?'#e98b4c':'#c9ee74';
  $('touch-dash').style.opacity=ready?'1':'.45';const edgeDistance=game.radius-Math.hypot(p.x,p.z);$('warning').hidden=tilt<.7&&edgeDistance>9;$('warning').textContent=tilt>.7?'ТЕРЯЕШЬ РАВНОВЕСИЕ · Q / E':'ЗАБОР = ВЗРЫВ';
  const ctx=$('minimap').getContext('2d'),scale=56/game.radius;ctx.clearRect(0,0,140,140);ctx.fillStyle=selectedMap===2?'#d9c38b':'#adc58e';ctx.beginPath();ctx.arc(70,70,56,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#ae714e';ctx.lineWidth=3;ctx.stroke();
  for(const s of game.sheep){if(!s.alive)continue;ctx.beginPath();ctx.arc(70+s.x*scale,70+s.z*scale,s.id===0?4:2.3,0,Math.PI*2);ctx.fillStyle=s.id===0?'#f9f9dc':'#4a6144';ctx.fill();if(s.id===0){ctx.strokeStyle='#344d2e';ctx.lineWidth=2;ctx.stroke();ctx.beginPath();ctx.moveTo(70+s.x*scale,70+s.z*scale);ctx.lineTo(70+s.x*scale+Math.sin(s.angle)*9,70+s.z*scale+Math.cos(s.angle)*9);ctx.stroke()}}
}
function startGame(){
  closeModal();mode='countdown';game=new ArenaGame(selectedMap);rebuildSheep();createArena(selectedMap);cameraYaw=Math.PI;turnDelta=0;countdown=3.2;accumulator=0;resultDelay=0;keys.clear();joy={x:0,z:0};dashRequested=false;
  $('menu').hidden=true;$('hud').hidden=false;$('countdown').hidden=false;$('countdown').textContent='3';$('announcements').replaceChildren();$('arena-name').textContent=MAPS[selectedMap].name.toUpperCase();document.body.classList.add('in-game');tone(350,.12,'sine',.07);updateHud();
}
function enterMenu(){
  closeModal();mode='menu';keys.clear();joy={x:0,z:0};$('hud').hidden=true;$('menu').hidden=false;document.body.classList.remove('in-game');
  game=new ArenaGame(selectedMap,MAPS[selectedMap].seed);createArena(selectedMap);rebuildSheep();
  game.player.x=27;game.player.z=24;game.player.y=surfaceHeight(selectedMap,27,24);game.player.angle=.65;sheepModels[0].scale.setScalar(3.1);$('sheep-count').textContent=MAPS[selectedMap].count+' ОВЕЦ. ОДИН ПОБЕДИТЕЛЬ.';updateRecords();
}
function showModal(id){
  if(document.pointerLockElement)document.exitPointerLock();
  focusBeforeModal=document.activeElement;keys.clear();joy={x:0,z:0};dashRequested=false;currentModal=id;
  for(const m of document.querySelectorAll('.modal'))m.hidden=m.id!==id;$('modal-backdrop').hidden=false;
  requestAnimationFrame(()=>$(id).querySelector('button,input,select')?.focus());
}
function closeModal(){const old=currentModal;currentModal=null;$('modal-backdrop').hidden=true;for(const m of document.querySelectorAll('.modal'))m.hidden=true;if(focusBeforeModal?.isConnected)focusBeforeModal.focus();return old}
function pause(){if(mode==='playing'||mode==='countdown'){mode=mode==='countdown'?'paused-countdown':'paused';showModal('pause-modal')}}
function resume(){if(mode==='paused'||mode==='paused-countdown'){mode=mode==='paused-countdown'?'countdown':'playing';closeModal();keys.clear();accumulator=0}}
function finish(){
  mode='result';const r=game.result;if(r.won){records.wins++;records.trophies[selectedMap]=Math.min(records.trophies[selectedMap]??Infinity,r.time);tone(523,.2,'sine',.1);setTimeout(()=>tone(659,.2,'sine',.1),150);setTimeout(()=>tone(784,.4,'sine',.1),300)}else tone(220,.4,'triangle',.08,75);
  records.bestKo=Math.max(records.bestKo,r.ko);storage.set('cc3-records',records);updateRecords();
  $('result-title').textContent=r.won?'БЕ-Е-ЕЗУМНО!':'БЕ-Е-Е… БУМ!';$('result-kicker').textContent=r.won?'КОРОЛЬ ПАСТБИЩА':'НЕ ПОСЛЕДНИЙ ТАРАН';$('result-copy').textContent=r.won?'Трофей пастбища твой. Следующая остановка — новое стадо.':(r.reason==='fence'?'Столкновение с забором. Осторожнее у границы!':'Овца перевернулась. Заходи на таран головой, береги бока.');$('result-icon').textContent=r.won?'♛':'↗';$('result-place').textContent='#'+r.place;$('result-ko').textContent=r.ko;$('result-time').textContent=formatTime(r.time);$('next-map-btn').hidden=!r.won||selectedMap===2;showModal('result-modal');
}
function cameraUpdate(dt){
  let desired,look;
  if(mode==='menu'){
    const scale=MAPS[selectedMap].radius/23;desired=new THREE.Vector3((35+Math.sin(visualTime*.055)*2)*scale,27*scale,38*scale);look=new THREE.Vector3(-7*scale,0,scale);sheepModels[0].rotation.y=.65+Math.sin(visualTime*.5)*.12;
  }else{
    const p=game.player;cameraYaw+=angleDifference(p.angle,cameraYaw)*(1-Math.exp(-dt*9));const pose=chasePose({...p,angle:cameraYaw});
    const r=Math.hypot(pose.x,pose.z),limit=game.radius-.6;if(r>limit){pose.x*=limit/r;pose.z*=limit/r}
    pose.y=Math.max(pose.y,surfaceHeight(selectedMap,pose.x,pose.z)+2.3);desired=new THREE.Vector3(pose.x,pose.y,pose.z);look=new THREE.Vector3(pose.lookX,pose.lookY,pose.lookZ);
  }
  const factor=1-Math.exp(-dt*(mode==='menu'?4:10));camera.position.lerp(desired,factor);camera.userData.look??=look.clone();camera.userData.look.lerp(look,factor);
  if(settings.shake&&shake>0){camera.position.x+=(Math.random()-.5)*shake;camera.position.y+=(Math.random()-.5)*shake;shake=Math.max(0,shake-dt*2)}camera.lookAt(camera.userData.look);
  const fov=mode==='menu'?(innerWidth<760?58:48):67+Math.min(5,Math.hypot(game.player.vx,game.player.vz)*.2);if(Math.abs(camera.fov-fov)>.02){camera.fov+=(fov-camera.fov)*(1-Math.exp(-dt*4));camera.updateProjectionMatrix()}
}
function animate(){
  requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05);visualTime+=dt;
  if(mode==='menu'){
    for(const s of game.sheep){if(s.id===0)continue;const a=visualTime*.035*(s.id%2?1:-1)+s.id/game.sheep.length*Math.PI*2,r=19+s.id%4*4;s.x=Math.sin(a)*r;s.z=Math.cos(a)*r;s.y=surfaceHeight(selectedMap,s.x,s.z);s.angle=a+(s.id%2?Math.PI/2:-Math.PI/2);s.vx=Math.cos(a)*1.1;s.vz=-Math.sin(a)*1.1}
    syncModels(dt);
  }else if(mode==='countdown'){
    const prev=Math.ceil(countdown);countdown-=dt;const now=Math.ceil(countdown);if(now!==prev&&now>0)tone(350+now*50,.1,'sine',.06);
    $('countdown').textContent=countdown>.35?Math.max(1,Math.ceil(countdown-.3)):'ВПЕРЁД!';
    if(countdown<=0){mode='playing';$('countdown').hidden=true;tone(700,.2,'sine',.07)}syncModels(dt);
  }else if(mode==='playing'){
    accumulator+=dt;const input=getInput();let first=true;while(accumulator>=1/60){game.update(1/60,{...input,dash:first&&input.dash,turnDelta:first?input.turnDelta:0});accumulator-=1/60;first=false;processEvents();if(game.done){mode='ending';resultDelay=1.1;break}}
    if(first){if(input.dash)dashRequested=true;turnDelta+=input.turnDelta}
    syncModels(dt);updateHud();
  }else if(mode==='ending'){resultDelay-=dt;syncModels(dt);if(resultDelay<=0)finish();}
  if(!mode.startsWith('paused')){animateParticles(dt);for(let i=0;i<clouds.length;i++)clouds[i].position.x+=dt*(.12+i*.008)}
  cameraUpdate(dt);renderer.render(scene,camera);
}
function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.fov=mode==='menu'?(w<760?58:48):67;camera.updateProjectionMatrix()}
function setQuality(){renderer.setPixelRatio(Math.min(devicePixelRatio,settings.quality==='high'?1.7:1));renderer.shadowMap.enabled=settings.quality==='high';$('quality-setting').value=settings.quality;scene.traverse(o=>{if(o.isMesh){if(Array.isArray(o.material))o.material.forEach(m=>m.needsUpdate=true);else o.material.needsUpdate=true}});resize();storage.set('cc3-settings',settings)}
function bindUI(){
  $('play-btn').onclick=startGame;$('again-btn').onclick=startGame;$('restart-btn').onclick=startGame;
  $('next-map-btn').onclick=()=>{selectedMap=Math.min(2,selectedMap+1);for(const c of document.querySelectorAll('.map-card')){c.classList.toggle('selected',Number(c.dataset.map)===selectedMap);c.setAttribute('aria-pressed',String(Number(c.dataset.map)===selectedMap))}startGame()};
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
    if(e.code==='Escape'||e.code==='KeyP'){e.preventDefault();if(['paused','paused-countdown'].includes(mode))resume();else if(['playing','countdown'].includes(mode))pause();else if(['settings-modal','help-modal'].includes(currentModal))closeModal();return}
    if((mode==='result'||mode==='ending')&&['KeyR','Enter','Space'].includes(e.code)&&!e.repeat){e.preventDefault();startGame();return}
    if(mode==='playing'||mode==='countdown'){
      if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.code==='Space'&&!e.repeat&&mode==='playing')dashRequested=true;if(e.code==='KeyB'&&!e.repeat){tone(360,.17,'sawtooth',.04,290);setTimeout(()=>tone(320,.22,'sawtooth',.04,280),110)}
    }
  });
  window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();pause()});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause()});
  const joystick=$('joystick'),stick=$('stick');
  const moveJoy=e=>{const r=joystick.getBoundingClientRect();let x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;const d=Math.hypot(x,y),max=35;if(d>max){x=x/d*max;y=y/d*max}joy={x:x/max,z:y/max};stick.style.transform=`translate(${x}px,${y}px)`};
  joystick.addEventListener('pointerdown',e=>{joyPointer=e.pointerId;joystick.setPointerCapture(e.pointerId);moveJoy(e);e.preventDefault()});joystick.addEventListener('pointermove',e=>{if(e.pointerId===joyPointer)moveJoy(e)});
  const releaseJoy=()=>{joyPointer=null;joy={x:0,z:0};stick.style.transform=''};joystick.addEventListener('pointerup',releaseJoy);joystick.addEventListener('pointercancel',releaseJoy);
  $('touch-dash').addEventListener('pointerdown',e=>{if(mode==='playing')dashRequested=true;e.preventDefault()});
  const world=$('world');world.addEventListener('pointerdown',e=>{if(mode==='playing'&&e.pointerType==='mouse'){mouseDown=true;world.setPointerCapture(e.pointerId)}});world.addEventListener('pointermove',e=>{if(mode==='playing'&&mouseDown&&e.pointerType==='mouse')turnDelta-=e.movementX*.004});world.addEventListener('pointerup',()=>mouseDown=false);world.addEventListener('pointercancel',()=>mouseDown=false);
  window.addEventListener('resize',resize);
}
function init(){
  try{
    renderer=new THREE.WebGLRenderer({canvas:$('world'),antialias:true,alpha:false,powerPreference:'high-performance'});renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
    scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,.1,600);camera.position.set(35,29,38);
    const hemi=new THREE.HemisphereLight(0xfff8e4,0x7b8c68,2.6);scene.add(hemi);
    const sun=new THREE.DirectionalLight(0xfff0ce,3.3);sun.position.set(-40,90,36);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-95,right:95,top:95,bottom:-95,near:1,far:210});sun.shadow.bias=-.0005;sun.shadow.normalBias=.04;scene.add(sun);
    makeEnvironment();makeRing();bindUI();setQuality();updateSound();enterMenu();resize();
    $('play-btn').disabled=false;$('play-btn').querySelector('span').textContent='НАЧАТЬ ХАОС';animate();
  }catch(e){console.error(e);$('error-panel').hidden=false;$('error-message').textContent='Для 3D-арены нужна поддержка WebGL. Попробуй открыть игру в современном Chrome, Safari или Firefox.'}
}
init();
