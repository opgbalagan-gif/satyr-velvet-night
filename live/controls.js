/* One pad: drag its center or ring to move; hold the still center to act. */
(function(root){
class CentralJoystick{
  constructor(element,enabled){
    this.element=element;this.enabled=enabled;this.gesture=null;this.secondary=new Map();this.axis={x:0,y:0};
    element.addEventListener('pointerdown',e=>this.down(e));
    element.addEventListener('pointermove',e=>this.move(e));
    for(const name of ['pointerup','pointercancel','lostpointercapture'])element.addEventListener(name,e=>this.release(e));
    element.addEventListener('contextmenu',e=>e.preventDefault());
  }
  down(e){
    if(!this.enabled())return;e.preventDefault();
    const center=!!e.target.closest('#action');
    if(this.gesture){if(center){this.secondary.set(e.pointerId,{x:e.clientX,y:e.clientY});this.element.setPointerCapture(e.pointerId);}return;}
    const b=this.element.getBoundingClientRect();
    this.gesture={id:e.pointerId,startX:center?e.clientX:b.left+b.width/2,startY:center?e.clientY:b.top+b.height/2,center,dragged:!center,started:performance.now(),stillSince:performance.now(),width:b.width};
    this.element.setPointerCapture(e.pointerId);
    if(!center)this.move(e);
  }
  move(e){
    const extra=this.secondary.get(e.pointerId);
    if(extra){if(Math.hypot(e.clientX-extra.x,e.clientY-extra.y)>5)this.secondary.delete(e.pointerId);return;}
    const g=this.gesture;if(!g||e.pointerId!==g.id)return;e.preventDefault();
    const dx=e.clientX-g.startX,dy=e.clientY-g.startY,len=Math.hypot(dx,dy),dead=5;
    if(len>dead){g.dragged=true;g.stillSince=null;}
    else if(g.stillSince===null)g.stillSince=performance.now();
    const power=Math.min(1,Math.max(0,(len-dead)/(g.width*.30-dead)));
    this.axis.x=len?dx/len*power:0;this.axis.y=len?dy/len*power:0;
    this.element.classList.toggle('dragging',power>0);
    this.element.style.setProperty('--stick-x',this.axis.x*g.width*.21+'px');
    this.element.style.setProperty('--stick-y',this.axis.y*g.width*.21+'px');
  }
  release(e){
    this.secondary.delete(e.pointerId);
    if(this.gesture?.id===e.pointerId){this.gesture=null;this.center();}
  }
  center(){this.axis.x=this.axis.y=0;this.element.classList.remove('dragging');this.element.style.setProperty('--stick-x','0px');this.element.style.setProperty('--stick-y','0px');}
  reset(){this.gesture=null;this.secondary.clear();this.center();}
  read(){
    const g=this.gesture,now=performance.now();
    const holding=g?.center&&this.axis.x===0&&this.axis.y===0&&g.stillSince!==null&&now-g.stillSince>=(g.dragged?180:100);
    const stationary=this.axis.x===0&&this.axis.y===0;
    return {x:this.axis.x,y:this.axis.y,action:stationary&&(!!holding||this.secondary.size>0)};
  }
}
root.CentralJoystick=CentralJoystick;
})(globalThis);
