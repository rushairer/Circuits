import type { Part, Wire } from '../model.js';
import { createPinResolver, orthogonalRoute, type Point } from './geometry.js';

/** Exact underlying wire strokes, not the broad transparent SVG hit paths or jump arcs. */
export interface WirePickCandidate {
 id:string;
 distancePx:number;
 /** Leg index in the visible polyline, NOT an electrical junction. */
 legIndex:number;
}
export interface WirePickCycle {
 id:string;
 ids:string[];
 x:number;
 y:number;
 at:number;
}
const finite=(n:number)=>Number.isFinite(n);
const validPoint=(p:Point)=>finite(p.x)&&finite(p.y);

/**
 * Ranks visual wire centerlines by true screen distance. Ties use stable model
 * order rather than the SVG painter stack, which changes on selection.
 * The route mirrors wire-crossings' *hitPath*: bridges are cosmetic only.
 */
export function wirePickCandidates(
 wires:readonly Wire[],parts:readonly Part[],point:Point,
 pixelsPerWorldUnit:number,tolerancePx=9
):WirePickCandidate[] {
 if(!validPoint(point)||!finite(pixelsPerWorldUnit)||pixelsPerWorldUnit<=0||
    !finite(tolerancePx)||tolerancePx<=0)return [];
 const radius=tolerancePx/pixelsPerWorldUnit;
 const resolve=createPinResolver(parts);
 const result:(WirePickCandidate & {order:number})[]=[];
 for(let order=0;order<wires.length;order++){
   const wire=wires[order],from=resolve(wire.from),to=resolve(wire.to);
   if(!from||!to)continue;
   const points=[from,...(wire.bends??[]),to];
   const route=wire.routing?orthogonalRoute(points,wire.routing):
     wire.bends?.length?points:
     [from,{x:(from.x+to.x)/2,y:from.y},{x:(from.x+to.x)/2,y:to.y},to];
   let best=Infinity,legIndex=-1;
   for(let i=1;i<route.length;i++){
     const a=route[i-1],b=route[i];
     if(!validPoint(a)||!validPoint(b)||
       point.x<Math.min(a.x,b.x)-radius||point.x>Math.max(a.x,b.x)+radius||
       point.y<Math.min(a.y,b.y)-radius||point.y>Math.max(a.y,b.y)+radius)continue;
     const dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy;
     if(len===0)continue;
     const t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/len));
     const d=(point.x-a.x-t*dx)**2+(point.y-a.y-t*dy)**2;
     if(d<best){best=d;legIndex=i-1;}
   }
   if(legIndex!==-1&&best<=radius*radius+1e-9)
     result.push({id:wire.id,distancePx:Math.sqrt(best)*pixelsPerWorldUnit,legIndex,order});
 }
 result.sort((a,b)=>a.distancePx-b.distancePx||a.order-b.order);
 return result.map(({id,distancePx,legIndex})=>({id,distancePx,legIndex}));
}

/** Repeated taps or Alt-click cycle only genuinely ambiguous strokes. */
export function pickWireCandidate(
 candidates:readonly WirePickCandidate[],previous:WirePickCycle|null,
 input:{x:number;y:number;at:number;altKey?:boolean;detail?:number},
 ambiguityPx=3
):{id:string|null;cycle:WirePickCycle|null} {
 if(!candidates.length||!finite(input.x)||!finite(input.y)||!finite(input.at))
   return {id:null,cycle:null};
 const first=candidates[0];
 const near=candidates.filter(c=>c.distancePx<=first.distancePx+ambiguityPx+1e-8);
 const ids=near.map(c=>c.id);
 const same=previous&&previous.ids.length===ids.length&&
   previous.ids.every((id,i)=>id===ids[i])&&
   Math.hypot(previous.x-input.x,previous.y-input.y)<=7;
 const elapsed=previous?input.at-previous.at:Infinity;
 // The dblclick handler uses the selected candidate after the second click.
 const cycle=!!same&&(input.altKey===true||(elapsed>=0&&elapsed<=1600));
 const next=cycle?ids[(ids.indexOf(previous!.id)+1)%ids.length]:first.id;
 return {id:next,cycle:{id:next,ids,x:input.x,y:input.y,at:input.at}};
}
