import { labels, type Part, type Wire } from '../model.js';
import { WIRE_TYPES } from '../core/wire-types.js';
import { LED_COLORS, ledAppearance } from '../core/led-colors.js';
import { resistorValueFields } from './resistor-value-fields.js';

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
 // Both an adjacent LED pin and the panel's native input are clickable.
 // Rank obstruction BEFORE proximity: even an interactive input must not cover
 // another part when a free placement exists. Explore corners as well as the
 // four immediate sides of the selected object (at most 30 candidates).
 // Evaluate obstacle edges too: an interactive inspector cannot overlap the
 // selected part, but the original five slots may all be occupied on tablets.
 // Bound extra anchors to the six closest scene obstacles to avoid O(n^3).
 const center=(box:ScreenRect)=>({x:(box.left+box.right)/2,y:(box.top+box.bottom)/2});
 const a=center(anchor);
 const nearby=obstacles.filter(box=>[box.left,box.top,box.right,box.bottom].every(Number.isFinite))
  .map(box=>({box,c:center(box)}))
  .sort((l,r)=>Math.hypot(l.c.x-a.x,l.c.y-a.y)-Math.hypot(r.c.x-a.x,r.c.y-a.y))
  .slice(0,6).map(x=>x.box);
 const xSlots=[
  anchor.right+margin,anchor.left-w-margin,anchor.left,
  stageWidth-w-margin,margin,(stageWidth-w)/2,
  ...nearby.flatMap(box=>[box.left-w-margin,box.right+margin])
 ];
 const ySlots=[
  anchor.top,anchor.top-h-margin,anchor.bottom+margin,
  margin,stageHeight-h-margin,
  ...nearby.flatMap(box=>[box.top-h-margin,box.bottom+margin])
 ];
 const scored:{x:number;y:number;occupied:number;own:number;distance:number}[]=[];
 const visited=new Set<string>();
 for(const candidateX of xSlots)for(const candidateY of ySlots){
  const x=clamp(candidateX,margin,Math.max(margin,stageWidth-w-margin));
  const y=clamp(candidateY,margin,Math.max(margin,stageHeight-h-margin));
  const key=x+','+y;
  if(visited.has(key))continue;
  visited.add(key);
  const box={left:x,top:y,right:x+w,bottom:y+h};
  const occupied=obstacles.reduce((sum,r)=>sum+overlap(box,r),0);
  const own=overlap(box,anchor);
  const distance=Math.hypot(x-(anchor.right+margin),y-anchor.top);
  scored.push({x,y,occupied,own,distance});
 }
 scored.sort((a,b)=>{
   // A completely clear placement outranks a near placement. On collisions,
   // never place an active native field over the selected SVG part: WebKit
   // otherwise retries the first click after the DOM re-render.
   const aClear=a.own===0&&a.occupied===0,bClear=b.own===0&&b.occupied===0;
   if(aClear!==bClear)return aClear?-1:1;
   const aOwn=a.own===0,bOwn=b.own===0;
   if(aOwn!==bOwn)return aOwn?-1:1;
   return a.occupied-b.occupied||a.own-b.own||
     a.distance-b.distance||a.y-b.y||a.x-b.x;
 });
 return {x:scored[0].x,y:scored[0].y};
}

/** The existing inspector remains the canonical validation and undo path. */
export function renderQuickProperties(part:Part):string {
 const header='<div class="quick-heading"><div><strong>'+escape(part.name||labels[part.kind])+
  '</strong><small>'+escape(part.id)+' · 快捷属性</small></div>'+
  '<button type="button" data-action="parts" title="关闭快捷属性" aria-label="关闭快捷属性">×</button></div>';
 const title=part.kind==='resistor'?'阻值 (Ω)':part.kind==='battery'?'电压 (V)':
  part.kind==='capacitor'?'电容 (µF)':null;
 const fallback=part.kind==='resistor'?220:part.kind==='battery'?9:100;
 const value=title&&part.kind!=='resistor'?'<label class="quick-field">'+title+
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
  '<div class="quick-fields">'+
   '<label class="quick-field">名称<input data-quick-field="part-name" type="text" maxlength="80" '+
   'autocomplete="off" aria-label="快捷元件名称" value="'+escape(part.name??'')+'" placeholder="'+escape(labels[part.kind])+'"/></label>'+
   (part.kind==='resistor'?resistorValueFields(part,true):value)+led+capacitor+toggle+generic+'</div>'+
  '<div class="quick-actions"><button type="button" data-action="rotate">⟳ 旋转</button>'+
  '<button type="button" data-action="delete" class="quick-danger">删除</button></div></section>';
}


/** Selected conductor overlay; real electrical identity stays in Project.wires. */
export function renderQuickWireProperties(wire:Wire):string {
 const type=wire.type??'normal';
 const options=WIRE_TYPES.map(item=>
   '<option value="'+item.value+'"'+(type===item.value?' selected':'')+'>'+
   escape(item.label)+'</option>').join('');
 const routing=wire.routing==='horizontal'?'横向优先':wire.routing==='vertical'?'纵向优先':'传统兼容路径';
 return '<section role="region" class="quick-properties quick-wire-properties" '+
   'aria-label="导线快捷属性" data-quick-wire-for="'+escape(wire.id)+'">'+
   '<div class="quick-heading"><div><strong>导线属性</strong><small>'+
   escape(wire.id)+' · '+(wire.bends?.length??0)+' 个折点</small></div>'+
   '<button type="button" aria-label="关闭导线快捷属性" data-action="parts">×</button></div>'+
   '<div class="quick-fields">'+
   '<label class="quick-field">导线颜色<input data-quick-field="wire-color" type="color" '+
   'aria-label="快捷导线颜色" value="'+escape(wire.color)+'"/></label>'+
   '<label class="quick-field">线缆类型<select data-quick-field="wire-type" aria-label="快捷线缆类型">'+options+'</select></label>'+
   '<div class="quick-routing-status">正交走线：'+routing+'</div></div>'+
   '<div class="quick-actions"><button type="button" data-action="quick-wire-flip-direction" '+
   'aria-label="切换导线正交走线方向">↳ 切换方向</button>'+
   '<button type="button" data-action="quick-wire-delete" class="quick-danger">删除</button></div>'+
   '</section>';
}
