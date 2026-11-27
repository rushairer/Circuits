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
 * networks. Each net owns one row and each device one column. This is a
 * general rail layout within that scope, not a planar graph optimizer or a solver.
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
 const rank=new Map(order.map((id,i)=>[id,i]));
 const row=(id:string)=>TOP+rank.get(id)!*ROW;
 const oriented=steps.map(s=>rank.get(s.from.netId!)!<rank.get(s.to.netId!)!?s:
  {component:s.component,from:s.to,to:s.from});
 oriented.sort((a,b)=>row(a.from.netId!)-row(b.from.netId!)||row(a.to.netId!)-row(b.to.netId!)||
  a.component.id.localeCompare(b.component.id,'en'));
 const placements=[{component:battery,from:positive,to:negative},...oriented];
 const devices:LayeredDevice[]=placements.map((step,i)=>{
  const top=row(step.from.netId!),bottom=row(step.to.netId!);
  return {step,x:i===0?SOURCE_X:FIRST_X+(i-1)*COLUMN,top,bottom,mid:top+68,crossings:[]};
 });
 const rails=order.map(id=>{
  const xs=devices.filter(d=>d.step.from.netId===id||d.step.to.netId===id).map(d=>d.x);
  const power=id===high||id===low;
  return {id,y:row(id),x1:power?120:270,x2:Math.max(...xs),labelX:power?38:225};
 });
 let count=0;
 for(const d of devices)for(const rail of rails)
  if(rail.y>d.top&&rail.y<d.bottom&&d.x>=rail.x1&&d.x<=rail.x2){
   d.crossings.push({netId:rail.id,y:rail.y});
   if(++count>LAYERED_MAX_CROSSINGS)return null;
  }
 return {width:Math.max(990,devices[devices.length-1].x+190),height:row(low)+65,high,low,rails,devices};
}
