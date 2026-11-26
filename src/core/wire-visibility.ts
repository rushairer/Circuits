import { pins, size, type Endpoint, type Part, type Wire, type Project } from '../model.js';
import { orthogonalRoute, createPinResolver, type Point, type WireDirection } from './geometry.js';

/**
 * View-only, deterministic clearance router. Physical connectivity remains
 * exclusively the authored wire endpoints. Manually authored waypoints and
 * untagged legacy wires retain their existing shapes.
 */
export const AUTO_ROUTE_PART_LIMIT=300;
export const AUTO_ROUTE_OBSTACLE_LIMIT=18;
const CLEARANCE=13;
const OUTSIDE=7;
const BEND_COST=28;
const EPS=1e-7;
export const COOPERATIVE_WIRE_LIMIT=48;
const OCCUPIED_LEG_LIMIT=240;
// Medium scenes can cooperate regionally without increasing each lane search.
export const REGIONAL_WIRE_LIMIT=256;
const REGIONAL_LEG_LIMIT=2048;
const LANE_GAP=12;
interface OccupiedLeg {axis:1|2;lane:number;low:number;high:number}
function legs(points:readonly Point[]):OccupiedLeg[]{
 const result:OccupiedLeg[]=[];
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i];
  if(a.y===b.y&&a.x!==b.x)result.push({axis:1,lane:a.y,low:Math.min(a.x,b.x),high:Math.max(a.x,b.x)});
  else if(a.x===b.x&&a.y!==b.y)result.push({axis:2,lane:a.x,low:Math.min(a.y,b.y),high:Math.max(a.y,b.y)});
 }
 return result;
}
function overlap(a:OccupiedLeg,b:OccupiedLeg):number{
 if(a.axis!==b.axis||Math.abs(a.lane-b.lane)>=LANE_GAP-EPS)return 0;
 return Math.max(0,Math.min(a.high,b.high)-Math.max(a.low,b.low));
}
function crosses(a:OccupiedLeg,b:OccupiedLeg):boolean{
 return a.axis!==b.axis&&a.lane>b.low+EPS&&a.lane<b.high-EPS&&
  b.lane>a.low+EPS&&b.lane<a.high-EPS;
}
function lengthOf(path:readonly Point[]):number{
 return path.slice(1).reduce((sum,p,i)=>sum+Math.abs(p.x-path[i].x)+Math.abs(p.y-path[i].y),0);
}
/**
 * Any accepted candidate is at most baseline + max(48, 25%) long.
 * Its excursion outside the endpoint rectangle cannot exceed half the
 * excess over Manhattan distance. Include the lane-gap margin as well.
 * Distant reservations cannot influence any accepted path. In a region
 * exceeding the per-wire budget, keep independent routing instead of
 * silently ignoring a subset of conflicting legs.
 */
function regionalLegs(path:readonly Point[],start:Point,end:Point,occupied:readonly OccupiedLeg[]):OccupiedLeg[]{
 const baseline=lengthOf(path);
 const slack=Math.max(0,(baseline+Math.max(48,baseline*0.25)-
   Math.abs(start.x-end.x)-Math.abs(start.y-end.y))/2)+LANE_GAP;
 const left=Math.min(start.x,end.x)-slack,right=Math.max(start.x,end.x)+slack;
 const top=Math.min(start.y,end.y)-slack,bottom=Math.max(start.y,end.y)+slack;
 const local:OccupiedLeg[]=[];
 for(const leg of occupied){
  const relevant=leg.axis===1?
   leg.lane>=top&&leg.lane<=bottom&&leg.high>=left&&leg.low<=right:
   leg.lane>=left&&leg.lane<=right&&leg.high>=top&&leg.low<=bottom;
  if(!relevant)continue;
  if(local.length===OCCUPIED_LEG_LIMIT)return [];
  local.push(leg);
 }
 return local;
}
function congestion(path:readonly Point[],occupied:readonly OccupiedLeg[]):number{
 let result=0;
 for(const a of legs(path))for(const b of occupied){
  result+=overlap(a,b)*3;
  // Penalize true interior perpendicular crossings, not shared endpoints.
  if(crosses(a,b))result+=16;
 }
 return result;
}
/** Try bounded orthogonal alternative corridors only if the ordinary clear route is crowded. */
function chooseLane(path:Point[],start:Point,end:Point,boxes:readonly Bounds[],occupied:readonly OccupiedLeg[]):Point[]{
 // Crossing-only congestion matters too: an equally short alternate
 // elbow may remove a crossing or fan out immediately at a shared socket.
 if(!occupied.length||congestion(path,occupied)<=EPS)return path;
 const baselineLength=lengthOf(path);
 const cost=(p:Point[])=>lengthOf(p)+BEND_COST*Math.max(0,p.length-2)+congestion(p,occupied);
 let best=path,bestCost=cost(path);
 // Include the two shortest orthogonal elbows. Unlike shifted
 // corridors, these can split a common breadboard pin without adding
 // a dogleg; clearance and the same cost function still gate selection.
 const candidates:Point[][]=[
  orthogonalRoute([start,end],'horizontal'),
  orthogonalRoute([start,end],'vertical')
 ];
 const seen=new Set<string>();
 const addCorridor=(axis:1|2,lane:number)=>{
  const key=axis+':'+lane;
  if(seen.has(key)||seen.size>=16)return;
  seen.add(key);
  candidates.push(simplify(axis===1?
   [start,{x:start.x,y:lane},{x:end.x,y:lane},end]:
   [start,{x:lane,y:start.y},{x:lane,y:end.y},end]));
 };
 // Preserve the existing overlap candidates and their priority.
 for(const a of legs(path))for(const b of occupied){
  if(overlap(a,b)<=EPS)continue;
  for(const lane of [b.lane-LANE_GAP,b.lane+LANE_GAP])addCorridor(a.axis,lane);
 }
 // Both shortest elbows may cross other wires. Try a channel beside
 // a crossed leg, or beyond its ends, using the remaining corridor
 // budget. A channel between the endpoint coordinates can be just as
 // short as an elbow, even though it has one extra bend.
 for(const a of legs(path))for(const b of occupied){
  if(seen.size>=16||!crosses(a,b))continue;
  for(const lane of [b.lane-LANE_GAP,b.lane+LANE_GAP])addCorridor(b.axis,lane);
  for(const lane of [b.low-LANE_GAP,b.high+LANE_GAP])addCorridor(a.axis,lane);
 }
 // The initial clear route is only one of the possible elbows. A
 // crowded alternate elbow can expose an otherwise missed corridor
 // (e.g. a horizontal bundle near its far end). Preserve the original
 // candidates first, then probe both elbows within the SAME budget.
 for(const elbow of candidates.slice(0,2)){
  if(seen.size>=16)break;
  const elbowLegs=legs(elbow);
  for(const a of elbowLegs)for(const b of occupied){
   if(seen.size>=16||overlap(a,b)<=EPS)continue;
   for(const lane of [b.lane-LANE_GAP,b.lane+LANE_GAP])addCorridor(a.axis,lane);
  }
  for(const a of elbowLegs)for(const b of occupied){
   if(seen.size>=16||!crosses(a,b))continue;
   for(const lane of [b.lane-LANE_GAP,b.lane+LANE_GAP])addCorridor(b.axis,lane);
   for(const lane of [b.low-LANE_GAP,b.high+LANE_GAP])addCorridor(a.axis,lane);
  }
 }
 // A full start-to-end corridor can be blocked even though a single
 // congested leg of a multi-turn detour has room to fan out. Shift that
 // leg locally, absorbing its jogs into adjacent perpendicular legs
 // where possible. Never move either escaped pin or rewrite waypoints.
 const localSeen=new Set<string>();
 localCandidates:
 for(let i=0;i+1<path.length;i++){
  const a=path[i],b=path[i+1],leg=legs([a,b])[0];
  if(!leg)continue;
  for(const other of occupied){
   if(overlap(leg,other)<=EPS)continue;
   for(const lane of [other.lane-LANE_GAP,other.lane+LANE_GAP]){
    const key=i+':'+lane;
    if(localSeen.has(key))continue;
    if(localSeen.size>=16)break localCandidates;
    localSeen.add(key);
    const shifted=(p:Point):Point=>leg.axis===1?{x:p.x,y:lane}:{x:lane,y:p.y};
    const prev=path[i-1],next=path[i+2];
    const perpendicular=(p:Point,q:Point)=>leg.axis===1?p.x===q.x:p.y===q.y;
    candidates.push(simplify([
     ...path.slice(0,i),
     ...(!prev||!perpendicular(prev,a)?[a]:[]),
     shifted(a),shifted(b),
     ...(!next||!perpendicular(b,next)?[b]:[]),
     ...path.slice(i+2)
    ]));
   }
  }
 }
 for(const candidate of candidates){
  if(lengthOf(candidate)>baselineLength+Math.max(48,baselineLength*0.25)||!routeIsClear(candidate,boxes))continue;
  const score=cost(candidate);
  if(score<bestCost-EPS){best=candidate;bestCost=score;}
 }
 return best;
}
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
interface RoutingObstacle {id:string;bounds:Bounds}
interface RoutingScene {
 partsById:ReadonlyMap<string,Part>;
 obstacles:readonly RoutingObstacle[];
 fullBoxes:readonly Bounds[];
}
/** Per-operation geometry only: never retain across a part move, rotation or import. */
function routingScene(parts:readonly Part[]):RoutingScene{
 const partsById=new Map<string,Part>(),obstacles:RoutingObstacle[]=[];
 for(const original of parts){
  const part={...original};
  if(!partsById.has(part.id))partsById.set(part.id,part);
  if(part.kind!=='breadboard')obstacles.push({id:part.id,bounds:box(part)});
 }
 return {partsById,obstacles,fullBoxes:obstacles.map(item=>item.bounds)};
}
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
const routeIsClear=(vertices:readonly Point[],boxes:readonly Bounds[]):boolean=>
  vertices.every(finite)&&vertices.slice(1).every((p,i)=>
   !blocked(vertices[i],p,boxes));

/** When too many nearby bodies exceed the bounded graph's capacity,
 * search four deterministic perimeter corridors instead of painting a wire
 * directly through an omitted component. Any used corridor must be clear
 * against *all* component bodies, not merely the sampled first 18.
 */
function perimeterRoute(from:Point,to:Point,boxes:readonly Bounds[],direction:WireDirection,
 verify:readonly Bounds[]=boxes):Point[]|null{
 if(!boxes.length)return null;
 const up=Math.min(from.y,to.y,...boxes.map(b=>b.top))-CLEARANCE-OUTSIDE;
 const down=Math.max(from.y,to.y,...boxes.map(b=>b.bottom))+CLEARANCE+OUTSIDE;
 const left=Math.min(from.x,to.x,...boxes.map(b=>b.left))-CLEARANCE-OUTSIDE;
 const right=Math.max(from.x,to.x,...boxes.map(b=>b.right))+CLEARANCE+OUTSIDE;
 const candidates=[
  [from,{x:from.x,y:up},{x:to.x,y:up},to],
  [from,{x:from.x,y:down},{x:to.x,y:down},to],
  [from,{x:left,y:from.y},{x:left,y:to.y},to],
  [from,{x:right,y:from.y},{x:right,y:to.y},to]
 ].map(simplify).filter(path=>routeIsClear(path,verify));
 if(!candidates.length)return null;
 const cost=(route:Point[])=>{
  const length=route.slice(1).reduce((sum,p,i)=>
   sum+Math.abs(p.x-route[i].x)+Math.abs(p.y-route[i].y),0);
  const first=route[0],next=route[1]??first;
  const axis=Math.abs(first.x-next.x)>EPS?'horizontal':'vertical';
  return length+BEND_COST*(route.length-2)+(axis===direction?0:12);
 };
 return candidates.sort((a,b)=>cost(a)-cost(b))[0];
}
function simplify(points:readonly Point[]):Point[]{
 const out:Point[]=[];
 for(const p of points){
  if(out.length&&same(out[out.length-1],p))continue;
  const a=out[out.length-2],b=out[out.length-1];
  const collinear=a&&b&&((Math.abs(a.x-b.x)<EPS&&Math.abs(b.x-p.x)<EPS)||
                           (Math.abs(a.y-b.y)<EPS&&Math.abs(b.y-p.y)<EPS));
  // Do NOT erase a reversal: the escape stub may need to leave the device,
  // then loop back via a free lane. Removing it could hide the connection
  // behind the source component body.
  const forward=a&&b&&(b.x-a.x)*(p.x-b.x)+(b.y-a.y)*(p.y-b.y)>=-EPS;
  if(collinear&&forward){
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
 const [w,h]=size[part.kind];
 const sides=[
  {gap:raw[0],dx:-1,dy:0},
  {gap:w-raw[0],dx:1,dy:0},
  {gap:raw[1],dx:0,dy:-1},
  {gap:h-raw[1],dx:0,dy:1}
 ].sort((a,b)=>a.gap-b.gap);
 const side=sides[0],turn=Math.round(rot/90)%4;
 // Retain cardinal escape directions. For arbitrary imported rotations,
 // use the dominant axis of the rotated outward normal. The endpoint stays
 // at its exact pin coordinate and the escape stub stays orthogonal.
 let dx=[side.dx,-side.dy,-side.dx,side.dy][turn];
 let dy=[side.dy,side.dx,-side.dy,-side.dx][turn];
 if(Math.abs(rot/90-Math.round(rot/90))>1e-8){
  const rad=part.rotation*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad);
  const nx=side.dx*c-side.dy*s,ny=side.dx*s+side.dy*c;
  if(Math.abs(nx)>=Math.abs(ny)-EPS){dx=nx>=0?1:-1;dy=0;}
  else{dx=0;dy=ny>=0?1:-1;}
 }
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
 // Preserve exact imported fractional coordinates. Quantizing to 6 decimals
 // could create a microscopic diagonal between a real pin/port and the grid.
 const unique=(a:number[])=>[...new Set(a)].sort((a,b)=>a-b);
 const xx=unique(xs),yy=unique(ys),rows=yy.length,cols=xx.length;
 if(cols*rows>2000)return null;
 const point=(id:number)=>({x:xx[Math.floor(id/rows)],y:yy[id%rows]});
 const index=(p:Point)=>{
  const col=xx.indexOf(p.x);
  const row=yy.indexOf(p.y);
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
 wire:Wire,parts:readonly Part[],providedPoints?:readonly Point[],freeEnd=false,
 occupied:readonly OccupiedLeg[]=[]
):Point[]|null {
 return routeWithScene(wire,parts,providedPoints,freeEnd,occupied,()=>routingScene(parts));
}
function routeWithScene(
 wire:Wire,parts:readonly Part[],providedPoints:readonly Point[]|undefined,freeEnd:boolean,
 occupied:readonly OccupiedLeg[],getScene:()=>RoutingScene,regional=false
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
 // Older schema-v2 routed wires retain their original HV/VH geometry:
 // switching on obstacle-avoidance requires explicit user intent.
 if(!wire.autoAvoid)return fallback;
 if(parts.length>AUTO_ROUTE_PART_LIMIT||points.some(p=>!finite(p)))return fallback;
 const from=points[0],to=points.at(-1)!;
 const scene=getScene();
 const source=scene.partsById.get(wire.from.componentId);
 const dest=freeEnd?undefined:scene.partsById.get(wire.to.componentId);
 const start=escapePort(wire.from,from,source);
 const end=freeEnd?{...to}:escapePort(wire.to,to,dest);
 if(!start||!end||!finite(start)||!finite(end))return fallback;
 const corridor:Bounds={
  left:Math.min(start.x,end.x)-230,right:Math.max(start.x,end.x)+230,
  top:Math.min(start.y,end.y)-230,bottom:Math.max(start.y,end.y)+230
 };
 const all=scene.obstacles.filter(item=>intersects(item.bounds,corridor));
 const allBoxes=all.map(item=>item.bounds);
 // Perimeter lanes may leave the initial corridor: verify them against ALL
 // bodies in the project, never just the sampled corridor obstacles.
 const fullBoxes=scene.fullBoxes;
 if(allBoxes.some(b=>inside(start,b)||inside(end,b)))return fallback;
 // Prefer the familiar clean elbow when no component is in its way.
 // This also avoids building an A* graph for most wires in full-size projects.
 const preferred=orthogonalRoute([start,end],wire.routing);
 const alternative=orthogonalRoute([start,end],
  wire.routing==='horizontal'?'vertical':'horizontal');
 let path:Point[]|null=routeIsClear(preferred,allBoxes)?preferred:
  routeIsClear(alternative,allBoxes)?alternative:null;
 if(!path){
  // The bounded graph is only needed if both simple elbows are obstructed.
  // Do not rank or sort obstacles on the common clear-elbow path.
  const mandatory=new Set(freeEnd?[wire.from.componentId]:
   [wire.from.componentId,wire.to.componentId]);
  const kept=all.filter(item=>mandatory.has(item.id));
  const extras=all.filter(item=>!mandatory.has(item.id)).sort((a,b)=>{
    const relevance=(r:Bounds)=>Math.max(0,Math.max(r.left-Math.max(start.x,end.x),Math.min(start.x,end.x)-r.right))+
      Math.max(0,Math.max(r.top-Math.max(start.y,end.y),Math.min(start.y,end.y)-r.bottom));
    return relevance(a.bounds)-relevance(b.bounds)||a.id.localeCompare(b.id);
  });
  // Endpoint devices may never be evicted by a crowded nearest-obstacle list.
  const boxes=[...kept,...extras.slice(0,Math.max(0,AUTO_ROUTE_OBSTACLE_LIMIT-kept.length))]
   .map(item=>item.bounds);
  const searched=orthogonalSearch(start,end,boxes,wire.routing);
  path=searched&&routeIsClear(searched,allBoxes)?searched:
    perimeterRoute(start,end,allBoxes,wire.routing,fullBoxes);
 }
 if(!path)return fallback;
 const relevant=regional&&occupied.length?regionalLegs(path,start,end,occupied):occupied;
 const combined=simplify([from,start,...chooseLane(path,start,end,fullBoxes,relevant),end,to]);
 // Pins and all manual connections retain exact identity and coordinates.
 if(!same(combined[0],from)||!same(combined.at(-1)!,to))return fallback;
 return combined;
}
/**
 * One scene snapshot for paint, pick and edits. Fixed routes reserve lanes first;
 * automatic routes follow stable project order, never selection/painter order.
 * Medium scenes use regional congestion checks; very large scenes retain
 * independent clearance routing. Drafts use the appended scene's budget.
 */
function collectSceneRoutes(
 wires:readonly Wire[],parts:readonly Part[],wireCount:number,
 resolvePin?:ReturnType<typeof createPinResolver>
){
 const routes=new Map<string,Point[]>(),occupied:OccupiedLeg[]=[];
 let scene:RoutingScene|undefined,saturated=false;
 const getScene=()=>scene??(scene=routingScene(parts));
 const regional=wireCount>COOPERATIVE_WIRE_LIMIT&&wireCount<=REGIONAL_WIRE_LIMIT;
 const cooperative=wireCount<=REGIONAL_WIRE_LIMIT;
 const budget=regional?REGIONAL_LEG_LIMIT:OCCUPIED_LEG_LIMIT;
 const automatic=(w:Wire)=>!!w.routing&&!!w.autoAvoid&&!w.bends?.length;
 if(wires.length){
  const resolve=resolvePin??createPinResolver(parts);
  const ordered=cooperative?[...wires.filter(w=>!automatic(w)),...wires.filter(automatic)]:wires;
  for(const w of ordered){
   const start=resolve(w.from),end=resolve(w.to);
   if(!start||!end)continue;
   const points=[start,...(w.bends??[]),end];
   const route=routeWithScene(w,parts,points,false,
    cooperative&&automatic(w)&&!saturated?occupied:[],getScene,regional);
   if(!route)continue;
   routes.set(w.id,route);
   if(cooperative&&!saturated){
    const reserved=legs(route);
    if(occupied.length+reserved.length>budget){
     saturated=true;
     occupied.length=0;
    }else occupied.push(...reserved);
   }
  }
 }
 return {routes,occupied,getScene,regional};
}
export function projectWireRoutes(
 wires:readonly Wire[],parts:readonly Part[],resolvePin?:ReturnType<typeof createPinResolver>
):Map<string,Point[]>{
 return collectSceneRoutes(wires,parts,wires.length,resolvePin).routes;
}
/** Preview uses the same reservation order and size tier as an appended auto wire. */
export function draftWireVertices(wire:Wire,wires:readonly Wire[],parts:readonly Part[],points:readonly Point[],freeEnd:boolean):Point[]|null{
 if(wires.length>=REGIONAL_WIRE_LIMIT)return visibleWireVertices(wire,parts,points,freeEnd);
 const {occupied,getScene,regional}=collectSceneRoutes(wires,parts,wires.length+1);
 return routeWithScene(wire,parts,points,freeEnd,occupied,getScene,regional);
}
export function visibleWirePath(wire:Wire,parts:readonly Part[],points?:readonly Point[]):string{
 const vertices=visibleWireVertices(wire,parts,points);
 return vertices?'M'+vertices.map(coordinate).join(' L'):'';
}


/**
 * Explicit, undoable opt-in for existing legacy autoroutes. Never silently
 * replace a user's manual bends or mutate the serialized geometry on load.
 */
export function enableClearanceRouting(project:Project,selected:ReadonlySet<string>|null=null):Project{
 let changed=false;
 const resolve=createPinResolver(project.parts);
 const wires=project.wires.map(wire=>{
  if((selected&&!selected.has(wire.id))||wire.autoAvoid||wire.bends?.length)return wire;
  const a=resolve(wire.from),b=resolve(wire.to);
  if(!a||!b)return wire;
  changed=true;
  return {...wire,autoAvoid:true,
    routing:wire.routing??(Math.abs(b.x-a.x)>=Math.abs(b.y-a.y)?
      'horizontal' as const:'vertical' as const)};
 });
 return changed?{...project,wires}:project;
}
