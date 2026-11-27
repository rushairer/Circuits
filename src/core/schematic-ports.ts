import { pins } from '../model.js';
import type { SchematicComponent, SchematicDiagram, SchematicTerminal } from './schematic.js';

export const PORT_MAX_DEVICES=8;
export const PORT_MAX_NETS=10;
export const PORT_MAX_CROSSINGS=64;
const FIRST=80,PIN_TOP=150,PIN_GAP=38,RAIL_TOP=300,RAIL_GAP=44;
// Keep independent tracks, sufficient clearance for the 10px bridge and
// a fixed label corridor before the innermost pin. Two-pin devices need
// one fewer track; NC pins still keep their own anchor.
const INNER_TRACK=170,TRACK_GAP=40,COLUMN_GUARD=20;
export interface PortTrack {
 terminal:SchematicTerminal; x:number; y:number; endY:number|null; crossings:{netId:string;y:number}[];
}
export interface PortDevice {component:SchematicComponent;x:number;columnWidth:number;tracks:PortTrack[]}
export interface PortRail {id:string;y:number;x1:number;x2:number}
export interface PortLayout {width:number;height:number;devices:PortDevice[];rails:PortRail[]}

/** A bounded component/port incidence layout for connected mixed-pin
 * circuits with optional unused pins. Device membership is not an electrical
 * union. NC pins keep their symbol anchors but never receive a rail. */
export function portSchematic(diagram:SchematicDiagram):PortLayout|null {
 const {components,nets}=diagram;
 if(!components.length||components.length>PORT_MAX_DEVICES||!nets.length||
    nets.length>PORT_MAX_NETS||
    !components.some(c=>c.terminals.length===3))return null;
 const known=new Map(nets.map(n=>[n.id,n]));
 if(known.size!==nets.length||new Set(components.map(c=>c.id)).size!==components.length)return null;
 const members=new Map(nets.map(n=>[n.id,[] as PortTrack[]]));
 const devices:PortDevice[]=[];
 const sorted=[...components].sort((a,b)=>a.id.localeCompare(b.id,'en'));
 let unused=0,nextBase=FIRST;
 for(const component of sorted){
  const ids=Object.keys(pins[component.kind]);
  if(component.kind==='breadboard'||ids.length<2||ids.length>3||component.terminals.length!==ids.length)return null;
  const base=nextBase,columnWidth=INNER_TRACK+(ids.length-1)*TRACK_GAP+COLUMN_GUARD;
  const tracks:PortTrack[]=[];
  for(let i=0;i<ids.length;i++){
   const terminal=component.terminals.find(t=>t.pinId===ids[i]);
   if(!terminal||terminal.componentId!==component.id||
      (terminal.netId!==null&&!known.has(terminal.netId)))return null;
   const track:PortTrack={terminal,x:base+INNER_TRACK+(ids.length-1-i)*TRACK_GAP,y:PIN_TOP+i*PIN_GAP,endY:null,crossings:[]};
   tracks.push(track);
   if(terminal.netId===null)unused++;
   else members.get(terminal.netId)!.push(track);
  }
  // Keep wholly disconnected devices in the complete fallback view.
  if(!tracks.some(t=>t.terminal.netId!==null))return null;
  devices.push({component,x:base+45,columnWidth,tracks});
  nextBase+=columnWidth;
 }
 if(unused!==diagram.unconnectedTerminals)return null;
 for(const net of nets){
  const tracks=members.get(net.id)!;
  const keys=tracks.map(t=>t.terminal.componentId+'::'+t.terminal.pinId).sort();
  if(!keys.length||keys.length+net.boardContacts.length<2||
     keys.join('|')!==[...net.endpointKeys].sort().join('|'))return null;
 }
 // Connectedness of the incidence graph, not electrical continuity through
 // a device. Independent islands retain the established complete fallback.
 const seen=new Set<string>([nets[0].id]);
 const queue=[nets[0].id];
 for(let i=0;i<queue.length;i++)for(const device of devices){
  if(!device.tracks.some(t=>t.terminal.netId===queue[i]))continue;
  for(const t of device.tracks){
   const id=t.terminal.netId;
   if(id!==null&&!seen.has(id)){seen.add(id);queue.push(id);}
  }
 }
 if(seen.size!==nets.length)return null;
 const extent=(id:string)=>Math.max(...members.get(id)!.map(t=>t.x));
 // Shorter rails first is the baseline. For adjacent rails only their
 // mutual crossing contribution changes on a swap; accept strict gains.
 const order=[...known.keys()].sort((a,b)=>extent(a)-extent(b)||a.localeCompare(b,'en'));
 const cost=(first:string,second:string)=>members.get(second)!.filter(t=>t.x<=extent(first)).length;
 for(let pass=0;pass<2;pass++)for(let i=0;i+1<order.length;i++){
  const a=order[i],b=order[i+1];
  if(cost(b,a)<cost(a,b)){order[i]=b;order[i+1]=a;}
 }
 const rails=order.map((id,i)=>({id,y:RAIL_TOP+i*RAIL_GAP,x1:80,x2:extent(id)}));
 const byId=new Map(rails.map(r=>[r.id,r]));
 let count=0;
 for(const device of devices)for(const track of device.tracks){
  if(track.terminal.netId===null)continue;
  const endY=byId.get(track.terminal.netId)!.y;
  track.endY=endY;
  track.crossings=rails.filter(r=>r.y<endY&&track.x>=r.x1&&track.x<=r.x2)
   .map(r=>({netId:r.id,y:r.y}));
  count+=track.crossings.length;
 }
 if(count>PORT_MAX_CROSSINGS)return null;
 return {width:Math.max(990,nextBase),height:rails[rails.length-1].y+65,devices,rails};
}
