import type { Point } from './geometry.js';

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
