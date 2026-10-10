import type { Point } from './geometry.js';
import { size, type Part, type Wire } from '../model.js';

export interface Viewport { zoom:number; panX:number; panY:number }
export const MIN_ZOOM=0.4;
export const MAX_ZOOM=2.5;

/** SVG viewBox coordinate -> circuit world coordinate. */
export function viewportToWorld(view:Viewport,at:Point):Point {
 return {x:(at.x-view.panX)/view.zoom,y:(at.y-view.panY)/view.zoom};
}

/** Preserve the exact circuit location under the cursor while zooming. */
export function zoomAt(view:Viewport,anchor:Point,requestedZoom:number):Viewport {
 if(!Number.isFinite(requestedZoom)||!Number.isFinite(anchor.x)||!Number.isFinite(anchor.y)||
    !Number.isFinite(view.zoom)||view.zoom<=0)return view;
 const zoom=Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,requestedZoom));
 const world=viewportToWorld(view,anchor);
 return {zoom,panX:anchor.x-world.x*zoom,panY:anchor.y-world.y*zoom};
}

/** Translation in SVG viewBox units; zoom is not changed. */
export function panBy(view:Viewport,delta:Point):Viewport {
 if(!Number.isFinite(delta.x)||!Number.isFinite(delta.y))return view;
 return {zoom:view.zoom,panX:view.panX+delta.x,panY:view.panY+delta.y};
}

/** Zoom-to-fit actual component bounds and user-defined wire waypoints. */
export function fitCircuit(
 parts:readonly Part[],wires:readonly Wire[]=[],canvasWidth=1100,canvasHeight=800,padding=55
):Viewport {
 if(!parts.length)return {zoom:1,panX:0,panY:0};
 const coords:Point[]=[];
 for(const p of parts){
   const [w,h]=size[p.kind],angle=p.rotation*Math.PI/180;
   const extentW=Math.abs(w*Math.cos(angle))+Math.abs(h*Math.sin(angle));
   const extentH=Math.abs(w*Math.sin(angle))+Math.abs(h*Math.cos(angle));
   const midX=p.x+w/2,midY=p.y+h/2;
   coords.push({x:midX-extentW/2,y:midY-extentH/2},
     {x:midX+extentW/2,y:midY+extentH/2});
 }
 for(const wire of wires)for(const p of wire.bends??[])coords.push(p);
 const minX=Math.min(...coords.map(p=>p.x)),maxX=Math.max(...coords.map(p=>p.x));
 const minY=Math.min(...coords.map(p=>p.y)),maxY=Math.max(...coords.map(p=>p.y));
 const availableX=Math.max(1,canvasWidth-padding*2),availableY=Math.max(1,canvasHeight-padding*2);
 const zoom=Math.min(MAX_ZOOM,Math.max(MIN_ZOOM,
   Math.min(availableX/Math.max(1,maxX-minX),availableY/Math.max(1,maxY-minY))));
 return {zoom,panX:canvasWidth/2-(minX+maxX)*zoom/2,
   panY:canvasHeight/2-(minY+maxY)*zoom/2};
}
