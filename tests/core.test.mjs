import test from 'node:test';
import assert from 'node:assert/strict';
import {ArenaGame,MAPS,BODY_RADIUS,surfaceHeight,surfaceGradient,chasePose} from '../dist/core.mjs';
const step=(g,n,input={})=>{for(let i=0;i<n&&!g.done;i++)g.update(1/60,input)};
function quiet(map=0){const g=new ArenaGame(map,10);for(const s of g.sheep.slice(2))s.alive=false;Object.assign(g.player,{x:0,z:0,y:surfaceHeight(map,0,0),angle:Math.PI});Object.assign(g.sheep[1],{x:-g.radius*.7,z:-g.radius*.4,y:surfaceHeight(map,-g.radius*.7,-g.radius*.4)});return g}

test('pastures are larger, stay fixed, and spawn each map’s complete flock safely',()=>{
  for(let m=0;m<3;m++){const g=new ArenaGame(m,4);assert.ok(g.radius>=54);assert.equal(g.sheep.length,MAPS[m].count);for(const s of g.sheep)assert.ok(Math.hypot(s.x,s.z)+BODY_RADIUS<g.radius);g.time=200;g.update(1/60);assert.equal(g.radius,MAPS[m].radius)}
});
test('camera stays behind the sheep and looks ahead through every turn',()=>{
  for(const angle of[0,Math.PI/2,Math.PI,-Math.PI/2,12]){const p={x:5,y:3,z:-8,vx:8,vz:2,angle},c=chasePose(p),fx=Math.sin(angle),fz=Math.cos(angle);assert.ok((c.x-p.x)*fx+(c.z-p.z)*fz< -8);assert.ok((c.lookX-p.x)*fx+(c.lookZ-p.z)*fz>3);assert.ok(c.y>p.y+3)}
});
test('steering changes facing while lateral momentum remains physical',()=>{
  const g=quiet();g.player.vz=-12;step(g,20,{steer:1});assert.ok(g.player.angle<Math.PI-.3);assert.ok(g.player.vz< -5);assert.ok(Math.abs(g.player.vx)<5);
});
test('acceleration, sprint and a jump-ram work with a cooldown',()=>{
  const a=quiet(),b=quiet();step(a,100,{throttle:1});step(b,100,{throttle:1,sprint:true});assert.ok(Math.hypot(b.player.vx,b.player.vz)>Math.hypot(a.player.vx,a.player.vz));assert.equal(a.dash(a.player),true);assert.ok(a.player.vy>0);assert.equal(a.player.grounded,false);assert.equal(a.dash(a.player),false);
});
test('touching the fence explodes once and ends the match with the correct place',()=>{
  const g=new ArenaGame(0,20);g.player.x=g.radius-BODY_RADIUS+.02;g.player.z=0;g.update(1/60);assert.equal(g.result.reason,'fence');assert.equal(g.result.place,30);assert.equal(g.player.alive,false);const events=g.drainEvents().filter(e=>e.type==='explosion'&&e.id===0);assert.equal(events.length,1);assert.equal(g.explode(g.player,'fence'),false);assert.equal(g.drainEvents().length,0);const t=g.time;g.update(1/60);assert.equal(g.time,t);
});
test('an upside-down sheep explodes, while a small tilt recovers',()=>{
  const g=quiet();g.player.roll=.2;step(g,90);assert.equal(g.player.alive,true);assert.ok(Math.abs(g.player.roll)<.1);g.player.roll=Math.PI;g.update(1/60);assert.equal(g.player.reason,'flip');assert.equal(g.result.won,false);
});
test('a side-on ram causes a physical flip and credits exactly one knockout',()=>{
  const g=quiet(),p=g.player,b=g.sheep[1];Object.assign(p,{x:0,z:0,y:surfaceHeight(0,0,0),angle:Math.PI/2});Object.assign(b,{x:2,z:0,y:surfaceHeight(0,2,0),angle:0});assert.equal(g.dash(p),true);step(g,180);assert.equal(b.reason,'flip');assert.equal(g.knockouts,1);assert.equal(g.result.won,true);assert.equal(g.drainEvents().filter(e=>e.type==='explosion'&&e.id===1).length,1);
});
test('explosion shockwaves disturb nearby sheep and preserve kill attribution',()=>{
  const g=quiet(),b=g.sheep[1];Object.assign(b,{x:2,z:0,y:surfaceHeight(0,2,0)});g.player.hitBy=1;g.player.hitAt=0;g.explode(g.player,'flip');assert.ok(Math.hypot(b.vx,b.vz)>0);assert.ok(Math.abs(b.rollV)+Math.abs(b.pitchV)>0);assert.equal(b.ko,1);
});
test('visible terrain heights are continuous and slopes accelerate sheep downhill',()=>{
  let point;for(let x=-20;x<20;x+=3){const g=surfaceGradient(0,x,0);if(Math.abs(g.x)>.1){point={x,g};break}}assert.ok(point);const g=quiet();g.player.x=point.x;g.player.y=surfaceHeight(0,point.x,0);g.update(1/60);assert.ok(g.player.vx*point.g.x<0);assert.ok(Math.abs(surfaceHeight(0,point.x+.01,0)-g.player.y)<.1);
});
test('all maps simulate chaotic battles with finite positions, flips and eliminations',()=>{
  for(let map=0;map<3;map++){const g=new ArenaGame(map,18);for(let i=0;i<6000&&!g.done;i++){g.update(1/60,{throttle:.7,steer:.4,dash:i%200===0});for(const s of g.sheep)assert.ok([s.x,s.y,s.z,s.roll,s.pitch].every(Number.isFinite));g.drainEvents()}assert.ok(g.sheep.some(s=>s.eliminated));assert.ok(g.sheep.filter(s=>s.alive).length<MAPS[map].count)}
});
