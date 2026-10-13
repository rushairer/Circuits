import type { Point } from './geometry.js';

/** UI-only guides: alignment never creates a netlist junction. */
export interface WaypointGuide { id:string; kind:'terminal'|'bend'; point:Point }
interface AxisLock { value:number; kind:'alignment'|'grid'; id?:string }
export interface WaypointSnapMemory {
 terminal?:{id:string;point:Point};
 x?:AxisLock;
 y?:AxisLock;
}
export interface WaypointSnapResult { point:Point; memory:WaypointSnapMemory }
export interface WaypointSnapOptions {
 pixelsPerWorldUnit:number;
 guides:readonly WaypointGuide[];
 gridPitch?:number|null;
 /** Screen pixels, independent of canvas zoom. */
 enterPx?:number;
 releasePx?:number;
}
const valid=(p:Point)=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&
  Math.abs(p.x)<=100000&&Math.abs(p.y)<=100000;
const within=(delta:number,scale:number,radius:number)=>Math.abs(delta)*scale<=radius+1e-8;

/**
 * Terminal anchors have 2D priority; alignment axes beat the optional grid.
 * Entry and exit are separated, preventing rapid toggling at a guide edge.
 * Grid entry/exit are bounded by cell size so low zoom does not freeze the
 * pointer against a grid line several cells away.
 */
export function snapWireWaypoint(
 raw:Point,previous:WaypointSnapMemory|null,options:WaypointSnapOptions
):WaypointSnapResult {
 const point={...raw},none:WaypointSnapResult={point,memory:{}};
 const scale=options.pixelsPerWorldUnit;
 if(!valid(raw)||!Number.isFinite(scale)||scale<=0)return none;
 const enter=Number.isFinite(options.enterPx)&&options.enterPx!>0?options.enterPx!:6;
 const exit=Number.isFinite(options.releasePx)&&options.releasePx!>enter?
   options.releasePx!:Math.max(enter+2,11);
 const guides=options.guides.filter(g=>valid(g.point));
 const terminal=previous?.terminal&&guides.find(g=>g.kind==='terminal'&&g.id===previous.terminal!.id);
 if(terminal&&Math.hypot(raw.x-terminal.point.x,raw.y-terminal.point.y)*scale<=exit)
   return {point:{...terminal.point},memory:{terminal:{id:terminal.id,point:{...terminal.point}}}};
 let best:WaypointGuide|null=null,bestD=Infinity;
 for(const guide of guides){
   if(guide.kind!=='terminal')continue;
   const distance=Math.hypot(raw.x-guide.point.x,raw.y-guide.point.y)*scale;
   if(distance<=enter&&distance<bestD){best=guide;bestD=distance;}
 }
 if(best)return {point:{...best.point},memory:{terminal:{id:best.id,point:{...best.point}}}};
 const pitch=options.gridPitch;
 const grid=typeof pitch==='number'&&Number.isFinite(pitch)&&pitch>0?pitch:null;
 const snapAxis=(axis:'x'|'y'):AxisLock|undefined=>{
   const coordinate=raw[axis];
   const previousLock=previous?.[axis];
   if(previousLock?.kind==='alignment'){
     const guide=guides.find(g=>g.id===previousLock.id);
     if(guide&&within(coordinate-guide.point[axis],scale,exit))
       return {value:guide.point[axis],kind:'alignment',id:guide.id};
   }
   // Prefer alignment with real terminals over other waypoints; then distance.
   let near:WaypointGuide|null=null,nearDistance=Infinity;
   for(const guide of guides){
     const dist=Math.abs(coordinate-guide.point[axis])*scale;
     if(dist<=enter&&(dist<nearDistance-1e-8||
       (Math.abs(dist-nearDistance)<1e-8&&guide.kind==='terminal'&&near?.kind==='bend'))){
       near=guide;nearDistance=dist;
     }
   }
   if(near)return {value:near.point[axis],kind:'alignment',id:near.id};
   if(grid===null)return;
   const pitchPx=grid*scale;
   if(previousLock?.kind==='grid'&&
      within(coordinate-previousLock.value,scale,Math.min(exit,pitchPx*0.48)))
     return {...previousLock};
   const closest=Math.round(coordinate/grid)*grid;
   if(within(coordinate-closest,scale,Math.min(enter,pitchPx*0.33)))
     return {value:closest,kind:'grid'};
   return;
 };
 const x=snapAxis('x'),y=snapAxis('y');
 return {point:{x:x?.value??raw.x,y:y?.value??raw.y},memory:{x,y}};
}
