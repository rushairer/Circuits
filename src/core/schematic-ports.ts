import { pins } from '../model.js';
import type { SchematicComponent, SchematicDiagram, SchematicTerminal } from './schematic.js';

export const PORT_MAX_DEVICES=8;
export const PORT_MAX_NETS=10;
export const PORT_MAX_CROSSINGS=64;
const FIRST=80,COLUMN=320,PIN_TOP=150,PIN_GAP=38,RAIL_TOP=300,RAIL_GAP=44;
export interface PortTrack {
 terminal:SchematicTerminal; x:number; y:number; endY:number; crossings:{netId:string;y:number}[];
}
export interface PortDevice {component:SchematicComponent;x:number;tracks:PortTrack[]}
export interface PortRail {id:string;y:number;x1:number;x2:number}
export interface PortLayout {width:number;height:number;devices:PortDevice[];rails:PortRail[]}

/** A bounded component/port incidence layout for fully connected mixed-pin
 * circuits. Device membership is not an electrical union. Each real pin
 * has its own descending track, even if multiple pins share one net. */
export function portSchematic(diagram:SchematicDiagram):PortLayout|null {
 const {components,nets}=diagram;
 if(!components.length||components.length>PORT_MAX_DEVICES||!nets.length||
    nets.length>PORT_MAX_NETS||diagram.unconnectedTerminals||
    !components.some(c=>c.terminals.length===3))return null;
 const known=new Map(nets.map(n=>[n.id,n]));
 if(known.size!==nets.length||new Set(components.map(c=>c.id)).size!==components.length)return null;
 const members=new Map(nets.map(n=>[n.id,[] as PortTrack[]]));
 const devices:PortDevice[]=[];
 const sorted=[...components].sort((a,b)=>a.id.localeCompare(b.id,'en'));
 for(const component of sorted){
  const ids=Object.keys(pins[component.kind]);
  if(component.kind==='breadboard'||ids.length<2||ids.length>3||component.terminals.length!==ids.length)return null;
  const base=FIRST+devices.length*COLUMN,tracks:PortTrack[]=[];
  for(let i=0;i<ids.length;i++){
   const terminal=component.terminals.find(t=>t.pinId===ids[i]);
   if(!terminal?.netId||terminal.componentId!==component.id||!known.has(terminal.netId))return null;
   const track={terminal,x:base+260-i*55,y:PIN_TOP+i*PIN_GAP,endY:0,crossings:[]};
   tracks.push(track);members.get(terminal.netId)!.push(track);
  }
  devices.push({component,x:base+45,tracks});
 }
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
  for(const t of device.tracks)if(!seen.has(t.terminal.netId!)){
   seen.add(t.terminal.netId!);queue.push(t.terminal.netId!);
  }
 }
 if(seen.size!==nets.length)return null;
 const extent=(id:string)=>Math.max(...members.get(id)!.map(t=>t.x));
 // Shorter rails first reduce the number of unrelated descending tracks
 // passing through them. The ordering does not imply voltage or direction.
 const order=[...known.keys()].sort((a,b)=>extent(a)-extent(b)||a.localeCompare(b,'en'));
 const rails=order.map((id,i)=>({id,y:RAIL_TOP+i*RAIL_GAP,x1:80,x2:extent(id)}));
 const byId=new Map(rails.map(r=>[r.id,r]));
 let count=0;
 for(const device of devices)for(const track of device.tracks){
  track.endY=byId.get(track.terminal.netId!)!.y;
  track.crossings=rails.filter(r=>r.y<track.endY&&track.x>=r.x1&&track.x<=r.x2)
   .map(r=>({netId:r.id,y:r.y}));
  count+=track.crossings.length;
 }
 if(count>PORT_MAX_CROSSINGS)return null;
 return {width:Math.max(990,FIRST+devices.length*COLUMN),height:rails[rails.length-1].y+65,devices,rails};
}
