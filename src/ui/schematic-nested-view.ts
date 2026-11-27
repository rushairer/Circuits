import type { SchematicDiagram } from '../core/schematic.js';
import type { BranchStep } from '../core/schematic-branches.js';
import { nestedDimensions,type NestedSchematic,type SeriesParallelNode } from '../core/schematic-nested.js';
import { connectedSchematicSymbol } from './schematic-symbols.js';

const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const short=(s:string)=>Array.from(s).length>12?Array.from(s).slice(0,11).join('')+'…':s;
const TOP=128,SOURCE_X=100,ROOT_LEFT=240;
export function nestedSheetSize(layout:NestedSchematic){
 const size=nestedDimensions(layout.root);
 return {width:Math.max(990,ROOT_LEFT+size.width+100),height:TOP+size.height+65};
}

/** Recursive rectangles have disjoint interiors. Every child exposes a
 * centered top/bottom port; parallel rails are outside child rectangles,
 * so no different-net crossover or guessed junction is needed.
 */
export function renderNestedSchematic(diagram:SchematicDiagram,layout:NestedSchematic,style:string,colorFor:(id:string)=>string):string {
 const {width,height}=nestedSheetSize(layout),bottom=height-65;
 const high=layout.root.from,low=layout.root.to,rootWidth=nestedDimensions(layout.root).width,rootX=ROOT_LEFT+rootWidth/2;
 const text=(x:number,y:number,value:string)=>'<text x="'+x+'" y="'+y+'" font-size="11" fill="#314c5a">'+escape(value)+'</text>';
 const wire=(id:string,d:string,cls='sch-link')=>'<path class="'+cls+'" data-schematic-net="'+escape(id)+'" d="'+d+'" fill="none" stroke="'+colorFor(id)+'" stroke-width="2.4"/>';
 const netLabel=(id:string,x:number,y:number,caption=id)=>{
  const net=diagram.nets.find(n=>n.id===id)!;
  return '<g class="sch-net" data-schematic-net="'+escape(id)+'">'+text(x,y,caption)+'<title>'+
   escape(id+': '+[...net.endpointKeys,...net.boardContacts].join('、'))+'</title></g>';
 };
 const joint=(id:string,x:number,y:number)=>'<circle class="sch-junction" data-schematic-net="'+escape(id)+'" cx="'+x+'" cy="'+y+'" r="3.1" fill="'+colorFor(id)+'"/>';
 const device=(step:BranchStep,x:number,y0:number,y1:number)=>{
  const c=step.component,mid=(y0+y1)/2,top=mid-20,end=mid+20;
  const symbol=connectedSchematicSymbol({...c,x:x-70,terminals:c.terminals.map((t,i)=>({...t,x,y:i===0?top:end}))});
  const reversed=c.terminals[0].pinId!==step.from.pinId;
  const art=reversed&&c.kind==='led'?'<g transform="rotate(180 '+x+' '+mid+')">'+(symbol?.body??'')+'</g>':symbol?.body??'';
  const lead=(t:BranchStep['from'],a:number,b:number)=>'<g class="sch-terminal" data-terminal="'+escape(t.componentId+'::'+t.pinId)+'" data-schematic-net="'+escape(t.netId!)+'">'+
   wire(t.netId!,'M'+x+' '+a+' V'+b,'sch-pin-lead')+'<title>'+escape(t.pinId+' · '+t.netId)+'</title></g>';
  return '<g class="sch-component" data-schematic-part="'+escape(c.id)+'">'+lead(step.from,y0,top)+lead(step.to,end,y1)+art+
   text(x+26,mid-4,short(c.reference+' · '+c.label))+text(x+26,mid+12,short(c.specification))+
   '<title>'+escape(c.reference+' · '+c.label+' · '+c.specification)+'</title></g>';
 };
 function draw(node:SeriesParallelNode,x:number,y0:number,y1:number):string {
  if(node.kind==='device')return device(node.step,x,y0,y1);
  const sizes=node.children.map(nestedDimensions);
  if(node.kind==='series'){
   const total=sizes.reduce((n,s)=>n+s.height,0);
   let out='',y=y0;
   for(const [i,child] of node.children.entries()){
    const end=i===node.children.length-1?y1:y+(y1-y0)*sizes[i].height/total;
    out+=draw(child,x,y,end);
    if(i<node.children.length-1)out+=netLabel(child.to,x+10,end-6);
    y=end;
   }
   return out;
  }
  const total=sizes.reduce((n,s)=>n+s.width,0);
  let left=x-total/2;
  const centers=sizes.map(s=>{const cx=left+s.width/2;left+=s.width;return cx;});
  const top=y0+32,end=y1-32;
  let out=wire(node.from,'M'+x+' '+y0+' V'+top,'sch-bus')+
   wire(node.to,'M'+x+' '+end+' V'+y1,'sch-bus')+
   wire(node.from,'M'+centers[0]+' '+top+' H'+centers[centers.length-1],'sch-bus')+
   wire(node.to,'M'+centers[0]+' '+end+' H'+centers[centers.length-1],'sch-bus');
  // The centered parent lead is a real T or four-way junction; interior
  // branch taps are T junctions as well. End elbows need no dot.
  const junctions=new Set([x,...centers.slice(1,-1)]);
  for(const cx of junctions)out+=joint(node.from,cx,top)+joint(node.to,cx,end);
  for(const [i,child] of node.children.entries())out+=draw(child,centers[i],top,end);
  return out;
 }
 const body=wire(high,'M'+SOURCE_X+' '+TOP+' H'+rootX,'sch-bus')+
  wire(low,'M'+SOURCE_X+' '+bottom+' H'+rootX,'sch-bus')+
  netLabel(high,SOURCE_X,TOP-10,high+' · 电池 +')+netLabel(low,SOURCE_X,bottom+22,low+' · 电池 −')+
  device(layout.source,SOURCE_X,TOP,bottom)+draw(layout.root,rootX,TOP,bottom);
 return '<svg class="schematic-svg sch-root" xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'" data-schematic-route-mode="nested" role="img" aria-label="根据真实 Netlist 自动生成的嵌套串并联原理图">'+
  style+'<rect width="'+width+'" height="'+height+'" fill="#f8fbfc"/>'+
  '<text class="sch-title" x="38" y="39">'+escape(diagram.name)+'</text>'+
  '<text class="sch-caption" x="38" y="61">同一 N 编号表示实际电气等势网络；电池负端不代表大地接地。</text>'+
  '<text class="sch-col-label" x="38" y="87">多级串并联拓扑布局 · 非电流方向指示</text>'+body+'</svg>';
}
