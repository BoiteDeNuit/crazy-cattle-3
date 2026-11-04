export const MAPS = [
  {name:'Ирландия',sky:0xdce9d7,grass:0x9abf67,side:0x8a7954,trim:0xb5ce84,friction:.64,acceleration:13,speed:15,radius:54,count:30,hills:3.6,seed:13},
  {name:'Швеция',sky:0xd5e1e3,grass:0x94ac84,side:0x798679,trim:0xaec19d,friction:.46,acceleration:12,speed:16,radius:60,count:40,hills:5.4,seed:54},
  {name:'Египет',sky:0xedd9b6,grass:0xd6bc7d,side:0xa08454,trim:0xe5cd91,friction:.76,acceleration:14,speed:15,radius:66,count:50,hills:4.7,seed:92}
];
export const BODY_RADIUS=.9;
export const DASH_COOLDOWN=2.4;
export function randomSeed(seed){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296}}
export function angleDifference(target,current){return Math.atan2(Math.sin(target-current),Math.cos(target-current))}
export function surfaceHeight(mapIndex,x,z){const m=MAPS[mapIndex],r=Math.hypot(x,z)/m.radius,fade=Math.max(0,1-r**6);return m.hills*fade*(.52*Math.sin(x*.085+m.seed)*Math.cos(z*.073)+.30*Math.sin(z*.13+x*.045)+.18*Math.cos(x*.16-z*.07))}
export function surfaceGradient(map,x,z){const e=.15;return{x:(surfaceHeight(map,x+e,z)-surfaceHeight(map,x-e,z))/(2*e),z:(surfaceHeight(map,x,z+e)-surfaceHeight(map,x,z-e))/(2*e)}}
export function chasePose(s){const fx=Math.sin(s.angle),fz=Math.cos(s.angle),speed=Math.hypot(s.vx,s.vz),distance=8.2+Math.min(2,speed*.065);return{x:s.x-fx*distance,y:s.y+4.5,z:s.z-fz*distance,lookX:s.x+fx*4,lookY:s.y+1.35,lookZ:s.z+fz*4}}
export class ArenaGame {
  constructor(map=0,seed=Date.now()){this.reset(map,seed)}
  reset(map=0,seed=Date.now()){
    this.map=MAPS[map];this.mapIndex=map;this.random=randomSeed(seed);this.time=0;this.radius=this.map.radius;this.knockouts=0;this.done=false;this.result=null;this.events=[];
    this.sheep=Array.from({length:this.map.count},(_,i)=>{
      const a=i/this.map.count*Math.PI*2,r=this.radius*(.38+(i%3)*.14),x=i===0?0:Math.sin(a)*r,z=i===0?this.radius*.30:Math.cos(a)*r;
      return{id:i,x,z,y:surfaceHeight(map,x,z),vx:0,vz:0,vy:0,angle:i===0?Math.PI:a+Math.PI,alive:true,eliminated:false,reason:null,roll:0,pitch:0,rollV:0,pitchV:0,grounded:true,cooldown:0,dashTime:0,stun:0,hitBy:null,hitAt:-99,aiTimer:this.random()*.5,target:-1,noise:this.random()*100,ko:0,collisionAt:-99};
    });this.player=this.sheep[0];return this;
  }
  dash(s){
    if(!s.alive||!s.grounded||s.cooldown>0||Math.abs(s.roll)+Math.abs(s.pitch)>1.4)return false;
    const fx=Math.sin(s.angle),fz=Math.cos(s.angle),v=Math.max(23,Math.hypot(s.vx,s.vz)+7);
    s.vx=fx*v;s.vz=fz*v;s.vy=4.2;s.grounded=false;s.cooldown=DASH_COOLDOWN;s.dashTime=.45;
    this.events.push({type:'dash',id:s.id,x:s.x,y:s.y,z:s.z});return true;
  }
  impact(s,dx,dz,power,lift=0){
    if(!s.alive)return;const lateral=dx*Math.cos(s.angle)-dz*Math.sin(s.angle),front=dx*Math.sin(s.angle)+dz*Math.cos(s.angle);
    s.rollV-=lateral*power*.57;s.pitchV+=front*power*.25;s.vy=Math.max(s.vy,lift);if(lift>0)s.grounded=false;s.stun=Math.max(s.stun,.14);
  }
  explode(s,reason){
    if(!s.alive)return false;s.alive=false;s.eliminated=true;s.reason=reason;
    const killer=this.time-s.hitAt<6&&s.hitBy!==s.id?s.hitBy:null;
    if(killer!==null&&this.sheep[killer]){this.sheep[killer].ko++;if(killer===0)this.knockouts++}
    this.events.push({type:'explosion',id:s.id,killer,reason,x:s.x,y:s.y+1,z:s.z});
    for(const t of this.sheep){if(!t.alive||t===s)continue;const dx=t.x-s.x,dz=t.z-s.z,d=Math.hypot(dx,dz);if(d<5.2&&d>.05){const force=(1-d/5.2)*7;t.vx+=dx/d*force;t.vz+=dz/d*force;this.impact(t,dx/d,dz/d,force*.9,force*.32);if(killer!==null){t.hitBy=killer;t.hitAt=this.time}}}
    return true;
  }
  update(dt,input={}){
    if(this.done)return;dt=Math.min(Math.max(dt,0),1/30);this.time+=dt;const living=this.sheep.filter(s=>s.alive);
    for(const s of living){
      s.cooldown=Math.max(0,s.cooldown-dt);s.dashTime=Math.max(0,s.dashTime-dt);s.stun=Math.max(0,s.stun-dt);
      let throttle=0,steer=0,sprint=false,balance=0;
      if(s.id===0){throttle=Math.max(-1,Math.min(1,input.throttle||0));steer=Math.max(-1,Math.min(1,input.steer||0));sprint=!!input.sprint;balance=input.balance||0;s.angle+=input.turnDelta||0;if(input.dash)this.dash(s)}
      else{
        s.aiTimer-=dt;
        if(s.aiTimer<=0){s.aiTimer=.35+this.random()*.6;let closest=null,best=Infinity;for(const t of living){if(t===s)continue;const d=(t.x-s.x)**2+(t.z-s.z)**2;if(d<best){best=d;closest=t}}s.target=closest?.id??-1}
        let dx=0,dz=0;const target=this.sheep[s.target];
        if(target?.alive){dx=target.x-s.x;dz=target.z-s.z;dx+=Math.sin(this.time*.7+s.noise)*2;dz+=Math.cos(this.time*.6+s.noise)*2}
        const edge=Math.hypot(s.x,s.z),danger=this.radius-10;if(edge>danger){const w=Math.min(1,(edge-danger)/5);dx=dx*(1-w)-s.x*w;dz=dz*(1-w)-s.z*w}
        const diff=angleDifference(Math.atan2(dx,dz),s.angle);steer=-Math.max(-1,Math.min(1,diff*1.6));throttle=Math.abs(diff)>1.4?.3:1;
        if(target?.alive&&Math.hypot(dx,dz)<8&&Math.abs(diff)<.25&&this.time>3&&this.random()<dt*.8)this.dash(s);sprint=this.time>15&&this.random()<.35;
      }
      const speed=Math.hypot(s.vx,s.vz),control=s.grounded?1:.35;
      s.angle-=steer*(1.5+Math.min(1,speed*.055))*dt*control;
      if(s.dashTime<=0&&s.stun<=0&&Math.abs(s.roll)<1.2&&Math.abs(s.pitch)<1.2){const acceleration=this.map.acceleration*(sprint?1.35:1)*throttle*control;s.vx+=Math.sin(s.angle)*acceleration*dt;s.vz+=Math.cos(s.angle)*acceleration*dt}
      const grad=surfaceGradient(this.mapIndex,s.x,s.z);
      if(s.grounded){s.vx-=grad.x*15*dt;s.vz-=grad.z*15*dt;const sideX=Math.cos(s.angle),sideZ=-Math.sin(s.angle),slide=s.vx*sideX+s.vz*sideZ,traction=Math.min(1,dt*(s.stun>0?.2:1.3));s.vx-=sideX*slide*traction;s.vz-=sideZ*slide*traction}
      const drag=Math.exp(-(s.grounded?this.map.friction:.12)*dt);s.vx*=drag;s.vz*=drag;
      const maxSpeed=s.dashTime>0?34:(sprint?24:20),actualSpeed=Math.hypot(s.vx,s.vz);if(actualSpeed>maxSpeed){const slow=1-Math.min(.12,dt*2);s.vx*=slow;s.vz*=slow}
      s.x+=s.vx*dt;s.z+=s.vz*dt;s.vy-=20*dt;s.y+=s.vy*dt;
      const ground=surfaceHeight(this.mapIndex,s.x,s.z);
      if(s.y<=ground||(s.grounded&&s.vy<=0&&s.y-ground<.35)){const landing=s.vy;s.y=ground;s.vy=0;s.grounded=true;if(landing< -8){s.pitchV+=landing*.08;s.rollV+=Math.sin(s.noise)*Math.abs(landing)*.05}}else s.grounded=false;
      for(const [angle,velocity]of[['roll','rollV'],['pitch','pitchV']]){const tilt=s[angle],upright=Math.abs(tilt)<1.05;s[velocity]+=(upright?-tilt*10:Math.sign(tilt)*6)*dt;s[velocity]*=Math.exp(-(s.grounded?2.2:.65)*dt);s[angle]+=s[velocity]*dt}
      if(s.id===0&&balance&&Math.abs(s.roll)<1.4)s.rollV+=balance*10*dt;
      if(Math.abs(s.roll)>1.72||Math.abs(s.pitch)>1.72||Math.cos(s.roll)*Math.cos(s.pitch)<-.13)this.explode(s,'flip');
    }
    for(let i=0;i<this.sheep.length;i++)for(let j=i+1;j<this.sheep.length;j++){
      const a=this.sheep[i],b=this.sheep[j];if(!a.alive||!b.alive||Math.abs(a.y-b.y)>1.7)continue;
      let dx=b.x-a.x,dz=b.z-a.z,dist=Math.hypot(dx,dz);if(dist>=BODY_RADIUS*2)continue;
      if(dist<.0001){dx=.0001;dz=0;dist=.0001}const nx=dx/dist,nz=dz/dist,overlap=(BODY_RADIUS*2-dist)*.51;a.x-=nx*overlap;a.z-=nz*overlap;b.x+=nx*overlap;b.z+=nz*overlap;
      const approach=(a.vx-b.vx)*nx+(a.vz-b.vz)*nz;if(approach<=0)continue;
      const av=Math.hypot(a.vx,a.vz),bv=Math.hypot(b.vx,b.vz),aAttack=Math.max(0,Math.sin(a.angle)*nx+Math.cos(a.angle)*nz)*(av+Number(a.dashTime>0)*10),bAttack=Math.max(0,-Math.sin(b.angle)*nx-Math.cos(b.angle)*nz)*(bv+Number(b.dashTime>0)*10);
      const hitter=aAttack>=bAttack?a:b,victim=hitter===a?b:a,impulse=approach*.94+Math.min(3,approach*.18),af=a.dashTime>0?.42:1,bf=b.dashTime>0?.42:1;
      a.vx-=nx*impulse*af;a.vz-=nz*impulse*af;b.vx+=nx*impulse*bf;b.vz+=nz*impulse*bf;
      if(approach>2.5){victim.hitBy=hitter.id;victim.hitAt=this.time;const sign=victim===b?1:-1;this.impact(victim,nx*sign,nz*sign,approach,Math.max(0,approach-5)*.21);this.impact(hitter,-nx*sign,-nz*sign,approach*(hitter.dashTime>0?.10:.24));
        if(this.time-a.collisionAt>.08||this.time-b.collisionAt>.08){this.events.push({type:'hit',x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:(a.z+b.z)/2,power:approach,player:a.id===0||b.id===0});a.collisionAt=b.collisionAt=this.time}
      }
    }
    for(const s of this.sheep)if(s.alive&&Math.hypot(s.x,s.z)+BODY_RADIUS>=this.radius)this.explode(s,'fence');
    const remaining=this.sheep.filter(s=>s.alive).length;
    if(!this.player.alive){this.done=true;this.result={won:false,place:remaining+1,ko:this.knockouts,time:this.time,reason:this.player.reason}}
    else if(remaining===1){this.done=true;this.result={won:true,place:1,ko:this.knockouts,time:this.time,reason:'survivor'}}
  }
  drainEvents(){const e=this.events;this.events=[];return e}
}
