import type { SchematicDiagram } from '../core/schematic.js';
import type { BranchStep } from '../core/schematic-branches.js';
import type { SchematicBridge } from '../core/schematic-bridge.js';
import { connectedSchematicSymbol } from './schematic-symbols.js';

const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const short=(s:string)=>Array.from(s).length>18?Array.from(s).slice(0,17).join('')+'…':s;
const TOP=128,MIDDLE=328,BOTTOM=528,SOURCE_X=100,LEFT=330,RIGHT=690;
export const bridgeSheetSize={width:990,height:593};

/** Four orthogonal arms, two distinct midpoint nets and a horizontal
 * cross-link. Every conductive segment ends at its real symbol pin.
 */
export function renderBridgeSchematic(diagram:SchematicDiagram,layout:SchematicBridge,style:string,colorFor:(id:string)=>string):string {
 const {width,height}=bridgeSheetSize;
 const high=layout.source.from.netId!,low=layout.source.to.netId!,left=layout.cross.from.netId!,right=layout.cross.to.netId!;
 const text=(x:number,y:number,value:string)=>'<text x="'+x+'" y="'+y+'" font-size="11" fill="#314c5a">'+escape(value)+'</text>';
 const wire=(id:string,d:string,cls='sch-link')=>'<path class="'+cls+'" data-schematic-net="'+escape(id)+'" d="'+d+'" fill="none" stroke="'+colorFor(id)+'" stroke-width="2.4"/>';
 const joint=(id:string,x:number,y:number)=>'<circle class="sch-junction" data-schematic-net="'+escape(id)+'" cx="'+x+'" cy="'+y+'" r="3.1" fill="'+colorFor(id)+'"/>';
 const netLabel=(id:string,x:number,y:number,caption=id)=>{
  const net=diagram.nets.find(n=>n.id===id)!;
  return '<g class="sch-net" data-schematic-net="'+escape(id)+'">'+text(x,y,caption)+'<title>'+
   escape(id+': '+[...net.endpointKeys,...net.boardContacts].join('、'))+'</title></g>';
 };
 const lead=(t:BranchStep['from'],d:string)=>'<g class="sch-terminal" data-terminal="'+escape(t.componentId+'::'+t.pinId)+'" data-schematic-net="'+escape(t.netId!)+'">'+
  wire(t.netId!,d,'sch-pin-lead')+'<title>'+escape(t.pinId+' · '+t.netId)+'</title></g>';
 const device=(step:BranchStep,x:number,y0:number,y1:number,horizontal=false)=>{
  const c=step.component,mid=(y0+y1)/2,top=mid-20,end=mid+20;
  const cx=horizontal?mid:x,cy=horizontal?x:mid;
  const symbol=connectedSchematicSymbol({...c,x:cx-70,terminals:c.terminals.map((t,i)=>({...t,x:cx,y:cy+(i===0?-20:20)}))});
  let art=symbol?.body??'';
  if(horizontal){
   if(c.kind==='resistor')art='<g transform="rotate(-90 '+cx+' '+cy+')">'+art+'</g>';
   else {
    // Keep instrument letters upright; mark the actual terminal polarity.
    const plus=step.from.pinId==='positive';
    art='<g class="sch-symbol" data-symbol-kind="'+c.kind+'" stroke="#314c5a" stroke-width="2" fill="none">'+
     '<path d="M'+(cx-20)+' '+cy+' H'+(cx-8)+' M'+(cx+8)+' '+cy+' H'+(cx+20)+'"/>'+
     '<circle cx="'+cx+'" cy="'+cy+'" r="8" fill="#fff"/>'+
     '<text x="'+cx+'" y="'+(cy+3)+'" text-anchor="middle" font-size="10" fill="#314c5a" stroke="none">'+(c.kind==='ammeter'?'A':'V')+'</text></g>'+
     text(cx-32,cy-10,plus?'+':'−')+text(cx+25,cy-10,plus?'−':'+');
   }
  }
  const a=horizontal?'M'+y0+' '+x+' H'+top:'M'+x+' '+y0+' V'+top;
  const b=horizontal?'M'+end+' '+x+' H'+y1:'M'+x+' '+end+' V'+y1;
  const labelX=horizontal?cx-55:cx+26,labelY=horizontal?cy+28:cy-4;
  return '<g class="sch-component" data-schematic-part="'+escape(c.id)+'">'+lead(step.from,a)+lead(step.to,b)+art+
   text(labelX,labelY,short(c.reference+' · '+c.label))+text(labelX,labelY+16,short(c.specification))+
   '<title>'+escape(c.reference+' · '+c.label+' · '+c.specification)+'</title></g>';
 };
 const body=wire(high,'M'+SOURCE_X+' '+TOP+' H'+RIGHT,'sch-bus')+
  wire(low,'M'+SOURCE_X+' '+BOTTOM+' H'+RIGHT,'sch-bus')+
  netLabel(high,SOURCE_X,TOP-10,high+' · 电池 +')+netLabel(low,SOURCE_X,BOTTOM+22,low+' · 电池 −')+
  netLabel(left,LEFT-44,MIDDLE-12)+netLabel(right,RIGHT+12,MIDDLE-12)+
  device(layout.source,SOURCE_X,TOP,BOTTOM)+
  device(layout.upperLeft,LEFT,TOP,MIDDLE)+device(layout.lowerLeft,LEFT,MIDDLE,BOTTOM)+
  device(layout.upperRight,RIGHT,TOP,MIDDLE)+device(layout.lowerRight,RIGHT,MIDDLE,BOTTOM)+
  device(layout.cross,MIDDLE,LEFT,RIGHT,true)+
  joint(high,LEFT,TOP)+joint(low,LEFT,BOTTOM)+joint(left,LEFT,MIDDLE)+joint(right,RIGHT,MIDDLE);
 return '<svg class="schematic-svg sch-root" xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'" data-schematic-route-mode="bridge" role="img" aria-label="根据真实 Netlist 自动生成的桥式原理图">'+
  style+'<rect width="'+width+'" height="'+height+'" fill="#f8fbfc"/>'+
  '<text class="sch-title" x="38" y="39">'+escape(diagram.name)+'</text>'+
  '<text class="sch-caption" x="38" y="61">同一 N 编号表示实际电气等势网络；电池负端不代表大地接地。</text>'+
  '<text class="sch-col-label" x="38" y="87">桥式拓扑布局 · 非电流方向指示</text>'+body+'</svg>';
}
