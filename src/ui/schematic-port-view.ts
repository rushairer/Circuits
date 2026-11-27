import type { SchematicDiagram } from '../core/schematic.js';
import type { PortLayout } from '../core/schematic-ports.js';
import { connectedSchematicSymbol } from './schematic-symbols.js';

const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const short=(s:string)=>Array.from(s).length>24?Array.from(s).slice(0,23).join('')+'…':s;

/** Render original symbols and independent pin leads; rail crossings are
 * insulated, and only the exact endpoint rail receives a junction dot. */
export function renderPortSchematic(diagram:SchematicDiagram,layout:PortLayout,style:string,colorFor:(id:string)=>string):string {
 const {width,height}=layout;
 const text=(x:number,y:number,value:string)=>'<text x="'+x+'" y="'+y+'" font-size="11" fill="#314c5a">'+escape(value)+'</text>';
 const wire=(id:string,d:string,cls='sch-link')=>'<path class="'+cls+'" data-schematic-net="'+escape(id)+'" d="'+d+'" fill="none" stroke="'+colorFor(id)+'" stroke-width="2.4"/>';
 const rails=layout.rails.map(r=>{
  const net=diagram.nets.find(n=>n.id===r.id)!;
  return wire(r.id,'M'+r.x1+' '+r.y+' H'+r.x2,'sch-bus')+
   '<g class="sch-net" data-schematic-net="'+escape(r.id)+'">'+text(38,r.y+4,r.id)+
   '<title>'+escape(r.id+': '+[...net.endpointKeys,...net.boardContacts].join('、'))+'</title></g>';
 }).join('');
 const devices=layout.devices.map(d=>{
  const c=d.component;
  const symbol=connectedSchematicSymbol({...c,x:d.x-70,terminals:d.tracks.map(t=>({...t.terminal,x:t.x,y:t.y}))});
  // The model pin schema and symbol registry share the same IDs. No invented
  // ports or decorative disconnected symbols are introduced in this view.
  const leads=d.tracks.map(t=>{
   const id=t.terminal.netId!;
   let path='M'+t.x+' '+t.y,bridges='';
   for(const cross of t.crossings){
    const y=cross.y,arc='M'+t.x+' '+(y-10)+' Q'+(t.x+16)+' '+y+' '+t.x+' '+(y+10);
    path+=' V'+(y-10)+' M'+t.x+' '+(y+10);
    bridges+='<g class="sch-crossover" data-horizontal-net="'+escape(cross.netId)+'" data-vertical-net="'+escape(id)+'">'+
     '<path d="'+arc+'" fill="none" stroke="#f8fbfc" stroke-width="7" stroke-linecap="round"/>'+wire(id,arc)+'</g>';
   }
   path+=' V'+t.endY;
   return '<g class="sch-terminal" data-terminal="'+escape(c.id+'::'+t.terminal.pinId)+'" data-schematic-net="'+escape(id)+'">'+
    wire(id,symbol!.leads.get(t.terminal.pinId)!,'sch-pin-lead')+wire(id,path)+
    text(d.x+27,t.y-5,t.terminal.pinId)+'<title>'+escape(t.terminal.pinId+' · '+id)+'</title></g>'+bridges+
    '<circle class="sch-junction" data-schematic-net="'+escape(id)+'" cx="'+t.x+'" cy="'+t.endY+'" r="3.1" fill="'+colorFor(id)+'"/>';
  }).join('');
  return '<g class="sch-component" data-schematic-part="'+escape(c.id)+'">'+
   text(d.x-27,113,short(c.reference+' · '+c.label))+text(d.x-27,130,short(c.specification))+
   leads+symbol!.body+'<title>'+escape(c.reference+' · '+c.label+' · '+c.specification)+'</title></g>';
 }).join('');
 return '<svg class="schematic-svg sch-root" xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'" data-schematic-route-mode="ports" role="img" aria-label="根据真实 Netlist 自动生成的多引脚原理图">'+
  style+'<rect width="'+width+'" height="'+height+'" fill="#f8fbfc"/>'+
  '<text class="sch-title" x="38" y="39">'+escape(diagram.name)+'</text>'+
  '<text class="sch-caption" x="38" y="61">同一 N 编号表示实际电气等势网络；不同引脚保持独立身份。</text>'+
  '<text class="sch-col-label" x="38" y="87">多引脚网络布局 · 拱形跨线不导通 · 排列不表示电压或电流方向</text>'+rails+devices+'</svg>';
}
