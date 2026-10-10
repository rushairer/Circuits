import type { Part, Project, Wire } from '../model.js';
import { orthogonalRoute, pinWorld, snap, wirePoints, type Point } from './geometry.js';

export type SegmentAxis='horizontal'|'vertical';
export interface VisibleWireSegment {
 index:number;
 from:Point;
 to:Point;
 axis:SegmentAxis;
 distance:number;
}
export interface SlidWireSegment {
 project:Project;
 /** Point handle index in the persisted wire's bends array. */
 bendIndex:number;
 displacement:number;
}
const valid=(point:Point)=>Number.isFinite(point.x)&&Number.isFinite(point.y)&&
  Math.abs(point.x)<=100000&&Math.abs(point.y)<=100000;
const same=(a:Point,b:Point)=>a.x===b.x&&a.y===b.y;
const parallel=(a:Point,b:Point,c:Point)=>
  (a.x===b.x&&b.x===c.x)||(a.y===b.y&&b.y===c.y);

/** Remove invisible zero-length/redundant collinear vertices, never change shape. */
function simplify(points:readonly Point[]):Point[]{
 const result:Point[]=[];
 for(const p of points){
   if(result.length&&same(result[result.length-1],p))continue;
   const previous=result[result.length-1],before=result[result.length-2];
   if(previous&&before&&parallel(before,previous,p)&&
       (previous.x-before.x)*(p.x-previous.x)+(previous.y-before.y)*(p.y-previous.y)>=0)
     result[result.length-1]={...p};
   else result.push({...p});
 }
 return result;
}

/**
 * Geometry of the CURRENTLY VISIBLE path. An untagged wire with manually
 * authored bends is a legacy literal polyline and must not be auto-converted
 * into a new orthogonal route during a segment drag.
 */
export function orthogonalWireVertices(wire:Wire,parts:readonly Part[]):Point[]|null{
 const pts=wirePoints(wire,parts);
 if(!pts)return null;
 if(wire.routing)return simplify(orthogonalRoute(pts,wire.routing));
 if(wire.bends?.length)return null;
 const start=pts[0],end=pts[pts.length-1],midX=(start.x+end.x)/2;
 return simplify([start,{x:midX,y:start.y},{x:midX,y:end.y},end]);
}

/**
 * Nearest actually painted horizontal/vertical segment.
 * Calling this on a legacy, manually bent, possibly diagonal path returns
 * null; its old waypoint drag behavior stays available.
 */
export function nearestOrthogonalSegment(
 wire:Wire,parts:readonly Part[],target:Point
):VisibleWireSegment|null {
 const points=orthogonalWireVertices(wire,parts);
 if(!points||!valid(target))return null;
 let best:VisibleWireSegment|null=null;
 for(let i=0;i<points.length-1;i++){
   const a=points[i],b=points[i+1],dx=b.x-a.x,dy=b.y-a.y;
   const len=dx*dx+dy*dy;
   if(!len||(dx!==0&&dy!==0))continue;
   const t=Math.max(0,Math.min(1,((target.x-a.x)*dx+(target.y-a.y)*dy)/len));
   const dist=Math.hypot(target.x-a.x-t*dx,target.y-a.y-t*dy);
   if(!best||dist<best.distance-1e-8)
     best={index:i,from:{...a},to:{...b},
       axis:dx===0?'vertical':'horizontal',distance:dist};
 }
 return best;
}

/**
 * Slide one whole orthogonal leg strictly along its normal axis. The two
 * electrical terminals NEVER move. In the interior, adjacent perpendicular
 * legs lengthen/shorten naturally; terminal-adjacent legs gain doglegs so
 * the pin stays fixed. Persist actual corners as waypoints, retaining the
 * project's schema-v2 and wire id/color/topology.
 *
 * IMPORTANT: delta is from pointer DOWN to current pointer, not cumulative.
 * Call on the gesture's original project snapshot on every pointer move.
 */
export function slideOrthogonalSegment(
 project:Project,wireId:string,segmentIndex:number,worldDelta:Point,grid:number|null=null
):SlidWireSegment|null {
 const wire=project.wires.find(w=>w.id===wireId);
 if(!wire||!valid(worldDelta)||!Number.isInteger(segmentIndex))return null;
 const points=orthogonalWireVertices(wire,project.parts);
 if(!points||segmentIndex<0||segmentIndex>=points.length-1)return null;
 const a=points[segmentIndex],b=points[segmentIndex+1];
 const axis:SegmentAxis|null=a.y===b.y&&a.x!==b.x?'horizontal':
   a.x===b.x&&a.y!==b.y?'vertical':null;
 if(axis!=='horizontal'&&axis!=='vertical')return null;
 // Drag the cross-axis ONLY. This is the physical on-screen "slide" gesture.
 const raw=axis==='horizontal'?worldDelta.y:worldDelta.x;
 const delta=grid?snap(raw,grid):raw;
 if(!Number.isFinite(delta)||delta===0)return null;
 const move=(point:Point):Point=>axis==='horizontal'?
   {x:point.x,y:point.y+delta}:{x:point.x+delta,y:point.y};
 const movedA=move(a),movedB=move(b);
 const interior:Point[]=[
   ...points.slice(0,segmentIndex),
   ...(segmentIndex===0?[{...a}]:[]),
   movedA,movedB,
   ...(segmentIndex===points.length-2?[{...b}]:[]),
   ...points.slice(segmentIndex+2)
 ];
 // Keep endpoints untouched and ensure every straight leg is orthogonal.
 if(!same(interior[0],points[0])||!same(interior[interior.length-1],points[points.length-1])||
   interior.some(p=>!valid(p)))return null;
 for(let i=1;i<interior.length;i++)
   if(interior[i-1].x!==interior[i].x&&interior[i-1].y!==interior[i].y)return null;
 const simplified=simplify(interior);
 const bends=simplified.slice(1,-1);
 if(bends.length>32)return null;
 const replacement:Wire={...wire,
   routing:wire.routing??'horizontal',
   bends};
 const final:Project={...project,wires:project.wires.map(w=>w.id===wireId?replacement:w)};
 // The handle is a persistent interior vertex, not a synthetic electrical joint.
 const handle=simplified.findIndex((p,i)=>i>0&&i<simplified.length-1&&same(p,movedA));
 return {project:final,bendIndex:Math.max(0,Math.min(bends.length-1,handle-1)),displacement:delta};
}
