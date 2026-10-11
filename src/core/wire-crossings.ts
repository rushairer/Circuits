import type { Part, Wire } from '../model.js';
import { orthogonalRoute, wirePath, wirePoints, type Point } from './geometry.js';

/**
 * A jumper wire is physically above/below another at an interior crossing,
 * but the cross is NOT a netlist contact. Arches and their white insulation
 * underlays are view-only: no persisted wire waypoints or junctions are added.
 */
export interface PaintedWire {
 id:string;
 /** Exact unmodified model path: also used for the generous mouse hit area. */
 hitPath:string;
 /** Stroke path with a Q arch substituted at visually crossing segments. */
 displayPath:string;
 /** Tiny arc backdrops, with pointer-events disabled in the SVG scene. */
 bridgeBackdrops:readonly string[];
 bridgeCount:number;
}
interface Segment {
 wireIndex:number;
 from:Point;
 to:Point;
 length:number;
 minX:number;maxX:number;minY:number;maxY:number;
}
interface Intersection { segmentIndex:number; t:number; at:Point }
const EPS=1e-8;
const DEFAULT_RADIUS=6;
/** Hard rendering budget: complex circuits remain responsive, without modifying topology. */
export const MAX_BRIDGE_SEGMENTS=720;
export const MAX_BRIDGES_PER_WIRE=24;
const coordinate=(p:Point)=>p.x+' '+p.y;
const subtract=(a:Point,b:Point)=>({x:a.x-b.x,y:a.y-b.y});
const cross=(a:Point,b:Point)=>a.x*b.y-a.y*b.x;
const at=(a:Point,b:Point,t:number):Point=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});

function visualVertices(w:Wire,parts:readonly Part[]):Point[]|null{
 const points=wirePoints(w,parts);
 if(!points)return null;
 if(w.routing)return orthogonalRoute(points,w.routing);
 if(w.bends?.length)return points;
 const a=points[0],b=points[points.length-1],mid=(a.x+b.x)/2;
 return [a,{x:mid,y:a.y},{x:mid,y:b.y},b];
}
function makeSegment(wireIndex:number,from:Point,to:Point):Segment{
 return {wireIndex,from,to,length:Math.hypot(to.x-from.x,to.y-from.y),
   minX:Math.min(from.x,to.x),maxX:Math.max(from.x,to.x),
   minY:Math.min(from.y,to.y),maxY:Math.max(from.y,to.y)};
}
function crossing(over:Segment,under:Segment,radius:number):{t:number;at:Point}|null {
 if(over.maxX<under.minX-EPS||over.minX>under.maxX+EPS||
    over.maxY<under.minY-EPS||over.minY>under.maxY+EPS)return null;
 const v=subtract(over.to,over.from),w=subtract(under.to,under.from);
 const denominator=cross(v,w);
 if(Math.abs(denominator)<EPS||!over.length||!under.length)return null;
 const delta=subtract(under.from,over.from);
 const t=cross(delta,w)/denominator,u=cross(delta,v)/denominator;
 // A shared wire endpoint, T-end or elbow is not a free-space crossover.
 if(t<=EPS||t>=1-EPS||u<=EPS||u>=1-EPS)return null;
 if(Math.min(t,1-t)*over.length<radius+2)return null;
 if(Math.min(u,1-u)*under.length<radius+2)return null;
 return {t,at:at(over.from,over.to,t)};
}
function normal(from:Point,to:Point):Point{
 const dx=to.x-from.x,dy=to.y-from.y,len=Math.hypot(dx,dy);
 // The hump goes toward the top of the editor for mostly horizontal legs
 // and toward the right for mostly vertical ones, independent of wire order.
 const base={x:-dy/len,y:dx/len};
 const invert=Math.abs(dx)>=Math.abs(dy)?base.y>0:base.x<0;
 return invert?{x:-base.x,y:-base.y}:base;
}
function bridgePath(vertices:readonly Point[],crosses:readonly Intersection[],radius:number){
 if(!crosses.length)return null;
 let d='M'+coordinate(vertices[0]);
 const backdrops:string[]=[];
 for(let i=0;i<vertices.length-1;i++){
   const from=vertices[i],to=vertices[i+1],len=Math.hypot(to.x-from.x,to.y-from.y);
   const matches=crosses.filter(c=>c.segmentIndex===i).sort((a,b)=>a.t-b.t);
   let previous=-Infinity;
   for(const crossing of matches){
     if((crossing.t*len-previous)<radius*2+3)continue;
     const start=at(from,to,crossing.t-radius/len);
     const end=at(from,to,crossing.t+radius/len);
     const n=normal(from,to),control={
       x:crossing.at.x+n.x*radius*2,
       y:crossing.at.y+n.y*radius*2
     };
     const arc='M'+coordinate(start)+' Q'+coordinate(control)+' '+coordinate(end);
     d+=' L'+coordinate(start)+' Q'+coordinate(control)+' '+coordinate(end);
     backdrops.push(arc);
     previous=crossing.t*len;
   }
   d+=' L'+coordinate(to);
 }
 return {d,backdrops};
}
/**
 * The supplied order is the actual SVG painter order (the last wire is
 * visible above earlier conductors). No paths or crossings change the
 * electrical model, and the project is never mutated.
 */
export function paintCrossingWires(
 wires:readonly Wire[],parts:readonly Part[],bridgeRadius=DEFAULT_RADIUS
):PaintedWire[] {
 const prepared=wires.map(w=>{
   const vertices=visualVertices(w,parts);
   const points=wirePoints(w,parts);
   return {id:w.id,vertices,
     original:points?wirePath(points,Boolean(w.bends?.length),w.routing):''};
 });
 const plain=()=>prepared.map(w=>({id:w.id,hitPath:w.original,
   displayPath:w.original,bridgeBackdrops:[],bridgeCount:0}));
 const radius=Number.isFinite(bridgeRadius)?Math.max(2,Math.min(12,bridgeRadius)):DEFAULT_RADIUS;
 const segments=prepared.map((w,i)=>w.vertices?
   w.vertices.slice(1).map((point,j)=>makeSegment(i,w.vertices![j],point)):[]);
 const count=segments.reduce((sum,list)=>sum+list.length,0);
 if(count>MAX_BRIDGE_SEGMENTS)return plain();
 const result:PaintedWire[]=[];
 for(let i=0;i<prepared.length;i++){
   const item=prepared[i],crosses:Intersection[]=[];
   if(!item.vertices||!item.original){result.push({id:item.id,hitPath:item.original,
     displayPath:item.original,bridgeBackdrops:[],bridgeCount:0});continue;}
   for(let segmentIndex=0;segmentIndex<segments[i].length;segmentIndex++){
     const above=segments[i][segmentIndex];
     for(let lower=0;lower<i;lower++){
       for(const below of segments[lower]){
         const hit=crossing(above,below,radius);
         if(hit)crosses.push({segmentIndex,...hit});
       }
     }
   }
   // Avoid excessive SVG markup in high-density designs. Prefer earliest
   // crossings, and never let very close arches overlap on the same leg.
   crosses.sort((a,b)=>a.segmentIndex-b.segmentIndex||a.t-b.t);
   const chosen:Intersection[]=[];
   for(const c of crosses){
     const prev=chosen.at(-1);
     if(prev&&prev.segmentIndex===c.segmentIndex&&
       (c.t-prev.t)*segments[i][c.segmentIndex].length<radius*2+3)continue;
     chosen.push(c);
     if(chosen.length===MAX_BRIDGES_PER_WIRE)break;
   }
   const curved=bridgePath(item.vertices,chosen,radius);
   result.push({id:item.id,hitPath:item.original,
     displayPath:curved?.d??item.original,
     bridgeBackdrops:curved?.backdrops??[],
     bridgeCount:curved?.backdrops.length??0});
 }
 return result;
}
