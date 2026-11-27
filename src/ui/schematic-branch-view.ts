import type { SchematicDiagram } from '../core/schematic.js';
import type { BranchStep, SchematicBranches } from '../core/schematic-branches.js';
import { connectedSchematicSymbol } from './schematic-symbols.js';

const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const short=(s:string)=>Array.from(s).length>12?Array.from(s).slice(0,11).join('')+'…':s;
const TOP=128,SOURCE_X=100,STEP_X=180,STEP_Y=116;
export function branchSheetSize(layout:SchematicBranches){
 return {width:Math.max(990,SOURCE_X+STEP_X*layout.branches.length+175),
  height:TOP+STEP_Y*Math.max(...layout.branches.map(b=>b.length))+65};
}

/** The layout is a complete projection of two-terminal branches, not a
 * solver. Positive/negative rails refer only to the real battery terminals.
 */
export function renderBranchSchematic(diagram:SchematicDiagram,layout:SchematicBranches,style:string,colorFor:(id:string)=>string):string {
 const {width,height}=branchSheetSize(layout),bottom=height-65;
 const high=layout.source.from.netId!,low=layout.source.to.netId!;
 const lastX=SOURCE_X+STEP_X*layout.branches.length;
 const text=(x:number,y:number,value:string)=>'<text x="'+x+'" y="'+y+'" font-size="11" fill="#314c5a">'+escape(value)+'</text>';
 const wire=(id:string,d:string,cls:string)=>'<path class="'+cls+'" data-schematic-net="'+escape(id)+'" d="'+d+'" fill="none" stroke="'+colorFor(id)+'" stroke-width="2.4"/>';
 const netLabel=(id:string,x:number,y:number,caption:string)=>{
  const net=diagram.nets.find(n=>n.id===id)!;
  return '<g class="sch-net" data-schematic-net="'+escape(id)+'">'+text(x,y,caption)+'<title>'+
   escape(id+': '+[...net.endpointKeys,...net.boardContacts].join('、'))+'</title></g>';
 };
 const joint=(id:string,x:number,y:number)=>'<circle class="sch-junction" data-schematic-net="'+escape(id)+'" cx="'+x+'" cy="'+y+'" r="3.1" fill="'+colorFor(id)+'"/>';
 const device=(step:BranchStep,x:number,y0:number,y1:number)=>{
  const c=step.component,mid=(y0+y1)/2,top=mid-20,end=mid+20;
  // Draw natural model pin order then rotate only artwork if the branch
  // traverses the component backwards. Actual terminal IDs never change.
  const symbol=connectedSchematicSymbol({...c,x:x-70,terminals:c.terminals.map((t,i)=>({...t,x,y:i===0?top:end}))});
  const reversed=c.terminals[0].pinId!==step.from.pinId;
  const art=reversed&&c.kind==='led'?'<g transform="rotate(180 '+x+' '+mid+')">'+(symbol?.body??'')+'</g>':symbol?.body??'';
  const lead=(t:BranchStep['from'],a:number,b:number)=>'<g class="sch-terminal" data-terminal="'+escape(t.componentId+'::'+t.pinId)+'" data-schematic-net="'+escape(t.netId!)+'">'+
   wire(t.netId!,'M'+x+' '+a+' V'+b,'sch-pin-lead')+'<title>'+escape(t.pinId+' · '+t.netId)+'</title></g>';
  return '<g class="sch-component" data-schematic-part="'+escape(c.id)+'">'+
   lead(step.from,y0,top)+lead(step.to,end,y1)+art+
   text(x+26,mid-4,short(c.reference+' · '+c.label))+text(x+26,mid+12,short(c.specification))+
   '<title>'+escape(c.reference+' · '+c.label+' · '+c.specification)+'</title></g>';
 };
 let body=wire(high,'M'+SOURCE_X+' '+TOP+' H'+lastX,'sch-bus')+
  wire(low,'M'+SOURCE_X+' '+bottom+' H'+lastX,'sch-bus')+
  netLabel(high,SOURCE_X,TOP-10,high+' · 电池 +')+netLabel(low,SOURCE_X,bottom+22,low+' · 电池 −')+
  device(layout.source,SOURCE_X,TOP,bottom);
 for(const [index,branch] of layout.branches.entries()){
  const x=SOURCE_X+STEP_X*(index+1);
  if(index<layout.branches.length-1)body+=joint(high,x,TOP)+joint(low,x,bottom);
  for(const [i,step] of branch.entries()){
   const y0=TOP+Math.round((bottom-TOP)*i/branch.length),y1=TOP+Math.round((bottom-TOP)*(i+1)/branch.length);
   body+=device(step,x,y0,y1);
   if(i<branch.length-1)body+=netLabel(step.to.netId!,x+9,y1-5,step.to.netId!);
  }
 }
 return '<svg class="schematic-svg sch-root" xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'" data-schematic-route-mode="branches" role="img" aria-label="根据真实 Netlist 自动生成的串并联原理图">'+
  style+'<rect width="'+width+'" height="'+height+'" fill="#f8fbfc"/>'+
  '<text class="sch-title" x="38" y="39">'+escape(diagram.name)+'</text>'+
  '<text class="sch-caption" x="38" y="61">同一 N 编号表示实际电气等势网络；路径交叉不表示新连接。电池负端不代表大地接地。</text>'+
  '<text class="sch-col-label" x="38" y="87">拓扑布局 · '+layout.branches.length+' 条支路 · 非电流方向指示</text>'+body+'</svg>';
}
