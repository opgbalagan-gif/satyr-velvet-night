/* Satyr: Velvet Night. Simulation is independent of rendering and input. */
'use strict';
const $=id=>document.getElementById(id),canvas=$('scene'),ctx=canvas.getContext('2d');
const sim=new GameSim(RULES);const params=new URLSearchParams(location.search);const QA=params.has('qa');
let images={},atlas=null,clock=0,last=0,record=0,muted=false,audio=null,nextUI=0,toastTimer=0,particles=[],floaters=[],shake=0,helpReturn=null;
const music=$('soundtrack');music.volume=.5;
try{record=Number(localStorage.getItem('satyr-record-v1'))||0;}catch{}
const input={x:0,y:0,action:false},keys=new Set();let controls=null;
const pad=v=>String(Math.floor(v)).padStart(6,'0');
// Zoom only the room; HUD and the central touch control stay in screen space.
const camera={zoom:1.65,x:251,y:522,level:-1,viewport:{x:0,y:154,width:540,height:620}};
const duet={amount:0,target:null,side:1};
const reaction={remaining:0};
const comic={time:0,emitter:0,sequence:0};
// Stage and lounge performers give the club a crowd without changing mission targets.
const clubGuests=[
  {x:126,y:326},{x:217,y:320},{x:323,y:320},{x:414,y:326},
  {x:125,y:385},{x:405,y:385},{x:125,y:485},{x:405,y:485},
  {x:125,y:585},{x:405,y:585},{x:125,y:685},{x:405,y:685}
].map((p,i)=>({...p,id:i,phase:i*1.37,guest:true}));
function dancerKind(d){return 2+(d.id||0)%Math.max(2,(atlas?.actors.length||4)-2);}
function updateDuet(dt){
  if(sim.mode==='paused')return;
  const target=sim.dancing&&sim.activeTarget;
  if(target){duet.target=target;duet.side=sim.player.x<=target.x?1:-1;}
  const desired=target?1:0;duet.amount+=(desired-duet.amount)*(1-Math.exp(-15*dt));
  if(duet.amount<.001)duet.target=null;
}
function duetPose(entity){
  if(!duet.target||duet.amount<.001||entity!==sim.player&&entity!==duet.target)return {x:entity.x,y:entity.y};
  const p=sim.player,d=duet.target,a=duet.amount;
  const side=entity===p?-duet.side:duet.side;
  // Bring the two idle figures into the same comic effect area.
  const x=(p.x+d.x)/2+side*18;
  const y=(p.y+d.y)/2;
  return {x:entity.x+(x-entity.x)*a,y:entity.y+(y-entity.y)*a};
}
function updateCamera(dt,snap=false){
  const view=camera.viewport,z=camera.zoom;
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const x=clamp(sim.player.x,view.width/(2*z),540-view.width/(2*z));
  const y=clamp(sim.player.y-28,180+view.height/(2*z),830-view.height/(2*z));
  const blend=snap||camera.level!==sim.level?1:1-Math.exp(-8*dt);
  camera.x+=(x-camera.x)*blend;camera.y+=(y-camera.y)*blend;camera.level=sim.level;
}
function rr(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
function ellipse(x,y,rx,ry,color){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();}
function text(s,x,y,size=14,color='#ffe8bf',align='center'){ctx.font=`${size}px Georgia`;ctx.textAlign=align;ctx.fillStyle=color;ctx.fillText(s,x,y);}
function notify(s){$('toast').textContent=s;$('toast').classList.add('visible');toastTimer=3;}
function saveRecord(){if(sim.score>record){record=sim.score;try{localStorage.setItem('satyr-record-v1',String(record));}catch{}}$('record').textContent='РЕКОРД '+pad(record);}
function sound(type){if(muted)return;try{audio??=new(window.AudioContext||window.webkitAudioContext)();audio.resume();const at=audio.currentTime;const notes=type==='dancer'?[523,659,784]:type==='caught'?[190,130]:type==='cleared'?[523,659,784,1046]:[392,523];notes.forEach((freq,i)=>{const o=audio.createOscillator(),g=audio.createGain();o.type='triangle';o.frequency.value=freq;g.gain.setValueAtTime(0,at+i*.09);g.gain.linearRampToValueAtTime(.06,at+i*.09+.01);g.gain.exponentialRampToValueAtTime(.001,at+i*.09+.2);o.connect(g).connect(audio.destination);o.start(at+i*.09);o.stop(at+i*.09+.22);});}catch{}}
function syncMusic(){
  music.muted=muted;
  $('sound').setAttribute('aria-label',muted?'Включить звук':'Выключить звук');
  $('sound').setAttribute('aria-pressed',String(!muted));
  $('sound').querySelector('span').hidden=!muted;
  if(muted||sim.mode!=='playing'||document.hidden){music.pause();return;}
  // Call play directly from Start/Resume and the sound button for mobile browsers.
  const playing=music.play();
  playing?.catch(error=>{if(error.name!=='AbortError'&&sim.mode==='playing'&&!muted)notify('Нажми ♪, чтобы включить музыку.');});
}
function rewindMusic(){try{music.currentTime=0;}catch{}}
function setOverlay(title,copy,button,secondary=false,instructions=false){$('modal-title').innerHTML=title;$('modal-copy').textContent=copy;$('play').innerHTML=button+' <span>↗</span>';$('secondary').hidden=!secondary;$('instructions').hidden=!instructions;$('overlay').hidden=false;saveRecord();clearInput();syncMusic();}
function clearInput(){keys.clear();controls?.reset();input.x=input.y=0;input.action=false;$('action').classList.remove('active');}
function start(){if(helpReturn!==null){sim.mode=helpReturn;helpReturn=null;if(sim.mode==='ready'){setOverlay('Выходи<br>на танцпол.','Зажги настроение каждой танцовщицы и не попадись охране.','НАЧАТЬ ВЕЧЕР',false,true);return;}}else if(sim.mode==='cleared')sim.nextLevel();else if(sim.mode==='paused')sim.mode='playing';else{sim.reset();sim.start();rewindMusic();}if(sim.mode==='playing'){$('overlay').hidden=true;syncMusic();sound('start');notify(`Миссия ${sim.level+1}: зажги ${sim.target} номеров`);}updateUI();}
function pause(){if(sim.mode==='playing'){sim.mode='paused';setOverlay('Антракт.','Вечер подождёт. Вернись, когда будешь готов.','ПРОДОЛЖИТЬ',true);}else if(sim.mode==='paused')start();}
$('play').addEventListener('click',start);$('pause').addEventListener('click',pause);$('secondary').addEventListener('click',()=>{helpReturn=null;sim.reset();sim.start();rewindMusic();$('overlay').hidden=true;syncMusic();updateUI();});$('help').addEventListener('click',()=>{helpReturn=sim.mode;if(sim.mode==='playing')sim.mode='paused';setOverlay('Твой выход.','Обойди танцпол, подними настроение всем и избегай двух охранников.','ПОНЯТНО',false,true);});
$('sound').addEventListener('click',()=>{muted=!muted;syncMusic();if(!muted)sound('start');});
window.addEventListener('pagehide',()=>music.pause());
window.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyW','KeyA','KeyS','KeyD','Escape','KeyP'].includes(e.code)){e.preventDefault();if(e.code==='Escape'||e.code==='KeyP'){if(!e.repeat)pause();return;}keys.add(e.code);}});window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{clearInput();if(sim.mode==='playing')pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&sim.mode==='playing')pause();});
controls=new CentralJoystick($('joystick'),()=>sim.mode==='playing');
function updateInput(){const touch=controls.read();input.x=touch.x+(keys.has('ArrowRight')||keys.has('KeyD')?1:0)-(keys.has('ArrowLeft')||keys.has('KeyA')?1:0);input.y=touch.y+(keys.has('ArrowDown')||keys.has('KeyS')?1:0)-(keys.has('ArrowUp')||keys.has('KeyW')?1:0);input.action=keys.has('Space')||touch.action;$('action').classList.toggle('active',input.action);}
function updateUI(){$('score').textContent=pad(sim.score);const n=Math.max(0,Math.ceil(sim.remaining));$('timer').textContent=String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');$('timer').parentElement.classList.toggle('danger',n<=15);$('lives').textContent=Array.from({length:3},(_,i)=>i<sim.lives?'♥':'♡').join(' ');$('lives').setAttribute('aria-label',`${sim.lives} попытки`);$('round').textContent='МИССИЯ '+String(sim.level+1).padStart(2,'0')+' / 05';$('progress').textContent=sim.completed+' / '+sim.target;$('status').textContent=sim.dancing?'УДЕРЖИВАЙ КНОПКУ':sim.activeTarget?'УДЕРЖИВАЙ ЦЕНТР — НОМЕР':sim.boost?(({vibe:'ХАРИЗМА ×3',spotlight:'ПРОЖЕКТОР ×5',vip:'VIP-РИТМ ×15'})[sim.boostKind]+' · '+Math.ceil(sim.boost)+' С'):'ПОДОЙДИ К ТАНЦОВЩИЦЕ';}
function burst(x,y,count=12,color='#efbd79'){for(let i=0;i<count;i++){const a=i/count*Math.PI*2;particles.push({x,y,vx:Math.cos(a)*(20+Math.random()*35),vy:-30+Math.sin(a)*30,life:.7+Math.random()*.4,max:1.1,color,size:2+Math.random()*2});}}
function comicState(){
  if(!duet.target||duet.amount<.001||!images.cloud||!images.lips)return null;
  return {x:(sim.player.x+duet.target.x)/2,y:(sim.player.y+duet.target.y)/2,alpha:Math.min(1,duet.amount*1.4)};
}
function comicBurst(x,y,count=1){
  const icons=['lips','heart','lips','devil','heart'];
  for(let i=0;i<count;i++){
    const n=comic.sequence++,side=n%2?1:-1,spread=.45+(n%5)*.13;
    const life=.85+(n%3)*.12;
    particles.push({icon:icons[n%icons.length],x:x+side*(12+n%4*6),y:y-30,
      vx:side*(35+spread*30),vy:-55-(n%4)*12,life,max:life,size:17+n%3*2,spin:side*.3});
  }
}
function updateComic(dt){
  if(sim.mode!=='playing')return;
  comic.time+=dt;
  const cloud=comicState();
  if(sim.dancing&&cloud){
    comic.emitter-=dt;
    while(comic.emitter<=0){comicBurst(cloud.x,cloud.y);comic.emitter+=.11;}
  }else comic.emitter=0;
}
function comicIcon(icon,x,y,size,angle=0){
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);
  if(icon==='lips'&&images.lips)ctx.drawImage(images.lips,-size*.62,-size*.4,size*1.24,size*.8);
  else {ctx.font=`${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(icon==='devil'?'😈':'❤️',0,0);}
  ctx.restore();
}
function comicCloud(cloud,t){
  ctx.save();ctx.globalAlpha*=cloud.alpha;ctx.translate(cloud.x,cloud.y-36);
  const enter=.78+.22*cloud.alpha,pulse=1+.085*Math.sin(t*15),squash=.04*Math.sin(t*15+1.2);
  ctx.scale(.75*enter*pulse,.75*enter*(1-squash));ctx.rotate(.025*Math.sin(t*11));
  ctx.drawImage(images.cloud,-68,-48,136,96);
  comicIcon('lips',0,0,32,.09*Math.sin(t*9));
  ctx.restore();
}
function consumeEvents(){for(const e of sim.drainEvents()){if(e.type==='round'){duet.amount=0;duet.target=null;particles=[];floaters=[];comic.emitter=0;}else if(e.type==='dancer'){sound('dancer');comicBurst(e.x,e.y,9);floaters.push({x:e.x,y:e.y-110,text:'+'+e.points,life:1.2});}else if(e.type==='caught'){sound('caught');reaction.remaining=.65;shake=.35;burst(e.x,e.y-25,12,'#dc7b79');notify('Охрана! Минус одна попытка.');}else if(e.type==='pickup'){sound('pickup');burst(e.x,e.y,10,'#9bd6c5');notify(({vibe:'Харизма: +3 очка за номер, 10 секунд',spotlight:'Прожектор: +5 очков за номер, 13 секунд',vip:'VIP-ритм: +15 очков за номер, 15 секунд'})[e.kind]);}else if(e.type==='timeout'){sound('caught');notify('Время вышло: минус попытка. Снова 90 секунд.');}else if(e.type==='lighting'){notify('Свет погас: настроение падает быстрее');}else if(e.type==='mood'){notify('Танцовщица снова ждёт твоего выхода');}else if(e.type==='threshold'){notify('50 очков: +10 секунд');}else if(e.type==='cleared'){sound('cleared');burst(270,350,38);setOverlay(e.final?'Вот это<br>была ночь!':'Браво,<br>танцпол твой.',`Миссия ${sim.level+1}: ${sim.target} из ${sim.target}. Бонус за время и уровень: +${e.bonus}. Всего ${sim.score} очков.`,e.final?'ЕЩЁ ОДИН ВЕЧЕР':'СЛЕДУЮЩАЯ МИССИЯ',!e.final);}else if(e.type==='end'){sound('caught');setOverlay('Конец<br>вечера.',sim.lives<=0?`Охрана вывела тебя из клуба. Результат: ${sim.score} очков.`:`Время вышло. Номеров завершено: ${sim.completed} из ${sim.target}. Результат: ${sim.score} очков.`,'ПОПРОБОВАТЬ СНОВА');}}}
function backdrop(){ctx.fillStyle='#281923';ctx.fillRect(0,0,540,960);if(images.club){ctx.drawImage(images.club,0,180,540,650);}else{ctx.fillStyle='#895744';ctx.fillRect(0,210,540,590);for(let y=230;y<800;y+=35){ctx.strokeStyle='#654337';ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(540,y-50);ctx.stroke();}ellipse(270,300,170,50,'#472338');}const top=ctx.createLinearGradient(0,0,0,190);top.addColorStop(0,'#20111c');top.addColorStop(.82,'#2a1722');top.addColorStop(1,'#2a172200');ctx.fillStyle=top;ctx.fillRect(0,0,540,195);ctx.fillStyle='#ddac6b';ctx.fillRect(0,153,540,.6);}
function lights(t){ctx.save();ctx.globalCompositeOperation='screen';for(let i=0;i<3;i++){let x=130+i*140+Math.sin(t*.35+i)*45,y=440+Math.cos(t*.3+i)*85;const glow=ctx.createRadialGradient(x,y,5,x,y,145);glow.addColorStop(0,i===1?'#285f7f29':'#7a337c23');glow.addColorStop(1,'#00000000');ctx.fillStyle=glow;ctx.fillRect(x-145,y-145,290,290);}ctx.restore();}
function spritePart(sprite,part,angle=0,tx=0,ty=0){const p=sprite.parts[part];if(!p)return;ctx.save();ctx.translate(p.pivot[0]+tx,p.pivot[1]+ty);ctx.rotate(angle);ctx.drawImage(images.cast,p.rect[0],p.rect[1],p.rect[2],p.rect[3],p.offset[0]-p.pivot[0],p.offset[1]-p.pivot[1],p.rect[2],p.rect[3]);ctx.restore();}
function limb(sprite,upper,lower,angle,bend=0,lift=0){const p=sprite.parts[upper];if(!p)return;ctx.save();ctx.translate(p.pivot[0],p.pivot[1]+lift);ctx.rotate(angle);ctx.translate(-p.pivot[0],-p.pivot[1]);spritePart(sprite,upper);spritePart(sprite,lower,bend);ctx.restore();}
function restPose(entity){
  if(!entity.done)return 0;
  const t=Math.min(1,entity.exit/.65);
  return t*t*(3-2*t);
}
function actor(entity,kind,scale=1){
  const pose=duetPose(entity),x=pose.x,y=pose.y,s=atlas?.actors[kind];
  const rest=kind>1?restPose(entity):0;
  const size=(kind===1?65:kind===0?68:56)*scale*(1-.06*rest);
  const rawPhase=entity.guest?clock*.9+entity.phase:entity.phase||clock,frames=kind===0?14:16;
  const phase=Math.floor(rawPhase/(Math.PI*2)*frames)/frames*Math.PI*2;
  const walking=kind===1||kind===0&&Math.hypot(entity.vx,entity.vy)>5;
  const step=walking?Math.sin(phase):0,idle=kind>1?Math.sin(phase*1.8)*.35*(1-rest):0;
  ellipse(x,y+2,size*(.27+.24*rest),size*.085,'#24102566');
  if(kind===0&&entity.invuln>0&&sim.mode==='playing'&&Math.sin(clock*17)<-.3)ctx.globalAlpha*=.5;
  ctx.save();ctx.translate(x,y-(walking?Math.abs(step)*(kind===0?1.5:.85):0));
  if(kind===0&&reaction.remaining>0)ctx.rotate(-.18*reaction.remaining/.65);
  if(kind===0||kind===1)ctx.scale(entity.facing||1,1);
  if(s&&images.cast){
    const factor=size/s.rect[3];
    // The floor pose has its own bent knees, tucked arm and relaxed head.
    // Rotate around the body centre while lowering it onto the floor shadow.
    ctx.translate(0,-size/2+rest*(size/2-8));
    ctx.rotate(-Math.PI/2*rest);
    ctx.scale(factor,factor);ctx.translate(-s.rect[2]/2,-s.rect[3]/2);
    limb(s,'leftLeg','leftShin',step*.22-idle*.05+.18*rest,Math.max(0,step)*.35+.35*rest,walking?Math.min(0,step)*25:0);
    limb(s,'rightLeg','rightShin',-step*.22+idle*.05-.15*rest,Math.max(0,-step)*.35+.5*rest,walking?Math.min(0,-step)*25:0);
    const shock=kind===0?reaction.remaining*.9:0;
    limb(s,'leftArm','leftForearm',-step*.2+idle*.35+shock+1.9*rest,.9*rest);
    limb(s,'rightArm','rightForearm',step*.2-idle*.35-shock-.3*rest,.65*rest);
    spritePart(s,'body',walking?step*.022:idle*.025,0,!walking?Math.sin(clock*2+kind)*2*(1-rest):0);
    spritePart(s,'head',idle*.05+(!walking?Math.sin(clock*.8+kind)*.012:0)+.12*rest);
  }else{
    ellipse(0,-size*.5,size*.21,size*.3,['#95547a','#29232b','#c37396','#55a69d'][kind]);
    ellipse(0,-size*.86,size*.16,size*.15,'#edbe94');
  }
  ctx.restore();
  if(kind===0)text('САТИР',x,y-size-9,8,'#ffe6a3');
  if(kind===1&&entity.alert>.35)text('!',x,y-size-10,19,'#ffbc78');
  return size;
}
function mood(d){const rest=restPose(d),posed=duetPose(d);d={...d,x:posed.x,y:posed.y,selected:sim.activeTarget===d};if(d.done){ctx.strokeStyle='#b7c784';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(d.x,d.y-69+46*rest,8,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.max(0,(d.mood-.35)/.65));ctx.stroke();text('✓',d.x,d.y-65+46*rest,10,'#c6d39c');return;}const active=d.selected&&sim.mode==='playing',cloud=d.selected&&comicState();const y=d.y-(cloud?85:68);if(active){ctx.fillStyle='#ffe3a1';ctx.beginPath();ctx.moveTo(d.x-5,y-14);ctx.lineTo(d.x+5,y-14);ctx.lineTo(d.x,y-7);ctx.closePath();ctx.fill();if(!cloud){ellipse(d.x,d.y+1,22,7,'#e5bc7666');ctx.strokeStyle='#eaca8c';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(d.x,d.y+1,22,7,0,0,Math.PI*2);ctx.stroke();}}if(active||d.progress>0){rr(d.x-21,y-5,42,7,3,'#281927','#a6795666');rr(d.x-20,y-4,40*Math.max(.04,d.progress),5,2,'#f4c783');}else{const color=d.mood>.65?'#e2c383':d.mood>.3?'#cea4a2':'#d67879';ellipse(d.x,y,6.5,6.5,'#341d2ac9');ctx.strokeStyle=color;ctx.lineWidth=1.1;ctx.beginPath();ctx.arc(d.x,y+.3,3.3,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(d.x,y+1,1.8,.15,Math.PI-.15,d.mood<.3);ctx.stroke();}if(d.special)text('✦',d.x+20,y+3,12,'#f3c76d');}
function pickup(item,t){if(!item.active)return;const y=item.y-8+Math.sin(t*2+item.x)*2;ellipse(item.x,item.y+3,12,4,'#2b172944');ctx.save();ctx.translate(item.x,y);ctx.rotate(Math.sin(t+item.x)*.08);ctx.fillStyle='#553148';ctx.strokeStyle='#d5a65e';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,-14);ctx.lineTo(12,0);ctx.lineTo(0,14);ctx.lineTo(-12,0);ctx.closePath();ctx.fill();ctx.stroke();text(({vibe:'3',spotlight:'5',vip:'15'})[item.kind],0,5,14,'#f1d492');ctx.restore();}
function render(t){
  ctx.setTransform(2,0,0,2,0,0);ctx.clearRect(0,0,540,960);ctx.fillStyle='#101421';ctx.fillRect(0,0,540,960);
  if(QA)updateCamera(0,true);
  ctx.save();const view=camera.viewport;ctx.beginPath();ctx.rect(view.x,view.y,view.width,view.height);ctx.clip();
  ctx.translate(view.x+view.width/2,view.y+view.height/2);ctx.scale(camera.zoom,camera.zoom);ctx.translate(-camera.x,-camera.y);
  if(shake>0)ctx.translate(Math.sin(t*74)*shake*7,Math.cos(t*81)*shake*4);
  backdrop();lights(t);if(sim.badLight){ctx.fillStyle='#1d12383d';ctx.fillRect(0,180,540,595);}
  for(const p of sim.pickups)pickup(p,t);
  const cloud=comicState(),actors=sim.dancers.map(d=>({e:d,k:dancerKind(d),scale:1}));
  for(const guest of clubGuests)actors.push({e:guest,k:dancerKind(guest),scale:.85});
  actors.push({e:sim.player,k:0,scale:1});for(const g of sim.guards)actors.push({e:g,k:1,scale:g.assistant?.92:1});
  if(cloud)actors.push({e:{y:cloud.y+3},cloud});
  actors.sort((a,b)=>a.e.y-b.e.y);
  for(const a of actors){
    if(a.cloud){comicCloud(a.cloud,QA?t:comic.time);continue;}
    ctx.save();if(a.e.guest)ctx.globalAlpha=.72;else if(a.e.done)ctx.globalAlpha=.9;
    if(cloud&&(a.e===sim.player||a.e===duet.target))ctx.globalAlpha*=1-cloud.alpha;
    actor(a.e,a.k,a.scale);ctx.restore();
  }
  for(const d of sim.dancers)mood(d);
  for(const p of particles){
    ctx.save();const age=1-p.life/p.max;
    ctx.globalAlpha=Math.max(0,Math.min(1,(1-age)*3,age*12));
    if(p.icon)comicIcon(p.icon,p.x,p.y,p.size*(.7+.3*Math.sin(Math.min(1,age*4)*Math.PI/2)),(p.spin||0)*age);
    else{
      ctx.translate(p.x,p.y);ctx.rotate(p.life*2);ctx.fillStyle=p.color;ctx.beginPath();ctx.moveTo(0,-p.size*1.8);
      ctx.quadraticCurveTo(p.size*.3,-p.size*.2,p.size,0);ctx.quadraticCurveTo(p.size*.2,p.size*.3,0,p.size*1.8);
      ctx.quadraticCurveTo(-p.size*.3,p.size*.2,-p.size,0);ctx.quadraticCurveTo(-p.size*.2,-p.size*.3,0,-p.size*1.8);ctx.fill();
    }
    ctx.restore();
  }
  for(const f of floaters){ctx.globalAlpha=Math.max(0,f.life);text(f.text,f.x,f.y,24,'#ffe7a6');}
  ctx.globalAlpha=1;ctx.restore();ctx.save();const bottom=ctx.createLinearGradient(0,730,0,800);
  bottom.addColorStop(0,'#10142100');bottom.addColorStop(1,'#101421cc');ctx.fillStyle=bottom;ctx.fillRect(0,730,540,70);ctx.restore();
}
function tick(now){const dt=Math.min(.05,Math.max(0,(now-last)/1000||0));last=now;if(!QA)clock+=dt;updateInput();sim.step(QA?0:dt,input);consumeEvents();updateDuet(QA?0:dt);updateComic(QA?0:dt);if(sim.mode==='playing'){for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=25*dt;p.life-=dt;}particles=particles.filter(p=>p.life>0);for(const f of floaters){f.y-=dt*22;f.life-=dt;}floaters=floaters.filter(f=>f.life>0);}if(sim.mode==='playing')reaction.remaining=Math.max(0,reaction.remaining-dt);shake=Math.max(0,shake-dt);if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)$('toast').classList.remove('visible');}if(now>nextUI){updateUI();nextUI=now+80;}updateCamera(dt,QA);render(clock);requestAnimationFrame(tick);}
async function load(){const paths={club:'assets/club.png',cast:'assets/cast.png',cloud:'assets/cloud.png',lips:'assets/lips.png'};await Promise.all(Object.entries(paths).map(async([key,src])=>{const im=new Image();im.src=src;try{await im.decode();images[key]=im;}catch{console.warn('Asset unavailable:',src);}}));atlas=globalThis.ACTOR_ATLAS||null;$('loading').hidden=true;saveRecord();updateUI();if(params.has('play')){sim.start();$('overlay').hidden=true;}if(QA){sim.start();$('overlay').hidden=true;clock=Number(params.get('time'))||3;sim.player.invuln=0;}updateCamera(0,true);window.__game={sim,input,render,updateUI,images,atlas,camera,controls,duet,comic,clubGuests,music,version:'0.5.1'};requestAnimationFrame(tick);}
load();
