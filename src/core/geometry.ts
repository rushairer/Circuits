import { pins, size, type Endpoint, type Part, type Wire } from '../model.js';

export interface Point { x: number; y: number }

/** Snap a world-space coordinate, independent of view zoom. */
export function snap(value: number, pitch=10): number {
  if (!Number.isFinite(value) || !Number.isFinite(pitch) || pitch<=0) throw new Error('Invalid grid input');
  return Math.round(value/pitch)*pitch;
}

export function pinWorld(endpoint: Endpoint, parts: readonly Part[]): Point | null {
  const component=parts.find(c=>c.id===endpoint.componentId);
  if (!component) return null;
  const local=pins[component.kind][endpoint.pinId];
  if (!local) return null;
  const [w,h]=size[component.kind],radians=component.rotation*Math.PI/180;
  const dx=local[0]-w/2,dy=local[1]-h/2;
  return {x:component.x+w/2+dx*Math.cos(radians)-dy*Math.sin(radians),
          y:component.y+h/2+dx*Math.sin(radians)+dy*Math.cos(radians)};
}

export function wirePoints(wire: Wire, parts: readonly Part[]): Point[] | null {
  const start=pinWorld(wire.from,parts),end=pinWorld(wire.to,parts);
  return start&&end?[start,...(wire.bends??[]),end]:null;
}

/**
 * An opt-in orthogonal route treats saved bends as user-selected waypoints.
 * All legs remain horizontal/vertical after moving or rotating either part.
 * Legacy wires WITHOUT routing preserve their original path geometry.
 */
export type WireDirection='horizontal'|'vertical';
export function orthogonalRoute(points:readonly Point[],direction:WireDirection):Point[]{
 if(points.length===0)return [];
 const result:Point[]=[{...points[0]}];
 const append=(p:Point)=>{
   const previous=result[result.length-1];
   if(previous.x!==p.x||previous.y!==p.y)result.push({...p});
 };
 for(let i=0;i<points.length-1;i++){
   const from=points[i],to=points[i+1];
   append(direction==='horizontal'?{x:to.x,y:from.y}:{x:from.x,y:to.y});
   append(to);
 }
 return result;
}
/** Optional routing is schema-v2 compatible; untagged wire paths are unchanged. */
export function wirePath(points: readonly Point[], explicitBends=false, routing?:WireDirection): string {
 if(points.length<2)return '';
 const xy=(p:Point)=>p.x+' '+p.y;
 if(routing)return 'M'+orthogonalRoute(points,routing).map(xy).join(' L');
 if(explicitBends)return 'M'+points.map(xy).join(' L');
 const start=points[0],end=points[points.length-1],midX=(start.x+end.x)/2;
 return 'M'+xy(start)+' L'+midX+' '+start.y+' L'+midX+' '+end.y+' L'+xy(end);
}
/** Find the saved waypoint insertion index nearest the ACTUAL visible route. */
export function nearestWireSegment(points:readonly Point[],target:Point,routing?:WireDirection):number {
 if(!routing)return nearestSegment(points,target);
 let best=Infinity,index=0;
 for(let i=0;i<points.length-1;i++){
   const vertices=orthogonalRoute([points[i],points[i+1]],routing);
   for(let j=0;j<vertices.length-1;j++){
     const a=vertices[j],b=vertices[j+1],dx=b.x-a.x,dy=b.y-a.y;
     const denominator=dx*dx+dy*dy;
     const t=denominator>0?Math.max(0,Math.min(1,((target.x-a.x)*dx+(target.y-a.y)*dy)/denominator)):0;
     const distance=(target.x-a.x-t*dx)**2+(target.y-a.y-t*dy)**2;
     if(distance<best){best=distance;index=i;}
   }
 }
 return index;
}

/** Insert a wire bend in path order, nearest to the clicked segment. */
export function nearestSegment(points: readonly Point[], target: Point): number {
  if(points.length<2) return 0;
  let best=Infinity,index=0;
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1],dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy;
    const fraction=len===0?0:Math.max(0,Math.min(1,((target.x-a.x)*dx+(target.y-a.y)*dy)/len));
    const x=a.x+fraction*dx,y=a.y+fraction*dy,dist=(target.x-x)**2+(target.y-y)**2;
    if(dist<best){best=dist;index=i}
  }
  return index;
}
