import { pins, size, type Kind, type Endpoint, type Insertion, type Part, type Project } from '../model.js';
import { pinWorld, type Point } from './geometry.js';

const supported = new Set<Part['kind']>(['resistor','led']);
const padIds=Object.keys(pins.breadboard).filter(id=>id!=='plus'&&id!=='minus');
export const isInsertable=(part:Part):boolean=>supported.has(part.kind);
export interface BreadboardHit { boardId:string;holeId:string;position:Point;distance:number }

/** The aliases "plus" and "minus" exist for old projects, but are not physical holes. */
export function nearestBreadboardHole(project:Project,at:Point,radius=7):BreadboardHit|null {
 if(!Number.isFinite(at.x)||!Number.isFinite(at.y)||!Number.isFinite(radius)||radius<=0)return null;
 let best:BreadboardHit|null=null;
 for(const board of project.parts.filter(p=>p.kind==='breadboard')){
  for(const holeId of padIds){
   const position=pinWorld({componentId:board.id,pinId:holeId},[board]);
   if(!position)continue;
   const distance=Math.hypot(position.x-at.x,position.y-at.y);
   if(distance<=radius&&(!best||distance<best.distance-1e-9))
     best={boardId:board.id,holeId,position,distance};
  }
 }
 return best;
}

/** Materialize spatial physical contacts as explicit pin-to-hole identities. */
export function detectInsertions(project:Project,radius=5.5):Insertion[] {
 const insertions:Insertion[]=[];
 for(const part of project.parts){
  if(!isInsertable(part))continue;
  for(const pinId of Object.keys(pins[part.kind])){
   const position=pinWorld({componentId:part.id,pinId},[part]);
   const hit=position&&nearestBreadboardHole(project,position,radius);
   if(hit)insertions.push({componentId:part.id,pinId,boardId:hit.boardId,holeId:hit.holeId});
  }
 }
 return insertions;
}
export function reconcileInsertions(project:Project):Project {
 return {...project,insertions:detectInsertions(project)};
}

/**
 * When an insertable part is released near a hole, translate the whole part
 * so its nearest lead exactly aligns to that hole. The other lead is tested
 * separately: merely touching the breadboard body does not create a contact.
 */
export function snapPartToBreadboard(project:Project,id:string,radius=11):Project {
 const part=project.parts.find(p=>p.id===id);
 if(!part||!isInsertable(part))return reconcileInsertions(project);
 let chosen:{at:Point;hole:BreadboardHit}|null=null;
 for(const pinId of Object.keys(pins[part.kind])){
  const at=pinWorld({componentId:part.id,pinId},[part]);
  const hole=at&&nearestBreadboardHole(project,at,radius);
  if(at&&hole&&(!chosen||hole.distance<chosen.hole.distance))chosen={at,hole};
 }
 if(!chosen)return reconcileInsertions(project);
 const deltaX=chosen.hole.position.x-chosen.at.x,deltaY=chosen.hole.position.y-chosen.at.y;
 const updated={...part,x:part.x+deltaX,y:part.y+deltaY};
 return reconcileInsertions({...project,parts:project.parts.map(p=>p.id===id?updated:p)});
}

/** Find the physically inserted board terminal for an electrically named pin. */
export function insertionTarget(project:Project,endpoint:Endpoint):Endpoint|null {
 const match=(project.insertions??[]).find(x=>x.componentId===endpoint.componentId&&x.pinId===endpoint.pinId);
 return match?{componentId:match.boardId,pinId:match.holeId}:null;
}

/** Deterministic nearby placement for palette clicks; explicit drag/drop is untouched. */
export function suggestPalettePosition(project:Project,kind:Kind,preferred:Point={x:300,y:300}):Point {
 const [width,height]=size[kind];
 const existing=project.parts.map(part=>{
   const [w,h]=size[part.kind],r=part.rotation*Math.PI/180;
   const rw=Math.abs(w*Math.cos(r))+Math.abs(h*Math.sin(r));
   const rh=Math.abs(w*Math.sin(r))+Math.abs(h*Math.cos(r));
   return {left:part.x+(w-rw)/2,right:part.x+(w+rw)/2,
     top:part.y+(h-rh)/2,bottom:part.y+(h+rh)/2};
 });
 const origin={x:Math.round(preferred.x/10)*10,y:Math.round(preferred.y/10)*10};
 const space=18,step=40;
 for(let ring=0;ring<=20;ring++){
   for(let dy=-ring;dy<=ring;dy++){
     for(let dx=-ring;dx<=ring;dx++){
       if(Math.max(Math.abs(dx),Math.abs(dy))!==ring)continue;
       const x=origin.x+dx*step,y=origin.y+dy*step;
       if(x<12||y<12||x+width>1088||y+height>788)continue;
       if(existing.every(box=>x+width+space<=box.left||x-space>=box.right||
         y+height+space<=box.top||y-space>=box.bottom))return {x,y};
     }
   }
 }
 // Very dense or entirely occupied workspaces: keep add available, never delete/move existing parts.
 return origin;
}
