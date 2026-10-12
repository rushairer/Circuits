import type { Part, Wire } from '../model.js';
import { createPinResolver, orthogonalRoute, type Point } from './geometry.js';

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
export interface WireEndpointPreview { id:string; side:'from'|'to'; point:Point }
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

function visualVertices(w:Wire,points:Point[]|null):Point[]|null{
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
interface SegmentBounds { minX:number;maxX:number;minY:number;maxY:number }
interface SegmentTree extends SegmentBounds {
 firstWire:number;
 entries:readonly Segment[];
 children:readonly SegmentTree[];
}
function overlaps(a:SegmentBounds,b:SegmentBounds):boolean {
 return !(a.maxX<b.minX-EPS||a.minX>b.maxX+EPS||
          a.maxY<b.minY-EPS||a.minY>b.maxY+EPS);
}
/** Bounded broad phase; exact intersection and painter-order rules stay unchanged. */
function segmentTree(entries:readonly Segment[]):SegmentTree|null {
 if(!entries.length)return null;
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,firstWire=Infinity;
 for(const s of entries){
   minX=Math.min(minX,s.minX);maxX=Math.max(maxX,s.maxX);
   minY=Math.min(minY,s.minY);maxY=Math.max(maxY,s.maxY);
   firstWire=Math.min(firstWire,s.wireIndex);
 }
 const bounds={minX,maxX,minY,maxY,firstWire};
 if(entries.length<=8)return {...bounds,entries,children:[]};
 const horizontal=maxX-minX>=maxY-minY;
 const sorted=[...entries].sort((a,b)=>horizontal?
   (a.minX+a.maxX)-(b.minX+b.maxX):(a.minY+a.maxY)-(b.minY+b.maxY));
 const middle=Math.floor(sorted.length/2);
 return {...bounds,entries:[],children:[
   segmentTree(sorted.slice(0,middle))!,segmentTree(sorted.slice(middle))!
 ]};
}
/** Dense long diagonals overlap most boxes; a tree then adds only overhead. */
function shouldIndex(entries:readonly Segment[]):boolean {
 if(entries.length<256)return false;
 const sample=Array.from({length:24},(_,i)=>entries[Math.floor((i+0.5)*entries.length/24)]);
 let checks=0,hits=0;
 for(let i=0;i<sample.length;i++)for(let j=0;j<i;j++){
   if(sample[i].wireIndex===sample[j].wireIndex)continue;
   checks++;if(overlaps(sample[i],sample[j]))hits++;
 }
 return checks>0&&hits*4<checks;
}
function collectCrossings(
 above:Segment,segmentIndex:number,node:SegmentTree|null,radius:number,matches:Intersection[]
):void {
 if(!node||node.firstWire>=above.wireIndex||!overlaps(above,node))return;
 for(const below of node.entries){
   if(below.wireIndex>=above.wireIndex)continue;
   const hit=crossing(above,below,radius);
   if(hit)matches.push({segmentIndex,...hit});
 }
 for(const child of node.children)collectCrossings(above,segmentIndex,child,radius,matches);
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
 wires:readonly Wire[],parts:readonly Part[],bridgeRadius=DEFAULT_RADIUS,
 preview:WireEndpointPreview|null=null
):PaintedWire[] {
 if(!wires.length)return [];
 const resolvePin=createPinResolver(parts);
 const prepared=wires.map(w=>{
   const start=resolvePin(w.from),end=resolvePin(w.to);
   const points=start&&end?[start,...(w.bends??[]).map(p=>({...p})),end]:null;
   if(points&&preview?.id===w.id){
     const index=preview.side==='from'?0:points.length-1;
     points[index]={...preview.point};
   }
   const vertices=visualVertices(w,points);
   return {id:w.id,vertices,
     original:vertices?'M'+vertices.map(coordinate).join(' L'):''};
 });
 const plain=()=>prepared.map(w=>({id:w.id,hitPath:w.original,
   displayPath:w.original,bridgeBackdrops:[],bridgeCount:0}));
 const radius=Number.isFinite(bridgeRadius)?Math.max(2,Math.min(12,bridgeRadius)):DEFAULT_RADIUS;
 // Enforce the existing visual budget BEFORE allocating segments or the tree.
 const count=prepared.reduce((sum,w)=>sum+Math.max(0,(w.vertices?.length??0)-1),0);
 if(count>MAX_BRIDGE_SEGMENTS)return plain();
 const segments=prepared.map((w,i)=>w.vertices?
   w.vertices.slice(1).map((point,j)=>makeSegment(i,w.vertices![j],point)):[]);
 const flat=segments.flat();
 const index=shouldIndex(flat)?segmentTree(flat):null;
 const result:PaintedWire[]=[];
 for(let i=0;i<prepared.length;i++){
   const item=prepared[i],crosses:Intersection[]=[];
   if(!item.vertices||!item.original){result.push({id:item.id,hitPath:item.original,
     displayPath:item.original,bridgeBackdrops:[],bridgeCount:0});continue;}
   // Process visible legs in route order, stopping once the decoration budget
   // is full. Later legs cannot displace an earlier selected arch.
   for(let segmentIndex=0;segmentIndex<segments[i].length;segmentIndex++){
     const above=segments[i][segmentIndex],matches:Intersection[]=[];
     if(index)collectCrossings(above,segmentIndex,index,radius,matches);
     else for(let lower=0;lower<i;lower++)for(const below of segments[lower]){
       const hit=crossing(above,below,radius);
       if(hit)matches.push({segmentIndex,...hit});
     }
     matches.sort((a,b)=>a.t-b.t);
     for(const c of matches){
       const prev=crosses.at(-1);
       if(prev&&prev.segmentIndex===segmentIndex&&
         (c.t-prev.t)*above.length<radius*2+3)continue;
       crosses.push(c);
       if(crosses.length===MAX_BRIDGES_PER_WIRE)break;
     }
     if(crosses.length===MAX_BRIDGES_PER_WIRE)break;
   }
   const curved=bridgePath(item.vertices,crosses,radius);
   result.push({id:item.id,hitPath:item.original,
     displayPath:curved?.d??item.original,
     bridgeBackdrops:curved?.backdrops??[],
     bridgeCount:curved?.backdrops.length??0});
 }
 return result;
}
