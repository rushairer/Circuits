import { labels, type Part } from '../model.js';
import { LED_COLORS, ledAppearance } from '../core/led-colors.js';

export interface ScreenRect {left:number;top:number;right:number;bottom:number}
export interface ScreenPoint {x:number;y:number}
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]!));
const clamp=(value:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,value));
const overlap=(a:ScreenRect,b:ScreenRect)=>
 Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*
 Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));

/** CSS-pixel-only panel positioning; never affects world-space circuit state. */
export function placeQuickProperties(
 anchor:ScreenRect,stageWidth:number,stageHeight:number,
 width:number,height:number,obstacles:readonly ScreenRect[]=[]
):ScreenPoint {
 if(![anchor.left,anchor.top,anchor.right,anchor.bottom,stageWidth,stageHeight,width,height].every(Number.isFinite))
   return {x:12,y:12};
 const margin=12,w=Math.max(0,Math.min(width,stageWidth-margin*2)),
   h=Math.max(0,Math.min(height,stageHeight-margin*2));
 const proposals=[
  {x:anchor.right+margin,y:anchor.top},
  {x:anchor.left-w-margin,y:anchor.top},
  {x:anchor.left,y:anchor.top-h-margin},
  {x:anchor.left,y:anchor.bottom+margin},
  {x:stageWidth-w-margin,y:margin}
 ];
 return proposals.map((p,index)=>{
  const x=clamp(p.x,margin,Math.max(margin,stageWidth-w-margin)),
    y=clamp(p.y,margin,Math.max(margin,stageHeight-h-margin));
  const box={left:x,top:y,right:x+w,bottom:y+h};
  const score=overlap(box,anchor)*5+
    obstacles.reduce((sum,r)=>sum+overlap(box,r)*3,0)+
    Math.hypot(x-p.x,y-p.y)*55+index*0.01;
  return {x,y,score};
 }).sort((a,b)=>a.score-b.score)[0];
}

/** The existing inspector remains the canonical validation and undo path. */
export function renderQuickProperties(part:Part):string {
 const header='<div class="quick-heading"><div><strong>'+escape(labels[part.kind])+
  '</strong><small>'+escape(part.id)+' · 快捷属性</small></div>'+
  '<button type="button" data-action="parts" title="关闭快捷属性" aria-label="关闭快捷属性">×</button></div>';
 const title=part.kind==='resistor'?'阻值 (Ω)':part.kind==='battery'?'电压 (V)':
  part.kind==='capacitor'?'电容 (µF)':null;
 const fallback=part.kind==='resistor'?220:part.kind==='battery'?9:100;
 const value=title?'<label class="quick-field">'+title+
  '<input type="number" data-quick-field="value" aria-label="快捷'+title+'" step="any" min="'+
  (part.kind==='capacitor'?'0.001':'1')+'" value="'+(part.value??fallback)+'"/></label>':'';
 const led=part.kind==='led'?'<label class="quick-field">LED 颜色'+
  '<select data-quick-field="led-color" aria-label="快捷 LED 颜色">'+
  LED_COLORS.map(item=>'<option value="'+item.value+'" '+
   (ledAppearance(part.ledColor).value===item.value?'selected':'')+'>'+escape(item.label)+'</option>').join('')+
  '</select></label>':'';
 const capacitor=part.kind==='capacitor'?'<label class="quick-field">初始电压 (V)'+
  '<input data-quick-field="rc-initial" type="number" step="any" min="-1000" max="1000" value="'+
  (part.initialVolts??0)+'" aria-label="快捷初始电压"/></label>':'';
 const toggle=part.kind==='switch'?'<button type="button" class="quick-switch" data-action="quick-toggle-switch">'+
  (part.closed?'断开开关':'闭合开关')+'</button>':'';
 const generic=!title&&!led&&!toggle?
  '<small class="quick-hint">详细规格和仿真读数请查看右侧属性栏</small>':'';
 return '<section role="region" aria-label="'+escape(labels[part.kind])+' 快捷属性" '+
  'class="quick-properties" data-quick-for="'+escape(part.id)+'">'+header+
  '<div class="quick-fields">'+value+led+capacitor+toggle+generic+'</div>'+
  '<div class="quick-actions"><button type="button" data-action="rotate">⟳ 旋转</button>'+
  '<button type="button" data-action="delete" class="quick-danger">删除</button></div></section>';
}
