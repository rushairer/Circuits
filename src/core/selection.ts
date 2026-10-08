import { size, type Part, type Project } from '../model.js';
import { snap, type Point } from './geometry.js';

/**
 * Selection and movement are independent of electrical wiring. A group moves
 * rigidly: grid snapping quantizes one common delta, never each pin separately.
 */
export function translateComponents(
  project:Project, ids:readonly string[], delta:Point, gridPitch:number|null=null
):Project {
  if(!Number.isFinite(delta.x)||!Number.isFinite(delta.y))return project;
  if(gridPitch!==null&&(!Number.isFinite(gridPitch)||gridPitch<=0))return project;
  const selected=new Set(ids);
  if(selected.size===0)return project;
  const dx=gridPitch===null?delta.x:snap(delta.x,gridPitch);
  const dy=gridPitch===null?delta.y:snap(delta.y,gridPitch);
  if(dx===0&&dy===0)return project;
  for(const part of project.parts){
    if(!selected.has(part.id))continue;
    if(!Number.isFinite(part.x+dx)||!Number.isFinite(part.y+dy)||
      Math.abs(part.x+dx)>100000||Math.abs(part.y+dy)>100000)return project;
  }
  return {...project,parts:project.parts.map(part=>selected.has(part.id)?
    {...part,x:Math.round((part.x+dx)*10000)/10000,y:Math.round((part.y+dy)*10000)/10000}:part)};
}

export function removeComponents(project:Project,ids:readonly string[]):Project {
  const selected=new Set(ids);
  if(selected.size===0||!project.parts.some(p=>selected.has(p.id)))return project;
  return {
    ...project,
    parts:project.parts.filter(part=>!selected.has(part.id)),
    wires:project.wires.filter(w=>!selected.has(w.from.componentId)&&!selected.has(w.to.componentId)),
    insertions:project.insertions?.filter(i=>!selected.has(i.componentId)&&!selected.has(i.boardId))
  };
}

export function rotateComponents(project:Project,ids:readonly string[]):Project {
  const selected=new Set(ids);
  if(selected.size===0)return project;
  return {...project,parts:project.parts.map(part=>selected.has(part.id)?
    {...part,rotation:((part.rotation+90)%360+360)%360}:part)};
}

function bounds(part:Part):{left:number;right:number;top:number;bottom:number}{
  const [w,h]=size[part.kind],cx=part.x+w/2,cy=part.y+h/2;
  const radians=part.rotation*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians);
  const corners:[[number,number],[number,number],[number,number],[number,number]]=[
    [-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]
  ];
  const xs=corners.map(([x,y])=>cx+x*c-y*s),ys=corners.map(([x,y])=>cy+x*s+y*c);
  return {left:Math.min(...xs),right:Math.max(...xs),top:Math.min(...ys),bottom:Math.max(...ys)};
}

/** Left-to-right or right-to-left marquee both select fully enclosed objects. */
export function componentsWithinRect(project:Project,first:Point,last:Point):string[]{
  if(![first.x,first.y,last.x,last.y].every(Number.isFinite))return [];
  const left=Math.min(first.x,last.x),right=Math.max(first.x,last.x);
  const top=Math.min(first.y,last.y),bottom=Math.max(first.y,last.y);
  const epsilon=0.00001;
  return project.parts.filter(part=>{
    const b=bounds(part);
    return b.left>=left-epsilon&&b.right<=right+epsilon&&
      b.top>=top-epsilon&&b.bottom<=bottom+epsilon;
  }).map(p=>p.id);
}
