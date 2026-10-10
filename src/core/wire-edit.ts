import { type Project } from '../model.js';
import { nearestWireSegment, snap, wirePoints, type Point } from './geometry.js';

export interface WaypointInserted { project:Project; index:number }
const validPoint=(point:Point)=>Number.isFinite(point.x)&&Number.isFinite(point.y)&&
  Math.abs(point.x)<=100000&&Math.abs(point.y)<=100000;
const placed=(point:Point,grid:number|null):Point=>grid?
  {x:snap(point.x,grid),y:snap(point.y,grid)}:{...point};

/**
 * Topological wiring is fixed at terminal IDs. Anchor edit operations are
 * immutable so a cancelled pointer gesture can safely restore its draft.
 */
export function insertWireWaypoint(
 project:Project,wireId:string,at:Point,grid:number|null=null
):WaypointInserted|null {
 const wire=project.wires.find(w=>w.id===wireId);
 if(!wire||!validPoint(at)||(wire.bends?.length??0)>=32)return null;
 const points=wirePoints(wire,project.parts);
 if(!points)return null;
 const nextPoint=placed(at,grid);
 if(!validPoint(nextPoint))return null;
 const index=nearestWireSegment(points,nextPoint,wire.routing);
 const bends=[...(wire.bends??[])];
 bends.splice(index,0,nextPoint);
 return {project:{...project,wires:project.wires.map(w=>
   w.id===wireId?{...w,bends}:w)},index};
}
export function moveWireWaypoint(
 project:Project,wireId:string,index:number,at:Point,grid:number|null=null
):Project|null {
 const wire=project.wires.find(w=>w.id===wireId);
 if(!wire?.bends||!Number.isInteger(index)||index<0||index>=wire.bends.length||!validPoint(at))return null;
 const nextPoint=placed(at,grid);
 if(!validPoint(nextPoint))return null;
 const bends=wire.bends.map((p,i)=>i===index?nextPoint:p);
 return {...project,wires:project.wires.map(w=>w.id===wireId?{...w,bends}:w)};
}
export function removeWireWaypoint(project:Project,wireId:string,index:number):Project|null{
 const wire=project.wires.find(w=>w.id===wireId);
 if(!wire?.bends||!Number.isInteger(index)||index<0||index>=wire.bends.length)return null;
 const bends=wire.bends.filter((_,i)=>i!==index);
 return {...project,wires:project.wires.map(w=>w.id===wireId?{...w,bends}:w)};
}
