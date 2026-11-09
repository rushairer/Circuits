import { pins, size, type Endpoint, type Part, type Wire } from '../model.js';
import { orthogonalRoute, createPinResolver, type Point, type WireDirection } from './geometry.js';

/**
 * View-only, deterministic clearance router. Physical connectivity remains
 * exclusively the authored wire endpoints. Manually authored waypoints and
 * untagged legacy wires retain their existing shapes.
 */
export const AUTO_ROUTE_PART_LIMIT=240;
export const AUTO_ROUTE_OBSTACLE_LIMIT=18;
const CLEARANCE=13;
const OUTSIDE=7;
const BEND_COST=28;
const EPS=1e-7;
type Axis=0|1|2;
interface Bounds {left:number;right:number;top:number;bottom:number}
const finite=(p:Point)=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&
 Math.abs(p.x)<=100000&&Math.abs(p.y)<=100000;
const same=(a:Point,b:Point)=>Math.abs(a.x-b.x)<EPS&&Math.abs(a.y-b.y)<EPS;
const coordinate=(p:Point)=>p.x+' '+p.y;
const box=(part:Part):Bounds=>{
 const [w,h]=size[part.kind],cx=part.x+w/2,cy=part.y+h/2;
 const rad=part.rotation*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad);
 const ex=Math.abs(w*c)/2+Math.abs(h*s)/2;
 const ey=Math.abs(w*s)/2+Math.abs(h*c)/2;
 return {left:cx-ex-CLEARANCE,right:cx+ex+CLEARANCE,
  top:cy-ey-CLEARANCE,bottom:cy+ey+CLEARANCE};
};
const intersects=(a:Bounds,b:Bounds)=>a.right>=b.left&&a.left<=b.right&&
 a.bottom>=b.top&&a.top<=b.bottom;
const inside=(p:Point,b:Bounds)=>p.x>b.left+EPS&&p.x<b.right-EPS&&
 p.y>b.top+EPS&&p.y<b.bottom-EPS;
/** Strict interior crossing; touching a clean lane boundary is not an obstruction. */
function blocked(a:Point,b:Point,boxes:readonly Bounds[]):boolean {
 for(const r of boxes){
  if(Math.abs(a.y-b.y)<EPS){
   if(a.y>r.top+EPS&&a.y<r.bottom-EPS&&
     Math.max(Math.min(a.x,b.x),r.left)<Math.min(Math.max(a.x,b.x),r.right)-EPS)
     return true;
  }else if(Math.abs(a.x-b.x)<EPS){
   if(a.x>r.left+EPS&&a.x<r.right-EPS&&
     Math.max(Math.min(a.y,b.y),r.top)<Math.min(Math.max(a.y,b.y),r.bottom)-EPS)
     return true;
  }else return true;
 }
 return false;
}
function simplify(points:readonly Point[]):Point[]{
 const out:Point[]=[];
 for(const p of points){
  if(out.length&&same(out[out.length-1],p))continue;
  const a=out[out.length-2],b=out[out.length-1];
  if(a&&b&&((Math.abs(a.x-b.x)<EPS&&Math.abs(b.x-p.x)<EPS)||
             (Math.abs(a.y-b.y)<EPS&&Math.abs(b.y-p.y)<EPS))){
   out[out.length-1]={...p};
  }else out.push({...p});
 }
 return out;
}
/** Exit along the real component's rotated pin-facing edge, outside its label/body. */
function escapePort(endpoint:Endpoint,position:Point,part:Part|undefined):Point|null{
 if(!part||part.kind==='breadboard')return {...position};
 const raw=pins[part.kind][endpoint.pinId];
 if(!raw)return null;
 const rot=((part.rotation%360)+360)%360;
 if(Math.abs(rot/90-Math.round(rot/90))>1e-8)return null;
 const [w,h]=size[part.kind];
 const sides=[
  {gap:raw[0],dx:-1,dy:0},
  {gap:w-raw[0],dx:1,dy:0},
  {gap:raw[1],dx:0,dy:-1},
  {gap:h-raw[1],dx:0,dy:1}
 ].sort((a,b)=>a.gap-b.gap);
 const side=sides[0],turn=Math.round(rot/90)%4;
 const dx=[side.dx,-side.dy,-side.dx,side.dy][turn];
 const dy=[side.dy,side.dx,-side.dy,-side.dx][turn];
 const rect=box(part);
 if(dx===1)return {x:rect.right+OUTSIDE,y:position.y};
 if(dx===-1)return {x:rect.left-OUTSIDE,y:position.y};
 if(dy===1)return {x:position.x,y:rect.bottom+OUTSIDE};
 return {x:position.x,y:rect.top-OUTSIDE};
}
interface Item {id:number;axis:Axis;g:number;f:number}
class Queue {
 private data:Item[]=[];
 get length(){return this.data.length;}
 push(p:Item){
  const a=this.data;let i=a.length;a.push(p);
  while(i>0){
   const parent=(i-1)>>1;
   if(a[parent].f<=p.f)break;
   a[i]=a[parent];i=parent;
  }
  a[i]=p;
 }
 pop():Item|undefined{
  const a=this.data,first=a[0],last=a.pop();
  if(!a.length||!last)return first;
  let i=0;
  while(i*2+1<a.length){
   let child=i*2+1;
   if(child+1<a.length&&a[child+1].f<a[child].f)child++;
   if(a[child].f>=last.f)break;
   a[i]=a[child];i=child;
  }
  a[i]=last;return first;
 }
}
function orthogonalSearch(from:Point,to:Point,boxes:readonly Bounds[],direction:WireDirection):Point[]|null{
 const xs=[from.x,to.x],ys=[from.y,to.y];
 for(const b of boxes){
  xs.push(b.left-OUTSIDE,b.right+OUTSIDE);
  ys.push(b.top-OUTSIDE,b.bottom+OUTSIDE);
 }
 const unique=(a:number[])=>[...new Set(a.map(n=>Number(n.toFixed(6))))].sort((a,b)=>a-b);
 const xx=unique(xs),yy=unique(ys),rows=yy.length,cols=xx.length;
 if(cols*rows>2000)return null;
 const point=(id:number)=>({x:xx[Math.floor(id/rows)],y:yy[id%rows]});
 const index=(p:Point)=>{
  const col=xx.findIndex(x=>Math.abs(x-p.x)<1e-5);
  const row=yy.findIndex(y=>Math.abs(y-p.y)<1e-5);
  return col<0||row<0?-1:col*rows+row;
 };
 const start=index(from),goal=index(to);
 if(start<0||goal<0)return null;
 const passable=new Uint8Array(rows*cols);
 for(let id=0;id<passable.length;id++){
  const p=point(id);
  passable[id]=boxes.some(b=>inside(p,b))?0:1;
 }
 if(!passable[start]||!passable[goal])return null;
 const best=new Float64Array(rows*cols*3).fill(Infinity);
 const parent=new Int32Array(best.length).fill(-1);
 const heap=new Queue();
 const heuristic=(p:Point)=>Math.abs(p.x-to.x)+Math.abs(p.y-to.y);
 best[start*3]=0;heap.push({id:start,axis:0,g:0,f:heuristic(from)});
 let terminal=-1,steps=0;
 while(heap.length&&steps++<15000){
  const cur=heap.pop()!,slot=cur.id*3+cur.axis;
  if(cur.g>best[slot]+EPS)continue;
  if(cur.id===goal){terminal=slot;break;}
  const col=Math.floor(cur.id/rows),row=cur.id%rows,p=point(cur.id);
  const neighbors=[
   ...(col>0?[cur.id-rows]:[]),
   ...(col+1<cols?[cur.id+rows]:[]),
   ...(row>0?[cur.id-1]:[]),
   ...(row+1<rows?[cur.id+1]:[])
  ];
  for(const n of neighbors){
   if(!passable[n])continue;
   const target=point(n);
   if(blocked(p,target,boxes))continue;
   const axis:Axis=cur.id%rows===n%rows?1:2;
   const firstBias=cur.axis===0&&axis!==(direction==='horizontal'?1:2)?12:0;
   const delta=Math.abs(p.x-target.x)+Math.abs(p.y-target.y)+
     (cur.axis&&cur.axis!==axis?BEND_COST:0)+firstBias;
   const g=cur.g+delta,next=n*3+axis;
   if(g+EPS>=best[next])continue;
   best[next]=g;parent[next]=slot;
   heap.push({id:n,axis,g,f:g+heuristic(target)});
  }
 }
 if(terminal<0)return null;
 const reversed:Point[]=[];
 let cursor=terminal;
 while(cursor>=0){
  reversed.push(point(Math.floor(cursor/3)));
  cursor=parent[cursor];
 }
 return simplify(reversed.reverse());
}
/**
 * Auto-avoidance is offered for routed, unbent wires only. It does not rewrite
 * authored waypoints. Breadboards are pass-through substrates: jumper wires
 * are intentionally visible on top of their sockets, not hidden behind them.
 */
export function visibleWireVertices(
 wire:Wire,parts:readonly Part[],providedPoints?:readonly Point[]
):Point[]|null {
 const points=providedPoints?providedPoints.map(p=>({...p})):(()=>{
  const pin=createPinResolver(parts),a=pin(wire.from),b=pin(wire.to);
  return a&&b?[a,...(wire.bends??[]).map(p=>({...p})),b]:null;
 })();
 if(!points||points.length<2)return null;
 if(wire.bends?.length)return wire.routing?orthogonalRoute(points,wire.routing):points;
 if(!wire.routing){
  const a=points[0],b=points.at(-1)!;
  const mx=(a.x+b.x)/2;
  return [a,{x:mx,y:a.y},{x:mx,y:b.y},b];
 }
 const fallback=orthogonalRoute(points,wire.routing);
 if(parts.length>AUTO_ROUTE_PART_LIMIT||points.some(p=>!finite(p)))return fallback;
 const from=points[0],to=points.at(-1)!;
 const find=(ep:Endpoint)=>parts.find(p=>p.id===ep.componentId);
 const source=find(wire.from),dest=find(wire.to);
 const start=escapePort(wire.from,from,source);
 const end=escapePort(wire.to,to,dest);
 if(!start||!end||!finite(start)||!finite(end))return fallback;
 const corridor:Bounds={
  left:Math.min(start.x,end.x)-230,right:Math.max(start.x,end.x)+230,
  top:Math.min(start.y,end.y)-230,bottom:Math.max(start.y,end.y)+230
 };
 const boxes=parts.filter(p=>p.kind!=='breadboard')
  .map(p=>({id:p.id,bounds:box(p)})).filter(item=>intersects(item.bounds,corridor))
  .sort((a,b)=>{
   const relevance=(r:Bounds)=>Math.max(0,Math.max(r.left-Math.max(start.x,end.x),Math.min(start.x,end.x)-r.right))+
    Math.max(0,Math.max(r.top-Math.max(start.y,end.y),Math.min(start.y,end.y)-r.bottom));
   return relevance(a.bounds)-relevance(b.bounds)||a.id.localeCompare(b.id);
  }).slice(0,AUTO_ROUTE_OBSTACLE_LIMIT).map(item=>item.bounds);
 if(boxes.some(b=>inside(start,b)||inside(end,b)))return fallback;
 const path=orthogonalSearch(start,end,boxes,wire.routing);
 if(!path)return fallback;
 const combined=simplify([from,start,...path,end,to]);
 // Pins and all manual connections retain exact identity and coordinates.
 if(!same(combined[0],from)||!same(combined.at(-1)!,to))return fallback;
 return combined;
}
export function visibleWirePath(wire:Wire,parts:readonly Part[],points?:readonly Point[]):string{
 const vertices=visibleWireVertices(wire,parts,points);
 return vertices?'M'+vertices.map(coordinate).join(' L'):'';
}
