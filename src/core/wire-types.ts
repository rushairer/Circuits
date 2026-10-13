import type { Part, Project, Wire } from '../model.js';
import { orthogonalRoute, wirePoints, type Point } from './geometry.js';

export const WIRE_TYPES=[
 {value:'normal',label:'普通线',shortcut:'Shift+1'},
 {value:'hookup',label:'杜邦跳线',shortcut:'Shift+2'},
 {value:'alligator',label:'鳄鱼夹线',shortcut:'Shift+3'},
 {value:'automatic',label:'自动匹配',shortcut:'Shift+4'}
] as const;
export type WireType=(typeof WIRE_TYPES)[number]['value'];
export const isWireType=(value:unknown):value is WireType=>
 value==='normal'||value==='hookup'||value==='alligator'||value==='automatic';

export function wireTypeForDigit(digit:string):WireType|null {
 const index=Number(digit);
 return /^[1-4]$/.test(digit)?WIRE_TYPES[index-1].value:null;
}

/**
 * Auto is a conservative visualization heuristic, not an Autodesk algorithm.
 * Exposed 9V battery terminals use clip ends; other terminals keep classic wire.
 * Do not conflate type resolution with physical pin topology.
 */
export function effectiveWireType(wire:Wire,parts:readonly Part[]):Exclude<WireType,'automatic'> {
 const specified=wire.type??'normal';
 if(specified!=='automatic')return specified;
 const componentA=parts.find(c=>c.id===wire.from.componentId);
 const componentB=parts.find(c=>c.id===wire.to.componentId);
 return componentA?.kind==='battery'||componentB?.kind==='battery'?'alligator':'normal';
}

/** A wire type is a visual/physical-connector annotation only: one undo for a batch. */
export function changeWireTypes(
 project:Project,ids:ReadonlySet<string>,type:WireType
):Project {
 if(!isWireType(type)||!ids.size)return project;
 let changed=false;
 const wires=project.wires.map(w=>{
   if(!ids.has(w.id)||(w.type??'normal')===type)return w;
   changed=true;return {...w,type};
 });
 return changed?{...project,wires}:project;
}

function actualVertices(wire:Wire,parts:readonly Part[]):Point[] {
 const pts=wirePoints(wire,parts);
 if(!pts||pts.length<2)return [];
 if(wire.routing)return orthogonalRoute(pts,wire.routing);
 if(wire.bends?.length)return pts;
 const a=pts[0],b=pts[pts.length-1],midX=(a.x+b.x)/2;
 return [a,{x:midX,y:a.y},{x:midX,y:b.y},b];
}
function pose(point:Point,near:Point):string {
 const angle=Math.atan2(near.y-point.y,near.x-point.x)*180/Math.PI;
 return 'translate('+point.x+' '+point.y+') rotate('+angle.toFixed(3)+')';
}

/**
 * Decorative shrouds/clips are pointer transparent, inside the conductors
 * paint sublayer and underneath real physical pins. No fake electrical nodes.
 * Normal wires emit no decoration at all, preserving alpha.10 paint fixtures.
 */
export function wireConnectorMarkup(wire:Wire,parts:readonly Part[]):string {
 const style=effectiveWireType(wire,parts);
 if(style==='normal')return '';
 const verts=actualVertices(wire,parts);
 if(verts.length<2)return '';
 const first=verts[0],last=verts[verts.length-1];
 const startNeighbour=verts.find(p=>p.x!==first.x||p.y!==first.y);
 const endNeighbour=[...verts].reverse().find(p=>p.x!==last.x||p.y!==last.y);
 if(!startNeighbour||!endNeighbour)return '';
 const shape=style==='hookup'?
   '<rect class="wire-plug" x="-8" y="-4.2" width="14" height="8.4" rx="2.3"/>'+
   '<rect class="wire-plug-tip" x="5" y="-3" width="5" height="6" rx=".7"/>':
   '<rect class="wire-clip-body" x="-8" y="-4.8" width="12" height="9.6" rx="2.5"/>'+
   '<path class="wire-clip-jaws" d="M2 -5 L12 -2 L9 0 L12 2 L2 5 Z"/>'+
   '<path class="wire-clip-teeth" d="M6 -2L9 0L6 2"/>';
 const cap=(p:Point,near:Point)=>
   '<g transform="'+pose(p,near)+'">'+shape+'</g>';
 return '<g class="wire-connectors" data-wire="'+wire.id+
   '" data-effective-wire-type="'+style+'" pointer-events="none">'+
   cap(first,startNeighbour)+cap(last,endNeighbour)+'</g>';
}
