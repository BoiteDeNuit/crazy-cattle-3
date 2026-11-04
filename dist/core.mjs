export const MAPS = [
  {name:'Ирландия', sky:0xdce9d7, grass:0x9abf67, side:0x8a7954, trim:0xb5ce84, friction:2.5, acceleration:18, speed:9.5, seed:13},
  {name:'Исландия', sky:0xdac6b5, grass:0x827e68, side:0x554d49, trim:0xa19a7d, friction:2.2, acceleration:20, speed:10, seed:54},
  {name:'Новая Зеландия', sky:0xdae8ec, grass:0xe4e9df, side:0x91a3a4, trim:0xf3f4e9, friction:1.2, acceleration:14, speed:10.5, seed:92}
];
export function randomSeed(seed){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296}}
export class ArenaGame {
  constructor(map=0,seed=Date.now()) {this.reset(map,seed)}
  reset(map=0,seed=Date.now()) {
    this.map=MAPS[map];this.mapIndex=map;this.random=randomSeed(seed);this.time=0;this.radius=23;this.knockouts=0;this.done=false;this.result=null;this.events=[];
    this.sheep=Array.from({length:24},(_,i)=>{
      const angle=i/24*Math.PI*2;const r=i===0?8:11+(i%3)*3;
      return {id:i,x:i===0?0:Math.sin(angle)*r,z:i===0?9:Math.cos(angle)*r,vx:0,vz:0,y:0,vy:0,angle:i===0?Math.PI:angle+Math.PI,alive:true,falling:false,fallAge:0,cooldown:0,dashTime:0,stun:0,hitBy:null,hitAt:-99,aiTimer:this.random()*.5,target:-1,noise:this.random()*100,ko:0};
    });this.player=this.sheep[0];return this;
  }
  dash(s,dx,dz){
    if(!s.alive||s.falling||s.cooldown>0||s.stun>.2)return false;
    const d=Math.hypot(dx,dz);if(d>.1){dx/=d;dz/=d}else{dx=Math.sin(s.angle);dz=Math.cos(s.angle)}
    s.vx=dx*21;s.vz=dz*21;s.angle=Math.atan2(dx,dz);s.cooldown=3;s.dashTime=.38;
    this.events.push({type:'dash',id:s.id,x:s.x,z:s.z});return true;
  }
  update(dt,input={x:0,z:0,dash:false}) {
    if(this.done)return;dt=Math.min(dt,.035);this.time+=dt;
    this.radius=Math.max(7,23-Math.max(0,this.time-25)*.105);
    const living=this.sheep.filter(s=>s.alive&&!s.falling);
    for(const s of this.sheep){
      if(!s.alive)continue;
      s.cooldown=Math.max(0,s.cooldown-dt);s.dashTime=Math.max(0,s.dashTime-dt);s.stun=Math.max(0,s.stun-dt);
      if(s.falling){s.fallAge+=dt;s.vy-=24*dt;s.y+=s.vy*dt;s.x+=s.vx*dt;s.z+=s.vz*dt;if(s.y< -16){s.alive=false;this.events.push({type:'gone',id:s.id})}continue}
      let dx=0,dz=0;
      if(s.id===0){dx=input.x||0;dz=input.z||0;if(input.dash)this.dash(s,dx,dz)}
      else {
        s.aiTimer-=dt;
        if(s.aiTimer<=0){s.aiTimer=.4+this.random()*.6;let closest=null,dist=Infinity;
          for(const t of living){if(t===s)continue;const d=(t.x-s.x)**2+(t.z-s.z)**2;const bias=t.id===0?1.35:1;if(d*bias<dist){dist=d*bias;closest=t}}
          s.target=closest?.id??-1;
        }
        const target=this.sheep[s.target];
        if(target?.alive&&!target.falling){const d=Math.hypot(target.x-s.x,target.z-s.z)||1;dx=(target.x-s.x)/d;dz=(target.z-s.z)/d;
          dx+=Math.sin(this.time*1.4+s.noise)*.22;dz+=Math.cos(this.time+s.noise)*.22;
          if(d<6.5&&d>2&&s.cooldown===0&&this.random()<dt*.75&&this.time>2)this.dash(s,dx,dz);
        }
        const edge=Math.hypot(s.x,s.z);
        if(edge>this.radius-4){const force=Math.min(2,(edge-(this.radius-4))*.6);dx=dx*.4-s.x/edge*force;dz=dz*.4-s.z/edge*force}
      }
      const length=Math.hypot(dx,dz);if(length>1){dx/=length;dz/=length}
      if(s.dashTime<=0&&s.stun<=0){s.vx+=dx*this.map.acceleration*dt;s.vz+=dz*this.map.acceleration*dt}
      const drag=Math.exp(-(s.dashTime>0?.65:this.map.friction)*dt);s.vx*=drag;s.vz*=drag;
      const speed=Math.hypot(s.vx,s.vz),max=s.dashTime>0?23:this.map.speed;
      if(speed>max){s.vx*=max/speed;s.vz*=max/speed}
      if(speed>.25){let diff=Math.atan2(s.vx,s.vz)-s.angle;diff=Math.atan2(Math.sin(diff),Math.cos(diff));s.angle+=diff*Math.min(1,dt*12)}
      s.x+=s.vx*dt;s.z+=s.vz*dt;
    }
    for(let i=0;i<this.sheep.length;i++)for(let j=i+1;j<this.sheep.length;j++){
      const a=this.sheep[i],b=this.sheep[j];if(!a.alive||!b.alive||a.falling||b.falling)continue;
      let dx=b.x-a.x,dz=b.z-a.z;let dist=Math.hypot(dx,dz);const diameter=1.8;if(dist>=diameter)continue;
      if(dist<.0001){dx=1;dz=0;dist=1}const nx=dx/dist,nz=dz/dist;const overlap=(diameter-dist)*.51;
      a.x-=nx*overlap;a.z-=nz*overlap;b.x+=nx*overlap;b.z+=nz*overlap;
      const approach=(a.vx-b.vx)*nx+(a.vz-b.vz)*nz;
      if(approach>0){const impulse=approach*.9+Math.min(3,approach*.3);const aDash=a.dashTime>0,bDash=b.dashTime>0;
        const aFactor=aDash&&!bDash?.22:1,bFactor=bDash&&!aDash?.22:1;
        a.vx-=nx*impulse*aFactor;a.vz-=nz*impulse*aFactor;b.vx+=nx*impulse*bFactor;b.vz+=nz*impulse*bFactor;
        if(approach>2){const hitter=(aDash&&!bDash)?a:((bDash&&!aDash)?b:((Math.hypot(a.vx,a.vz)>Math.hypot(b.vx,b.vz))?b:a));const victim=hitter===a?b:a;
          victim.hitBy=hitter.id;victim.hitAt=this.time;victim.stun=.25;
          this.events.push({type:'hit',x:(a.x+b.x)/2,z:(a.z+b.z)/2,power:approach,player:a.id===0||b.id===0});
        }
      }
    }
    for(const s of this.sheep){if(s.alive&&!s.falling&&Math.hypot(s.x,s.z)>this.radius+.1){
      s.falling=true;s.vy=3;const killer=this.time-s.hitAt<5?s.hitBy:null;
      if(killer!==null){this.sheep[killer].ko++;if(killer===0)this.knockouts++}
      this.events.push({type:'fall',id:s.id,killer,x:s.x,z:s.z});
    }}
    const remaining=this.sheep.filter(s=>s.alive&&!s.falling).length;
    if(this.player.falling){this.done=true;this.result={won:false,place:remaining+1,ko:this.knockouts,time:this.time}}
    else if(remaining===1){this.done=true;this.result={won:true,place:1,ko:this.knockouts,time:this.time}}
  }
  drainEvents(){const e=this.events;this.events=[];return e}
}
