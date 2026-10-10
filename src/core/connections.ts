import { pins, type Endpoint, type Project, type Wire } from '../model.js';
import { pinWorld, type Point } from './geometry.js';

export interface TerminalHit { endpoint: Endpoint; point: Point; distance: number }

const same=(a:Endpoint,b:Endpoint)=>a.componentId===b.componentId&&a.pinId===b.pinId;
export const validTerminal=(project:Project,e:Endpoint):boolean=>{
  if(!e||typeof e.componentId!=='string'||typeof e.pinId!=='string')return false;
  const c=project.parts.find(p=>p.id===e.componentId);
  return Boolean(c&&Object.hasOwn(pins[c.kind],e.pinId));
};
export const identicalConnection=(a:Wire,b:Wire):boolean=>
  (same(a.from,b.from)&&same(a.to,b.to))||(same(a.from,b.to)&&same(a.to,b.from));

/** Search in world-space so camera zoom does not affect terminal identity. */
export function nearestTerminal(
 project:Project,target:Point,radius=13,exclude?:Endpoint,componentId?:string
):TerminalHit|null {
 if(!Number.isFinite(target.x)||!Number.isFinite(target.y)||!Number.isFinite(radius)||radius<=0)return null;
 let best:TerminalHit|null=null;
 for(const part of project.parts){
  if(componentId&&part.id!==componentId)continue;
  for(const pinId of Object.keys(pins[part.kind])){
   // These two pre-v0.2 aliases remain import-compatible but not selectable.
   if(part.kind==='breadboard'&&(pinId==='plus'||pinId==='minus'))continue;
   const endpoint={componentId:part.id,pinId};
   if(exclude&&same(endpoint,exclude))continue;
   const point=pinWorld(endpoint,[part]);
   if(!point)continue;
   const distance=Math.hypot(point.x-target.x,point.y-target.y);
   if(distance<=radius&&(!best||distance<best.distance-1e-9))best={endpoint,point,distance};
  }
 }
 return best;
}

/** Connections are defined by pin identities, not by where the wire is drawn. */
export function appendConnection(project:Project,wire:Wire):Project|null {
 if((wire.routing!==undefined&&wire.routing!=='horizontal'&&wire.routing!=='vertical')||
    (wire.bends!==undefined&&(!Array.isArray(wire.bends)||wire.bends.length>32||
      wire.bends.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>100000||Math.abs(p.y)>100000)))||
    !validTerminal(project,wire.from)||!validTerminal(project,wire.to)||
    same(wire.from,wire.to)||project.wires.some(w=>w.id===wire.id||identicalConnection(w,wire)))return null;
 return {...project,wires:[...project.wires,structuredClone(wire)]};
}

/** Change exactly one terminal and retain color, route bends and wire ID. */
export function reconnectEndpoint(
 project:Project,wireId:string,side:'from'|'to',terminal:Endpoint
):Project|null {
 const source=project.wires.find(w=>w.id===wireId);
 if(!source||!validTerminal(project,terminal))return null;
 if(same(source[side],terminal))return project;
 const changed={...source,[side]:{...terminal}};
 if(same(changed.from,changed.to))return null;
 if(project.wires.some(w=>w.id!==wireId&&identicalConnection(w,changed)))return null;
 return {...project,wires:project.wires.map(w=>w.id===wireId?changed:w)};
}
