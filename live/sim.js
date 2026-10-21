(function(root){
'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const mapPoint=c=>({x:96+(c.column-2)*31,y:350+(c.row-1)*40});
class GameSim{
  constructor(rules){this.rules=rules;this.reset();}
  reset(){this.level=0;this.score=0;this.lives=this.rules.startingLives;this.time=0;this.mode='ready';this.events=[];this.loadLevel();}
  loadLevel(){
    const cfg=this.rules.levels[this.level%this.rules.levels.length];
    this.remaining=this.rules.roundSeconds;this.completed=0;this.target=cfg.count;this.roundTime=0;
    const original=root.ORIGINAL_LEVELS?.levels[this.level];
    const originalPlayer=original?.characters.find(c=>c.kind==='f');
    this.player={x:270,y:720,vx:0,vy:0,facing:1,phase:0,invuln:3,energy:0,...(originalPlayer?mapPoint(originalPlayer):{})};
    const targets=original?.characters.filter(c=>'neswWS'.includes(c.kind));
    const pts=targets?targets.map(c=>({...mapPoint(c),type:c.kind})):Array.from({length:cfg.count},(_,i)=>({x:115+(i%5)*75,y:390+Math.floor(i/5)*57,type:'n'}));
    this.dancers=pts.map(({x,y,type},i)=>({x,y,homeX:x,homeY:y,id:i,kind:2+i%2,mood:({n:.85,e:.6,s:1,w:.35,S:1,W:1})[type]??1,progress:0,done:false,phase:i*1.7,exit:0,special:type==='S'||type==='W'}));
    this.guards=Array.from({length:cfg.guards},(_,i)=>{
      const originalGuard=original?.characters.find(c=>c.kind===(i?'d':'m'));
      return {x:i?105:435,y:350+i*330,...(originalGuard?mapPoint(originalGuard):{}),phase:0,facing:-1,route:i?2:0,alert:0,assistant:!!i};
    });
    this.pickups=[{x:275,y:610,kind:'vibe',active:true},{x:440,y:720,kind:'spotlight',active:true},{x:88,y:718,kind:'vip',active:true}];
    this.boost=0;this.boostKind=null;this.activeTarget=null;this.dancing=false;this.badLight=false;this.events.push({type:'round',level:this.level});
  }
  start(){this.mode='playing';}
  event(type,extra={}){this.events.push({type,...extra});}
  drainEvents(){return this.events.splice(0);}
  addScore(points){
    const previous=Math.floor(this.score/this.rules.scoreThreshold);
    this.score=Math.max(0,this.score+points);
    if(points>0&&Math.floor(this.score/this.rules.scoreThreshold)>previous){this.remaining+=this.rules.thresholdSeconds;this.event('threshold',{seconds:this.rules.thresholdSeconds});}
  }
  nearest(){let nearest=null,best=this.rules.actionRadius;for(const d of this.dancers){if(d.done)continue;const n=dist(this.player,d);if(n<best){best=n;nearest=d;}}return nearest;}
  step(dt,input={}){
    if(this.mode!=='playing')return;
    dt=clamp(dt,0,.05);this.time+=dt;this.roundTime+=dt;this.remaining=Math.max(0,this.remaining-dt);
    this.boost=Math.max(0,this.boost-dt);if(!this.boost)this.boostKind=null;
    // Club lighting replaces weather. Exact mood rates are adaptation values.
    const wasBad=this.badLight;this.badLight=this.roundTime>28&&this.roundTime%38<7;
    if(this.badLight&&!wasBad)this.event('lighting');
    const p=this.player;p.invuln=Math.max(0,p.invuln-dt);
    let mx=input.x||0,my=input.y||0;const length=Math.hypot(mx,my);if(length>1){mx/=length;my/=length;}
    const speed=this.rules.playerSpeed*(this.boostKind==='slow'?.6:1);
    p.vx=mx*speed;p.vy=my*speed;p.x=clamp(p.x+p.vx*dt,75,465);p.y=clamp(p.y+p.vy*dt,335,740);
    if(Math.abs(mx)>.05)p.facing=Math.sign(mx);if(length>.05)p.phase+=dt*speed*Math.PI/14;
    this.activeTarget=this.nearest();const dancing=input.action&&length<.28&&this.activeTarget;
    for(const d of this.dancers){
      d.phase+=dt;
      if(d.done){
        d.exit+=dt;d.mood=Math.max(0,d.mood-dt*(this.badLight?.017:.005));
        if(d.mood<.35){d.done=false;d.progress=0;d.exit=0;this.completed--;this.event('mood',{x:d.x,y:d.y});}
        continue;
      }
      d.mood=Math.max(0,d.mood-dt*(.0035+.0008*this.level)*(this.badLight?3:1));
      if(d===dancing){
        const duration=this.boostKind==='spotlight'?.48:this.rules.danceSeconds+(1-d.mood)*.9;
        d.progress+=dt/duration;p.facing=d.x>p.x?1:-1;d.mood=Math.min(1,d.mood+dt*.12);
        if(d.progress>=1){
          d.done=true;d.mood=1;d.exit=0;this.completed++;
          const points=({vibe:3,spotlight:5,vip:15})[this.boostKind]||this.rules.pointsPerDancer;
          this.addScore(points);this.event('dancer',{x:d.x,y:d.y,points});this.activeTarget=null;
        }
      }else d.progress=Math.max(0,d.progress-dt*.09);
    }
    p.energy=dancing?1:0;this.dancing=!!dancing;
    const routes=[{x:435,y:350},{x:435,y:710},{x:95,y:710},{x:95,y:350}];
    for(const g of this.guards){
      const distance=dist(g,p),detect=(dancing&&distance<135)||distance<65;
      g.alert=clamp(g.alert+(detect?dt*2:-dt*.9),0,1);
      let target=routes[g.route],velocity=this.rules.guardSpeed+this.level*4;
      if(g.alert>.45&&p.invuln<=0){target=p;velocity=this.rules.guardChaseSpeed+this.level*5;}
      if(dist(g,target)<9)g.route=(g.route+1)%routes.length;
      const dx=target.x-g.x,dy=target.y-g.y,len=Math.hypot(dx,dy);
      if(len>1){g.x+=dx/len*velocity*dt;g.y+=dy/len*velocity*dt;g.phase+=dt*velocity*Math.PI/12;if(Math.abs(dx)>2)g.facing=Math.sign(dx);}
      if(dist(g,p)<28&&p.invuln<=0){
        this.lives--;p.invuln=3;this.event('caught',{x:p.x,y:p.y});p.x=270;p.y=735;g.alert=0;
        if(this.lives<=0){this.mode='lost';this.event('end',{won:false});return;}
      }
    }
    for(const item of this.pickups){
      if(!item.active||dist(item,p)>=24)continue;
      item.active=false;this.boostKind=item.kind;this.boost=({vibe:10,spotlight:13,vip:15,slow:5})[item.kind]||5;
      this.event('pickup',{kind:item.kind,x:item.x,y:item.y});
    }
    if(this.completed===this.target){
      this.mode=this.level===this.rules.levels.length-1?'won':'cleared';
      const bonus=Math.floor(this.remaining)*this.rules.timeBonus+(this.level+1)*this.rules.levelBonus;
      this.addScore(bonus);this.event('cleared',{bonus,final:this.mode==='won'});
    }else if(this.remaining<=0){
      this.lives--;
      if(this.lives<=0){this.mode='lost';this.event('end',{won:false});}
      else{this.remaining=this.rules.roundSeconds;p.invuln=3;this.event('timeout',{lives:this.lives});}
    }
  }
  nextLevel(){this.level++;this.loadLevel();this.mode='playing';}
}
root.GameSim=GameSim;if(typeof module!=='undefined')module.exports={GameSim,clamp,dist};
})(globalThis);
