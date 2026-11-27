import type { SchematicDiagram } from '../core/schematic.js';
import type { PortLayout } from '../core/schematic-ports.js';
import { connectedSchematicSymbol } from './schematic-symbols.js';

const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const short=(s:string,limit:number)=>Array.from(s).length>limit?Array.from(s).slice(0,limit-1).join('')+'…':s;

/** Render original symbols and independent pin leads; rail crossings are
 * insulated, and only the exact endpoint rail receives a junction dot. */
export function renderPortSchematic(diagram:SchematicDiagram,layout:PortLayout,style:string,colorFor:(id:string)=>string):string {
 const {width,height}=layout;
 const text=(x:number,y:number,value:string)=>'<text x="'+x+'" y="'+y+'" font-size="11" fill="#314c5a">'+escape(value)+'</text>';
 // The visible label has a conservative code-point budget plus an actual
 // SVG viewport clip for wide glyphs/fallback fonts. Full text stays in title.
 // Override the workbench's broad .canvas svg sizing and touch rule.
 const boundedText=(x:number,y:number,value:string,available:number,truncate=true)=>
  '<svg class="sch-port-label" x="'+x+'" y="'+(y-13)+'" width="'+available+'" height="17" overflow="hidden" style="width:'+available+'px;height:17px;touch-action:pan-x pan-y;user-select:text">'+
  text(0,13,truncate?short(value,Math.max(1,Math.floor(available/11))):value)+'</svg>';
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
   const id=t.terminal.netId;
   if(id===null||t.endY===null){
    return '<g class="sch-terminal" data-terminal="'+escape(c.id+'::'+t.terminal.pinId)+'" data-schematic-net="NC">'+
     '<path class="sch-pin-lead" d="'+symbol!.leads.get(t.terminal.pinId)!+'" fill="none" stroke="#8599a3" stroke-width="1.6"/>'+
     '<circle class="sch-nc" cx="'+t.x+'" cy="'+t.y+'" r="4.5" fill="#f8fbfc" stroke="#8599a3" stroke-width="1.6"/>'+
     boundedText(d.x+27,t.y-5,t.terminal.pinId+' · NC',t.x-d.x-35,false)+'<title>'+escape(t.terminal.pinId+' · NC')+'</title></g>';
   }
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
    boundedText(d.x+27,t.y-5,t.terminal.pinId,t.x-d.x-35,false)+'<title>'+escape(t.terminal.pinId+' · '+id)+'</title></g>'+bridges+
    '<circle class="sch-junction" data-schematic-net="'+escape(id)+'" cx="'+t.x+'" cy="'+t.endY+'" r="3.1" fill="'+colorFor(id)+'"/>';
  }).join('');
  return '<g class="sch-component" data-schematic-part="'+escape(c.id)+'">'+
   boundedText(d.x-27,113,c.reference+' · '+c.label,d.columnWidth-36)+boundedText(d.x-27,130,c.specification,d.columnWidth-36)+
   leads+symbol!.body+'<title>'+escape(c.reference+' · '+c.label+' · '+c.specification)+'</title></g>';
 }).join('');
 return '<svg class="schematic-svg sch-root" xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'" data-schematic-route-mode="ports" role="img" aria-label="根据真实 Netlist 自动生成的多引脚原理图">'+
  style+'<rect width="'+width+'" height="'+height+'" fill="#f8fbfc"/>'+
  '<text class="sch-title" x="38" y="39">'+escape(diagram.name)+'</text>'+
  '<text class="sch-caption" x="38" y="61">同一 N 编号表示实际电气等势网络；不同引脚保持独立身份。</text>'+
  '<text class="sch-col-label" x="38" y="87">多引脚网络布局 · 拱形跨线不导通 · 排列不表示电压或电流方向</text>'+rails+devices+'</svg>';
}
