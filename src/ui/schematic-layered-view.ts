import type { SchematicDiagram } from '../core/schematic.js';
import type { BranchStep } from '../core/schematic-branches.js';
import type { LayeredSchematic } from '../core/schematic-layered.js';
import { connectedSchematicSymbol } from './schematic-symbols.js';

const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const short=(s:string)=>Array.from(s).length>12?Array.from(s).slice(0,11).join('')+'…':s;

/** Device intervals sharing a column are strictly disjoint. Foreign rails crossing a
 * vertical lead receive an insulated bridge with a background knockout.
 * Junction dots occur only on actual endpoint rails. */
export function renderLayeredSchematic(diagram:SchematicDiagram,layout:LayeredSchematic,style:string,colorFor:(id:string)=>string):string {
 const {width,height}=layout;
 const text=(x:number,y:number,value:string)=>'<text x="'+x+'" y="'+y+'" font-size="11" fill="#314c5a">'+escape(value)+'</text>';
 const wire=(id:string,d:string,cls='sch-link')=>'<path class="'+cls+'" data-schematic-net="'+escape(id)+'" d="'+d+'" fill="none" stroke="'+colorFor(id)+'" stroke-width="2.4"/>';
 const multiSource=layout.devices.filter(d=>d.step.component.kind==='battery').length>1;
 const sourceLabel=multiSource?layout.devices[0].step.component.reference:'电池';
 const rails=layout.rails.map(r=>{
  const net=diagram.nets.find(n=>n.id===r.id)!;
  const label=r.id===layout.high?r.id+' · '+sourceLabel+' +':r.id===layout.low?r.id+' · '+sourceLabel+' −':r.id;
  return wire(r.id,'M'+r.x1+' '+r.y+' H'+r.x2,'sch-bus')+
   '<g class="sch-net" data-schematic-net="'+escape(r.id)+'">'+text(r.labelX,r.y-7,label)+
   '<title>'+escape(r.id+': '+[...net.endpointKeys,...net.boardContacts].join('、'))+'</title></g>';
 }).join('');
 const devices=layout.devices.map(d=>{
  const {step,x,top,bottom,mid}=d,c=step.component;
  const upper=mid-20,lower=mid+20;
  const symbol=connectedSchematicSymbol({...c,x:x-70,terminals:c.terminals.map((t,i)=>({...t,x,y:i===0?upper:lower}))});
  const reversed=c.terminals[0].pinId!==step.from.pinId;
  // Reflect a reversed battery vertically, keeping polarity marks on the
  // left of its plates (away from reference/value text on the right).
  const art=reversed&&c.kind==='battery'?'<g transform="translate(0 '+(2*mid)+') scale(1 -1)">'+(symbol?.body??'')+'</g>':
   reversed&&c.kind==='led'?'<g transform="rotate(180 '+x+' '+mid+')">'+(symbol?.body??'')+'</g>':symbol?.body??'';
  const lead=(t:BranchStep['from'],path:string)=>'<g class="sch-terminal" data-terminal="'+escape(t.componentId+'::'+t.pinId)+'" data-schematic-net="'+escape(t.netId!)+'">'+
   wire(t.netId!,path,'sch-pin-lead')+'<title>'+escape(t.pinId+' · '+t.netId)+'</title></g>';
  let lowerPath='M'+x+' '+lower,bridges='';
  for(const crossing of d.crossings){
   const y=crossing.y,arc='M'+x+' '+(y-10)+' Q'+(x+16)+' '+y+' '+x+' '+(y+10);
   lowerPath+=' V'+(y-10)+' M'+x+' '+(y+10);
   bridges+='<g class="sch-crossover" data-horizontal-net="'+escape(crossing.netId)+'" data-vertical-net="'+escape(step.to.netId!)+'">'+
    '<path d="'+arc+'" fill="none" stroke="#f8fbfc" stroke-width="7" stroke-linecap="round"/>'+
    wire(step.to.netId!,arc)+'</g>';
  }
  lowerPath+=' V'+bottom;
  const dot=(id:string,y:number)=>'<circle class="sch-junction" data-schematic-net="'+escape(id)+'" cx="'+x+'" cy="'+y+'" r="3.1" fill="'+colorFor(id)+'"/>';
  const polarity=['multimeter','ammeter','buzzer'].includes(c.kind)?
   text(x-22,upper+4,step.from.pinId==='positive'?'+':'−')+text(x-22,lower,step.to.pinId==='positive'?'+':'−'):'';
  return '<g class="sch-component" data-schematic-part="'+escape(c.id)+'">'+
   lead(step.from,'M'+x+' '+top+' V'+upper)+lead(step.to,lowerPath)+bridges+art+polarity+
   dot(step.from.netId!,top)+dot(step.to.netId!,bottom)+
   text(x+26,mid-4,short(c.reference+' · '+c.label))+text(x+26,mid+12,short(c.specification))+
   '<title>'+escape(c.reference+' · '+c.label+' · '+c.specification)+'</title></g>';
 }).join('');
 return '<svg class="schematic-svg sch-root" xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'" data-schematic-route-mode="layered" role="img" aria-label="根据真实 Netlist 自动生成的分层原理图">'+
  style+'<rect width="'+width+'" height="'+height+'" fill="#f8fbfc"/>'+
  '<text class="sch-title" x="38" y="39">'+escape(diagram.name)+'</text>'+
  '<text class="sch-caption" x="38" y="61">同一 N 编号表示实际电气等势网络；电池负端不代表大地接地。</text>'+
  '<text class="sch-col-label" x="38" y="87">通用分层网络布局 · 拱形跨线不导通 · 排列不表示电压或电流方向</text>'+rails+devices+'</svg>';
}
