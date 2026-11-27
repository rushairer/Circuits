import { pins } from '../model.js';
import type { SchematicDiagram } from './schematic.js';
import type { BranchStep } from './schematic-branches.js';

export const LAYERED_MAX_DEVICES=12;
export const LAYERED_MAX_NETS=10;
export const LAYERED_MAX_CROSSINGS=64;
const TOP=128,ROW=156,SOURCE_X=140,FIRST_X=350,COLUMN=210;
export interface LayeredRail {id:string;y:number;x1:number;x2:number;labelX:number}
export interface LayeredDevice {step:BranchStep;x:number;top:number;bottom:number;mid:number;crossings:{netId:string;y:number}[]}
export interface LayeredSchematic {width:number;height:number;high:string;low:string;rails:LayeredRail[];devices:LayeredDevice[]}

/** Bounded graph projection for complete, connected single-source two-terminal
 * networks. Each net owns one row; disjoint device intervals may share columns.
 * This is a bounded rail layout, not a planar graph optimizer or a solver.
 * Existing specialized layouts take precedence. */
export function layeredSchematic(diagram:SchematicDiagram):LayeredSchematic|null {
 const {components,nets}=diagram;
 if(components.length<3||components.length>LAYERED_MAX_DEVICES||
    nets.length<3||nets.length>LAYERED_MAX_NETS||diagram.unconnectedTerminals)return null;
 const known=new Set(nets.map(n=>n.id));
 if(known.size!==nets.length||new Set(components.map(c=>c.id)).size!==components.length)return null;
 const batteries=components.filter(c=>c.kind==='battery');
 if(batteries.length!==1)return null;
 const battery=batteries[0];
 const positive=battery.terminals.find(t=>t.pinId==='positive'),negative=battery.terminals.find(t=>t.pinId==='negative');
 if(!positive?.netId||!negative?.netId||positive.netId===negative.netId)return null;
 const high=positive.netId,low=negative.netId;
 const adjacency=new Map<string,Set<string>>([...known].map(id=>[id,new Set<string>()]));
 const members=new Map<string,string[]>([...known].map(id=>[id,[]]));
 const steps:BranchStep[]=[];
 for(const c of components){
  const ids=Object.keys(pins[c.kind]);
  if(c.kind==='breadboard'||ids.length!==2||c.terminals.length!==2)return null;
  const a=c.terminals.find(t=>t.pinId===ids[0]),b=c.terminals.find(t=>t.pinId===ids[1]);
  if(!a?.netId||!b?.netId||a.netId===b.netId||!known.has(a.netId)||!known.has(b.netId)||
     a.componentId!==c.id||b.componentId!==c.id)return null;
  members.get(a.netId)!.push(c.id+'::'+a.pinId);
  members.get(b.netId)!.push(c.id+'::'+b.pinId);
  if(c===battery)continue;
  adjacency.get(a.netId)!.add(b.netId);adjacency.get(b.netId)!.add(a.netId);
  steps.push({component:c,from:a,to:b});
 }
 // Do not drop board-only nets, dangling terminals, or inconsistent identities.
 for(const net of nets){
  const keys=members.get(net.id)!.sort();
  if(keys.length<2||keys.join('|')!==[...net.endpointKeys].sort().join('|'))return null;
 }
 // Rank nodes by graph distance from the actual positive terminal, not voltage.
 const distance=new Map<string,number>([[high,0]]),queue=[high];
 for(let i=0;i<queue.length;i++)for(const id of adjacency.get(queue[i])??[])
  if(!distance.has(id)){distance.set(id,distance.get(queue[i])!+1);queue.push(id);}
 if(distance.size!==known.size)return null;
 const order=[high,...[...known].filter(id=>id!==high&&id!==low)
  .sort((a,b)=>distance.get(a)!-distance.get(b)!||a.localeCompare(b,'en')),low];
 const source={component:battery,from:positive,to:negative};
 let best=placeLayered(order,steps,source);
 // Two bounded sweeps of adjacent internal rows. Keep the source rails fixed.
 // Accept strictly better geometry only; the original layout is a candidate.
 for(let pass=0;pass<2;pass++){
  let improved=false;
  for(let i=1;i<order.length-2;i++){
   const next=[...order];[next[i],next[i+1]]=[next[i+1],next[i]];
   const layout=placeLayered(next,steps,source);
   if(betterLayered(layout,best)){best=layout;order.splice(0,order.length,...next);improved=true;}
  }
  if(!improved)break;
 }
 return layeredScore(best)[0]<=LAYERED_MAX_CROSSINGS?best:null;
}

/** Geometry-only search. Pin and network identities are never rewritten. */
function placeLayered(order:string[],steps:BranchStep[],source:BranchStep):LayeredSchematic {
 const rank=new Map(order.map((id,i)=>[id,i]));
 const row=(id:string)=>TOP+rank.get(id)!*ROW;
 const oriented=steps.map(s=>rank.get(s.from.netId!)!<rank.get(s.to.netId!)!?s:
  {component:s.component,from:s.to,to:s.from});
 oriented.sort((a,b)=>row(a.from.netId!)-row(b.from.netId!)||row(a.to.netId!)-row(b.to.netId!)||
  a.component.id.localeCompare(b.component.id,'en'));
 const span=(s:BranchStep)=>row(s.to.netId!)-row(s.from.netId!);
 const orders=[oriented,[...oriented].reverse(),
  [...oriented].sort((a,b)=>span(b)-span(a)),[...oriented].sort((a,b)=>span(a)-span(b))];
 const high=order[0],low=order[order.length-1];
 function candidate(sequence:BranchStep[],compact:boolean):LayeredSchematic {
  const top=row(high),bottom=row(low);
  const devices:LayeredDevice[]=[{step:source,x:SOURCE_X,top,bottom,mid:top+68,crossings:[]}];
  const columns:LayeredDevice[][]=[];
  for(const step of sequence){
   const top=row(step.from.netId!),bottom=row(step.to.netId!);
   // Closed intervals must be disjoint: even a shared endpoint row reserves
   // its own column, so dots, leads and labels cannot obscure one another.
   let col=compact?columns.findIndex(group=>group.every(d=>d.bottom<top||bottom<d.top)):-1;
   if(col<0){col=columns.length;columns.push([]);}
   const d={step,x:FIRST_X+col*COLUMN,top,bottom,mid:top+68,crossings:[]};
   columns[col].push(d);devices.push(d);
  }
  const rails=order.map(id=>{
   const xs=devices.filter(d=>d.step.from.netId===id||d.step.to.netId===id).map(d=>d.x);
   const power=id===high||id===low;
   return {id,y:row(id),x1:power?120:270,x2:Math.max(...xs),labelX:power?38:225};
  });
  for(const d of devices)for(const rail of rails)
   if(rail.y>d.top&&rail.y<d.bottom&&d.x>=rail.x1&&d.x<=rail.x2)
    d.crossings.push({netId:rail.id,y:rail.y});
  return {width:Math.max(990,Math.max(...devices.map(d=>d.x))+190),height:row(low)+65,high,low,rails,devices};
 }
 let best=candidate(oriented,false);
 for(const sequence of orders)for(const compact of [true,false]){
  const next=candidate(sequence,compact);
  if(betterLayered(next,best))best=next;
 }
 return best;
}

function layeredScore(layout:LayeredSchematic):number[]{
 return [layout.devices.reduce((sum,d)=>sum+d.crossings.length,0),
  Math.max(...layout.devices.map(d=>d.x)),
  layout.rails.reduce((sum,r)=>sum+r.x2-r.x1,0)+layout.devices.reduce((sum,d)=>sum+d.bottom-d.top,0)];
}
function betterLayered(a:LayeredSchematic,b:LayeredSchematic):boolean {
 const x=layeredScore(a),y=layeredScore(b);
 for(let i=0;i<x.length;i++)if(x[i]!==y[i])return x[i]<y[i];
 return false;
}
