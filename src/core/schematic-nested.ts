import type { SchematicDiagram } from './schematic.js';
import type { BranchStep } from './schematic-branches.js';

export type SeriesParallelNode =
 | {kind:'device';from:string;to:string;step:BranchStep}
 | {kind:'series'|'parallel';from:string;to:string;children:SeriesParallelNode[]};
export interface NestedSchematic {source:BranchStep;root:SeriesParallelNode}

function orient(node:SeriesParallelNode,from:string):SeriesParallelNode {
 if(node.from===from)return node;
 if(node.kind==='device')return {...node,from:node.to,to:node.from,
  step:{component:node.step.component,from:node.step.to,to:node.step.from}};
 const children=node.kind==='series'?[...node.children].reverse():node.children;
 return {...node,from:node.to,to:node.from,children:children.map(child=>orient(child,child.to))};
}
function merge(kind:'series'|'parallel',a:SeriesParallelNode,b:SeriesParallelNode):SeriesParallelNode {
 return {kind,from:a.from,to:kind==='series'?b.to:a.to,
  children:[...(a.kind===kind?a.children:[a]),...(b.kind===kind?b.children:[b])]};
}
export function nestedDimensions(node:SeriesParallelNode):{width:number;height:number} {
 if(node.kind==='device')return {width:180,height:116};
 const sizes=node.children.map(nestedDimensions);
 return node.kind==='series'?{width:Math.max(...sizes.map(s=>s.width)),height:sizes.reduce((n,s)=>n+s.height,0)}:
  {width:sizes.reduce((n,s)=>n+s.width,0),height:Math.max(...sizes.map(s=>s.height))+64};
}

/** Deterministic two-terminal series/parallel reduction. Only complete
 * reducible graphs are accepted; bridges, dangling islands, shorts, extra
 * sources and unsupported devices retain the complete existing projection.
 * Geometry and net identities are never written back to the circuit.
 */
export function nestedSchematic(diagram:SchematicDiagram):NestedSchematic|null {
 const components=diagram.components;
 if(components.length<2||components.length>49||diagram.unconnectedTerminals)return null;
 if(new Set(components.map(c=>c.id)).size!==components.length)return null;
 const batteries=components.filter(c=>c.kind==='battery');
 if(batteries.length!==1)return null;
 const battery=batteries[0],positive=battery.terminals.find(t=>t.pinId==='positive'),
  negative=battery.terminals.find(t=>t.pinId==='negative');
 if(battery.terminals.length!==2||!positive?.netId||!negative?.netId||positive.netId===negative.netId)return null;
 const high=positive.netId,low=negative.netId,known=new Set(diagram.nets.map(n=>n.id));
 if(known.size!==diagram.nets.length||!known.has(high)||!known.has(low))return null;
 const touched=new Set<string>([high,low]);
 let edges:SeriesParallelNode[]=[];
 for(const component of [...components].sort((a,b)=>a.id.localeCompare(b.id,'en'))){
  if(component===battery)continue;
  if(!['resistor','led','capacitor','switch','pushbutton','buzzer','multimeter','ammeter'].includes(component.kind)||component.terminals.length!==2)return null;
  const [a,b]=component.terminals;
  if(!a.netId||!b.netId||a.netId===b.netId||!known.has(a.netId)||!known.has(b.netId))return null;
  touched.add(a.netId);touched.add(b.netId);
  edges.push({kind:'device',from:a.netId,to:b.netId,step:{component,from:a,to:b}});
 }
 if(touched.size!==known.size)return null;
 const internal=[...known].filter(n=>n!==high&&n!==low).sort((a,b)=>a.localeCompare(b,'en'));
 while(edges.length>1){
  let reduction:{a:SeriesParallelNode;b:SeriesParallelNode;node:SeriesParallelNode}|null=null;
  // Parallel edges can be combined even when authored in opposite directions.
  for(let i=0;i<edges.length&&!reduction;i++)for(let j=i+1;j<edges.length;j++){
   const a=edges[i],b=edges[j];
   if((a.from===b.from&&a.to===b.to)||(a.from===b.to&&a.to===b.from)){
    reduction={a,b,node:merge('parallel',a,orient(b,a.from))};break;
   }
  }
  if(!reduction)for(const net of internal){
   const incident=edges.filter(e=>e.from===net||e.to===net);
   if(incident.length!==2)continue;
   const [a,b]=incident,first=orient(a,a.from===net?a.to:a.from),second=orient(b,net);
   // A cycle returning to the same node is not a series path.
   if(first.from===second.to)continue;
   reduction={a,b,node:merge('series',first,second)};break;
  }
  if(!reduction)return null;
  const {a,b,node}=reduction;
  edges=edges.filter(e=>e!==a&&e!==b);edges.push(node);
 }
 const root=edges[0];
 if(!root||!((root.from===high&&root.to===low)||(root.from===low&&root.to===high)))return null;
 const ordered=orient(root,high),size=nestedDimensions(ordered);
 const depth=(n:SeriesParallelNode):number=>n.kind==='device'?1:1+Math.max(...n.children.map(depth));
 if(size.width>1440||size.height>2400||depth(ordered)>12)return null;
 return {source:{component:battery,from:positive,to:negative},root:ordered};
}
