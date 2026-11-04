import test from 'node:test';
import assert from 'node:assert/strict';
import {ArenaGame} from '../dist/core.mjs';

test('movement and a dash propel the player in the requested direction, with cooldown',()=>{
  const game=new ArenaGame(0,1);
  for(const s of game.sheep.slice(1)){s.x=16;s.z=-16}
  const start=game.player.z;
  for(let i=0;i<45;i++)game.update(1/60,{x:0,z:-1});
  assert.ok(game.player.z<start-2);
  assert.equal(game.dash(game.player,1,0),true);
  assert.ok(game.player.vx>20);
  assert.equal(game.dash(game.player,-1,0),false);
});

test('a head-on dash transfers momentum and gives the player credit for a ring-out',()=>{
  const game=new ArenaGame(0,1);
  for(const s of game.sheep.slice(2))s.alive=false;
  const p=game.player,b=game.sheep[1];
  p.x=20;p.z=0;b.x=21.9;b.z=0;
  game.dash(p,1,0);
  for(let i=0;i<90&&!game.done;i++)game.update(1/60,{x:0,z:0});
  assert.equal(b.falling,true);
  assert.equal(game.knockouts,1);
  assert.equal(game.result.won,true);
});

test('falling off ends the round with the correct placement',()=>{
  const game=new ArenaGame(0,20);game.player.x=24;
  game.update(1/60);
  assert.equal(game.done,true);
  assert.equal(game.result.won,false);
  assert.equal(game.result.place,24);
  const time=game.time;game.update(1/60);assert.equal(game.time,time);
});

test('arena shrinks after the grace period and its edge removes sheep',()=>{
  const game=new ArenaGame(0,7);
  game.time=50;game.player.x=22;game.player.z=0;
  game.update(1/60);
  assert.ok(game.radius<21);
  assert.equal(game.player.falling,true);
});

test('all three maps can simulate a complete autonomous battle without invalid physics',()=>{
  for(let map=0;map<3;map++){
    const game=new ArenaGame(map,15);
    for(let i=0;i<12000&&!game.done;i++){
      const p=game.player,r=Math.hypot(p.x,p.z),t=game.time;
      const dx=r>game.radius-4?-p.x/(r||1):Math.sin(t*.7);
      const dz=r>game.radius-4?-p.z/(r||1):Math.cos(t*.7);
      game.update(1/60,{x:dx,z:dz,dash:i%190===0});
      for(const s of game.sheep)assert.ok(Number.isFinite(s.x)&&Number.isFinite(s.z)&&Number.isFinite(s.vx));
      game.drainEvents();
    }
    assert.ok(game.time>3);
    assert.ok(game.sheep.some(s=>s.falling),'collisions should cause eliminations');
  }
});
